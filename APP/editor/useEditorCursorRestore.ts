import { useEffect } from 'react';
import { BC } from '../../CORE/BloodChannels';

export function useEditorCursorRestore(props: any) {
  const { areaId, content, currentFile, editorMode, projectPath, restoredCursorForFileRef, state, textareaRef } = props;
useEffect(() => {
  const savedCursor = state[BC.system.editorCursor(areaId)];
  if (!currentFile || !content) return;
  if (restoredCursorForFileRef.current === currentFile) return;
  if (editorMode === 'reading') return;

  let selectionStart = 0;
  let selectionEnd = 0;
  let scrollTop = 0;
  let scrollLeft = 0;
  if (projectPath) {
    try {
      const perFile = JSON.parse(localStorage.getItem(`galois_live_view:${projectPath}:${currentFile}`) || 'null');
      if (perFile) {
        selectionStart = Math.max(0, Math.min(content.length, Number(perFile.selectionStart || 0)));
        selectionEnd = Math.max(0, Math.min(content.length, Number(perFile.selectionEnd || selectionStart)));
        scrollTop = Number(perFile.scrollTop || 0);
        scrollLeft = Number(perFile.scrollLeft || 0);
      }
    } catch (_) {}
  }
  if (selectionStart === 0 && selectionEnd === 0 && savedCursor?.filePath === currentFile) {
    const line = Math.max(1, Number(savedCursor.line || 1));
    const column = Math.max(1, Number(savedCursor.column || 1));
    const lines = content.split('\n');
    const before = lines.slice(0, line - 1).reduce((sum: number, item: string) => sum + item.length + 1, 0);
    selectionStart = Math.min(content.length, before + Math.min(column - 1, (lines[line - 1] || '').length));
    selectionEnd = selectionStart;
    scrollTop = Number(savedCursor.scrollTop || 0);
    scrollLeft = Number(savedCursor.scrollLeft || 0);
  }

  restoredCursorForFileRef.current = currentFile;
  setTimeout(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    requestAnimationFrame(() => {
      textareaRef.current?.setScrollPosition?.(scrollTop, scrollLeft);
    });
  }, 0);
}, [areaId, content, currentFile, editorMode, projectPath, state[BC.system.editorCursor(areaId)]]);
}
