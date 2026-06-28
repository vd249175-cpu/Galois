import { useEffect, useRef, RefObject } from 'react';

interface HistoryState {
  content: string;
  selectionStart: number;
  selectionEnd: number;
}

interface TextEditorHandle {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
}

interface UseEditorHistoryProps {
  content: string;
  setContent: (val: string) => void;
  currentFile: string;
  saveNodeFile: (customContent?: string) => Promise<void> | void;
  textareaRef: RefObject<TextEditorHandle | null>;
  setStatusMessage: (msg: string) => void;
}

export function useEditorHistory({
  content,
  setContent,
  currentFile,
  saveNodeFile,
  textareaRef,
  setStatusMessage,
}: UseEditorHistoryProps) {
  const undoStackRef = useRef<HistoryState[]>([]);
  const redoStackRef = useRef<HistoryState[]>([]);
  const lastHistoryContentRef = useRef<string>('');
  const historyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear/Reset history on file change
  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastHistoryContentRef.current = content;
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
  }, [currentFile]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
      }
    };
  }, []);

  const pushStateToUndoStack = (txt: string, selStart: number, selEnd: number) => {
    const last = undoStackRef.current[undoStackRef.current.length - 1];
    if (last && last.content === txt) return;
    undoStackRef.current.push({
      content: txt,
      selectionStart: selStart,
      selectionEnd: selEnd
    });
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  };

  const handleUndo = () => {
    if (!textareaRef.current) return;

    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    const currentText = textareaRef.current.value;
    const currentStart = textareaRef.current.selectionStart;
    const currentEnd = textareaRef.current.selectionEnd;

    if (currentText !== lastHistoryContentRef.current) {
      pushStateToUndoStack(lastHistoryContentRef.current, currentStart, currentEnd);
      lastHistoryContentRef.current = currentText;
    }

    const previousState = undoStackRef.current.pop();
    if (!previousState) {
      setStatusMessage('已是最旧版本');
      return;
    }

    redoStackRef.current.push({
      content: currentText,
      selectionStart: currentStart,
      selectionEnd: currentEnd
    });

    setContent(previousState.content);
    lastHistoryContentRef.current = previousState.content;
    saveNodeFile(previousState.content);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(previousState.selectionStart, previousState.selectionEnd);
      }
    }, 0);
    setStatusMessage('已撤销');
  };

  const handleRedo = () => {
    if (!textareaRef.current) return;

    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    const currentText = textareaRef.current.value;
    const currentStart = textareaRef.current.selectionStart;
    const currentEnd = textareaRef.current.selectionEnd;

    const nextState = redoStackRef.current.pop();
    if (!nextState) {
      setStatusMessage('已最新版本');
      return;
    }

    undoStackRef.current.push({
      content: currentText,
      selectionStart: currentStart,
      selectionEnd: currentEnd
    });

    setContent(nextState.content);
    lastHistoryContentRef.current = nextState.content;
    saveNodeFile(nextState.content);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextState.selectionStart, nextState.selectionEnd);
      }
    }, 0);
    setStatusMessage('已重做');
  };

  return {
    pushStateToUndoStack,
    handleUndo,
    handleRedo,
    historyTimerRef,
    lastHistoryContentRef,
  };
}
