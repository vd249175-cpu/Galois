import { useEffect, type MutableRefObject } from 'react';
import { BC } from '../../../CORE/BloodChannels';

interface NormalizedMarkdown {
  text: string;
  tags: string[];
}

interface UseExternalFileSyncOptions {
  currentFile: string;
  contentRef: MutableRefObject<string>;
  lastSavedContentRef: MutableRefObject<string>;
  pendingInternalContentRef: MutableRefObject<string | null>;
  autoSaveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  normalizeMarkdown: (content: string) => NormalizedMarkdown;
  applyExternalContent: (content: string, tags: string[]) => void;
  setStatusMessage: (message: string) => void;
  updateBloodKey: (key: string, value: any) => void;
}

/**
 * Watches only the active note and promotes disk writes made by agents or
 * other programs to the same Blood fileSaved event used by in-app saves.
 */
export function useExternalFileSync({
  currentFile,
  contentRef,
  lastSavedContentRef,
  pendingInternalContentRef,
  autoSaveTimerRef,
  normalizeMarkdown,
  applyExternalContent,
  setStatusMessage,
  updateBloodKey,
}: UseExternalFileSyncOptions) {
  useEffect(() => {
    if (!currentFile) return;
    const api = window.electronAPI;
    let disposed = false;
    let watchedPath = currentFile;

    const removeFileChangedListener = api.onFileChanged(async (payload) => {
      if (disposed || payload.path !== watchedPath) return;
      if (!payload.exists) {
        setStatusMessage('文件已被外部删除');
        updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
        return;
      }

      try {
        const rawContent = await api.readFile(currentFile);
        const normalized = normalizeMarkdown(rawContent);
        const diskContent = normalized.text;

        // Ignore the fs.watch echo produced by this editor's own IPC write.
        if (
          diskContent === pendingInternalContentRef.current
          || diskContent === lastSavedContentRef.current
        ) return;

        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }

        const hasLocalChanges = contentRef.current !== lastSavedContentRef.current;
        if (hasLocalChanges) {
          const loadExternal = window.confirm(
            '当前笔记同时存在未保存编辑和外部修改。\n\n选择“确定”加载 Agent/外部版本；选择“取消”保留编辑器版本，后续保存会覆盖外部版本。'
          );
          if (!loadExternal) {
            lastSavedContentRef.current = diskContent;
            setStatusMessage('已保留本地编辑；文件存在外部修改');
            updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
            return;
          }
        }

        lastSavedContentRef.current = diskContent;
        applyExternalContent(diskContent, normalized.tags);
        setStatusMessage(`已载入外部修改 ${new Date().toLocaleTimeString()}`);
        updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
      } catch (err: any) {
        console.error('[Editor] Failed to reload externally changed note:', currentFile, err);
        setStatusMessage(`外部修改载入失败: ${err.message || String(err)}`);
      }
    });

    api.watchFile(currentFile)
      .then((resolvedPath) => {
        watchedPath = resolvedPath;
      })
      .catch((err) => {
        console.error('[Editor] Failed to watch active note:', currentFile, err);
      });

    return () => {
      disposed = true;
      removeFileChangedListener();
      void api.unwatchFile(watchedPath).catch((err) => {
        console.error('[Editor] Failed to stop watching note:', watchedPath, err);
      });
    };
  }, [currentFile]);
}
