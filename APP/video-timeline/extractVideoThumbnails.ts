export async function extractVideoThumbnails({
  areaId, path, dur, projectPath, setIsExtractingThumbnails, setThumbnails,
}: {
  areaId: string;
  path: string;
  dur: number;
  projectPath: string;
  setIsExtractingThumbnails: (value: boolean) => void;
  setThumbnails: (value: string[]) => void;
}) {
  if (!path || dur <= 0) {
    console.log('[VideoTimeline] extractThumbnails skipped: invalid parameters');
    return;
  }
  console.log('[VideoTimeline] extractThumbnails start:', { path, dur, projectPath });
  setIsExtractingThumbnails(true);
  
  // We pre-extract 30 thumbnails to cover high zoom density details
  const frameCount = 30;
  const step = dur / frameCount;
  
  // 1. Try native FFmpeg extraction first for ultra-fast performance
  if (projectPath) {
    try {
      const cacheDir = `${projectPath}/.dnote_cache/video-timeline/${areaId}`;
      console.log('[VideoTimeline] extractThumbnails trying native FFmpeg in directory:', cacheDir);
      
      // Build parallel commands running with & and wait
      const cleanCacheCmd = `mkdir -p "${cacheDir}" && rm -f "${cacheDir}/thumb_*.jpg"`;
      const ffmpegTasks = [];
      
      for (let i = 0; i < frameCount; i++) {
        const t = (i * step + step / 2).toFixed(2);
        ffmpegTasks.push(`ffmpeg -y -ss ${t} -i "${path}" -vframes 1 -vf "scale=-1:68" "${cacheDir}/thumb_${i + 1}.jpg" >/dev/null 2>&1 &`);
      }
      
      const shellCmd = `${cleanCacheCmd} && ${ffmpegTasks.join(' ')} wait`;

      console.log('[VideoTimeline] extractThumbnails executing native FFmpeg command:', shellCmd);
      // Run in shell asynchronously (does not block renderer UI)
      await (window as any).electronAPI.execCommand(shellCmd, projectPath);

      // Populate thumbnails state with local custom scheme URLs
      const paths = Array.from({ length: frameCount }).map((_, i) => {
        const fullPath = `${cacheDir}/thumb_${i + 1}.jpg`;
        const absolutePath = fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
        return `dnote-file://${encodeURI(absolutePath)}`;
      });
      console.log('[VideoTimeline] extractThumbnails native extraction success, thumbnail count:', paths.length);
      setThumbnails(paths);
      setIsExtractingThumbnails(false);
      return; // Success! Exit early
    } catch (err) {
      console.warn('[Video Timeline] Native FFmpeg extraction failed, falling back to HTML5 seeker:', err);
    }
  }

  // 2. Fallback to HTML5 browser-level canvas sequential seeking if projectPath is empty or FFmpeg fails
  console.log('[VideoTimeline] extractThumbnails falling back to HTML5 canvas seeking...');
  const fallbackCount = 15;
  const fallbackStep = dur / fallbackCount;
  const list: string[] = new Array(fallbackCount).fill('');
  setThumbnails(list);

  try {
    const tempVideo = document.createElement('video');
    tempVideo.crossOrigin = 'anonymous';
    const absolutePath = path.startsWith('/') ? path : `/${path}`;
    const normalizedPath = encodeURI(absolutePath);
    tempVideo.src = `dnote-file://${normalizedPath}`;
    tempVideo.muted = true;
    tempVideo.playsInline = true;

    await new Promise<void>((resolve) => {
      tempVideo.onloadedmetadata = () => resolve();
      tempVideo.onloadeddata = () => resolve();
      tempVideo.onerror = () => resolve();
      setTimeout(resolve, 2000);
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < fallbackCount; i++) {
      const targetTime = i * fallbackStep + fallbackStep / 2;
      tempVideo.currentTime = targetTime;

      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
  }
        tempVideo.onseeked = done;
        tempVideo.onerror = done;
        setTimeout(done, 1500);
      });

      let w = 120;
      let h = 68;
      if (tempVideo.videoWidth && tempVideo.videoHeight) {
        const ratio = tempVideo.videoWidth / tempVideo.videoHeight;
        if (ratio > 1) {
          w = 120;
          h = Math.round(120 / ratio);
        } else {
          h = 68;
          w = Math.round(68 * ratio);
        }
      }
      canvas.width = w;
      canvas.height = h;

      if (ctx) {
        ctx.drawImage(tempVideo, 0, 0, w, h);
        list[i] = canvas.toDataURL('image/jpeg', 0.5);
      }
      setThumbnails([...list]);
    }

    console.log('[VideoTimeline] extractThumbnails HTML5 fallback extraction complete.');
    tempVideo.src = '';
    tempVideo.load();
  } catch (e) {
    console.error('[Video Timeline] HTML5 fallback extraction error:', e);
  } finally {
    setIsExtractingThumbnails(false);
  }
}
