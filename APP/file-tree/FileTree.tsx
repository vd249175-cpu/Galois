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

// ── Tag expression tokenizer and boolean evaluator helpers ──────────────────

function tokenizeQuery(query: string) {
  const regex = /(\(|\)|#\/[^\/]+\/[a-z]*|#[^\s()#]+|and|add|or|not|&&|\|\||!|\S+)/gi;
  const rawTokens = query.match(regex) || [];
  
  const tokens: { type: 'tag' | 'operator' | 'filename'; value: string }[] = [];
  
  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (lower === '(' || lower === ')') {
      tokens.push({ type: 'operator', value: token });
    } else if (lower === 'and' || lower === '&&' || lower === 'add') {
      tokens.push({ type: 'operator', value: '&' });
    } else if (lower === 'or' || lower === '||') {
      tokens.push({ type: 'operator', value: '|' });
    } else if (lower === 'not' || lower === '!') {
      tokens.push({ type: 'operator', value: '!' });
    } else if (token.startsWith('#')) {
      if (token.startsWith('#/')) {
        tokens.push({ type: 'tag', value: token });
      } else {
        const parts = token.split('#').filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) {
            tokens.push({ type: 'operator', value: '&' });
          }
          tokens.push({ type: 'tag', value: '#' + parts[i] });
        }
      }
    } else {
      tokens.push({ type: 'filename', value: token });
    }
  }
  
  return tokens;
}

function evaluateBoolean(tokens: string[]): boolean {
  const outputQueue: string[] = [];
  const operatorStack: string[] = [];
  
  const precedence: Record<string, number> = {
    '|': 1,
    '&': 2,
    '!': 3
  };

  for (const token of tokens) {
    if (token === 'true' || token === 'false') {
      outputQueue.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.pop();
    } else if (token === '&' || token === '|' || token === '!') {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== '(' &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    }
  }

  while (operatorStack.length > 0) {
    outputQueue.push(operatorStack.pop()!);
  }

  const stack: boolean[] = [];
  for (const token of outputQueue) {
    if (token === 'true') {
      stack.push(true);
    } else if (token === 'false') {
      stack.push(false);
    } else if (token === '!') {
      const val = stack.pop();
      if (val === undefined) return false;
      stack.push(!val);
    } else if (token === '&') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return false;
      stack.push(a && b);
    } else if (token === '|') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return false;
      stack.push(a || b);
    }
  }

  return stack[0] || false;
}

function checkSingleTagMatch(fileTags: string[], tagQuery: string): boolean {
  if (tagQuery.startsWith('#/')) {
    const lastSlash = tagQuery.lastIndexOf('/');
    const pattern = tagQuery.slice(2, lastSlash);
    const flags = tagQuery.slice(lastSlash + 1) || 'i';
    try {
      const re = new RegExp(pattern, flags.includes('i') ? flags : flags + 'i');
      return fileTags.some(t => re.test(t));
    } catch {
      const plain = tagQuery.slice(2).toLowerCase();
      return fileTags.some(t => t.toLowerCase().includes(plain));
    }
  } else {
    const plain = tagQuery.slice(1).toLowerCase();
    return fileTags.some(t => t.toLowerCase().includes(plain));
  }
}

function matchesTagQuery(fileTags: string[], tagTokens: { type: 'tag' | 'operator'; value: string }[]): boolean {
  if (tagTokens.length === 0) return true;

  const exprTokens: string[] = [];
  for (let i = 0; i < tagTokens.length; i++) {
    const current = tagTokens[i];
    if (i > 0) {
      const prev = tagTokens[i - 1];
      const prevIsOperand = prev.value === ')' || prev.type === 'tag';
      const currentIsOperand = current.value === '(' || current.value === '!' || current.type === 'tag';
      if (prevIsOperand && currentIsOperand) {
        exprTokens.push('&');
      }
    }
    
    if (current.type === 'tag') {
      const isMatch = checkSingleTagMatch(fileTags, current.value);
      exprTokens.push(isMatch ? 'true' : 'false');
    } else {
      exprTokens.push(current.value);
    }
  }

  return evaluateBoolean(exprTokens);
}

