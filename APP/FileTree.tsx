import { useEffect, useState } from 'react';
import { Blood, useBloodChannel } from '../CORE/Blood';

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
  const projectPath = useBloodChannel(['project.path'], () =>
    Blood.getValue<string>('project.path', '')
  );

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');

  // Watch for save/created events to refresh list
  const fileSavedEvent = useBloodChannel(['events.fileSaved.'], () =>
    Blood.getValue<Record<string, number>>('events.fileSaved.', {})
  );

  // Load project files when directory changes or files are saved
  useEffect(() => {
    if (!projectPath) return;

    const loadFiles = async () => {
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        // Clean out hidden folders (e.g. .git, .build, node_modules)
        const filtered = list.filter(
          (f: any) =>
            !f.name.startsWith('.') &&
            f.name !== 'node_modules' &&
            f.name !== 'dist' &&
            f.name !== 'media' && // Media folder itself is hidden from list, we display archived media directly inside notes
            f.name !== '.build'
        );
        setFiles(filtered);
      } catch (err) {
        console.error('Failed to load project directory files:', err);
      }
    };
    loadFiles();
  }, [projectPath, fileSavedEvent]);

  // Open directory selection dialog
  const handleOpenFolder = async () => {
    try {
      const selectedDir = await (window as any).electronAPI.openDirectory();
      if (selectedDir) {
        Blood.updateKey('project.path', selectedDir);
        setSelectedPath('');
      }
    } catch (err) {
      console.error('Failed to select project directory:', err);
    }
  };

  // Create new Markdown Note
  const handleCreateFile = async () => {
    if (!projectPath) return;
    const name = prompt('Enter name of the new note (e.g. My Note):');
    if (!name) return;

    const cleanName = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`;
    const fullPath = `${projectPath}/${cleanName}`;
    const defaultContent = `# ${name.trim()}\n\nStart writing here...\n`;

    try {
      await (window as any).electronAPI.writeFile(fullPath, defaultContent);
      
      // Trigger list refresh
      Blood.updateKey(`events.fileSaved.${fullPath}`, Date.now());

      // Instantly open the new file in editor
      handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0 });
    } catch (err: any) {
      alert(`Failed to create note: ${err.message}`);
    }
  };

  const handleFileClick = (file: FileInfo) => {
    if (file.isDir) return; // Flat notebook focus
    
    setSelectedPath(file.path);
    const targetEditorId = Blood.getValue<string | null>('system.lastFocusedEditorId', null)
      || Blood.getValue<string[]>('system.activeEditors', [])[0];

    if (targetEditorId) {
      Blood.updateKey(`events.openFile.${targetEditorId}`, file.path);
    } else {
      Blood.updateKey('events.openFile.global', file.path);
    }
  };

  // Filter files matching query
  const filteredFiles = files.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (f.name.endsWith('.md') || 
       ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(f.name.split('.').pop()?.toLowerCase() || ''))
  );

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'md') {
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
          <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
          <path d="M10 1.5V4h3.5" />
        </svg>
      );
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent-color)' }}>
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
          <circle cx="5.5" cy="5.5" r="1.5" />
          <path d="M2 11.5l3.5-3.5 4 4" />
          <path d="M9 9.5l2-2 3 3" />
        </svg>
      );
    }
    // Media audio/video icon
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent-color)' }}>
        <path d="M14.5 8a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        <path d="M7.5 5.5v5l4-2.5-4-2.5z" />
      </svg>
    );
  };

  if (!projectPath) {
    return (
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
        <svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
          <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
        </svg>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Welcome to DNOTE</h4>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          Open any folder on your device containing Markdown notes and media files.
        </p>
        <button
          className="right-sidebar-btn"
          onClick={handleOpenFolder}
          style={{ width: 'auto', height: '30px', padding: '0 16px', fontSize: '11px', fontWeight: 600 }}
        >
          Open Folder
        </button>
      </div>
    );
  }

  const folderName = projectPath.split('/').pop() || projectPath;

  return (
    <div className="file-list" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 10px 8px 10px' }}>
      {/* Directory Title and Open button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px' }}>
            Notebook
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }} title={projectPath}>
            {folderName}
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="area-btn" onClick={handleCreateFile} title="New Note">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <button className="area-btn" onClick={handleOpenFolder} title="Switch Notebook">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
              <path d="M4 10.5h8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Filter notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            padding: '5px 8px',
            borderRadius: '6px',
            fontSize: '11px',
            outline: 'none',
          }}
        />
      </div>

      {/* Files List */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {filteredFiles.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            No notes found.
          </div>
        ) : (
          filteredFiles.map((file) => {
            const isSelected = selectedPath === file.path;
            return (
              <div
                key={file.path}
                className={`file-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleFileClick(file)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isSelected ? 'var(--highlight-color)' : 'transparent',
                  color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                  fontWeight: isSelected ? 600 : 400,
                  borderRadius: '6px',
                  padding: '5px 8px',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
              >
                {getFileIcon(file.name)}
                <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name.substring(0, file.name.lastIndexOf('.md') !== -1 ? file.name.lastIndexOf('.md') : file.name.length)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
