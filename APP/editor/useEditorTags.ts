import type React from 'react';
import { BC } from '../../CORE/BloodChannels';
import { updateYamlFrontmatterTags } from './editorUtils';

export function useEditorTags(props: any) {
  const { contentRef, currentFile, lastSavedContentRef, markHistoryContent, newTagInput,
    pushStateToUndoStack, setContent, setNewTagInput, setStatusMessage, setTags, tags, textareaRef, updateBloodKey } = props;
const handleUpdateTags = async (nextTags: string[]) => {
  if (!currentFile) return;
  const cleanTags = Array.from(new Set(nextTags.map((t) => t.trim()).filter(Boolean))).sort();
  setTags(cleanTags);
  const fullContent = updateYamlFrontmatterTags(contentRef.current, cleanTags);
  if (fullContent === lastSavedContentRef.current) return;

  if (textareaRef.current) {
    pushStateToUndoStack(contentRef.current, textareaRef.current.selectionStart, textareaRef.current.selectionEnd);
  } else {
    pushStateToUndoStack(contentRef.current, 0, 0);
  }

  setContent(fullContent);
  markHistoryContent(fullContent);
  try {
    await (window as any).electronAPI.writeFile(currentFile, fullContent);
    lastSavedContentRef.current = fullContent;
    setStatusMessage('标签已更新。');
    updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
  } catch (err: any) {
    console.error('[Editor] Tag update failed:', err);
    alert(`更新标签失败: ${err.message}`);
  }
};

const handleAddTag = (e: React.FormEvent) => {
  e.preventDefault();
  const cleanInput = newTagInput.trim();
  if (!cleanInput) return;
  handleUpdateTags([...tags, cleanInput]);
  setNewTagInput('');
};

const handleRemoveTag = (tagToRemove: string) => {
  handleUpdateTags(tags.filter((t: string) => t !== tagToRemove));
};

  return { handleAddTag, handleRemoveTag, handleUpdateTags };
}
