import { useEffect, useRef, RefObject } from 'react';

interface HistoryState {
  content: string;
  selectionStart: number;
  selectionEnd: number;
}

interface HistoryBucket {
  undo: HistoryState[];
  redo: HistoryState[];
  last: string;
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
  projectPath: string;
  saveNodeFile: (customContent?: string) => Promise<void> | void;
  textareaRef: RefObject<TextEditorHandle | null>;
  setStatusMessage: (msg: string) => void;
}

export function useEditorHistory({
  content,
  setContent,
  currentFile,
  projectPath,
  saveNodeFile,
  textareaRef,
  setStatusMessage,
}: UseEditorHistoryProps) {
  const historyByFileRef = useRef<Record<string, HistoryBucket>>({});
  const currentFileRef = useRef(currentFile);
  const projectPathRef = useRef(projectPath);
  const lastHistoryContentRef = useRef<string>('');
  const historyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadedProjectRef = useRef<string>('');

  const getHistoryPath = (root = projectPathRef.current) => root ? `${root}/.dnote_cache/editor-history.json` : '';

  const normalizeState = (state: any): HistoryState => ({
    content: typeof state?.content === 'string' ? state.content : '',
    selectionStart: Number.isFinite(state?.selectionStart) ? state.selectionStart : 0,
    selectionEnd: Number.isFinite(state?.selectionEnd) ? state.selectionEnd : 0,
  });

  const normalizeBucket = (bucket: any): HistoryBucket => ({
    undo: Array.isArray(bucket?.undo) ? bucket.undo.slice(-100).map(normalizeState) : [],
    redo: Array.isArray(bucket?.redo) ? bucket.redo.slice(-100).map(normalizeState) : [],
    last: typeof bucket?.last === 'string' ? bucket.last : '',
  });

  const persistHistoryNow = async () => {
    const historyPath = getHistoryPath();
    if (!historyPath) return;
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      files: historyByFileRef.current,
    };
    try {
      await window.electronAPI.writeFile(historyPath, JSON.stringify(payload, null, 2));
    } catch (err) {
      console.warn('[EditorHistory] Failed to persist history:', err);
    }
  };

  const schedulePersistHistory = () => {
    if (!projectPathRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      persistHistoryNow();
    }, 500);
  };

  const getHistoryKey = () => currentFileRef.current || '__draft__';

  const getHistory = (key = getHistoryKey(), initialContent = content) => {
    if (!historyByFileRef.current[key]) {
      historyByFileRef.current[key] = { undo: [], redo: [], last: initialContent };
    }
    return historyByFileRef.current[key];
  };

  const markHistoryContent = (txt: string) => {
    const history = getHistory();
    history.last = txt;
    lastHistoryContentRef.current = txt;
    schedulePersistHistory();
  };

  useEffect(() => {
    projectPathRef.current = projectPath;
    currentFileRef.current = currentFile;
  }, [projectPath, currentFile]);

  useEffect(() => {
    let cancelled = false;
    projectPathRef.current = projectPath;

    const loadProjectHistory = async () => {
      if (!projectPath) {
        historyByFileRef.current = {};
        loadedProjectRef.current = '';
        return;
      }
      if (loadedProjectRef.current === projectPath) return;
      try {
        const raw = await window.electronAPI.readFile(getHistoryPath(projectPath));
        if (cancelled) return;
        const parsed = JSON.parse(raw);
        const files = parsed?.files && typeof parsed.files === 'object' ? parsed.files : {};
        const nextHistory: Record<string, HistoryBucket> = {};
        Object.entries(files).forEach(([filePath, bucket]) => {
          nextHistory[filePath] = normalizeBucket(bucket);
        });
        historyByFileRef.current = nextHistory;
      } catch (_) {
        if (!cancelled) historyByFileRef.current = {};
      }
      if (!cancelled) {
        loadedProjectRef.current = projectPath;
        const history = getHistory(currentFile || '__draft__', content);
        if (!history.last && content) history.last = content;
        lastHistoryContentRef.current = history.last || content;
      }
    };

    loadProjectHistory();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  // Keep an independent undo/redo stack per open document. Switching files or
  // editor modes should not discard the user's local editing history.
  useEffect(() => {
    currentFileRef.current = currentFile;
    const history = getHistory(currentFile || '__draft__', content);
    if (history.last === '' && content) {
      history.last = content;
    }
    lastHistoryContentRef.current = history.last || content;
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
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        persistHistoryNow();
      }
    };
  }, []);

  const pushStateToUndoStack = (txt: string, selStart: number, selEnd: number) => {
    const history = getHistory();
    const last = history.undo[history.undo.length - 1];
    if (last && last.content === txt) return;
    history.undo.push({
      content: txt,
      selectionStart: selStart,
      selectionEnd: selEnd
    });
    if (history.undo.length > 100) {
      history.undo.shift();
    }
    history.redo = [];
    schedulePersistHistory();
  };

  const handleUndo = () => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    const history = getHistory();
    const currentText = textareaRef.current?.value ?? content;
    const currentStart = textareaRef.current?.selectionStart ?? 0;
    const currentEnd = textareaRef.current?.selectionEnd ?? currentStart;

    if (currentText !== history.last) {
      pushStateToUndoStack(history.last, currentStart, currentEnd);
      history.last = currentText;
      lastHistoryContentRef.current = currentText;
      schedulePersistHistory();
    }

    const previousState = history.undo.pop();
    if (!previousState) {
      setStatusMessage('已是最旧版本');
      return;
    }

    history.redo.push({
      content: currentText,
      selectionStart: currentStart,
      selectionEnd: currentEnd
    });

    setContent(previousState.content);
    history.last = previousState.content;
    lastHistoryContentRef.current = previousState.content;
    schedulePersistHistory();
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
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    const history = getHistory();
    const currentText = textareaRef.current?.value ?? content;
    const currentStart = textareaRef.current?.selectionStart ?? 0;
    const currentEnd = textareaRef.current?.selectionEnd ?? currentStart;

    const nextState = history.redo.pop();
    if (!nextState) {
      setStatusMessage('已最新版本');
      return;
    }

    history.undo.push({
      content: currentText,
      selectionStart: currentStart,
      selectionEnd: currentEnd
    });

    setContent(nextState.content);
    history.last = nextState.content;
    lastHistoryContentRef.current = nextState.content;
    schedulePersistHistory();
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
    markHistoryContent,
  };
}
