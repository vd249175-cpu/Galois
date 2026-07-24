import { useEffect, useState } from 'react';
import type { VideoAsset } from './VideoAssetManager';

export function useSavedVideoAssets(projectPath: string, videoPath: string) {
const [savedAssets, setSavedAssets] = useState<VideoAsset[]>([]);

// Load saved video projects (assets) from project directory
useEffect(() => {
  if (!projectPath) return;

  const loadSavedAssets = async () => {
    try {
      const assetDir = `${projectPath}/.dnote_assets/videos`;
      const items = await (window as any).electronAPI.listDir(assetDir);
      const assetFiles = items.filter((item: any) => !item.isDir && item.name.endsWith('.asset.json'));
      
      const assets: VideoAsset[] = [];
      for (const file of assetFiles) {
        try {
          const raw = await (window as any).electronAPI.readFile(file.path);
          let parsed = JSON.parse(raw) as VideoAsset;
          if (parsed.version === 1 && parsed.videoPath) {
            const projectVideoPath = await (window as any).electronAPI.archiveVideo(
              parsed.videoPath,
              projectPath
            );
            if (projectVideoPath !== parsed.videoPath) {
              parsed = {
                ...parsed,
                videoPath: projectVideoPath,
                videoName: projectVideoPath.split('/').pop() || parsed.videoName,
              };
              await (window as any).electronAPI.writeFile(file.path, JSON.stringify(parsed, null, 2));
            }
            assets.push(parsed);
          }
        } catch (e) {
          console.error('Error loading asset file:', file.path, e);
        }
      }
      
      // Sort by updatedAt descending
      assets.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      setSavedAssets(assets);
    } catch (err) {
      // Folder might not exist yet, that's fine
      setSavedAssets([]);
    }
  };

  loadSavedAssets();
}, [projectPath, videoPath]);
  return savedAssets;
}
