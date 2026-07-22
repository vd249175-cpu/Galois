export type EditorMode = 'source' | 'live' | 'reading';

export function getInitialEditorMode(): EditorMode {
  const savedMode = localStorage.getItem('dnote_editor_mode') as EditorMode | null;
  if (savedMode === 'live' || savedMode === 'reading') return savedMode;
  if (savedMode === 'source') return 'live';
  const legacyPreview = localStorage.getItem('dnote_editor_preview_mode');
  return legacyPreview === null ? 'live' : legacyPreview === 'true' ? 'reading' : 'live';
}

export function useEditorSurfaceControls(props: any) {
  const { editorMode, handleDrop, handleDropAtIndex, isReadingMode, setEditorMode, textareaRef } = props;
  const cycleEditorMode = () => setEditorMode((previous: EditorMode) => {
    const next = previous === 'reading' ? 'live' : 'reading';
    localStorage.setItem('dnote_editor_mode', next);
    localStorage.setItem('dnote_editor_preview_mode', String(next === 'reading'));
    return next;
  });
  const switchEditorMode = (mode: EditorMode) => {
    setEditorMode(mode);
    localStorage.setItem('dnote_editor_mode', mode);
    localStorage.setItem('dnote_editor_preview_mode', String(mode === 'reading'));
  };
  const handleEditorDrop = (event: React.DragEvent) => {
    if (event.defaultPrevented) return;
    const position = !isReadingMode && textareaRef.current?.getPositionAtCoordinates(event.clientX, event.clientY);
    if (position !== null && position !== undefined) return handleDropAtIndex(event, position);
    handleDrop(event);
  };
  const modeLabel = editorMode === 'reading' ? '📖 Reading' : '✨ Live Preview';
  const modeOptions: Array<{ mode: EditorMode; label: string; title: string }> = [
    { mode: 'live', label: 'Live', title: '编辑态实时预览' },
    { mode: 'reading', label: 'Reading', title: '纯阅读预览' },
  ];
  return { cycleEditorMode, handleEditorDrop, modeLabel, modeOptions, switchEditorMode };
}
