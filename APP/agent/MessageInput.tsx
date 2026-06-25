import React from 'react';

export interface MessageInputProps {
  inputText: string;
  setInputText: (v: string) => void;
  isProcessing: boolean;
  currentFile: string;
  handleSend: (e?: React.FormEvent) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function MessageInput({
  inputText,
  setInputText,
  isProcessing,
  currentFile,
  handleSend,
  textareaRef,
}: MessageInputProps) {
  return (
    <form
      onSubmit={handleSend}
      style={{
        display: 'flex',
        padding: '8px',
        borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        backgroundColor: 'var(--bg-header, rgba(0, 0, 0, 0.15))',
        gap: '8px',
        alignItems: 'flex-end',
      }}
    >
      <textarea
        ref={textareaRef}
        value={inputText}
        onChange={(e) => {
          setInputText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (inputText.trim() && !isProcessing && currentFile) {
              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
              handleSend(fakeEvent);
            }
          }
        }}
        placeholder={currentFile ? "发送指令来重构当前打开的笔记..." : "请先在左侧树双击打开一个笔记文件..."}
        disabled={isProcessing || !currentFile}
        style={{
          flexGrow: 1,
          backgroundColor: 'var(--bg-input, #1b1b22)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
          color: 'var(--text-main, #e2e8f0)',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          outline: 'none',
          resize: 'none',
          height: '32px',
          minHeight: '32px',
          maxHeight: '120px',
          fontFamily: 'inherit',
          lineHeight: '1.4',
        }}
      />
      <button
        type="submit"
        disabled={isProcessing || !inputText.trim() || !currentFile}
        style={{
          backgroundColor: isProcessing || !inputText.trim() || !currentFile ? 'var(--bg-header, #262630)' : 'var(--accent-color, #3b82f6)',
          color: isProcessing || !inputText.trim() || !currentFile ? 'var(--text-muted, #888)' : '#ffffff',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 14px',
          fontSize: '12px',
          cursor: isProcessing || !inputText.trim() || !currentFile ? 'default' : 'pointer',
          fontWeight: 600,
        }}
      >
        发送
      </button>
    </form>
  );
}
