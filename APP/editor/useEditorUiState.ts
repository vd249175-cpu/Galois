import { useState } from 'react';

export function useEditorUiState() {
// ── Keyboard Shortcuts & Prompt Modal States ─────────────────────────────
const [editorShortcuts, setEditorShortcuts] = useState<Record<string, string>>(() => {
  const saved = localStorage.getItem('dnote_markdown_shortcuts');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (_) {}
  }
  return {
    bold: 'meta+b',
    italic: 'meta+i',
    'code-inline': 'meta+d',
    link: 'meta+k',
    h1: 'meta+1',
    h2: 'meta+2',
    h3: 'meta+3',
    todo: '',
    bullet: '',
    number: '',
    quote: '',
    callout: '',
    table: '',
    hr: '',
    'wiki-link': '',
    strike: '',
    highlight: '',
    'code-block': '',
  };
});

const [promptConfig, setPromptConfig] = useState<{
  show: boolean;
  title: string;
  defaultValue: string;
  onConfirm: (val: string) => void;
}>({ show: false, title: '', defaultValue: '', onConfirm: () => {} });

const showPrompt = (title: string, defaultValue: string, onConfirm: (val: string) => void) => {
  setPromptConfig({ show: true, title, defaultValue, onConfirm });
};

const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
const [recordingActionId, setRecordingActionId] = useState<string | null>(null);

// Custom Commands & Tag Groups States
const [customCommands, setCustomCommands] = useState<Array<{ id: string; label: string; desc: string; content: string; defaultShortcut?: string }>>(() => {
  const saved = localStorage.getItem('dnote_custom_commands');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(c => c.id !== 'custom.rainbow');
        if (filtered.length !== parsed.length) {
          localStorage.setItem('dnote_custom_commands', JSON.stringify(filtered));
        }
        return filtered;
      }
    } catch (_) {}
  }
  return [];
});
  return { customCommands, editorShortcuts, isShortcutsModalOpen, promptConfig, recordingActionId,
    setCustomCommands, setEditorShortcuts, setIsShortcutsModalOpen, setPromptConfig, setRecordingActionId, showPrompt };
}

