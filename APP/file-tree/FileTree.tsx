import React, { useEffect, useState, useMemo } from 'react';
import { calculateAllResolvedTags } from './tagResolver';
import { useProjectLifecycle } from './useProjectLifecycle';
import { fileTreeActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { updateYamlFrontmatterIcon } from '../utils';
import { Blood } from '../../CORE/Blood';

// Extracted modules
import { FileInfo } from './types';
import {
  tokenizeQuery,
  matchesTagQuery,
  matchesFilename
} from './searchHelpers';
import { useProjectHistory } from './useProjectHistory';
import { TemplateModal } from './TemplateModal';
import { PromptModal } from './PromptModal';
import { IconPickerModal } from './IconPickerModal';
import { HistoryProjectsMenu } from './HistoryProjectsMenu';
import { FileCard } from './FileCard';

/**
 * FileTreeComponent — Lattice Explorer 插件注册对象
 *
 * 契约声明：
 *   WRITES: system.projectPath, system.resolvedTags, system.maxIterations,
 *           events.fileSaved.*, events.openFile.{editorId}
 *   READS:  system.projectPath, system.resolvedTags, system.maxIterations,
 *           events.fileSaved.* (触发重算), system.lastFocusedEditorId, system.activeEditors
 *   DEPENDS ON: 无（fileTree 是数据源头）
 */
export const FileTreeComponent = {
  typeId: 'fileTree',
  displayName: '文本浏览器',
  shortName: '浏览器',
  iconName: 'folder',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
    </svg>
  ),
  component: FileTreeView,
  actions: fileTreeActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.resolvedTags,
    BC.system.staticTags,
    BC.system.fileSearchQuery,
    BC.system.maxIterations,
    BC_PREFIX.fileSavedAll,
    BC.system.lastFocusedEditorId,
    BC.system.activeEditors,
  ],
  manifest: {
    description: 'Lattice 笔记文件浏览器，负责计算全量 resolvedTags 并广播给其他插件',
    reads: [
      BC.system.projectPath,
      BC.system.maxIterations,
      BC_PREFIX.fileSavedAll,           // 监听任意文件保存 → 触发 tag 重算
      BC.system.lastFocusedEditorId,    // 确定点击文件发送到哪个 editor
      BC.system.activeEditors,
    ],
    writes: [
      BC.system.projectPath,            // 用户选择新目录时写入
      BC.system.resolvedTags,           // 计算后的全量标签 map（其他插件的核心数据来源）
      BC.system.staticTags,
      BC.system.fileSearchQuery,        // 左侧搜索状态，供 graphView 联动高亮/过滤
      BC.events.fileSaved('*'),         // 新建文件时广播
      BC.events.openFile('*'),          // 点击文件时发给目标 editor
      BC.events.scriptError('fileTree'), // 脚本执行错误广播
    ],
    dependsOn: [],                      // fileTree 是数据源，无依赖
  },
};

