import { useEffect } from 'react';
import { BC } from '../../CORE/BloodChannels';

export function useEditorFileLoader(props: any) {
  const { areaId, contentRef, fileSavedEvent, lastSavedContentRef, mergeInlineTagsIntoFrontmatter,
    openedFile, setContent, setCurrentFile, setEditorMode, setStatusMessage, setTags, updateBloodKey } = props;
// ── File loading ───────────────────────────────────────────────────────
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
  const loadMarkdownFile = async () => {
    try {
      const rawContent = await (window as any).electronAPI.readFile(openedFile);
      const normalized = mergeInlineTagsIntoFrontmatter(rawContent);
      const loadedContent = normalized.text;
      if (loadedContent === contentRef.current || loadedContent === lastSavedContentRef.current) return;
      const parsedTags = normalized.tags;
      if (normalized.changed) {
        await (window as any).electronAPI.writeFile(openedFile, loadedContent);
        updateBloodKey(BC.events.fileSaved(openedFile), Date.now());
      }
      lastSavedContentRef.current = loadedContent;
      setTags(parsedTags);
      setContent(loadedContent);
      setCurrentFile(openedFile);
      const noteName = openedFile.split('/').pop()?.replace('.md', '') || '';
      setStatusMessage(`Editing Note: ${noteName}`);
    } catch (err: any) {
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
        if (template === contentRef.current) return;
        lastSavedContentRef.current = template;
        setTags(draftTags);
        setContent(template);
        setCurrentFile(openedFile);
        setStatusMessage(`Draft Note: ${draftTitle} (Unsaved)`);
        setEditorMode('live');
      } else {
        setStatusMessage(`Error loading note file.`);
      }
    }
  };
  loadMarkdownFile();
}, [openedFile, fileSavedEvent]);
}

