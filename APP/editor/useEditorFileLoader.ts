import { useEffect } from 'react';

export function useEditorFileLoader(props: any) {
  const { areaId, contentRef, currentFile, fileSavedEvent, lastSavedContentRef, readMarkdownTagState,
    openedFile, setContent, setCurrentFile, setEditorMode, setStatusMessage, setTags } = props;
  // ── File loading ─────────────────────────────────────────────────────
  useEffect(() => {
    console.log('[Editor] File loading useEffect triggered. openedFile =', openedFile, 'areaId =', areaId);
    if (!openedFile) {
      setContent('');
      setCurrentFile('');
      setTags([]);
      lastSavedContentRef.current = '';
      setStatusMessage('No file open');
      return;
    }

    let disposed = false;
    const loadMarkdownFile = async () => {
      try {
        const rawContent = await (window as any).electronAPI.readFile(openedFile);
        if (disposed) return;
        const normalized = readMarkdownTagState(rawContent);
        const loadedContent = normalized.text;
        if (
          openedFile === currentFile
          && (loadedContent === contentRef.current || loadedContent === lastSavedContentRef.current)
        ) return;
        lastSavedContentRef.current = loadedContent;
        setTags(normalized.tags);
        setContent(loadedContent);
        setCurrentFile(openedFile);
        const noteName = openedFile.split('/').pop()?.replace('.md', '') || '';
        setStatusMessage(`Editing Note: ${noteName}`);
      } catch (err: any) {
        if (disposed) return;
        console.error('[Editor] Failed to load note:', openedFile, err);
        const errMsg = err.message || '';
        if (errMsg.includes('ENOENT') || errMsg.includes('no such file')) {
          const noteName = openedFile.split(/[/\\]/).pop()?.replace('.md', '') || '';
          let draftTags: string[] = [];
          let draftTitle = noteName;
          if (noteName.startsWith('#')) {
            const parsed = noteName.split('#').map((t: string) => t.trim()).filter(Boolean);
            if (parsed.length > 0) {
              draftTags = parsed;
              draftTitle = noteName;
            }
          }
          const serializedTags = draftTags.map(t => `  - ${t}\n`).join('');
          const template = `---\ntags:\n${serializedTags}---\n# ${draftTitle}\n\n`;
          if (openedFile === currentFile && template === contentRef.current) return;
          lastSavedContentRef.current = template;
          setTags(draftTags);
          setContent(template);
          setCurrentFile(openedFile);
          setStatusMessage(`Draft Note: ${draftTitle} (Unsaved)`);
          setEditorMode('live');
        } else {
          setStatusMessage('Error loading note file.');
        }
      }
    };
    void loadMarkdownFile();
    return () => { disposed = true; };
  }, [openedFile, fileSavedEvent]);
}