function FileTreeView({
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
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

  const allProjectTags = useMemo(() => {
    const resolved = state[BC.system.resolvedTags] || {};
    const staticTags = state[BC.system.staticTags] || {};
    const set = new Set<string>();

    for (const fileTags of Object.values(resolved)) {
      if (Array.isArray(fileTags)) {
        fileTags.forEach(t => {
          if (t && !t.startsWith('re:') && !t.startsWith('run:') && t.includes('#')) {
            t.split('#').filter(Boolean).forEach((part: string) => set.add(part));
          } else {
            set.add(t);
          }
        });
      }
    }

    for (const fileTags of Object.values(staticTags)) {
      if (Array.isArray(fileTags)) {
        fileTags.forEach(t => {
          if (t && !t.startsWith('re:') && !t.startsWith('run:') && t.includes('#')) {
            t.split('#').filter(Boolean).forEach((part: string) => set.add(part));
          } else {
            set.add(t);
          }
        });
      }
    }

    return Array.from(set).sort();
  }, [state[BC.system.resolvedTags], state[BC.system.staticTags]]);

  const filteredSuggestions = useMemo(() => {
    const match = searchQuery.match(/#([^\s#()]*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    
    const getSuggestionDisplay = (suggestion: string) => {
      if (suggestion.startsWith('re:')) return suggestion.substring(3);
      if (suggestion.startsWith('run:')) return suggestion.substring(4);
      return suggestion;
    };

    return allProjectTags.filter((t) => {
      const display = getSuggestionDisplay(t).toLowerCase();
      return display.includes(query) || t.toLowerCase().includes(query);
    });
  }, [searchQuery, allProjectTags]);

  const handleSelectSuggestion = (suggestion: string) => {
    const match = searchQuery.match(/(.*)#([^\s#()]*)$/);
    if (!match) return;
    const prefix = match[1];
    const replacement = `#${suggestion}`;
    setSearchQuery(prefix + replacement + ' ');
    setShowAutocomplete(false);
  };

  useEffect(() => {
    if (linkedSearchQuery !== searchQuery) {
      setSearchQuery(linkedSearchQuery);
      setAutocompleteIndex(0);
    }
  }, [linkedSearchQuery]);

  useEffect(() => {
    if (searchQuery !== linkedSearchQuery) {
      updateBloodKey(BC.system.fileSearchQuery, searchQuery);
    }
  }, [searchQuery]);
  const [templateFiles, setTemplateFiles] = useState<{ name: string; path: string; content: string }[]>([]);
  const [promptConfig, setPromptConfig] = useState<{
    show: boolean;
    title: string;
    defaultValue: string;
    onConfirm: (val: string) => void;
  }>({ show: false, title: '', defaultValue: '', onConfirm: () => {} });

  const showPrompt = (title: string, defaultValue: string, onConfirm: (val: string) => void) => {
    setPromptConfig({ show: true, title, defaultValue, onConfirm });
  };

  const [iconPickerFile, setIconPickerFile] = useState<FileInfo | null>(null);

  const handleSaveIcon = async (file: FileInfo, newIcon: string) => {
    try {
      const content = await (window as any).electronAPI.readFile(file.path);
      const updated = updateYamlFrontmatterIcon(content, newIcon);
      await (window as any).electronAPI.writeFile(file.path, updated);
      setIconPickerFile(null);
      updateBloodKey(BC.events.fileSaved(file.path), Date.now());
    } catch (err: any) {
      alert(`保存图标失败: ${err.message}`);
    }
  };

  // Project lifecycle scripts (on_project_open.py, on_project_run.py, on_project_close.py)
  useProjectLifecycle(projectPath);

  const handleOpenTemplateModal = async () => {
    if (!projectPath) {
      alert('Please open a folder first.');
      return;
    }
    const templeDir = `${projectPath}/temple`;
    try {
      let list: any[] = [];
      try {
        list = await (window as any).electronAPI.listDir(templeDir);
      } catch (err: any) {
        if (err.message.includes('ENOENT') || err.message.includes('no such file')) {
          await (window as any).electronAPI.writeFile(`${templeDir}/.gitkeep`, '');
          list = [];
        } else {
          throw err;
        }
      }
      
      const mdFiles = list.filter((f: any) => !f.isDir && f.name.endsWith('.md'));
      const templates = await Promise.all(
        mdFiles.map(async (file) => {
          const content = await (window as any).electronAPI.readFile(file.path);
          return {
            name: file.name,
            path: file.path,
            content,
          };
        })
      );
      setTemplateFiles(templates);
      setShowTemplateModal(true);
    } catch (err: any) {
      alert(`Failed to load templates: ${err.message}`);
    }
  };

  const handleUseTemplate = async (template: { name: string; path: string; content: string }) => {
    const defaultName = template.name.replace('.md', '');
    showPrompt('Name your new note:', defaultName, async (name) => {
      if (!name) return;

      const cleanName = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`;
      const fullPath = `${projectPath}/${cleanName}`;

      const list = await (window as any).electronAPI.listDir(projectPath);
      const exists = list.some((f: any) => f.name.toLowerCase() === cleanName.toLowerCase());
      if (exists) {
        alert('A note with this name already exists!');
        return;
      }

      const sanitizedContent = template.content;
      try {
        await (window as any).electronAPI.writeFile(fullPath, sanitizedContent);
        updateBloodKey(BC.events.fileSaved(fullPath), Date.now());
        handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0, tags: [] });
        setShowTemplateModal(false);
      } catch (err: any) {
        alert(`Failed to create note from template: ${err.message}`);
      }
    });
  };

  const handleOpenTempleFolder = async () => {
    if (!projectPath) return;
    const templePath = `${projectPath}/temple`;
    try {
      await (window as any).electronAPI.execCommand(`open "${templePath}"`, projectPath);
    } catch (err: any) {
      console.error('[FileTree] Failed to open temple folder:', err);
    }
  };

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

      const defaultContent = `---\ntags:\n  - ${name.trim()}\n---\n# ${name.trim()}\n\n`;
      try {
        await (window as any).electronAPI.writeFile(fullPath, defaultContent);
        updateBloodKey(BC.events.fileSaved(fullPath), Date.now());
        handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0, tags: [name.trim()] });
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

  return (
    <div className="file-list" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 10px 8px 10px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
          <span style={{ fontSize: 'calc(var(--panel-title-size, 11px) - 2px)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px' }}>笔记本</span>
          <span style={{ fontSize: 'var(--panel-title-size, 11px)', fontWeight: 600, color: 'var(--text-main)' }} title={projectPath}>{folderName}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="area-btn" onClick={handleCreateFile} title="新建笔记">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
          </button>
          <button className="area-btn" onClick={handleOpenFolder} title="切换目录">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
              <path d="M4 10.5h8" />
            </svg>
          </button>
          <button id="history-projects-btn" className="area-btn" onClick={() => setShowHistoryMenu(!showHistoryMenu)} title="历史项目" style={{ position: 'relative' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="7" />
              <path d="M8 3v5h3" />
            </svg>
          </button>
        </div>
      </div>

      <HistoryProjectsMenu
        show={showHistoryMenu}
        displayedHistory={displayedHistory}
        projectPath={projectPath}
        demoPath={demoPath}
        onSelectHistoryProject={handleSelectHistoryProject}
      />

      <div style={{ marginBottom: '10px', position: 'relative' }}>
        <input
          type="text"
          placeholder="搜索... #标签 #正则(如 #^cal) 标题(如 ^标题) and or not"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setAutocompleteIndex(0);
            setShowAutocomplete(true);
          }}
          onFocus={() => setShowAutocomplete(true)}
          onBlur={() => {
            setTimeout(() => setShowAutocomplete(false), 200);
          }}
          onKeyDown={(e) => {
            if (showAutocomplete && filteredSuggestions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAutocompleteIndex((prev) => (prev + 1) % filteredSuggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAutocompleteIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = filteredSuggestions[autocompleteIndex];
                if (selected) {
                  handleSelectSuggestion(selected);
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowAutocomplete(false);
              }
            }
          }}
          style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '5px 8px', borderRadius: '6px', fontSize: 'var(--ui-font-size, 12px)', outline: 'none' }}
        />

        {showAutocomplete && filteredSuggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '28px',
            left: 0,
            right: 0,
            zIndex: 1000,
            maxHeight: '160px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-main)',
            border: '1.2px solid rgba(0, 0, 0, 0.12)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            padding: '2px',
          }}>
            {filteredSuggestions.map((suggestion, index) => {
              const isSelected = index === autocompleteIndex;
              const isRegex = suggestion.startsWith('re:');
              const isScript = suggestion.startsWith('run:');
              
              const getSuggestionDisplay = (s: string) => {
                if (s.startsWith('re:')) return s.substring(3);
                if (s.startsWith('run:')) return s.substring(4);
                return s;
              };
              const display = getSuggestionDisplay(suggestion);

              return (
                <div
                  key={suggestion}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectSuggestion(suggestion);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: 'calc(var(--ui-font-size, 12px) - 2px)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--highlight-color)' : 'transparent',
                    color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <span style={{ fontSize: 'calc(var(--ui-font-size, 12px) - 3px)', opacity: 0.7 }}>
                    {isRegex ? '⚡ 正则' : isScript ? '⚡ 脚本' : '#'}
                  </span>
                  <span style={{ fontWeight: isSelected ? 700 : 500 }}>{display}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto' }}>
        {filteredFiles.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 'var(--ui-font-size, 12px)', color: 'var(--text-muted)' }}>没有找到任何笔记。</div>
        ) : (
          <div className="file-grid-container">
            {filteredFiles.map((file) => {
              const isSelected = selectedPath === file.path;
              return (
                <FileCard
                  key={file.path}
                  file={file}
                  isSelected={isSelected}
                  onFileClick={handleFileClick}
                  onRenameFile={handleRenameFile}
                  onDeleteFile={handleDeleteFile}
                  onIconClick={(e, f) => {
                    e.stopPropagation();
                    setIconPickerFile(f);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <TemplateModal
        show={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        templateFiles={templateFiles}
        onUseTemplate={handleUseTemplate}
        onOpenTempleFolder={handleOpenTempleFolder}
      />

      <PromptModal
        show={promptConfig.show}
        title={promptConfig.title}
        defaultValue={promptConfig.defaultValue}
        onConfirm={promptConfig.onConfirm}
        onClose={() => setPromptConfig(prev => ({ ...prev, show: false }))}
      />

      <IconPickerModal
        file={iconPickerFile}
        onClose={() => setIconPickerFile(null)}
        onSaveIcon={handleSaveIcon}
      />
    </div>
  );
}

export default FileTreeComponent;
