import { useMemo, useState } from 'react';
import { BC } from '../../CORE/BloodChannels';

export function useEditorTagGroups(props: any) {
  const { customCommands, editorShortcuts, setCustomCommands, setStatusMessage, state, tags } = props;
const [isCustomCommandsOpen, setIsCustomCommandsOpen] = useState(false);
const [isTagGroupsOpen, setIsTagGroupsOpen] = useState(false);

const [tagGroups, setTagGroups] = useState<Record<string, string[]>>(() => {
  const saved = localStorage.getItem('dnote_tag_groups');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (_) {}
  }
  return {
    "Daily Work (日常工作)": ["daily", "work", "todo"],
    "Study Notes (学习笔记)": ["study", "notes", "learning"],
    "Bug Report (缺陷报告)": ["bug", "issue", "reproduce"]
  };
});

const allProjectTags = useMemo(() => {
  const resolved = state[BC.system.resolvedTags] || {};
  const staticTags = state[BC.system.staticTags] || {};
  const set = new Set<string>();

  // 1. Gather tags from resolvedTags (individual matched values)
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

  // 2. Gather tags from staticTags (raw tag strings including re: and run:)
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

const handleAddCustomCommand = (trigger: string, label: string, desc: string, bodyText: string) => {
  const nextCmds = [
      ...customCommands.filter((c: any) => c.id !== `custom.${trigger}`),
    {
      id: `custom.${trigger}`,
      label,
      desc: desc || `Custom text insertion for /${trigger}`,
      content: bodyText
    }
  ];
  setCustomCommands(nextCmds);
  localStorage.setItem('dnote_custom_commands', JSON.stringify(nextCmds));
  setStatusMessage(`Custom command /${trigger} created.`);
};

const handleDeleteCustomCommand = (id: string) => {
    const nextCmds = customCommands.filter((c: any) => c.id !== id);
  setCustomCommands(nextCmds);
  localStorage.setItem('dnote_custom_commands', JSON.stringify(nextCmds));
  setStatusMessage('Custom command deleted.');
};

const handleSaveTagGroup = (name: string) => {
  const nextGroups = {
    ...tagGroups,
    [name]: [...tags]
  };
  setTagGroups(nextGroups);
  localStorage.setItem('dnote_tag_groups', JSON.stringify(nextGroups));
  setStatusMessage(`Saved tag group: ${name}`);
};

const handleUpdateTagGroups = (nextGroups: Record<string, string[]>) => {
  setTagGroups(nextGroups);
  localStorage.setItem('dnote_tag_groups', JSON.stringify(nextGroups));
};

const handleDeleteTagGroup = (name: string) => {
  const nextGroups = { ...tagGroups };
  delete nextGroups[name];
  setTagGroups(nextGroups);
  localStorage.setItem('dnote_tag_groups', JSON.stringify(nextGroups));
  setStatusMessage(`Deleted tag group: ${name}`);
};

const getShortcutDisplay = (id: string): string => {
  const combo = editorShortcuts[id];
  if (!combo) return '';
  return combo
    .split('+')
      .map((part: string) => {
      if (part === 'meta') return '⌘';
      if (part === 'control' || part === 'ctrl') return '⌃';
      if (part === 'shift') return '⇧';
      if (part === 'alt') return '⌥';
      return part.toUpperCase();
    })
    .join('');
};
  return { allProjectTags, getShortcutDisplay, handleAddCustomCommand, handleDeleteCustomCommand,
    handleDeleteTagGroup, handleSaveTagGroup, handleUpdateTagGroups, isCustomCommandsOpen,
    isTagGroupsOpen, setIsCustomCommandsOpen, setIsTagGroupsOpen, tagGroups };
}
