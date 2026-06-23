import { useEffect, useState } from 'react';
import { calculateAllResolvedTags } from './tagResolver';
import { useProjectLifecycle } from './useProjectLifecycle';
import { fileTreeActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';

interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  tags: string[];
}

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
  displayName: 'Lattice Explorer',
  iconName: 'folder',
  component: FileTreeView,
  actions: fileTreeActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.resolvedTags,
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

  // Project lifecycle scripts (on_project_open.py, on_project_run.py, on_project_close.py)
  useProjectLifecycle(projectPath);

  // Handle sidebar action triggers
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'fileTree.createFile') handleCreateFile();
    else if (lastAction.id === 'fileTree.openFolder') handleOpenFolder();
  }, [lastAction]);

  // Load project markdown files and compute resolved tags
  useEffect(() => {
    if (!projectPath) return;

    const loadFiles = async () => {
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        const mdFiles = list.filter((f: any) => !f.isDir && f.name.endsWith('.md'));
        const maxIterations = state[BC.system.maxIterations] || 3;

        const allResolved = await calculateAllResolvedTags(
          projectPath,
          mdFiles,
          maxIterations,
          (errMsg: string) => {
            // 脚本错误通过 Blood 广播，不再静默失败
            updateBloodKey(BC.events.scriptError('fileTree'), { message: errMsg, ts: Date.now() });
          }
        );

        updateBloodKey(BC.system.resolvedTags, allResolved);

        const parsedFiles: FileInfo[] = mdFiles.map((file: any) => ({
          name: file.name,
          path: file.path,
          isDir: false,
          size: file.size,
          tags: allResolved[file.path] || [],
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
    const name = prompt('Enter the name of the new note (e.g. My Note):');
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

    const defaultContent = `---\ntags:\n  - ${name.trim()}\n---\n# ${name.trim()}\n\nStart writing here...\n`;
    try {
      await (window as any).electronAPI.writeFile(fullPath, defaultContent);
      updateBloodKey(BC.events.fileSaved(fullPath), Date.now());
      handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0, tags: [name.trim()] });
    } catch (err: any) {
      alert(`Failed to create note file: ${err.message}`);
    }
  };

  const handleFileClick = (file: FileInfo) => {
    setSelectedPath(file.path);
    const targetEditorId =
      state[BC.system.lastFocusedEditorId] || (state[BC.system.activeEditors] || [])[0];
    if (targetEditorId) {
      updateBloodKey(BC.events.openFile(targetEditorId), file.path);
    } else {
      updateBloodKey(BC.events.openFile('global'), file.path);
    }
  };

  const filteredFiles = files.filter((f) => {
    const q = searchQuery.toLowerCase();
    return f.name.toLowerCase().includes(q) || (f.tags || []).some((t) => t.toLowerCase().includes(q));
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
        <button className="right-sidebar-btn" onClick={handleOpenFolder} style={{ width: 'auto', height: '30px', padding: '0 16px', fontSize: '11px', fontWeight: 600 }}>
          Open Folder
        </button>
      </div>
    );
  }

  const folderName = projectPath.split('/').pop() || projectPath;

  return (
    <div className="file-list" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 10px 8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px' }}>Notebook</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }} title={projectPath}>{folderName}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="area-btn" onClick={handleCreateFile} title="New Note File">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
          </button>
          <button className="area-btn" onClick={handleOpenFolder} title="Switch Directory">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
              <path d="M4 10.5h8" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Search by note/tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '5px 8px', borderRadius: '6px', fontSize: '11px', outline: 'none' }}
        />
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filteredFiles.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>No notes found.</div>
        ) : (
          filteredFiles.map((file) => {
            const isSelected = selectedPath === file.path;
            const displayName = file.name.substring(0, file.name.lastIndexOf('.md'));
            return (
              <div
                key={file.path}
                onClick={() => handleFileClick(file)}
                style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: isSelected ? 'var(--highlight-color)' : 'rgba(0,0,0,0.015)', color: isSelected ? 'var(--accent-color)' : 'var(--text-main)', border: isSelected ? '1px solid var(--accent-color)' : '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 8px', cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: isSelected ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                    <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
                    <path d="M10 1.5V4h3.5" />
                  </svg>
                  <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                </div>
                {file.tags && file.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {file.tags.map((t) => (
                      <span key={t} style={{ fontSize: '8.5px', fontWeight: 600, backgroundColor: isSelected ? 'rgba(255,59,48,0.12)' : 'rgba(0,0,0,0.04)', padding: '1px 3.5px', borderRadius: '3px', color: isSelected ? 'var(--accent-color)' : 'var(--text-muted)' }}>#{t}</span>
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
