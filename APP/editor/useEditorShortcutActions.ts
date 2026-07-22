import { useMemo } from 'react';

const MARKDOWN_ACTIONS = [
  { id: 'bold', label: 'Bold (粗体)', defaultCombo: 'meta+b' },
  { id: 'italic', label: 'Italic (斜体)', defaultCombo: 'meta+i' },
  { id: 'code-inline', label: 'Inline Code (行内代码)', defaultCombo: 'meta+d' },
  { id: 'link', label: 'Link (超链接)', defaultCombo: 'meta+k' },
  { id: 'wiki-link', label: 'Wiki Link (双向链接)', defaultCombo: '' },
  { id: 'h1', label: 'Heading 1 (一级标题)', defaultCombo: 'meta+1' },
  { id: 'h2', label: 'Heading 2 (二级标题)', defaultCombo: 'meta+2' },
  { id: 'h3', label: 'Heading 3 (三级标题)', defaultCombo: 'meta+3' },
  { id: 'todo', label: 'To-Do List (待办列表)', defaultCombo: '' },
  { id: 'bullet', label: 'Bullet List (无序列表)', defaultCombo: '' },
  { id: 'number', label: 'Numbered List (有序列表)', defaultCombo: '' },
  { id: 'quote', label: 'Blockquote (引用块)', defaultCombo: '' },
  { id: 'callout', label: 'Callout (提示块)', defaultCombo: '' },
  { id: 'table', label: 'Table (表格)', defaultCombo: '' },
  { id: 'hr', label: 'Divider (分割线)', defaultCombo: '' },
  { id: 'strike', label: 'Strikethrough (删除线)', defaultCombo: '' },
  { id: 'highlight', label: 'Highlight (高亮)', defaultCombo: '' },
  { id: 'code-block', label: 'Code Block (代码块)', defaultCombo: '' },
];

export function useEditorShortcutActions(props: any) {
  const { customCommands, projectCommands, setEditorShortcuts } = props;
  const allManageableActions = useMemo(() => {
    const actions = [...MARKDOWN_ACTIONS];
    customCommands.forEach((command: any) => {
      const projectCommand = projectCommands.find((item: any) => item.id === command.id);
      actions.push({
        id: command.id, label: `${command.label} (自定义)`,
        defaultCombo: command.defaultShortcut || projectCommand?.defaultShortcut || '',
      });
    });
    projectCommands.forEach((command: any) => {
      if (!customCommands.some((item: any) => item.id === command.id)) {
        actions.push({ id: command.id, label: `${command.label} (项目)`, defaultCombo: command.defaultShortcut || '' });
      }
    });
    return actions;
  }, [customCommands, projectCommands]);

  const handleResetShortcut = (id: string, defaultCombo: string) => {
    setEditorShortcuts((previous: Record<string, string>) => {
      const next = { ...previous, [id]: defaultCombo };
      localStorage.setItem('dnote_markdown_shortcuts', JSON.stringify(next));
      return next;
    });
  };
  return { allManageableActions, handleResetShortcut };
}
