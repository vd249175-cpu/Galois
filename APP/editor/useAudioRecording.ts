import { useEffect } from 'react';

export function useAudioRecording(props: any) {
  const { currentFile, insertTextAtCurrentCursor, isRecordingAudio, mediaRecorderRef, projectPath,
    recordingChunksRef, recordingStreamRef, setIsRecordingAudio, setStatusMessage } = props;
const stopRecordingTracks = () => {
  recordingStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  recordingStreamRef.current = null;
};

const finishAudioRecording = async (mimeType: string) => {
  try {
    const blob = new Blob(recordingChunksRef.current, { type: mimeType || 'audio/webm' });
    recordingChunksRef.current = [];
    if (blob.size === 0) {
      setStatusMessage('录音为空，未插入。');
      return;
    }
    if (!projectPath || !currentFile) {
      setStatusMessage('请先打开笔记项目和笔记，再开始录音。');
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const data = await blob.arrayBuffer();
    const relativePath = await (window as any).electronAPI.archiveMediaData(
      `voice-${timestamp}.webm`,
      mimeType || 'audio/webm',
      data,
      projectPath
    );
    insertTextAtCurrentCursor(`![audio](${relativePath})`);
    setStatusMessage('录音已保存到当前笔记项目媒体目录。');
  } catch (err: any) {
    console.error('[Editor] Audio recording save failed:', err);
    setStatusMessage(`录音保存失败: ${err.message}`);
  } finally {
    stopRecordingTracks();
    setIsRecordingAudio(false);
  }
};

const handleToggleAudioRecording = async () => {
  if (isRecordingAudio) {
    mediaRecorderRef.current?.stop();
    return;
  }
  if (!projectPath || !currentFile) {
    setStatusMessage('请先打开笔记项目和笔记，再开始录音。');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    setStatusMessage('当前环境不支持浏览器录音。');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    recordingStreamRef.current = stream;
    recordingChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunksRef.current.push(event.data);
    };
    recorder.onerror = (event: any) => {
      console.error('[Editor] Audio recording failed:', event.error || event);
      setStatusMessage(`录音失败: ${event.error?.message || '未知错误'}`);
      stopRecordingTracks();
      setIsRecordingAudio(false);
    };
    recorder.onstop = () => {
      finishAudioRecording(mimeType);
    };
    recorder.start();
    setIsRecordingAudio(true);
    setStatusMessage('正在录音，再次点击可停止并插入音频。');
  } catch (err: any) {
    console.error('[Editor] Audio recording start failed:', err);
    stopRecordingTracks();
    setIsRecordingAudio(false);
    setStatusMessage(`无法开始录音: ${err.message}`);
  }
};

useEffect(() => {
  return () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    stopRecordingTracks();
  };
}, []);
  return { handleToggleAudioRecording };
}
