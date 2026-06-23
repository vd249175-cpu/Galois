import { useEffect, useState } from 'react';
import { parseFrontmatterTags, resolveTagsSync } from '../utils';

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
  bloodChannels: [
    'project.path',
    'project.resolvedTags',
    'project.maxIterations',
    'events.fileSaved.',
    'system.lastFocusedEditorId',
    'system.activeEditors'
  ]
};

function FileTreeView({
  state,
  updateBloodKey,
}: {
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
}) {
  const projectPath = state['project.path'] || '';
  const fileSavedMap = state['events.fileSaved.'] || {};
  const fileSavedEvent = Object.values(fileSavedMap).reduce((max: number, val: any) => Math.max(max, Number(val) || 0), 0);

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');

  // Load project markdown files and parse their YAML frontmatter tags
  useEffect(() => {
    if (!projectPath) return;

    const calculateAllResolvedTags = async (mdFiles: any[]) => {
      const initialTagsMap: Record<string, string[]> = {};
      const fileRawTags: Record<string, string[]> = {};

      for (const file of mdFiles) {
        try {
          const rawContent = await (window as any).electronAPI.readFile(file.path);
          const rawTags = parseFrontmatterTags(rawContent);
          const tags = resolveTagsSync(rawTags, rawContent);
          initialTagsMap[file.path] = tags;
          fileRawTags[file.path] = rawTags;
        } catch (e) {
          console.error('[Tags Initializer] Failed to read/parse:', file.path, e);
          initialTagsMap[file.path] = [];
          fileRawTags[file.path] = [];
        }
      }

      const maxIterations = state['project.maxIterations'] || 3;
      let resolvedTagsMap = { ...initialTagsMap };

      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        const nextTagsMap = { ...resolvedTagsMap };
        let hasChanges = false;

        const runTasks = mdFiles.map(async (file) => {
          const rawTags = fileRawTags[file.path] || [];
          const scriptTags = rawTags.filter(t => t.startsWith('run:'));
          if (scriptTags.length === 0) return;

          const currentFileResolved = [...(initialTagsMap[file.path] || [])];
          const scriptDir = `${projectPath}/script`;

          for (const tag of scriptTags) {
            const scriptName = tag.substring(4).trim();
            try {
              const envResolvedTags = JSON.stringify(resolvedTagsMap).replace(/'/g, "'\\''");
              const cmd = `DNOTE_NOTE_PATH="${file.path}" DNOTE_RESOLVED_TAGS='${envResolvedTags}' uv run ${scriptName}`;
              const result = await (window as any).electronAPI.execCommand(cmd, scriptDir);
              
              if (result && result.stdout) {
                const parsed = JSON.parse(result.stdout.trim());
                const scriptCalculated = Array.isArray(parsed) ? parsed : (parsed.tags || []);
                scriptCalculated.forEach((t: any) => {
                  const val = String(t).trim();
                  if (val && !currentFileResolved.includes(val)) {
                    currentFileResolved.push(val);
                  }
                });
              }
            } catch (err) {
              console.error(`[Tags Resolver] Iterative script failed for note: ${file.name}, script: ${scriptName}`, err);
            }
          }

          currentFileResolved.sort();
          const prevTags = resolvedTagsMap[file.path] || [];
          const isDifferent = prevTags.length !== currentFileResolved.length || 
                              prevTags.some((t, idx) => t !== currentFileResolved[idx]);

          if (isDifferent) {
            nextTagsMap[file.path] = currentFileResolved;
            hasChanges = true;
          }
        });

        await Promise.all(runTasks);

        if (!hasChanges) {
          break;
        }
        resolvedTagsMap = nextTagsMap;
      }

      return resolvedTagsMap;
    };

    const loadFiles = async () => {
      console.log('[FileTree] loadFiles called. fileSavedEvent:', fileSavedEvent);
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        const mdFiles = list.filter((f: any) => !f.isDir && f.name.endsWith('.md'));

        // Iterative calculation of dynamic tags
        const allResolved = await calculateAllResolvedTags(mdFiles);
        console.log('[FileTree] resolvedTags computed:', allResolved);
        updateBloodKey('project.resolvedTags', allResolved);

        const parsedFiles: FileInfo[] = [];
        for (const file of mdFiles) {
          const tags = allResolved[file.path] || [];
          parsedFiles.push({
            name: file.name,
            path: file.path,
            isDir: false,
            size: file.size,
            tags,
          });
        }

        parsedFiles.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(parsedFiles);
      } catch (err) {
        console.error('Failed to read project folder contents:', err);
      }
    };
    loadFiles();
  }, [projectPath, fileSavedEvent, state['project.maxIterations']]);

  // Notebook project-level lifecycle scripts coordinator
  useEffect(() => {
    if (!projectPath) return;

    let isUnloading = false;

    // Helper to check if a script exists in the script/ directory
    const checkScriptExists = async (scriptName: string) => {
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        const hasScriptDir = list.some((f: any) => f.isDir && f.name === 'script');
        if (!hasScriptDir) return false;
        
        const scriptDir = `${projectPath}/script`;
        const scriptList = await (window as any).electronAPI.listDir(scriptDir);
        return scriptList.some((f: any) => !f.isDir && f.name === scriptName);
      } catch (err) {
        return false;
      }
    };

    // 1. Run on_project_open.py and on_project_run.py
    const triggerLifecycleScripts = async () => {
      const scriptDir = `${projectPath}/script`;
      
      // A. Open hook (runs once, blocking subsequent commands)
      const hasOpenScript = await checkScriptExists('on_project_open.py');
      if (hasOpenScript) {
        console.log('[Project Lifecycle] Executing on_project_open.py...');
        const outPath = `${projectPath}/script/on_project_open.json`;
        const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_open.py`;
        try {
          await (window as any).electronAPI.execCommand(cmd, scriptDir);
          console.log('[Project Lifecycle] on_project_open.py completed successfully.');
        } catch (err: any) {
          console.error('[Project Lifecycle] on_project_open.py failed:', err.message || err);
        }
      }

      // B. Run hook (spawns in background as a daemon)
      const hasRunScript = await checkScriptExists('on_project_run.py');
      if (hasRunScript) {
        console.log('[Project Lifecycle] Executing on_project_run.py (background daemon)...');
        const outPath = `${projectPath}/script/on_project_run.json`;
        // Use '&' to run in background in macOS shell
        const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_run.py &`;
        try {
          await (window as any).electronAPI.execCommand(cmd, scriptDir);
        } catch (err: any) {
          console.error('[Project Lifecycle] Failed to launch on_project_run.py daemon:', err.message || err);
        }
      }
    };

    triggerLifecycleScripts();

    // 2. Handle app close (window exit) via beforeunload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUnloading) return; // Allow unload if already completed/handling

      // Prevent immediate close
      e.preventDefault();
      e.returnValue = ''; // Standard cancellation returnValue

      isUnloading = true;

      // Run cleanup close script
      const runCloseOnUnload = async () => {
        try {
          const hasCloseScript = await checkScriptExists('on_project_close.py');
          if (hasCloseScript) {
            console.log('[Project Lifecycle] Executing on_project_close.py on unload...');
            const scriptDir = `${projectPath}/script`;
            const outPath = `${projectPath}/script/on_project_close.json`;
            const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_close.py`;
            await (window as any).electronAPI.execCommand(cmd, scriptDir);
            console.log('[Project Lifecycle] on_project_close.py unload completed.');
          }
        } catch (err: any) {
          console.error('[Project Lifecycle] on_project_close.py unload failed:', err.message || err);
        } finally {
          // Re-trigger window close which will exit since isUnloading is now true
          window.close();
        }
      };

      runCloseOnUnload();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // 3. Handle project switch (cleanup of previous project)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      const runCloseOnSwitch = async () => {
        try {
          const hasCloseScript = await checkScriptExists('on_project_close.py');
          if (hasCloseScript) {
            console.log('[Project Lifecycle] Executing on_project_close.py on switch from:', projectPath);
            const scriptDir = `${projectPath}/script`;
            const outPath = `${projectPath}/script/on_project_close.json`;
            const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_close.py`;
            await (window as any).electronAPI.execCommand(cmd, scriptDir);
            console.log('[Project Lifecycle] on_project_close.py switch completed.');
          }
        } catch (err: any) {
          console.error('[Project Lifecycle] on_project_close.py switch failed:', err.message || err);
        }
      };

      runCloseOnSwitch();
    };
  }, [projectPath]);

  // Open directory selection dialog
  const handleOpenFolder = async () => {
    try {
      const selectedDir = await (window as any).electronAPI.openDirectory();
      if (selectedDir) {
        updateBloodKey('project.path', selectedDir);
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
      updateBloodKey(`events.fileSaved.${fullPath}`, Date.now());

      // Open node in editor
      handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0, tags: [name.trim()] });
    } catch (err: any) {
      alert(`Failed to create note file: ${err.message}`);
    }
  };

  const handleFileClick = (file: FileInfo) => {
    setSelectedPath(file.path);
    const targetEditorId = state['system.lastFocusedEditorId']
      || (state['system.activeEditors'] || [])[0];

    if (targetEditorId) {
      updateBloodKey(`events.openFile.${targetEditorId}`, file.path);
    } else {
      updateBloodKey('events.openFile.global', file.path);
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
