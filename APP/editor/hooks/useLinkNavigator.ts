import { BC } from '../../../CORE/BloodChannels';

interface UseLinkNavigatorOptions {
  projectPath: string;
  areaId: string;
  updateBloodKey: (key: string, value: any) => void;
}

/**
 * useLinkNavigator — WikiLink 和 Markdown 链接点击跳转逻辑
 *
 * 读取: system.projectPath (通过 props 传入)
 * 写入: events.openFile.{areaId}  (导航到目标笔记)
 *        events.fileSaved.{path}   (新建笔记时广播)
 */
export function useLinkNavigator({ projectPath, areaId, updateBloodKey }: UseLinkNavigatorOptions) {
  const handleLinkClick = async (targetNodeText: string) => {
    if (!projectPath) return;

    const cleanTargetName = targetNodeText.trim().replace(/\.md$/, '');
    const targetFilename = `${cleanTargetName}.md`;
    const targetFilePath = `${projectPath}/${targetFilename}`;

    try {
      const list = await (window as any).electronAPI.listDir(projectPath);
      const exists = list.some((f: any) => f.name.toLowerCase() === targetFilename.toLowerCase());

      if (exists) {
        updateBloodKey(BC.events.openFile(areaId), targetFilePath);
      } else {
        const create = confirm(`Note "${cleanTargetName}" does not exist. Create it?`);
        if (create) {
          const defaultContent = `---\ntags:\n---\n# ${cleanTargetName}\n\n`;
          await (window as any).electronAPI.writeFile(targetFilePath, defaultContent);
          updateBloodKey(BC.events.fileSaved(targetFilePath), Date.now());
          updateBloodKey(BC.events.openFile(areaId), targetFilePath);
        }
      }
    } catch (e) {
      console.error('[useLinkNavigator] Failed to resolve note link:', e);
    }
  };

  return { handleLinkClick };
}
