import { useState } from 'react';
import { BC } from '../../CORE/BloodChannels';
import { updateYamlFrontmatterIcon } from '../utils';
import type { FileInfo } from './types';

interface Template {
  name: string;
  path: string;
  content: string;
}

interface FileTreeTemplatesOptions {
  projectPath: string;
  updateBloodKey: (key: string, value: unknown) => void;
  handleFileClick: (file: FileInfo) => void;
}

export function useFileTreeTemplates({ projectPath, updateBloodKey, handleFileClick }: FileTreeTemplatesOptions) {
  const [templateFiles, setTemplateFiles] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [iconPickerFile, setIconPickerFile] = useState<FileInfo | null>(null);
  const [promptConfig, setPromptConfig] = useState({
    show: false, title: '', defaultValue: '', onConfirm: (_value: string) => {},
  });
  const showPrompt = (title: string, defaultValue: string, onConfirm: (value: string) => void) => {
    setPromptConfig({ show: true, title, defaultValue, onConfirm });
  };
  const handleSaveIcon = async (file: FileInfo, newIcon: string) => {
    try {
      const content = await window.electronAPI.readFile(file.path);
      await window.electronAPI.writeFile(file.path, updateYamlFrontmatterIcon(content, newIcon));
      setIconPickerFile(null);
      updateBloodKey(BC.events.fileSaved(file.path), Date.now());
    } catch (err: any) {
      alert(`保存图标失败: ${err.message}`);
    }
  };
  const handleOpenTemplateModal = async () => {
    if (!projectPath) return alert('Please open a folder first.');
    const templeDir = `${projectPath}/temple`;
    try {
      let list: any[];
      try {
        list = await window.electronAPI.listDir(templeDir);
      } catch (err: any) {
        if (!err.message.includes('ENOENT') && !err.message.includes('no such file')) throw err;
        await window.electronAPI.writeFile(`${templeDir}/.gitkeep`, '');
        list = [];
      }
      const templates = await Promise.all(list.filter((file: any) => !file.isDir && file.name.endsWith('.md')).map(async (file: any) => ({
        name: file.name, path: file.path, content: await window.electronAPI.readFile(file.path),
      })));
      setTemplateFiles(templates);
      setShowTemplateModal(true);
    } catch (err: any) {
      alert(`Failed to load templates: ${err.message}`);
    }
  };
  const handleUseTemplate = async (template: Template) => {
    showPrompt('Name your new note:', template.name.replace('.md', ''), async (name) => {
      if (!name) return;
      const cleanName = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`;
      const fullPath = `${projectPath}/${cleanName}`;
      const exists = (await window.electronAPI.listDir(projectPath)).some((file: any) => file.name.toLowerCase() === cleanName.toLowerCase());
      if (exists) return alert('A note with this name already exists!');
      try {
        await window.electronAPI.writeFile(fullPath, template.content);
        updateBloodKey(BC.events.fileSaved(fullPath), Date.now());
        handleFileClick({ name: cleanName, path: fullPath, isDir: false, size: 0, tags: [] });
        setShowTemplateModal(false);
      } catch (err: any) {
        alert(`Failed to create note from template: ${err.message}`);
      }
    });
  };
  const handleOpenTempleFolder = async () => {
    if (!projectPath) return;
    try { await window.electronAPI.execCommand(`open "${projectPath}/temple"`, projectPath); }
    catch (err) { console.error('[FileTree] Failed to open temple folder:', err); }
  };
  return { templateFiles, showTemplateModal, setShowTemplateModal, iconPickerFile, setIconPickerFile, promptConfig, setPromptConfig, showPrompt, handleSaveIcon, handleOpenTemplateModal, handleUseTemplate, handleOpenTempleFolder };
}
