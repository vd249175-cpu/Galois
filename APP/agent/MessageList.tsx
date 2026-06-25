import React from 'react';
import { Conversation } from './types';

export interface MessageListProps {
  activeChat?: Conversation;
  streamText: string;
  isProcessing: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  currentFile: string;
  cursorData: { line: number; column: number; selectedText?: string } | null;
}

export function MessageList({
  activeChat,
  streamText,
  isProcessing,
  messagesEndRef,
  currentFile,
  cursorData,
}: MessageListProps) {
  return (
    <>
      {/* Messages List Area */}
      <div
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {activeChat?.messages.map((msg) => {
          if (msg.sender === 'tool') {
            return (
              <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color)', fontSize: '11px', padding: '0 4px', fontStyle: 'italic' }}>
                {msg.text}
              </div>
            );
          }
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--agent-system-color, #10b981)', fontSize: '11px', padding: '0 4px', fontStyle: 'italic' }}>
                {msg.text}
              </div>
            );
          }

          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                backgroundColor: isUser ? 'var(--accent-color, #3b82f6)' : 'var(--bg-input, rgba(128, 128, 128, 0.08))',
                color: isUser ? '#ffffff' : 'var(--text-main, #e2e8f0)',
                padding: '8px 12px',
                borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                fontSize: '12px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                border: isUser ? 'none' : '1px solid var(--border-color, rgba(255,255,255,0.06))'
              }}
            >
              {msg.text}
            </div>
          );
        })}

        {/* Live streaming bubble */}
        {streamText && (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              backgroundColor: 'var(--bg-input, rgba(128, 128, 128, 0.08))',
              color: 'var(--text-main, #e2e8f0)',
              padding: '8px 12px',
              borderRadius: '12px 12px 12px 2px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              fontSize: '12px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              border: '1px solid var(--border-color, rgba(255,255,255,0.06))'
            }}
          >
            {streamText}
            <span style={{ display: 'inline-block', width: '4px', height: '14px', backgroundColor: 'var(--text-main, #e2e8f0)', marginLeft: '2px', animation: 'blink 1s step-end infinite' }}>|</span>
          </div>
        )}

        {isProcessing && !streamText && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted, #94a3b8)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '4px' }}>
            <span>⚡ AI 正在思考中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* active file context tag indicator */}
      {currentFile && (
        <div style={{ fontSize: '10px', color: 'var(--text-muted, #94a3b8)', padding: '4px 12px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.05))', backgroundColor: 'var(--bg-header, rgba(0,0,0,0.1))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📖 当前聚焦笔记: <strong style={{ color: 'var(--accent-color)' }}>{currentFile.split(/[/\\]/).pop()}</strong></span>
          {cursorData && (
            <span>📍 光标行: {cursorData.line}</span>
          )}
        </div>
      )}
    </>
  );
}
