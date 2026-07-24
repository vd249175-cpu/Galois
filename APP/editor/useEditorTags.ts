import { useRef, type FormEvent } from 'react';
import { BC } from '../../CORE/BloodChannels';
import { normalizeManualTags, updateYamlFrontmatterTags } from './editorUtils';

export function useEditorTags(props: any) {
  const { contentRef, currentFile, currentFileRef, lastSavedContentRef, markHistoryContent, newTagInput,
    pendingInternalContentRef, pushStateToUndoStack, setContent, setNewTagInput, setStatusMessage,
    setTags, tagsRef, textareaRef, updateBloodKey } = props;
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const updateRevisionRef = useRef(0);

  const handleUpdateTags = async (nextTags: string[]) => {
    if (!currentFile) return;
    const targetFile = currentFile;
    const cleanTags = normalizeManualTags(nextTags);
    const previousContent = contentRef.current;
    const previousTags = tagsRef.current;
    const fullContent = updateYamlFrontmatterTags(previousContent, cleanTags);
    if (fullContent === previousContent) {
      tagsRef.current = cleanTags;
      setTags(cleanTags);
      return;
    }

    const revision = ++updateRevisionRef.current;
    tagsRef.current = cleanTags;
    setTags(cleanTags);

    if (textareaRef.current) {
      pushStateToUndoStack(previousContent, textareaRef.current.selectionStart, textareaRef.current.selectionEnd);
    } else {
      pushStateToUndoStack(previousContent, 0, 0);
    }

    contentRef.current = fullContent;
    setContent(fullContent);
    markHistoryContent(fullContent);
    const write = async () => {
      try {
        pendingInternalContentRef.current = fullContent;
        await (window as any).electronAPI.writeFile(targetFile, fullContent);
        if (currentFileRef.current === targetFile) {
          lastSavedContentRef.current = fullContent;
          if (revision === updateRevisionRef.current) setStatusMessage('手动标签已更新。');
        }
        updateBloodKey(BC.events.fileSaved(targetFile), Date.now());
      } catch (err: any) {
        console.error('[Editor] Tag update failed:', err);
        if (revision === updateRevisionRef.current && currentFileRef.current === targetFile) {
          contentRef.current = previousContent;
          tagsRef.current = previousTags;
          setContent(previousContent);
          setTags(previousTags);
          setStatusMessage(`标签更新失败: ${err.message || String(err)}`);
        }
      } finally {
        if (pendingInternalContentRef.current === fullContent) pendingInternalContentRef.current = null;
      }
    };
    writeQueueRef.current = writeQueueRef.current.catch(() => undefined).then(write);
    await writeQueueRef.current;
  };

  const handleAddTag = (e: FormEvent) => {
    e.preventDefault();
    const cleanInput = newTagInput.trim();
    if (!cleanInput) return;
    void handleUpdateTags([...tagsRef.current, cleanInput]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    void handleUpdateTags(tagsRef.current.filter((tag: string) => tag !== tagToRemove));
  };

  return { handleAddTag, handleRemoveTag, handleUpdateTags };
}
