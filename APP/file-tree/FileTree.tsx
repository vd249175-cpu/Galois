import { useEffect, useState, useMemo } from 'react';
import { calculateAllResolvedTags } from './tagResolver';
import { useProjectLifecycle } from './useProjectLifecycle';
import { fileTreeActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { updateYamlFrontmatterIcon } from '../utils';

interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  tags: string[];
  icon?: string;
}

// ── Tag expression tokenizer and boolean evaluator helpers ──────────────────

function tokenizeQuery(query: string) {
  const regex = /(#re:\S+|re:\S+|\(|\)|#\/[^\/]+\/[a-z]*|#[^\s()#]+|and|add|or|not|&&|\|\||!|\S+)/gi;
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
      if (token.startsWith('#/') || token.startsWith('#re:')) {
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
  let isRegex = false;
  let pattern = '';
  let flags = 'i';

  if (tagQuery.startsWith('#re:')) {
    isRegex = true;
    pattern = tagQuery.slice(4);
  } else if (tagQuery.startsWith('#/')) {
    const lastSlash = tagQuery.lastIndexOf('/');
    pattern = tagQuery.slice(2, lastSlash);
    flags = tagQuery.slice(lastSlash + 1) || 'i';
    isRegex = true;
  } else {
    // Auto-detect regex if common metacharacters are present (excluding ? and . to prevent false positives)
    const plainTag = tagQuery.slice(1); // strip '#'
    const regexMetachars = /[\^$()\[\]{}*+|\\]/;
    if (regexMetachars.test(plainTag)) {
      isRegex = true;
      pattern = plainTag;
    } else {
      pattern = plainTag;
    }
  }

  if (isRegex) {
    try {
      const re = new RegExp(pattern, flags.includes('i') ? flags : flags + 'i');
      return fileTags.some(t => re.test(t));
    } catch {
      return fileTags.some(t => t.toLowerCase().includes(pattern.toLowerCase()));
    }
  } else {
    return fileTags.some(t => t.toLowerCase().includes(pattern.toLowerCase()));
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
  const displayName = filename.endsWith('.md') ? filename.substring(0, filename.lastIndexOf('.md')) : filename;
  const nameLower = displayName.toLowerCase();
  return filenameTokens.every(token => {
    let isRegex = false;
    let pattern = '';
    let flags = 'i';

    if (token.startsWith('re:')) {
      isRegex = true;
      pattern = token.slice(3);
    } else if (/^\/.*\/\w*$/.test(token)) {
      const lastSlash = token.lastIndexOf('/');
      pattern = token.slice(1, lastSlash);
      flags = token.slice(lastSlash + 1) || 'i';
      isRegex = true;
    } else {
      // Auto-detect regex if common metacharacters are present (excluding ? and . to prevent false positives)
      const regexMetachars = /[\^$()\[\]{}*+|\\]/;
      if (regexMetachars.test(token)) {
        isRegex = true;
        pattern = token;
      }
    }

    if (isRegex) {
      try {
        const re = new RegExp(pattern, flags.includes('i') ? flags : flags + 'i');
        return re.test(displayName);
      } catch {
        return nameLower.includes(pattern.toLowerCase());
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
  displayName: '文本浏览器',
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
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);

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

        const { resolved: allResolved, staticTags: allStaticTags, icons: allIcons } = await calculateAllResolvedTags(
          projectPath,
          mdFiles,
          maxIterations,
          (errMsg: string) => {
            // 脚本错误通过 Blood 广播，不再静默失败
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
        <svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
          <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
        </svg>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>欢迎使用 TLKS</h4>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          打开一个笔记本目录以开始管理标签格子笔记。
        </p>
        <button className="right-sidebar-btn" onClick={handleOpenFolder} style={{ width: 'auto', height: '30px', padding: '0 16px', fontSize: '11px', fontWeight: 600 }}>
          打开文件夹
        </button>
      </div>
    );
  }

  const folderName = projectPath.split('/').pop() || projectPath;

  return (
    <div className="file-list" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 10px 8px 10px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px' }}>笔记本</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }} title={projectPath}>{folderName}</span>
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
        </div>
      </div>

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
          style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '5px 8px', borderRadius: '6px', fontSize: '11px', outline: 'none' }}
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
                    fontSize: '10px',
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
                  <span style={{ fontSize: '9px', opacity: 0.7 }}>
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
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>没有找到任何笔记。</div>
        ) : (
          <div className="file-grid-container">
            {filteredFiles.map((file) => {
              const isSelected = selectedPath === file.path;
              const displayName = file.name.substring(0, file.name.lastIndexOf('.md'));
              return (
                <div
                  key={file.path}
                  onClick={() => handleFileClick(file)}
                  className="file-card-item"
                  style={{
                    backgroundColor: isSelected ? 'var(--highlight-color)' : 'rgba(255,255,255,0.45)',
                    color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                    border: isSelected ? '1.5px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.65)',
                  }}
                >
                  {/* 右上角悬浮删除按钮 */}
                  <button
                    className="file-delete-btn"
                    onClick={(e) => handleDeleteFile(e, file)}
                    title="删除笔记"
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(0,0,0,0.05)',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                      borderRadius: '50%',
                      zIndex: 10,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 4h12M4 4v10a1 1 0 001 1h6a1 1 0 001-1V4M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011-1V4M6.5 7.5v4.5M9.5 7.5v4.5" />
                    </svg>
                  </button>

                  {/* 文件头：图标 + 文件名 */}
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: '4.5px', position: 'relative' }}>
                    {/* Notion-style Icon Button */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setIconPickerFile(file);
                      }}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(255,59,48,0.1)' : 'rgba(0,0,0,0.03)',
                        marginRight: '6px',
                        fontSize: '11px',
                        transition: 'background-color 0.12s, transform 0.12s',
                        flexShrink: 0
                      }}
                      className="note-icon-btn"
                      title="修改此笔记的图标"
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      {file.icon || '📄'}
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textAlign: 'left',
                      flexGrow: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginRight: '18px', // Leave space for delete button
                    }} title={displayName}>
                      {displayName}
                    </span>
                  </div>

                  {/* 标签列表 */}
                  {file.tags && file.tags.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px',
                      width: '100%',
                      marginTop: '2px'
                    }}>
                      {file.tags.map((t) => {
                        const labelText = t.startsWith('re:') || t.startsWith('run:') ? `⚡️ ${t.split(':').pop()}` : `#${t}`;
                        return (
                          <span
                            key={`${file.path}_tag_${t}`}
                            style={{
                              fontSize: '8.5px',
                              fontWeight: 700,
                              backgroundColor: isSelected ? 'rgba(255, 59, 48, 0.15)' : 'rgba(0, 0, 0, 0.05)',
                              color: isSelected ? 'var(--accent-color)' : 'var(--text-muted)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {labelText}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showTemplateModal && (
        <div className="pane-modal-overlay">
          <div className="pane-modal-content" style={{ width: '85%', maxHeight: '80%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>模板选择</span>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, marginBottom: 12 }}>
              {templateFiles.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', lineHeight: 1.5 }}>
                  在 temple/ 目录下没有找到模板。<br/>在编辑器中使用“设为模板”来创建模板。
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
                打开 temple/ 文件夹
              </button>
            </div>
          </div>
        </div>
      )}

      {promptConfig.show && (
        <div className="pane-modal-overlay">
          <div className="pane-modal-content" style={{ width: '85%' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginBottom: 12 }}>{promptConfig.title === 'Enter file name:' ? '新建笔记名称:' : promptConfig.title}</span>
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
              style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 8px', borderRadius: '6px', fontSize: '11px', outline: 'none', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button
                className="area-btn text-btn"
                onClick={() => setPromptConfig(prev => ({ ...prev, show: false }))}
                style={{ height: '24px', fontSize: '10px', padding: '0 10px' }}
              >
                取消
              </button>
              <button
                className="area-btn text-btn"
                onClick={() => {
                  const input = document.getElementById('prompt-modal-input-tree') as HTMLInputElement;
                  if (input) {
                    promptConfig.onConfirm(input.value.trim());
                  }
                  setPromptConfig(prev => ({ ...prev, show: false }));
                }}
                style={{ height: '24px', fontSize: '10px', padding: '0 10px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none' }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Icon Picker Modal */}
      {iconPickerFile && (
        <div className="pane-modal-overlay" onClick={() => setIconPickerFile(null)}>
          <div className="pane-modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '280px', maxHeight: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 700, fontSize: '11px' }}>选择笔记图标</span>
              <button
                onClick={() => setIconPickerFile(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>
            
            {/* Quick Emojis Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '6px',
              padding: '4px 0',
              maxHeight: '120px',
              overflowY: 'auto'
            }}>
              {['📝', '🚀', '💡', '📅', '🌟', '🛠️', '📂', '🎨', '📓', '💻', '⚡', '🔍', '🎯', '🔥', '📌', '🎉', '💬', '❤️', '✅', '❌', '🔑', '🏷️', '📚', '🗺️'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSaveIcon(iconPickerFile, emoji)}
                  style={{
                    fontSize: '16px',
                    padding: '6px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.15s, transform 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--highlight-color)';
                    e.currentTarget.style.transform = 'scale(1.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            
            {/* Custom Emoji input & Clear button */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="输入任意 Emoji..."
                maxLength={2}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (val) {
                    handleSaveIcon(iconPickerFile, val);
                  }
                }}
                style={{
                  flexGrow: 1,
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  outline: 'none'
                }}
              />
              {iconPickerFile.icon && (
                <button
                  className="area-btn text-btn"
                  onClick={() => handleSaveIcon(iconPickerFile, '')}
                  style={{
                    height: '24px',
                    padding: '0 8px',
                    fontSize: '10px',
                    backgroundColor: 'rgba(255, 59, 48, 0.1)',
                    color: 'var(--accent-color)',
                    border: '1px solid var(--accent-color)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  移除图标
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileTreeComponent;
