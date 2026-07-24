import React, { useMemo, useState } from 'react';
import { filterAndRankSlashCommands, rememberSlashCommand } from './slashCommandSearch';

export function useSlashCommands(props: any) {
  const { customCommands, projectCommands } = props;
// ── Notion-style Command & Formatting Menu States ─────────────────────────
const [showSlashMenu, setShowSlashMenu] = useState(false);
const [slashIndex, setSlashIndex] = useState(-1);
const [slashMenuQuery, setSlashMenuQuery] = useState('');
const [slashMenuCoords, setSlashMenuCoords] = useState({ left: 0, top: 0 });
const [slashMenuIndex, setSlashMenuIndex] = useState(0);
const [recentSlashCommandIds, setRecentSlashCommandIds] = useState<string[]>(() => {
  try {
    return JSON.parse(localStorage.getItem('dnote_recent_slash_commands') || '[]');
  } catch (_) {
    return [];
  }
});

const SLASH_COMMANDS = [
  { id: 'bold', label: 'Bold', desc: '加粗所选文本', icon: 'B', category: '格式' },
  { id: 'italic', label: 'Italic', desc: '将所选文本设为斜体', icon: 'I', category: '格式' },
  { id: 'code-inline', label: 'Inline Code', desc: '插入行内等宽代码', icon: '`', category: '格式' },
  { id: 'strike', label: 'Strikethrough', desc: '给所选文本加删除线', icon: 'S', category: '格式' },
  { id: 'highlight', label: 'Highlight', desc: '高亮所选文本', icon: '==', category: '格式' },
  { id: 'link', label: 'Link', desc: '插入外部超链接', icon: '🔗', category: '链接' },
  { id: 'wiki-link', label: 'Wiki Link', desc: '链接到另一篇笔记', icon: '[[', category: '链接' },
  { id: 'h1', label: 'Heading 1', desc: '插入一级标题', icon: 'H1', category: '基础块' },
  { id: 'h2', label: 'Heading 2', desc: '插入二级标题', icon: 'H2', category: '基础块' },
  { id: 'h3', label: 'Heading 3', desc: '插入三级标题', icon: 'H3', category: '基础块' },
  { id: 'quote', label: 'Blockquote', desc: '插入引用块', icon: '“', category: '基础块' },
  { id: 'callout', label: 'Callout', desc: '插入提示块', icon: '!', category: '基础块' },
  { id: 'hr', label: 'Divider', desc: '插入分隔线', icon: '—', category: '基础块' },
  { id: 'todo', label: 'To-Do List', desc: '插入待办列表', icon: '☑', category: '列表' },
  { id: 'bullet', label: 'Bullet List', desc: '插入无序列表', icon: '•', category: '列表' },
  { id: 'number', label: 'Numbered List', desc: '插入有序列表', icon: '1.', category: '列表' },
  { id: 'table', label: 'Table', desc: '插入两列表格', icon: '▦', category: '表格' },
  { id: 'code-block', label: 'Code Block', desc: '插入代码块', icon: '💻', category: '代码' }
];

const allCommands = useMemo(() => {
  const customList = customCommands.map((cmd: { id: string; label: string; desc: string; content: string }) => ({
    id: cmd.id,
    label: cmd.label,
    desc: cmd.desc,
    icon: React.createElement(
      'svg',
      { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
      React.createElement('circle', { cx: 8, cy: 8, r: 2.5 }),
      React.createElement('path', { d: 'M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4' })
    ),
    content: cmd.content,
    category: '自定义',
  }));

  const projectList = projectCommands
      .filter((cmd: any) => !customCommands.some((c: any) => c.id === cmd.id))
      .filter((cmd: any) => !cmd.script)
      .map((cmd: any) => ({
      id: cmd.id,
      label: cmd.label,
      desc: `${cmd.desc || ''} (Project)`,
      icon: React.createElement(
        'svg',
        { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
        React.createElement('path', { d: 'M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z' })
      ),
      content: cmd.content,
      category: '项目',
    }));

  const helperCmds = [
    {
      id: 'custom.add_new',
      label: 'Create Custom Command (新增自定义命令)',
      desc: '创建可复用的自定义文本命令',
      icon: React.createElement(
        'svg',
        { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
        React.createElement('path', { d: 'M8 3v10M3 8h10' })
      ),
      content: '',
      category: '自定义',
    },
    {
      id: 'custom.manage',
      label: 'Manage Custom Commands (管理自定义命令)',
      desc: '查看、编辑或删除自定义命令',
      icon: React.createElement(
        'svg',
        { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
        React.createElement('circle', { cx: 8, cy: 8, r: 2.5 }),
        React.createElement('path', { d: 'M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4' })
      ),
      content: '',
      category: '自定义',
    }
  ];
  return [...SLASH_COMMANDS, ...customList, ...projectList, ...helperCmds];
}, [customCommands, projectCommands]);

const filteredCommands = useMemo(
  () => filterAndRankSlashCommands(allCommands, slashMenuQuery, recentSlashCommandIds),
  [allCommands, slashMenuQuery, recentSlashCommandIds]
);

const rememberSlashCommandUse = (commandId: string) => {
  const nextRecent = rememberSlashCommand(recentSlashCommandIds, commandId);
  setRecentSlashCommandIds(nextRecent);
  localStorage.setItem('dnote_recent_slash_commands', JSON.stringify(nextRecent));
};

  return { allCommands, filteredCommands, recentSlashCommandIds, rememberSlashCommandUse, setRecentSlashCommandIds,
    setShowSlashMenu, setSlashIndex, setSlashMenuCoords, setSlashMenuIndex, setSlashMenuQuery, showSlashMenu,
    slashIndex, slashMenuCoords, slashMenuIndex, slashMenuQuery };
}
