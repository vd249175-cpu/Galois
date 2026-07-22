import { useEffect } from 'react';
import { BC } from '../../CORE/BloodChannels';

export function useEditorCursorState(props: any) {
  const { areaId, contentRef, currentFile, projectPath, textareaRef, updateBloodKey } = props;
const updateCursorState = (overrideContent?: string) => {
  if (!textareaRef.current) return;
  const { selectionStart, selectionEnd } = textareaRef.current;
  const currentVal = overrideContent !== undefined ? overrideContent : (contentRef.current || '');
  const subStr = currentVal.substring(0, selectionStart);
  const lines = subStr.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  const selectedText = currentVal.substring(selectionStart, selectionEnd);
  const scroll = textareaRef.current.getScrollPosition?.();
  if (projectPath && currentFile) {
    localStorage.setItem(`galois_live_view:${projectPath}:${currentFile}`, JSON.stringify({
      selectionStart,
      selectionEnd,
      scrollTop: scroll?.top || 0,
      scrollLeft: scroll?.left || 0,
    }));
  }
  
  updateBloodKey(`system.editorCursor.${areaId}`, {
    line,
    column,
    selectedText,
    scrollTop: scroll?.top || 0,
    scrollLeft: scroll?.left || 0,
    filePath: currentFile
  });
};

useEffect(() => {
  if (textareaRef.current) {
    updateCursorState();
  }
}, [currentFile]);

const handleFocus = () => {
  updateBloodKey(BC.system.focusedAreaId, areaId);
  updateCursorState();
};

  return { handleFocus, updateCursorState };
}

