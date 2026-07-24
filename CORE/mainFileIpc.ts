import { clipboard, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function registerFileIpcHandlers(deps: any) {
  const {
    assertWritableTarget, fileWatchEntries, fileWatchSenderCleanup, isInsidePath,
    getMainWindow, releaseFileWatchesForSender, stopWatchingFileIfUnused,
  } = deps;
ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Failed to read file: ${err.message}`);
  }
});

ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  try {
    assertWritableTarget(filePath, 'writeFile');
    console.log('[fs:writeFile] Writing file:', filePath, 'content length:', content.length);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err: any) {
    console.error('[fs:writeFile] Error writing file:', filePath, err);
    throw new Error(`Failed to write file: ${err.message}`);
  }
});

ipcMain.handle('fs:watchFile', async (event, filePath: string) => {
  const watchedPath = path.resolve(filePath);
  let entry = fileWatchEntries.get(watchedPath);
  if (!entry) {
    entry = { subscribers: new Map() };
    fileWatchEntries.set(watchedPath, entry);
    fs.watchFile(watchedPath, { persistent: false, interval: 300 }, (current, previous) => {
      if (
        current.mtimeMs === previous.mtimeMs
        && current.size === previous.size
        && current.nlink === previous.nlink
      ) return;
      const payload = {
        path: watchedPath,
        exists: current.nlink > 0,
        mtimeMs: current.mtimeMs,
        size: current.size,
      };
      const currentEntry = fileWatchEntries.get(watchedPath);
      for (const [senderId, subscriber] of currentEntry?.subscribers || []) {
        if (subscriber.webContents.isDestroyed()) {
          currentEntry?.subscribers.delete(senderId);
        } else {
          subscriber.webContents.send('fs:fileChanged', payload);
        }
      }
      stopWatchingFileIfUnused(watchedPath);
    });
  }

  const senderId = event.sender.id;
  const existing = entry.subscribers.get(senderId);
  entry.subscribers.set(senderId, {
    webContents: event.sender,
    count: (existing?.count || 0) + 1,
  });
  if (!fileWatchSenderCleanup.has(senderId)) {
    fileWatchSenderCleanup.add(senderId);
    event.sender.once('destroyed', () => releaseFileWatchesForSender(senderId));
  }
  return watchedPath;
});

ipcMain.handle('fs:unwatchFile', async (event, filePath: string) => {
  const watchedPath = path.resolve(filePath);
  const entry = fileWatchEntries.get(watchedPath);
  const existing = entry?.subscribers.get(event.sender.id);
  if (!entry || !existing) return false;
  if (existing.count > 1) {
    entry.subscribers.set(event.sender.id, { ...existing, count: existing.count - 1 });
  } else {
    entry.subscribers.delete(event.sender.id);
  }
  stopWatchingFileIfUnused(watchedPath);
  return true;
});

ipcMain.handle('fs:deleteFile', async (_, filePath: string) => {
  try {
    assertWritableTarget(filePath, 'deleteFile');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (err: any) {
    throw new Error(`Failed to delete file: ${err.message}`);
  }
});

ipcMain.handle('fs:renameFile', async (_, oldPath: string, newPath: string) => {
  try {
    assertWritableTarget(oldPath, 'renameFile source');
    assertWritableTarget(newPath, 'renameFile target');
    const parentDir = path.dirname(newPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (err: any) {
    throw new Error(`Failed to rename file: ${err.message}`);
  }
});

ipcMain.handle('fs:listDir', async (_, dirPath: string) => {
  try {
    const items = fs.readdirSync(dirPath);
    return items.map((name) => {
      const fullPath = path.join(dirPath, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        path: fullPath,
        isDir: stat.isDirectory(),
        size: stat.size,
      };
    });
  } catch (err: any) {
    throw new Error(`Failed to list directory: ${err.message}`);
  }
});

ipcMain.handle('fs:pathExists', async (_, targetPath: string) => {
  return Boolean(targetPath && fs.existsSync(targetPath));
});

// Native folder opener dialog IPC handler
ipcMain.handle('dialog:openDirectory', async () => {
  const mainWindowInstance = getMainWindow();
  if (!mainWindowInstance) return null;
  const result = await dialog.showOpenDialog(mainWindowInstance, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Directory',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Drag and drop media auto-archiving IPC handler
ipcMain.handle('fs:archiveMedia', async (_, { srcPath, projectPath }: { srcPath: string; projectPath: string }) => {
  try {
    const destDir = path.join(projectPath, 'media');
    assertWritableTarget(destDir, 'archiveMedia');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Extract base filename and sanitize it
    const baseName = path.basename(srcPath);
    let destPath = path.join(destDir, baseName);
    
    // Prevent name collisions
    if (fs.existsSync(destPath)) {
      const ext = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, ext);
      destPath = path.join(destDir, `${nameWithoutExt}_${Date.now()}${ext}`);
    }
    
    fs.copyFileSync(srcPath, destPath);
    // Return relative path from projectPath (e.g., 'media/pic.png') for Markdown embedding
    return path.relative(projectPath, destPath);
  } catch (err: any) {
    throw new Error(`Failed to archive media: ${err.message}`);
  }
});

// Video timeline imports belong to the notebook project. This also repairs
// legacy asset records: if their external source disappeared but the earlier
// project-local copy still exists, return that copy instead.
ipcMain.handle('fs:archiveVideo', async (_, { srcPath, projectPath }: { srcPath: string; projectPath: string }) => {
  try {
    if (!srcPath || !projectPath) {
      throw new Error('Missing video source or project path');
    }

    const sourcePath = path.resolve(srcPath);
    const destDir = path.resolve(projectPath, '.dnote_assets', 'videos');
    assertWritableTarget(destDir, 'archiveVideo');
    fs.mkdirSync(destDir, { recursive: true });

    if (isInsidePath(destDir, sourcePath)) {
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        throw new Error(`Project video does not exist: ${sourcePath}`);
      }
      return sourcePath;
    }

    const baseName = path.basename(sourcePath);
    const existingProjectCopy = path.join(destDir, baseName);
    const sourceExists = fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile();

    // Legacy timelines often have an external path in JSON even though this
    // exact-name copy was already archived during the original import.
    if (!sourceExists && fs.existsSync(existingProjectCopy)) {
      return existingProjectCopy;
    }
    if (!sourceExists) {
      throw new Error(`Video source does not exist and no project copy was found: ${sourcePath}`);
    }

    let destPath = existingProjectCopy;
    if (fs.existsSync(destPath)) {
      const sourceStat = fs.statSync(sourcePath);
      const destStat = fs.statSync(destPath);
      if (sourceStat.size === destStat.size) {
        return destPath;
      }
      const ext = path.extname(baseName);
      const stem = path.basename(baseName, ext);
      let suffix = Date.now();
      do {
        destPath = path.join(destDir, `${stem}_${suffix}${ext}`);
        suffix += 1;
      } while (fs.existsSync(destPath));
    }

    const tempPath = `${destPath}.importing-${process.pid}-${Date.now()}`;
    try {
      fs.copyFileSync(sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
      fs.renameSync(tempPath, destPath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
    return destPath;
  } catch (err: any) {
    throw new Error(`Failed to archive timeline video: ${err.message}`);
  }
});

function getMediaExtension(fileName: string, mimeType?: string): string {
  const existing = path.extname(fileName || '').replace('.', '').toLowerCase();
  if (existing) return existing;
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'audio/mpeg') return 'mp3';
  if (mimeType === 'audio/wav') return 'wav';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  return 'png';
}

function sanitizeMediaFileName(fileName: string, mimeType?: string): string {
  const ext = getMediaExtension(fileName, mimeType);
  const rawStem = path.basename(fileName || '', path.extname(fileName || ''));
  const safeStem = rawStem
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `pasted-media-${Date.now()}`;
  return `${safeStem}.${ext}`;
}

function getAvailableMediaPath(destDir: string, fileName: string): string {
  let destPath = path.join(destDir, fileName);
  if (!fs.existsSync(destPath)) return destPath;
  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(fileName, ext);
  destPath = path.join(destDir, `${nameWithoutExt}_${Date.now()}${ext}`);
  return destPath;
}

ipcMain.handle('fs:archiveMediaData', async (_, {
  fileName,
  mimeType,
  data,
  projectPath,
}: {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer | Uint8Array | number[];
  projectPath: string;
}) => {
  try {
    const destDir = path.join(projectPath, 'media');
    assertWritableTarget(destDir, 'archiveMediaData');
    fs.mkdirSync(destDir, { recursive: true });

    const safeName = sanitizeMediaFileName(fileName, mimeType);
    const destPath = getAvailableMediaPath(destDir, safeName);
    const buffer = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer));
    fs.writeFileSync(destPath, buffer);
    return path.relative(projectPath, destPath);
  } catch (err: any) {
    throw new Error(`Failed to archive media data: ${err.message}`);
  }
});

ipcMain.handle('clipboard:writeText', async (_, text: string) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});
}
