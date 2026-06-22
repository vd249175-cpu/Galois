import { useEffect, useState } from 'react';
import { Blood, useBloodChannel } from '../CORE/Blood';

interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  tags: string[];
}

export const FileTreeComponent = {
  typeId: 'fileTree',
  displayName: 'Lattice Explorer',
  iconName: 'folder',
  component: FileTreeView,
};

// Helper to parse YAML frontmatter tags from markdown content
export function parseFrontmatterTags(content: string): string[] {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  if (!match) return [];
  
  const yamlText = match[1];
  const tags: string[] = [];
  
  // Try inline array format first: tags: [t1, t2]
  const tagsInline = yamlText.match(/tags:\s*\[([^\]]*)\]/);
  if (tagsInline) {
    tagsInline[1].split(',').forEach((t) => {
      const clean = t.trim().replace(/['"]/g, '');
      if (clean) tags.push(clean);
    });
    return tags;
  }
  
  // Parse multiline format
  const lines = yamlText.split('\n');
  let inTagsList = false;
  for (const line of lines) {
    const trimLine = line.trim();
    if (trimLine.startsWith('tags:')) {
      const inlineValue = trimLine.substring(5).trim();
      if (inlineValue && inlineValue !== '-') {
        tags.push(inlineValue);
      } else {
        inTagsList = true;
      }
    } else if (inTagsList && trimLine.startsWith('-')) {
      const val = trimLine.substring(1).trim().replace(/['"]/g, '');
      if (val) tags.push(val);
    } else if (trimLine === '') {
      // ignore empty lines
    } else if (line.includes(':')) {
      inTagsList = false;
    }
  }
  return tags;
}

function FileTreeView() {
  const projectPath = useBloodChannel(['project.path'], () =>
    Blood.getValue<string>('project.path', '')
  );

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');

  const fileSavedEvent = useBloodChannel(['events.fileSaved.'], () =>
    Blood.getValue<Record<string, number>>('events.fileSaved.', {})
  );

  // Load project markdown files and parse their YAML frontmatter tags
  useEffect(() => {
    if (!projectPath) return;

    const loadFiles = async () => {
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        // Only load .md files
        const mdFiles = list.filter((f: any) => !f.isDir && f.name.endsWith('.md'));

        const parsedFiles: FileInfo[] = [];
        for (const file of mdFiles) {
          try {
            const rawContent = await (window as any).electronAPI.readFile(file.path);
            const tags = parseFrontmatterTags(rawContent);
            parsedFiles.push({
              name: file.name,
              path: file.path,
              isDir: false,
              size: file.size,
              tags,
            });
          } catch (e) {
            console.error('Failed to parse frontmatter from note:', file.path, e);
          }
        }

        // Sort files alphabetically by name
        parsedFiles.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(parsedFiles);
      } catch (err) {
        console.error('Failed to read project folder contents:', err);
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
      console.error('Failed to open directory selection dialog:', err);
    }
  };

  // Create new Markdown file with default frontmatter tags
  const handleCreateFile = async () => {
    if (!projectPath) return;
    const name = prompt('Enter the name of the new note (e.g. My Note):');
    if (!name) return;

    const cleanName = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`;
    const fullPath = `${projectPath}/${cleanName}`;
    
    // Check if file already exists
    const list = await (window as any).electronAPI.listDir(projectPath);
    const exists = list.some((f: any) => f.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      alert('A note with this name already exists!');
      const match = list.find((f: any) => f.name.toLowerCase() === cleanName.toLowerCase());
      if (match) {
        handleFileClick({ name: match.name, path: match.path, isDir: false, size: 0, tags: [] });
      }
      return;
    }

    const defaultContent = `---\ntags:\n  - ${name.trim()}\n---\n# ${name.trim()}\n\nStart writing here...\n`;

    try {
      await (window as any).electronAPI.writeFile(fullPath, defaultContent);
      
      // Trigger file system redraw
      Blood.updateKey(`events.fileSaved.${fullPath}`, Date.now());

      // Open node in editor
      handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0, tags: [name.trim()] });
    } catch (err: any) {
      alert(`Failed to create note file: ${err.message}`);
    }
  };

  const handleFileClick = (file: FileInfo) => {
    setSelectedPath(file.path);
    const targetEditorId = Blood.getValue<string | null>('system.lastFocusedEditorId', null)
      || Blood.getValue<string[]>('system.activeEditors', [])[0];

    if (targetEditorId) {
      Blood.updateKey(`events.openFile.${targetEditorId}`, file.path);
    } else {
      Blood.updateKey('events.openFile.global', file.path);
    }
  };

  // Filter files matching search query
  const filteredFiles = files.filter((f) => {
    const query = searchQuery.toLowerCase();
    return f.name.toLowerCase().includes(query) || (f.tags || []).some((tag) => tag.toLowerCase().includes(query));
  });

  if (!projectPath) {
    return (
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
        <svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
          <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
        </svg>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Welcome to TLKS</h4>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          Open a notebook directory to start managing Tag Lattice notes.
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
      {/* Sidebar Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px' }}>
            Notebook
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }} title={projectPath}>
            {folderName}
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="area-btn" onClick={handleCreateFile} title="New Note File">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <button className="area-btn" onClick={handleOpenFolder} title="Switch Directory">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
              <path d="M4 10.5h8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Search by note/tag..."
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
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filteredFiles.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            No notes found.
          </div>
        ) : (
          filteredFiles.map((file) => {
            const isSelected = selectedPath === file.path;
            const displayName = file.name.substring(0, file.name.lastIndexOf('.md'));
            return (
              <div
                key={file.path}
                onClick={() => handleFileClick(file)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  backgroundColor: isSelected ? 'var(--highlight-color)' : 'rgba(0,0,0,0.015)',
                  color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                  border: isSelected ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: isSelected ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                    <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
                    <path d="M10 1.5V4h3.5" />
                  </svg>
                  <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </span>
                </div>
                
                {file.tags && file.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {file.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: '8.5px',
                          fontWeight: 600,
                          backgroundColor: isSelected ? 'rgba(255, 59, 48, 0.12)' : 'rgba(0,0,0,0.04)',
                          padding: '1px 3.5px',
                          borderRadius: '3px',
                          color: isSelected ? 'var(--accent-color)' : 'var(--text-muted)',
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
export default FileTreeComponent;
