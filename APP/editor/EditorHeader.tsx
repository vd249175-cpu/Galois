import type { EditorMode } from './EditorCanvas';

interface EditorHeaderProps {
  currentFile: string;
  editorMode: EditorMode;
  isRecordingAudio: boolean;
  modeLabel: string;
  modeOptions: Array<{ mode: EditorMode; label: string; title: string }>;
  onRename: () => void;
  onSetCustomCommandsOpen: (open: boolean) => void;
  onSetTagGroupsOpen: (open: boolean) => void;
  onToggleAudioRecording: () => void;
  onSwitchMode: (mode: EditorMode) => void;
}

export function EditorHeader({
  currentFile, editorMode, isRecordingAudio, modeLabel, modeOptions, onRename,
  onSetCustomCommandsOpen, onSetTagGroupsOpen, onToggleAudioRecording, onSwitchMode,
}: EditorHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', height: '26px', overflow: 'hidden' }}>
      <span style={{ fontSize: 'var(--panel-title-size, 11px)', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
        <span>{modeLabel}</span>
        {currentFile && <>
          <span style={{ color: 'var(--border-color)', margin: '0 2px' }}>|</span>
          <span onClick={onRename} title="点击重命名此笔记" style={{ color: 'var(--text-main)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(0,0,0,0.03)', transition: 'background-color 0.12s', maxWidth: '150px', overflow: 'hidden' }} onMouseEnter={(event) => event.currentTarget.style.backgroundColor = 'var(--highlight-color)'} onMouseLeave={(event) => event.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>{currentFile.split(/[/\\]/).pop()?.replace('.md', '')}</span>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ opacity: 0.8, flexShrink: 0 }}><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" fill="currentColor" /></svg>
          </span>
        </>}
      </span>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
        <button className="area-btn" onClick={() => onSetTagGroupsOpen(true)} style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: 'var(--panel-title-size, 11px)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" /></svg>标签组模板</button>
        <button className="area-btn" onClick={() => onSetCustomCommandsOpen(true)} style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: 'var(--panel-title-size, 11px)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" /></svg>自定义命令</button>
        <button className="area-btn" onClick={onToggleAudioRecording} title={isRecordingAudio ? '停止录音并插入到当前笔记' : '录制一段声音并插入到当前笔记'} style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: 'var(--panel-title-size, 11px)', display: 'inline-flex', alignItems: 'center', gap: '4px', color: isRecordingAudio ? '#ff3b30' : 'var(--text-muted)', borderColor: isRecordingAudio ? 'rgba(255, 59, 48, 0.45)' : undefined, backgroundColor: isRecordingAudio ? 'rgba(255, 59, 48, 0.08)' : undefined }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: isRecordingAudio ? '#ff3b30' : 'currentColor', boxShadow: isRecordingAudio ? '0 0 0 3px rgba(255, 59, 48, 0.14)' : 'none' }} />{isRecordingAudio ? '停止' : '录音'}
        </button>
        <div role="group" aria-label="Editor mode" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '7px', backgroundColor: 'var(--bg-input)' }}>
          {modeOptions.map((option) => {
            const active = editorMode === option.mode;
            return <button key={option.mode} className="area-btn" title={`${option.title} (meta+e 在 Live / Reading 间切换)`} onClick={() => onSwitchMode(option.mode)} style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: 'var(--panel-title-size, 11px)', borderColor: active ? 'var(--accent-color)' : 'transparent', backgroundColor: active ? 'var(--highlight-color)' : 'transparent', color: active ? 'var(--accent-color)' : 'var(--text-muted)', fontWeight: active ? 700 : 600 }}>{option.label}</button>;
          })}
        </div>
      </div>
    </div>
  );
}
