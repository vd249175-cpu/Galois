import { BC } from '../../CORE/BloodChannels';

export function useEditorFileActions(props: any) {
  const { contentRef, currentFile, projectPath, setStatusMessage, showPrompt, state, updateBloodKey } = props;
const handleDeleteCurrentFile = async () => {
  if (!currentFile) return;
  const noteName = currentFile.split(/[/\\]/).pop()?.replace('.md', '') || '';

  let isUnsaved = false;
  try {
    const exists = await (window as any).electronAPI.readFile(currentFile).then(() => true).catch(() => false);
    isUnsaved = !exists;
  } catch (_) {}

  const message = isUnsaved
    ? `Are you sure you want to discard this draft note "${noteName}"?`
    : `Are you sure you want to delete note "${noteName}"?\nThis cannot be undone.`;

  const ok = confirm(message);
  if (!ok) return;

  try {
    if (!isUnsaved) {
      await (window as any).electronAPI.deleteFile(currentFile);
    }

    const activeEditors = state[BC.system.activeEditors] || [];
    activeEditors.forEach((editorId: string) => {
      const opened = state[BC.events.openFile(editorId)] || '';
      if (opened === currentFile) {
        updateBloodKey(BC.events.openFile(editorId), '');
      }
    });
    if (state[BC.events.openFile('global')] === currentFile) {
      updateBloodKey(BC.events.openFile('global'), '');
    }

    updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
  } catch (err: any) {
    alert(`Failed to delete note: ${err.message}`);
  }
};

const handleSetAsTemplate = async () => {
  if (!currentFile || !projectPath) {
    alert('Please open a project and a note file first.');
    return;
  }
  const noteName = currentFile.split(/[/\\]/).pop()?.replace('.md', '') || 'template';
  showPrompt('Save as template with name:', noteName, async (templeName: string) => {
    if (!templeName) return;
    const cleanName = templeName.trim().endsWith('.md') ? templeName.trim() : `${templeName.trim()}.md`;
    const templePath = `${projectPath}/temple`;
    const destPath = `${templePath}/${cleanName}`;
    try {
      await (window as any).electronAPI.writeFile(destPath, contentRef.current);
      setStatusMessage(`Saved as template: ${cleanName}`);
    } catch (err: any) {
      alert(`Failed to save template: ${err.message}`);
    }
  });
};

const handleRenameCurrentFile = async () => {
  if (!currentFile || !projectPath) return;
  const oldPath = currentFile;
  const currentName = oldPath.split(/[/\\]/).pop()?.replace('.md', '') || '';

  showPrompt('重命名笔记:', currentName, async (newName: string) => {
    if (!newName || newName.trim() === currentName) return;

    const cleanName = newName.trim().endsWith('.md') ? newName.trim() : `${newName.trim()}.md`;
    const dirPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${dirPath}/${cleanName}`;

    try {
      const list = await (window as any).electronAPI.listDir(dirPath);
      const exists = list.some((f: any) => f.name.toLowerCase() === cleanName.toLowerCase() && f.path !== oldPath);
      if (exists) {
        alert('同名笔记已存在！');
        return;
      }

      await (window as any).electronAPI.renameFile(oldPath, newPath);

      const activeEditors = state[BC.system.activeEditors] || [];
      activeEditors.forEach((editorId: string) => {
        const opened = state[BC.events.openFile(editorId)] || '';
        if (opened === oldPath) {
          updateBloodKey(BC.events.openFile(editorId), newPath);
        }
      });
      if (state[BC.events.openFile('global')] === oldPath) {
        updateBloodKey(BC.events.openFile('global'), newPath);
      }

      updateBloodKey(BC.events.fileSaved(oldPath), Date.now());
      updateBloodKey(BC.events.fileSaved(newPath), Date.now());
      
      setStatusMessage(`Editing Note: ${newName.trim()}`);
    } catch (err: any) {
      alert(`重命名笔记失败: ${err.message}`);
    }
  });
};
  return { handleDeleteCurrentFile, handleRenameCurrentFile, handleSetAsTemplate };
}
