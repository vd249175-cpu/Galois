export type MarkdownMediaKind = 'image' | 'audio' | 'video' | 'file';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);

export function getMarkdownMediaKind(url: string): MarkdownMediaKind {
  const cleanUrl = url.split('#')[0].split('?')[0];
  const extension = cleanUrl.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'file';
}

export function toDnoteMediaUrl(url: string, projectPath: string): string {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('dnote-file://')) {
    return url;
  }
  const cleanPath = url.startsWith('file://') ? url.replace('file://', '') : url;
  const absolutePath = cleanPath.startsWith('/') ? cleanPath : `${projectPath}/${cleanPath}`;
  const normalizedPath = absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`;
  return `dnote-file://${encodeURI(normalizedPath)}`;
}

export function resolveMarkdownMediaPath(url: string, projectPath: string): string | null {
  if (url.startsWith('http://') || url.startsWith('https://')) return null;
  const cleanUrl = url.split('#')[0].split('?')[0];
  const cleanPath = cleanUrl.startsWith('file://') ? cleanUrl.replace(/^file:\/\//, '') : cleanUrl;
  return cleanPath.startsWith('/') ? cleanPath : `${projectPath}/${cleanPath}`;
}