function matchesFilename(filename: string, filenameTokens: string[]): boolean {
  if (filenameTokens.length === 0) return true;
  const nameLower = filename.toLowerCase();
  return filenameTokens.every(token => {
    if (/^\/.*\/\w*$/.test(token)) {
      const lastSlash = token.lastIndexOf('/');
      const pattern = token.slice(1, lastSlash);
      const flags = token.slice(lastSlash + 1) || 'i';
      try {
        const re = new RegExp(pattern, flags.includes('i') ? flags : flags + 'i');
        return re.test(filename);
      } catch {
        return nameLower.includes(token.toLowerCase());
      }
    }
    return nameLower.includes(token.toLowerCase());
  });
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
  const [showTemplateModal, setShowTemplateModal] = useState(false);
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

  // Project lifecycle scripts (on_project_open.py, on_project_run.py, on_project_close.py)
  useProjectLifecycle(projectPath);

  const stripRunTags = (content: string): string => {
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const match = content.match(yamlRegex);
    if (!match) return content;

    const yamlText = match[1];
    const bodyText = match[2];
    const lines = yamlText.split('\n');
    const newYamlLines: string[] = [];
    let inTagsList = false;

    for (const line of lines) {
      const trimLine = line.trim();
      if (trimLine.startsWith('tags:')) {
        const inlineValue = trimLine.substring(5).trim();
        if (inlineValue) {
          if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
            const cleanTags = inlineValue
              .slice(1, -1)
              .split(',')
              .map(t => t.trim())
              .filter(t => t && !t.replace(/['"]/g, '').startsWith('run:'))
              .join(', ');
            newYamlLines.push(`tags: [${cleanTags}]`);
          } else if (inlineValue === '-') {
            newYamlLines.push('tags:');
            inTagsList = true;
          } else {
            if (!inlineValue.replace(/['"]/g, '').startsWith('run:')) {
              newYamlLines.push(line);
            } else {
              newYamlLines.push('tags:');
              inTagsList = true;
            }
          }
        } else {
          newYamlLines.push('tags:');
          inTagsList = true;
        }
      } else if (inTagsList && trimLine.startsWith('-')) {
        const val = trimLine.substring(1).trim().replace(/['"]/g, '');
        if (val.startsWith('run:')) {
          // Skip this tag
        } else {
          newYamlLines.push(line);
        }
      } else {
        if (line.includes(':')) {
          inTagsList = false;
        }
        newYamlLines.push(line);
      }
    }

    return `---\n${newYamlLines.join('\n').trim()}\n---\n${bodyText}`;
  };

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

      const sanitizedContent = stripRunTags(template.content);
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
  }, [lastAction]);

  // Load project markdown files and compute resolved tags
  useEffect(() => {
    if (!projectPath) return;

    const loadFiles = async () => {
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        const mdFiles = list.filter((f: any) => !f.isDir && f.name.endsWith('.md'));
        const maxIterations = state[BC.system.maxIterations] || 3;

        const { resolved: allResolved, staticTags: allStaticTags } = await calculateAllResolvedTags(
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
          tags: allStaticTags[file.path] || [],
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

      const defaultContent = `---\ntags:\n  - ${name.trim()}\n---\n# ${name.trim()}\n\nStart writing here...\n`;
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
    const targetEditorId =
      state[BC.system.lastFocusedEditorId] || (state[BC.system.activeEditors] || [])[0];
    if (targetEditorId) {
      updateBloodKey(BC.events.openFile(targetEditorId), file.path);
    } else {
      updateBloodKey(BC.events.openFile('global'), file.path);
    }
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
    <div className="file-list" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 10px 8px 10px', position: 'relative' }}>
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
          placeholder="Search... #tag #/regex/ and or not title"
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexGrow: 1 }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: isSelected ? 'var(--accent-color)' : 'var(--text-muted)', flexShrink: 0 }}>
                      <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
                      <path d="M10 1.5V4h3.5" />
                    </svg>
                    <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                  </div>
                  <button
                    className="file-delete-btn"
                    onClick={(e) => handleDeleteFile(e, file)}
                    title="Delete Note"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2px',
                      borderRadius: '4px',
                      opacity: 0.5,
                      transition: 'opacity 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent-color)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 4h12M4 4v10a1 1 0 001 1h6a1 1 0 001-1V4M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011-1V4M6.5 7.5v4.5M9.5 7.5v4.5" />
                    </svg>
                  </button>
                </div>
                 {file.tags && file.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {file.tags.map((t) => {
                      const isRule = t.startsWith('re:') || t.startsWith('run:');
                      return (
                        <span
                          key={t}
                          style={{
                            fontSize: '8.5px',
                            fontWeight: 600,
                            backgroundColor: isSelected
                              ? (isRule ? 'rgba(255, 59, 48, 0.15)' : 'rgba(255, 59, 48, 0.12)')
                              : (isRule ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)'),
                            padding: '1px 3.5px',
                            borderRadius: '3px',
                            color: isSelected
                              ? 'var(--accent-color)'
                              : (isRule ? 'var(--accent-color)' : 'var(--text-muted)'),
                            border: isRule
                              ? `1px dashed ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`
                              : 'none',
                          }}
                        >
                          {isRule ? `⚡️ ${t}` : `#${t}`}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showTemplateModal && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '85%', maxHeight: '80%', borderRadius: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>Templates</span>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
              {templateFiles.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', lineHeight: 1.5 }}>
                  No templates found in temple/ directory.<br/>Use "Set as Template" in the editor to create one.
                </div>
              ) : (
                templateFiles.map((t) => (
                  <div
                    key={t.path}
                    onClick={() => handleUseTemplate(t)}
                    style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: 12, color: 'var(--text-main)', fontWeight: 600, transition: 'background-color 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
                  >
                    {t.name.replace('.md', '')}
                  </div>
                ))
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleOpenTempleFolder}
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
              >
                Open temple/ folder
              </button>
            </div>
          </div>
        </div>
      )}

      {promptConfig.show && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '85%', borderRadius: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>{promptConfig.title}</span>
            <input
              type="text"
              id="prompt-modal-input-tree"
              defaultValue={promptConfig.defaultValue}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = e.currentTarget.value.trim();
                  promptConfig.onConfirm(val);
                  setPromptConfig(prev => ({ ...prev, show: false }));
                } else if (e.key === 'Escape') {
                  setPromptConfig(prev => ({ ...prev, show: false }));
                }
              }}
              style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 8px', borderRadius: '6px', fontSize: '11px', outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button
                className="area-btn"
                onClick={() => setPromptConfig(prev => ({ ...prev, show: false }))}
                style={{ height: '24px', fontSize: '10px', padding: '0 10px' }}
              >
                Cancel
              </button>
              <button
                className="area-btn"
                onClick={() => {
                  const input = document.getElementById('prompt-modal-input-tree') as HTMLInputElement;
                  if (input) {
                    promptConfig.onConfirm(input.value.trim());
                  }
                  setPromptConfig(prev => ({ ...prev, show: false }));
                }}
                style={{ height: '24px', fontSize: '10px', padding: '0 10px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileTreeComponent;
