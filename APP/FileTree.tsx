import { useEffect, useState } from 'react';
import { Blood } from '../CORE/Blood';

interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export const FileTreeComponent = {
  typeId: 'fileTree',
  displayName: 'File Explorer',
  iconName: 'folder',
  component: FileTreeView,
};

function FileTreeView() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Expose file listing from Electron Node API
    const loadFiles = async () => {
      try {
        const resolvedPath = '.';
        const list = await (window as any).electronAPI.listDir(resolvedPath);
        setFiles(list);
      } catch (err) {
        console.error('Failed to load workspace files:', err);
      }
    };
    loadFiles();
  }, []);

  const toggleDirectory = async (dirPath: string) => {
    const isExpanded = !!expandedDirs[dirPath];
    setExpandedDirs({
      ...expandedDirs,
      [dirPath]: !isExpanded,
    });
  };

  const handleFileClick = (file: FileInfo) => {
    if (file.isDir) {
      toggleDirectory(file.path);
    } else {
      // Find the last focused editor or fallback to the first active editor
      const targetEditorId = Blood.getValue<string | null>('system.lastFocusedEditorId', null)
        || Blood.getValue<string[]>('system.activeEditors', [])[0];

      if (targetEditorId) {
        Blood.updateKey(`events.openFile.${targetEditorId}`, file.path);
      } else {
        // Fallback to global if no editor instance is active
        Blood.updateKey('events.openFile.global', file.path);
      }
    }
  };

  return (
    <div className="file-list">
      <div className="file-list-header">DNOTE Workspace</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {files
          .filter((f) => !f.name.startsWith('.') && f.name !== 'node_modules' && f.name !== 'dist' && f.name !== '.build')
          .map((file) => (
            <div key={file.path}>
              <div
                className={`file-item ${file.isDir ? 'directory' : 'file'}`}
                onClick={() => handleFileClick(file)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {file.isDir ? (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent-color)' }}>
                    <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                    <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
                    <path d="M10 1.5V4h3.5" />
                  </svg>
                )}
                <span>{file.name}</span>
              </div>
              
              {file.isDir && expandedDirs[file.path] && (
                <SubFolder dirPath={file.path} onFileClick={handleFileClick} expandedDirs={expandedDirs} toggleDir={toggleDirectory} />
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

interface SubFolderProps {
  dirPath: string;
  onFileClick: (file: FileInfo) => void;
  expandedDirs: Record<string, boolean>;
  toggleDir: (path: string) => void;
}

function SubFolder({ dirPath, onFileClick, expandedDirs, toggleDir }: SubFolderProps) {
  const [subFiles, setSubFiles] = useState<FileInfo[]>([]);

  useEffect(() => {
    const loadSubFiles = async () => {
      try {
        const list = await (window as any).electronAPI.listDir(dirPath);
        setSubFiles(list);
      } catch (err) {
        console.error(err);
      }
    };
    loadSubFiles();
  }, [dirPath]);

  return (
    <div style={{ paddingLeft: '12px', borderLeft: '1px solid var(--border-color)', marginLeft: '6px' }}>
      {subFiles
        .filter((f) => !f.name.startsWith('.'))
        .map((file) => (
          <div key={file.path}>
            <div
              className={`file-item ${file.isDir ? 'directory' : 'file'}`}
              onClick={() => onFileClick(file)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {file.isDir ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent-color)' }}>
                  <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                  <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
                  <path d="M10 1.5V4h3.5" />
                </svg>
              )}
              <span>{file.name}</span>
            </div>
            {file.isDir && expandedDirs[file.path] && (
              <SubFolder
                dirPath={file.path}
                onFileClick={onFileClick}
                expandedDirs={expandedDirs}
                toggleDir={toggleDir}
              />
            )}
          </div>
        ))}
    </div>
  );
}
