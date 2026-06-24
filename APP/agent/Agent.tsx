import React, { useState, useEffect, useRef } from 'react';
import { agentActions } from './actions';
import { Blood, useBloodChannel } from '../../CORE/Blood';
import { BC } from '../../CORE/BloodChannels';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
  isCode?: boolean;
}

export const AgentComponent = {
  typeId: 'agent',
  displayName: 'Antigravity 助手',
  iconName: 'cpu',
  component: AgentView,
  actions: agentActions,
  bloodChannels: ['system.projectPath', 'system.lastFocusedEditorId'],
  manifest: {
    description: '嵌入式 Antigravity 智能助手，联动当前工作区上下文',
    reads: ['system.projectPath', 'system.lastFocusedEditorId'],
    writes: [],
    dependsOn: ['editor'],
  },
};

function AgentView({
  state,
  lastAction,
}: {
  areaId: string;
  state: Record<string, any>;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = state['system.projectPath'] || '';
  const lastFocusedEditorId = state['system.lastFocusedEditorId'] || '';

  // Dynamically listen to the focused editor's cursor position and selection
  const cursorData = useBloodChannel(
    lastFocusedEditorId ? [`system.editorCursor.${lastFocusedEditorId}`] : [],
    () =>
      lastFocusedEditorId
        ? Blood.getValue<any>(`system.editorCursor.${lastFocusedEditorId}`, null)
        : null
  );

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: '你好！我是 Antigravity。我已经准备就绪，可以感知你的 DNOTE 编辑器位置和选中的代码段。输入你想让我做的事，或者输入 `!` 前缀直接执行 shell 命令。',
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle toolbar actions like clearing history
  useEffect(() => {
    if (lastAction && lastAction.id === 'agent.clear') {
      setMessages([
        {
          id: 'welcome-reset',
          sender: 'agent',
          text: '会话记录已清空。随时向我提出任何问题或运行任务。',
          timestamp: Date.now(),
        },
      ]);
    }
  }, [lastAction]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputText.trim();
    if (!prompt || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    try {
      // Check if command is a direct shell command trigger
      if (prompt.startsWith('!')) {
        const cmd = prompt.substring(1).trim();
        if (!cmd) {
          addAgentResponse('请输入有效的命令，例如 `!ls` 或 `!git status`');
          return;
        }

        addAgentResponse(`正在目录 \`${projectPath || '.'}\` 执行命令: \`${cmd}\`...`);
        
        try {
          const result = await (window as any).electronAPI.execCommand(cmd, projectPath || '.');
          const output = (result.stdout || '') + (result.stderr ? `\nError:\n${result.stderr}` : '');
          setMessages((prev) => [
            ...prev,
            {
              id: `agent-exec-${Date.now()}`,
              sender: 'agent',
              text: output || '命令执行完成，无输出。',
              timestamp: Date.now(),
              isCode: true,
            },
          ]);
        } catch (err: any) {
          addAgentResponse(`执行失败: ${err.message}`);
        }
      } else {
        // Standard conversational agent prompt with context sensing
        setTimeout(() => {
          let contextDetails = '';
          if (cursorData) {
            const fileName = cursorData.filePath?.split(/[/\\]/).pop() || '未命名';
            contextDetails = `\n\n📌 **检测到当前工作区状态：**\n- **活跃文件**: \`${fileName}\`\n- **光标位置**: 行 ${cursorData.line}, 列 ${cursorData.column}`;
            if (cursorData.selectedText) {
              contextDetails += `\n- **选中的文本**:\n\`\`\`markdown\n${cursorData.selectedText}\n\`\`\``;
            }
          } else {
            contextDetails = `\n\n⚠️ **未检测到聚焦的编辑器。你可以点击某个编辑器面板激活坐标感知。**`;
          }

          const responseText = `收到您的指令！\n\n您说: "${prompt}"\n\n目前我是嵌入在 DNOTE 面板中的前哨助手。您可以直接在系统终端中运行 \`agy\` 启动我的完整形态来进行深度重构和工程级修改，所有操作都将通过工作区的 \`.dnote_runtime.json\` 进行无缝同步。${contextDetails}`;
          addAgentResponse(responseText);
        }, 800);
      }
    } catch (error: any) {
      addAgentResponse(`发生错误: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const addAgentResponse = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        text,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleOpenTerminal = () => {
    if (projectPath) {
      (window as any).electronAPI.openTerminal(projectPath);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-main)',
        color: 'var(--text-normal)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* HUD Bar - Real-time Coordinate Sensor */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'rgba(0, 0, 0, 0.08)',
          fontSize: '11px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: 'var(--accent-color)', letterSpacing: '0.5px' }}>
            🛰️ ANTIGRAVITY CONTEXT SENSOR
          </span>
          <button
            onClick={handleOpenTerminal}
            disabled={!projectPath}
            style={{
              background: 'none',
              border: 'none',
              color: projectPath ? 'var(--text-normal)' : 'var(--text-muted)',
              cursor: projectPath ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
            }}
            title="在终端打开此目录"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
              <path d="M4 6.5l2 1.5-2 1.5" />
              <line x1="7.5" y1="9.5" x2="10.5" y2="9.5" />
            </svg>
            <span>终端</span>
          </button>
        </div>

        {projectPath ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '2px', color: 'var(--text-muted)' }}>
            <div>
              <span style={{ color: 'var(--text-dark-muted)' }}>项目:</span>{' '}
              <span style={{ fontFamily: 'var(--font-mono)' }}>{projectPath.split(/[/\\]/).pop()}</span>
            </div>
            {cursorData?.filePath ? (
              <>
                <div>
                  <span style={{ color: 'var(--text-dark-muted)' }}>文件:</span>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {cursorData.filePath.split(/[/\\]/).pop()}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dark-muted)' }}>行/列:</span>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {cursorData.line}:{cursorData.column}
                  </span>
                </div>
                {cursorData.selectedText && (
                  <div>
                    <span style={{ color: 'var(--text-dark-muted)' }}>选中:</span>{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-color)' }}>
                      {cursorData.selectedText.length} 字
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--text-dark-muted)' }}>未激活焦点文件</div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>未打开任何项目</div>
        )}
      </div>

      {/* Chat Logs Scroll Area */}
      <div
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              animation: 'fadeInSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                borderTopRightRadius: msg.sender === 'user' ? '2px' : '12px',
                borderTopLeftRadius: msg.sender === 'agent' ? '2px' : '12px',
                backgroundColor:
                  msg.sender === 'user'
                    ? 'var(--accent-color)'
                    : 'rgba(255, 255, 255, 0.05)',
                color: msg.sender === 'user' ? '#fff' : 'var(--text-normal)',
                fontSize: '13px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                border: msg.sender === 'user' ? 'none' : '1px solid var(--border-color)',
                fontFamily: msg.isCode ? 'var(--font-mono)' : 'inherit',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              {msg.text}
            </div>
            <span
              style={{
                fontSize: '9px',
                color: 'var(--text-dark-muted)',
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                padding: '0 4px',
              }}
            >
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        {isProcessing && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              borderRadius: '12px',
              borderTopLeftRadius: '2px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="dot-flashing" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Antigravity 正在思考...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Box */}
      <form
        onSubmit={handleSend}
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.04)',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="问问 Antigravity，或者输入 !ls 运行命令..."
          disabled={isProcessing}
          style={{
            flexGrow: 1,
            height: '36px',
            borderRadius: '18px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-panel)',
            color: 'var(--text-normal)',
            padding: '0 16px',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isProcessing}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: inputText.trim() && !isProcessing ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            color: inputText.trim() && !isProcessing ? '#fff' : 'var(--text-muted)',
            cursor: inputText.trim() && !isProcessing ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="8" x2="14" y2="8" />
            <path d="M9 3l5 5-5 5" />
          </svg>
        </button>
      </form>
    </div>
  );
}
