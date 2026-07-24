import { useEffect } from 'react';
import { ActionRegistry } from '../../CORE/ActionRegistry';
import { Blood } from '../../CORE/Blood';
import { handleSmartEnter, handleSmartTab } from './markdownEditing';

export function useEditorKeyboard(props: any) {
  const { applyFormatting, areaId, content, editorShortcuts, filteredCommands, getEditorCaretCoordinates,
    handleExecuteCommand, handleRedo, handleUndo, isFocused, isReadingMode, markHistoryContent,
    pushStateToUndoStack, saveNodeFile, setContent, setShowSlashMenu, setSlashIndex, setSlashMenuCoords,
    setSlashMenuIndex, setSlashMenuQuery, showPrompt, showSlashMenu, slashMenuIndex, textareaRef } = props;
const handleKeyDown = (e: KeyboardEvent, start: number, end: number) => {
  // Undo / Redo keybind interception
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      handleRedo();
    } else {
      handleUndo();
    }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
    e.preventDefault();
    handleRedo();
    return;
  }

  // Formatting keyboard shortcuts matching user configuration
  const pressedComboParts: string[] = [];
  if (e.metaKey) pressedComboParts.push('meta');
  if (e.ctrlKey) pressedComboParts.push('control');
  if (e.altKey) pressedComboParts.push('alt');
  if (e.shiftKey) pressedComboParts.push('shift');

  const keyName = e.key.toLowerCase();
  const isModifier = ['control', 'meta', 'alt', 'shift'].includes(keyName);
  if (!isModifier) {
    pressedComboParts.push(keyName === ' ' ? 'space' : keyName);
  }
  const pressedCombo = pressedComboParts.join('+');

  let matchedType = '';
  for (const [type, combo] of Object.entries(editorShortcuts)) {
    if (combo === pressedCombo) {
      matchedType = type;
      break;
    }
  }

  // Also check ActionRegistry for custom/project commands shortcuts
  if (!matchedType) {
    const actionId = ActionRegistry.getActionIdByShortcut(pressedCombo, 'editor');
    if (actionId && (actionId.startsWith('custom.') || actionId.startsWith('project.'))) {
      matchedType = actionId;
    }
  }

  if (matchedType) {
    e.preventDefault();
    e.stopPropagation();
    if (matchedType.startsWith('custom.') || matchedType.startsWith('project.')) {
      // Trigger custom/project command immediately via Blood signal
      Blood.updateKey(`actions.${matchedType}.${areaId}`, Date.now());
    } else if (matchedType === 'link') {
    showPrompt('输入链接 URL:', 'https://', (url: string) => {
        if (!url) return;
        pushStateToUndoStack(content, start, end);
        const res = applyFormatting('link', content, start, end, url);
        setContent(res.text);
        markHistoryContent(res.text);
        saveNodeFile(res.text);

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
          }
        }, 0);
      });
    } else {
      pushStateToUndoStack(content, start, end);
      const res = applyFormatting(matchedType, content, start, end);
      setContent(res.text);
      markHistoryContent(res.text);
      saveNodeFile(res.text);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
        }
      }, 0);
    }
    return;
  }

  // Slash menu keyboard navigation
  if (showSlashMenu) {
    const cmds = filteredCommands;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashMenuIndex((prev: number) => (cmds.length > 0 ? (prev + 1) % cmds.length : 0));
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashMenuIndex((prev: number) => (cmds.length > 0 ? (prev - 1 + cmds.length) % cmds.length : 0));
      return;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (cmds.length > 0) {
        e.preventDefault();
        handleExecuteCommand(cmds[slashMenuIndex]);
        return;
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSlashMenu(false);
      return;
    }
  }

  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const result = handleSmartEnter(content, start, end);
    if (result.handled) {
      e.preventDefault();
      pushStateToUndoStack(content, start, end);
      setContent(result.text);
      markHistoryContent(result.text);
      saveNodeFile(result.text);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.newStart, result.newEnd);
      }, 0);
      return;
    }
  }

  if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const result = handleSmartTab(content, start, end, e.shiftKey);
    if (result.handled) {
      e.preventDefault();
      pushStateToUndoStack(content, start, end);
      setContent(result.text);
      markHistoryContent(result.text);
      if (result.text !== content) saveNodeFile(result.text);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.newStart, result.newEnd);
      }, 0);
      return;
    }
  }

  // Triggering Slash Menu
  if (e.key === '/') {
    const isStartOrWhitespace = start === 0 || /\s/.test(content.charAt(start - 1));
    if (isStartOrWhitespace) {
      setSlashIndex(start);
      setSlashMenuQuery('');
      setSlashMenuIndex(0);
      setShowSlashMenu(true);

      const coords = getEditorCaretCoordinates(start);
      setSlashMenuCoords(coords);
    }
  }
};

useEffect(() => {
  if (!isFocused || !isReadingMode) return;
  const handleReadingUndoRedo = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      handleRedo();
    }
  };
  window.addEventListener('keydown', handleReadingUndoRedo, true);
  return () => window.removeEventListener('keydown', handleReadingUndoRedo, true);
}, [isFocused, isReadingMode, handleUndo, handleRedo]);

  return { handleKeyDown };
}
