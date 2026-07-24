import React, { useEffect, useState } from 'react';
import { calculateAllResolvedTags } from './tagResolver';
import { useProjectLifecycle } from './useProjectLifecycle';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { Blood } from '../../CORE/Blood';
import { FileInfo } from './types';
import { tokenizeQuery, matchesTagQuery, matchesFilename } from './searchHelpers';
import { useProjectHistory } from './useProjectHistory';
import { FileTreeSurface } from './FileTreeSurface';
import { useFileTreeSearch } from './useFileTreeSearch';
import { useFileTreeTemplates } from './useFileTreeTemplates';

export function FileTreeView({
  state,
  updateBloodKey,
  lastAction,
}: {
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = state[BC.system.projectPath] || '';
  const fileSavedMap = state[BC_PREFIX.fileSavedAll] || {};
  const fileSavedEvent = Object.values(fileSavedMap).reduce(
    (max: number, val: any) => Math.max(max, Number(val) || 0),
    0
  );

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const linkedSearchQuery = state[BC.system.fileSearchQuery] || '';

  const [showHistoryMenu, setShowHistoryMenu] = useState(false);

  // Hook for project history logic
  const { displayedHistory, demoPath } = useProjectHistory(projectPath);

  const handleSelectHistoryProject = (path: string) => {
    updateBloodKey(BC.system.projectPath, path);
    setSelectedPath('');
    setShowHistoryMenu(false);
  };

  // Click-outside listener for history projects dropdown menu
  useEffect(() => {
    if (!showHistoryMenu) return;
    const handleGlobalClick = (e: MouseEvent) => {
      const menu = document.getElementById('history-projects-menu');
      const btn = document.getElementById('history-projects-btn');
      if (menu && !menu.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) {
        setShowHistoryMenu(false);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [showHistoryMenu]);

  const {
    autocompleteIndex, filteredSuggestions, handleSelectSuggestion, searchQuery,
    setAutocompleteIndex, setSearchQuery, setShowAutocomplete, showAutocomplete,
  } = useFileTreeSearch({
    resolvedTags: state[BC.system.resolvedTags] || {},
    staticTags: state[BC.system.staticTags] || {},
    linkedSearchQuery,
    updateBloodKey,
  });
  // Project lifecycle scripts (on_project_open.py, on_project_run.py, on_project_close.py)
  useProjectLifecycle(projectPath);

  // Handle sidebar action triggers
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'fileTree.createFile') handleCreateFile();
    else if (lastAction.id === 'fileTree.openFolder') handleOpenFolder();
    else if (lastAction.id === 'fileTree.openTemplates') handleOpenTemplateModal();
    else if (lastAction.id === 'fileTree.manageTemplates') handleOpenTempleFolder();
  }, [lastAction]);

  // Load project markdown files and compute resolved tags
  useEffect(() => {
    if (!projectPath) return;

    const loadFiles = async () => {
      try {
        await window.electronAPI.ensureNotebookProjectDeclaration(projectPath);
        const list = await (window as any).electronAPI.listDir(projectPath);
        const mdFiles = list.filter((f: any) => !f.isDir && f.name.endsWith('.md'));
        const maxIterations = state[BC.system.maxIterations] || 3;

        const { resolved: allResolved, staticTags: allStaticTags, icons: allIcons } = await calculateAllResolvedTags(
          projectPath,
          mdFiles,
          maxIterations,
          (errMsg: string) => {
            updateBloodKey(BC.events.scriptError('fileTree'), { message: errMsg, ts: Date.now() });
          }
        );

        updateBloodKey(BC.system.resolvedTags, allResolved);
        updateBloodKey(BC.system.staticTags, allStaticTags);

        const parsedFiles: FileInfo[] = mdFiles.map((file: any) => ({
          name: file.name,
          path: file.path,
          isDir: false,
          size: file.size,
          tags: allStaticTags[file.path] || [],
          icon: allIcons[file.path] || '',
        }));
        parsedFiles.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(parsedFiles);
      } catch (err) {
        console.error('[FileTree] Failed to read project folder:', err);
      }
    };

    loadFiles();
  }, [projectPath, fileSavedEvent, state[BC.system.maxIterations]]);

  const handleOpenFolder = async () => {
    try {
      const selectedDir = await (window as any).electronAPI.openDirectory();
      if (selectedDir) {
        updateBloodKey(BC.system.projectPath, selectedDir);
        setSelectedPath('');
      }
    } catch (err) {
      console.error('[FileTree] Failed to open directory dialog:', err);
    }
  };

  const handleCreateFile = async () => {
    if (!projectPath) return;
    showPrompt('Enter the name of the new note (e.g. My Note):', '', async (name) => {
      if (!name) return;

      const cleanName = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`;
      const fullPath = `${projectPath}/${cleanName}`;

      const list = await (window as any).electronAPI.listDir(projectPath);
      const exists = list.some((f: any) => f.name.toLowerCase() === cleanName.toLowerCase());
      if (exists) {
        alert('A note with this name already exists!');
        const match = list.find((f: any) => f.name.toLowerCase() === cleanName.toLowerCase());
        if (match) handleFileClick({ name: match.name, path: match.path, isDir: false, size: 0, tags: [] });
        return;
      }

      const defaultContent = `---\ntags:\n---\n# ${name.trim()}\n\n`;
      try {
        await (window as any).electronAPI.writeFile(fullPath, defaultContent);
        updateBloodKey(BC.events.fileSaved(fullPath), Date.now());
        handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0, tags: [] });
      } catch (err: any) {
        alert(`Failed to create note file: ${err.message}`);
      }
    });
  };

  const handleFileClick = (file: FileInfo) => {
    setSelectedPath(file.path);
    // Query Blood synchronously to bypass React state synchronization latency
    const lastFocused = Blood.getValue<string | null>(BC.system.lastFocusedEditorId, null);
    const activeEds = Blood.getValue<string[]>(BC.system.activeEditors, []);
    
    let targetEditorId = lastFocused || activeEds[0];
    if (!targetEditorId) {
      const allState = Blood.getRawState() || {};
      const prefix = 'system.areaComponentTypes.';
      for (const [key, value] of Object.entries(allState)) {
        if (key.startsWith(prefix) && value === 'editor') {
          targetEditorId = key.substring(prefix.length);
          break;
        }
      }
    }
    if (!targetEditorId) targetEditorId = 'editor-root';
    
    console.log('[FileTree] Clicked file:', file.path, 'lastFocused:', lastFocused, 'activeEds:', activeEds, 'targetEditorId:', targetEditorId);
    updateBloodKey(BC.events.openFile(targetEditorId), file.path);
  };

  const handleDeleteFile = async (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation();
    const displayName = file.name.substring(0, file.name.lastIndexOf('.md'));
    const ok = confirm(`Are you sure you want to delete note "${displayName}"?\nThis cannot be undone.`);
    if (!ok) return;

    try {
      await (window as any).electronAPI.deleteFile(file.path);
      
      const activeEditors = state[BC.system.activeEditors] || [];
      activeEditors.forEach((editorId: string) => {
        const opened = state[BC.events.openFile(editorId)] || '';
        if (opened === file.path) {
          updateBloodKey(BC.events.openFile(editorId), '');
        }
      });
      if (state[BC.events.openFile('global')] === file.path) {
        updateBloodKey(BC.events.openFile('global'), '');
      }

      if (selectedPath === file.path) {
        setSelectedPath('');
      }

      updateBloodKey(BC.events.fileSaved(file.path), Date.now());
    } catch (err: any) {
      alert(`Failed to delete note: ${err.message}`);
    }
  };

  const handleRenameFile = async (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation();
    const currentName = file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name;
    
    showPrompt('重命名笔记:', currentName, async (newName) => {
      if (!newName || newName.trim() === currentName) return;
      
      const cleanName = newName.trim().endsWith('.md') ? newName.trim() : `${newName.trim()}.md`;
      const oldPath = file.path;
      const dirPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const newPath = `${dirPath}/${cleanName}`;

      try {
        const list = await (window as any).electronAPI.listDir(dirPath);
        const exists = list.some((f: any) => f.name.toLowerCase() === cleanName.toLowerCase() && f.path !== oldPath);
        if (exists) {
          alert('同名笔记已存在！');
          return;
        }

        await (window as any).electronAPI.renameFile(oldPath, newPath);

        const activeEditors = state[BC.system.activeEditors] || [];
        activeEditors.forEach((editorId: string) => {
          const opened = state[BC.events.openFile(editorId)] || '';
          if (opened === oldPath) {
            updateBloodKey(BC.events.openFile(editorId), newPath);
          }
        });
        if (state[BC.events.openFile('global')] === oldPath) {
          updateBloodKey(BC.events.openFile('global'), newPath);
        }

        if (selectedPath === oldPath) {
          setSelectedPath(newPath);
        }

        updateBloodKey(BC.events.fileSaved(oldPath), Date.now());
        updateBloodKey(BC.events.fileSaved(newPath), Date.now());
      } catch (err: any) {
        alert(`重命名笔记失败: ${err.message}`);
      }
    });
  };

  const {
    templateFiles, showTemplateModal, setShowTemplateModal, iconPickerFile, setIconPickerFile,
    promptConfig, setPromptConfig, showPrompt, handleSaveIcon, handleOpenTemplateModal,
    handleUseTemplate, handleOpenTempleFolder,
  } = useFileTreeTemplates({ projectPath, updateBloodKey, handleFileClick });

  const filteredFiles = files.filter((f) => {
    if (!searchQuery.trim()) return true;

    const hasTagIndicator = searchQuery.includes('#');
    
    const tagTokens: { type: 'tag' | 'operator'; value: string }[] = [];
    const filenameTokens: string[] = [];

    if (!hasTagIndicator) {
      filenameTokens.push(...searchQuery.trim().split(/\s+/));
    } else {
      const allTokens = tokenizeQuery(searchQuery.trim());
      for (const t of allTokens) {
        if (t.type === 'tag') {
          tagTokens.push({ type: 'tag', value: t.value });
        } else if (t.type === 'operator') {
          tagTokens.push({ type: 'operator', value: t.value });
        } else {
          filenameTokens.push(t.value);
        }
      }
    }

    const tagIsMatch = matchesTagQuery(f.tags || [], tagTokens);
    const fileIsMatch = matchesFilename(f.name, filenameTokens);

    return tagIsMatch && fileIsMatch;
  });

  if (!projectPath) {
    return (
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', overflowY: 'auto' }}>
        <svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
          <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
        </svg>
        <h4 style={{ fontSize: 'calc(var(--panel-title-size, 11px) + 2px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>欢迎使用 TLKS</h4>
        <p style={{ fontSize: 'var(--ui-font-size, 12px)', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          打开一个笔记本目录以开始管理标签格子笔记。
        </p>
        <button className="right-sidebar-btn" onClick={handleOpenFolder} style={{ width: 'auto', height: '30px', padding: '0 16px', fontSize: 'var(--ui-font-size, 12px)', fontWeight: 600, marginBottom: '20px' }}>
          打开文件夹
        </button>

        {displayedHistory.length > 0 && (
          <div style={{ width: '100%', maxWidth: '240px', marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
            <span style={{ fontSize: 'calc(var(--ui-font-size, 12px) - 3px)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px', textAlign: 'left', marginBottom: '4px' }}>历史项目</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
              {displayedHistory.map((item) => {
                const name = item.split('/').pop() || item;
                const isDemo = item === demoPath;
                return (
                  <button
                    key={item}
                    onClick={() => handleSelectHistoryProject(item)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1.2px solid rgba(0, 0, 0, 0.08)',
                      backgroundColor: 'rgba(255, 255, 255, 0.45)',
                      color: 'var(--text-main)',
                      fontSize: 'var(--ui-font-size, 12px)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--highlight-color)';
                      e.currentTarget.style.borderColor = 'var(--accent-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.45)';
                      e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                    }}
                    title={item}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {name}
                    </span>
                    {isDemo && (
                      <span style={{ fontSize: 'calc(var(--ui-font-size, 12px) - 4px)', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(255, 59, 48, 0.1)', color: 'var(--accent-color)' }}>
                        演示
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const folderName = projectPath.split('/').pop() || projectPath;

  return <FileTreeSurface {...{
    autocompleteIndex, demoPath, displayedHistory, filteredFiles, filteredSuggestions, folderName,
    handleCreateFile, handleDeleteFile, handleFileClick, handleOpenFolder, handleOpenTempleFolder,
    handleRenameFile, handleSaveIcon, handleSelectHistoryProject, handleSelectSuggestion,
    handleUseTemplate, iconPickerFile, projectPath, promptConfig, searchQuery, selectedPath,
    setAutocompleteIndex, setIconPickerFile, setPromptConfig, setSearchQuery, setShowAutocomplete,
    setShowHistoryMenu, setShowTemplateModal, showAutocomplete, showHistoryMenu, showTemplateModal,
    templateFiles,
  }} />;
}
