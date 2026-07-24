export interface FrameReferenceResult {
  markdown: string;
  relativePath: string;
  time: number;
}

function waitForCurrentSeek(video: HTMLVideoElement): Promise<void> {
  if (!video.seeking) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeEventListener('seeked', finish);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 1800);
    video.addEventListener('seeked', finish, { once: true });
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('无法编码当前视频帧')),
      'image/jpeg',
      0.92,
    );
  });
}

function safeVideoStem(videoPath: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(videoPath);
    } catch {
      return videoPath;
    }
  })();
  const fileName = decoded.split(/[\\/]/).pop() || 'video';
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'video';
}

export function formatFrameTime(time: number): string {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const hours = Math.floor(safeTime / 3600);
  const minutes = Math.floor((safeTime % 3600) / 60);
  const seconds = Math.floor(safeTime % 60);
  const milliseconds = Math.floor((safeTime % 1) * 1000);
  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':') + `.${milliseconds.toString().padStart(3, '0')}`;
}

export async function copyCurrentFrameReference(
  video: HTMLVideoElement,
  projectPath: string,
  videoPath: string,
): Promise<FrameReferenceResult> {
  if (!projectPath) throw new Error('请先打开一个笔记项目');
  if (!videoPath) throw new Error('请先载入视频');

  await waitForCurrentSeek(video);
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('当前视频帧尚未准备好');
  }
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('无法读取当前视频帧尺寸');
  }

  const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建关键帧画布');

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToJpeg(canvas);
  const timeLabel = formatFrameTime(time);
  const fileName = `keyframe-${safeVideoStem(videoPath)}-${timeLabel.replace(/[:.]/g, '-')}.jpg`;
  const relativePath = await window.electronAPI.archiveMediaData(
    fileName,
    'image/jpeg',
    await blob.arrayBuffer(),
    projectPath,
  );
  const markdown = `![关键帧 ${timeLabel}](${relativePath})`;
  await window.electronAPI.writeClipboardText(markdown);

  return { markdown, relativePath, time };
}
