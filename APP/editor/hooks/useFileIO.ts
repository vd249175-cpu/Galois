import { useEffect, useRef, useState } from 'react';
import { parseFrontmatterTags } from '../../utils';
import { BC } from '../../../CORE/BloodChannels';

interface UseFileIOOptions {
  openedFile: string;
  isPreviewMode: boolean;
  updateBloodKey: (key: string, value: any) => void;
  onFileLoaded: (content: string, tags: string[], filePath: string) => void;
}

export function useFileIO({
  openedFile,
  isPreviewMode,
  updateBloodKey,
  onFileLoaded,
}: UseFileIOOptions) {
  const [currentFile, setCurrentFile] = useState('');
  const [statusMessage, setStatusMessage] = useState('No file open');

  const contentRef = useRef('');
  const lastSavedContentRef = useRef('');

  // 3. Load file when openedFile signal arrives
  useEffect(() => {
    if (!openedFile) return;

    const loadMarkdownFile = async () => {
      try {
        const rawContent = await (window as any).electronAPI.readFile(openedFile);
        const parsedTags = parseFrontmatterTags(rawContent);
        lastSavedContentRef.current = rawContent;
        setCurrentFile(openedFile);
        const noteName = openedFile.split('/').pop()?.replace('.md', '') || '';
        setStatusMessage(`Editing Note: ${noteName}`);
        onFileLoaded(rawContent, parsedTags, openedFile);
      } catch (err: any) {
        console.error('[useFileIO] Failed to load note:', openedFile, err);
        setStatusMessage(`Error loading note file.`);
      }
    };

    loadMarkdownFile();
  }, [openedFile]);

  // Save function — writes to disk and broadcasts fileSaved event
  const saveNodeFile = async (content: string) => {
    if (!currentFile) {
      setStatusMessage('No file open to save');
      return;
    }
    if (content === lastSavedContentRef.current) return; // skip identical

    try {
      await (window as any).electronAPI.writeFile(currentFile, content);
      lastSavedContentRef.current = content;
      setStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
    } catch (err: any) {
      console.error('[useFileIO] Save failed:', err);
      setStatusMessage(`Error saving: ${err.message}`);
      updateBloodKey(BC.events.scriptError('editor'), { message: err.message, ts: Date.now() });
    }
  };

  // Debounced auto-save
  useEffect(() => {
    if (!currentFile || isPreviewMode) return;
    if (!contentRef.current || contentRef.current === '') return;

    const timer = setTimeout(() => {
      saveNodeFile(contentRef.current);
    }, 1200);
    return () => clearTimeout(timer);
  }, [contentRef.current, currentFile, isPreviewMode]);

  return {
    currentFile,
    setCurrentFile,
    statusMessage,
    setStatusMessage,
    contentRef,
    lastSavedContentRef,
    saveNodeFile,
  };
}
