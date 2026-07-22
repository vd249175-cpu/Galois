export function useEditorContentActions(props: any) {
  const { contentRef, markHistoryContent, pushStateToUndoStack, saveNodeFile, setContent, textareaRef } = props;
const setContentFromDrop = (val: string | ((prev: string) => string)) => {
  const resolvedVal = typeof val === 'function' ? val(contentRef.current) : val;
  if (textareaRef.current) {
    pushStateToUndoStack(contentRef.current, textareaRef.current.selectionStart, textareaRef.current.selectionEnd);
  } else {
    pushStateToUndoStack(contentRef.current, 0, 0);
  }
  setContent(resolvedVal);
  markHistoryContent(resolvedVal);
};

const handlePreviewContentChange = (newContent: string) => {
  if (newContent === contentRef.current) return;
  pushStateToUndoStack(contentRef.current, 0, 0);
  setContent(newContent);
  markHistoryContent(newContent);
  saveNodeFile(newContent);
};

const insertTextAtCurrentCursor = (snippet: string) => {
  const editor = textareaRef.current;
  const start = editor?.selectionStart ?? contentRef.current.length;
  const end = editor?.selectionEnd ?? start;
  const source = contentRef.current;
  const before = source.slice(0, start);
  const after = source.slice(end);
  const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '\n';
  const nextContent = `${before}${prefix}${snippet}${suffix}${after}`;
  const nextCursor = before.length + prefix.length + snippet.length;
  pushStateToUndoStack(source, start, end);
  setContent(nextContent);
  markHistoryContent(nextContent);
  saveNodeFile(nextContent);
  requestAnimationFrame(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
  });
};
  return { handlePreviewContentChange, insertTextAtCurrentCursor, setContentFromDrop };
}

