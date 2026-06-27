/**
 * VideoAssetManager — Non-destructive video clip asset persistence.
 *
 * Assets are stored as JSON files in:
 *   <projectPath>/.dnote_assets/videos/<sanitized-video-name>.asset.json
 *
 * Design: we never cut the original video. Each asset stores the full
 * video path plus an ordered list of { start, end } segments.
 */
import { formatTimestamp } from '../utils';

// Re-export so existing callers that imported from this module don't break
export { formatTimestamp };
export interface VideoSegment {
  id: string;
  start: number;
  end: number;
  name: string;
  color: string;
}

export interface VideoAsset {
  version: 1;
  videoPath: string;
  videoName: string;
  duration: number;
  addedAt: string;
  updatedAt: string;
  segments: VideoSegment[];
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.\u4e00-\u9fa5]/g, '_');
}

export function getAssetPath(projectPath: string, videoPath: string): string {
  const videoName = videoPath.split('/').pop() || 'video';
  const safe = sanitizeName(videoName);
  return `${projectPath}/.dnote_assets/videos/${safe}.asset.json`;
}

export async function saveAsset(
  projectPath: string,
  asset: VideoAsset
): Promise<void> {
  if (!projectPath) return;
  const assetPath = getAssetPath(projectPath, asset.videoPath);
  // Ensure the directory exists
  const dir = assetPath.substring(0, assetPath.lastIndexOf('/'));
  try {
    await (window as any).electronAPI.execCommand(`mkdir -p "${dir}"`, projectPath);
    await (window as any).electronAPI.writeFile(
      assetPath,
      JSON.stringify({ ...asset, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (err) {
    console.error('[VideoAssetManager] saveAsset failed:', err);
  }
}

export async function loadAsset(
  projectPath: string,
  videoPath: string
): Promise<VideoAsset | null> {
  if (!projectPath || !videoPath) return null;
  const assetPath = getAssetPath(projectPath, videoPath);
  try {
    const raw = await (window as any).electronAPI.readFile(assetPath);
    const parsed = JSON.parse(raw) as VideoAsset;
    // Validate version and that the videoPath matches
    if (parsed.version === 1 && parsed.videoPath === videoPath) {
      return parsed;
    }
    return null;
  } catch (_) {
    // File doesn't exist yet — first time loading this video
    return null;
  }
}

export function buildClipMarkdown(
  videoPath: string,
  segment: VideoSegment
): string {
  const fileName = videoPath.split('/').pop() || 'video';
  const start = segment.start.toFixed(3);
  const end = segment.end.toFixed(3);
  const label = segment.name || `${formatTimestamp(segment.start)} – ${formatTimestamp(segment.end)}`;
  // Syntax: @video[label](filename?t=start,end)
  // Avoids conflict with [[wikilinks]] and standard markdown
  return `@video[${label}](${fileName}?t=${start},${end})`;
}

export function parseClipSyntax(text: string): {
  label: string;
  fileName: string;
  start: number;
  end: number;
} | null {
  const m = /@video\[([^\]]*)\]\(([^#?)]+)[#?]t=([\d.]+),([\d.]+)\)/.exec(text);
  if (!m) return null;
  return {
    label: m[1],
    fileName: m[2],
    start: parseFloat(m[3]),
    end: parseFloat(m[4]),
  };
}

// formatTimestamp is now re-exported from the import above (shared APP/utils)
