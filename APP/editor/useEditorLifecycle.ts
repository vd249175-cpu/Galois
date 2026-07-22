import { useEffect } from 'react';
import { BC } from '../../CORE/BloodChannels';
import { Blood } from '../../CORE/Blood';

type EditorShortcutMap = Record<string, string>;

export function useEditorLifecycle(props: any) {
  const {
    areaId, autoSaveTimerRef, content, currentFile, customCommands, cycleEditorMode,
    handleDeleteCurrentFile, handleExecuteCommand, handleExecuteProjectCommand,
    handleSetAsTemplate, isComposingRef, isFocused, isReadingMode, lastAction,
    lastSavedContentRef, projectCommands, recordingActionId, saveNodeFile,
    setEditorShortcuts, setIsShortcutsModalOpen, setRecordingActionId, updateBloodKey,
  } = props;

  useEffect(() => {
    const editors = Blood.getValue<string[]>(BC.system.activeEditors, []);
    if (!editors.includes(areaId)) updateBloodKey(BC.system.activeEditors, [...editors, areaId]);
    if (!Blood.getValue<string | null>(BC.system.lastFocusedEditorId, null)) {
      updateBloodKey(BC.system.lastFocusedEditorId, areaId);
    }
    return () => {
      const remaining = Blood.getValue<string[]>(BC.system.activeEditors, []).filter((id) => id !== areaId);
      updateBloodKey(BC.system.activeEditors, remaining);
      if (Blood.getValue<string | null>(BC.system.lastFocusedEditorId, null) === areaId) {
        updateBloodKey(BC.system.lastFocusedEditorId, remaining[0] || null);
      }
    };
  }, [areaId]);

  useEffect(() => {
    if (isFocused) updateBloodKey(BC.system.lastFocusedEditorId, areaId);
  }, [isFocused, areaId]);

  useEffect(() => {
    if (!recordingActionId) return;
    const handleRecordKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const keys = [
        ...(event.metaKey ? ['meta'] : []), ...(event.ctrlKey ? ['control'] : []),
        ...(event.altKey ? ['alt'] : []), ...(event.shiftKey ? ['shift'] : []),
      ];
      const keyName = event.key.toLowerCase();
      if (keyName === 'escape') return setRecordingActionId(null);
      if (['control', 'meta', 'alt', 'shift'].includes(keyName)) return;
      keys.push(keyName === ' ' ? 'space' : keyName);
      setEditorShortcuts((previous: EditorShortcutMap) => {
        const next = { ...previous, [recordingActionId]: keys.join('+') };
        localStorage.setItem('dnote_markdown_shortcuts', JSON.stringify(next));
        return next;
      });
      setRecordingActionId(null);
    };
    window.addEventListener('keydown', handleRecordKey, true);
    return () => window.removeEventListener('keydown', handleRecordKey, true);
  }, [recordingActionId]);

  useEffect(() => {
    if (!currentFile || isReadingMode || content === '' || content === lastSavedContentRef.current || isComposingRef.current) return;
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      saveNodeFile(content);
    }, 600);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [content, currentFile, isReadingMode]);

  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'editor.save') saveNodeFile();
    else if (lastAction.id === 'editor.toggleMode') cycleEditorMode();
    else if (lastAction.id === 'editor.delete') handleDeleteCurrentFile();
    else if (lastAction.id === 'editor.setAsTemplate') handleSetAsTemplate();
    else if (lastAction.id === 'editor.editShortcuts') setIsShortcutsModalOpen(true);
    else if (lastAction.id.startsWith('custom.') || lastAction.id.startsWith('project.')) {
      const command = customCommands.find((item: any) => item.id === lastAction.id)
        || projectCommands.find((item: any) => item.id === lastAction.id);
      if (command) (command.script ? handleExecuteProjectCommand : handleExecuteCommand)(command);
    }
  }, [lastAction, customCommands, projectCommands]);
}
