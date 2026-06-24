import React, { useState, useEffect, useRef } from 'react';
import { agentActions } from './actions';
import { Blood, useBloodChannel } from '../../CORE/Blood';
import { BC } from '../../CORE/BloodChannels';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system' | 'tool';
  text: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
}

export const AgentComponent = {
  typeId: 'agent',
  displayName: 'AI 智能副驾驶',
  iconName: 'cpu',
  component: AgentView,
  actions: agentActions,
  bloodChannels: (areaId: string) => [
    BC.system.projectPath,
    BC.system.lastFocusedEditorId,
    'events.openFile.',
    'system.editorCursor.'
  ],
  manifest: {
    description: 'LangChain 极简智能副驾驶，支持流式对话与代码重构工具',
    reads: [
      BC.system.projectPath,
      BC.system.lastFocusedEditorId,
      BC.events.openFile(''),
      'system.editorCursor.'
    ],
    writes: [
      BC.events.fileSaved(''),
    ],
    dependsOn: ['editor'],
  },
};

function AgentView({
  areaId,
  state,
  updateBloodKey,
  lastAction,
}: {
  areaId: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = state[BC.system.projectPath] || '';
  const lastFocusedEditorId = state[BC.system.lastFocusedEditorId] || '';

  // Get active note file in the focused editor
  const currentFile = lastFocusedEditorId ? state[BC.events.openFile(lastFocusedEditorId)] || '' : '';

  // Dynamically listen to the focused editor's cursor position and selection
  const cursorData = lastFocusedEditorId ? state[`system.editorCursor.${lastFocusedEditorId}`] : null;

  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  
  // LLM Settings
  const [provider, setProvider] = useState<string>('ollama');
  const [apiKey, setApiKey] = useState<string>('');
  const [baseURL, setBaseURL] = useState<string>('http://localhost:11434/v1');
  const [model, setModel] = useState<string>('llama3');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Chat UI states
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamText, setStreamText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize LLM Settings and Conversations from localStorage
  useEffect(() => {
    console.log('[AgentView] Initializing default conversation and local storage settings.');
    const savedProvider = localStorage.getItem('dnote_agent_provider');
    if (savedProvider) setProvider(savedProvider);

    const savedApiKey = localStorage.getItem('dnote_agent_api_key');
    if (savedApiKey) setApiKey(savedApiKey);

    const savedBaseURL = localStorage.getItem('dnote_agent_base_url');
    if (savedBaseURL) setBaseURL(savedBaseURL);

    const savedModel = localStorage.getItem('dnote_agent_model');
    if (savedModel) setModel(savedModel);

    const savedChats = localStorage.getItem('dnote_agent_conversations');
    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('[AgentView] Loaded saved conversations:', parsed.length);
          setConversations(parsed);
          setActiveChatId(parsed[0].id);
          return;
        }
      } catch (_) {}
    }

    // Default conversation
    const defaultChat: Conversation = {
      id: `chat-${Date.now()}`,
      title: '默认新会话',
      messages: [
        {
          id: 'welcome',
          sender: 'agent',
          text: '你好！我是你的 DNOTE 智能副驾驶 (Co-Pilot)。我只服务于你当前处于打开/聚焦状态的文档。\n\n你可以向我提问，或者直接命令我进行文本重构、添加段落、或者编辑特定行。例如你可以输入：“请为这篇文章的第三行到第五行进行拼写检查并润色”。',
          timestamp: Date.now(),
        },
      ],
    };
    console.log('[AgentView] Creating default conversation:', defaultChat.id);
    setConversations([defaultChat]);
    setActiveChatId(defaultChat.id);
  }, []);

  // Save conversations to localStorage
  const saveConversations = (updated: Conversation[]) => {
    setConversations(updated);
    localStorage.setItem('dnote_agent_conversations', JSON.stringify(updated));
  };

  const activeChat = conversations.find(c => c.id === activeChatId) || conversations[0];

  console.log('[AgentView] Render pass:', {
    conversationsCount: conversations.length,
    activeChatId,
    activeChatDefined: !!activeChat,
    currentFile,
    cursorData
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages, streamText]);

  // Handle toolbar actions (Clear history)
  useEffect(() => {
    if (lastAction && lastAction.id === 'agent.clear') {
      handleClearCurrentChat();
    }
  }, [lastAction]);

  if (conversations.length === 0 || !activeChat) {
    return (
      <div style={{
        padding: '20px',
        color: '#94a3b8',
        backgroundColor: '#1b1b22',
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px'
      }}>
        正在加载智能助手...
      </div>
    );
  }

  // Settings modification savers
  const saveSetting = (key: string, val: string, setter: (v: string) => void) => {
    setter(val);
    localStorage.setItem(key, val);
  };

  // Conversation Actions
  const handleNewConversation = () => {
    const newChat: Conversation = {
      id: `chat-${Date.now()}`,
      title: `新会话 #${conversations.length + 1}`,
      messages: [
        {
          id: 'welcome-' + Date.now(),
          sender: 'agent',
          text: '新会话已开启。你可以随时向我提问或调用工具编辑当前聚焦的笔记。',
          timestamp: Date.now(),
        },
      ],
    };
    const updated = [newChat, ...conversations];
    saveConversations(updated);
    setActiveChatId(newChat.id);
  };

  const handleClearCurrentChat = () => {
    if (!activeChatId) return;
    const updated = conversations.map(c => {
      if (c.id === activeChatId) {
        return {
          ...c,
          messages: [
            {
              id: 'reset-' + Date.now(),
              sender: 'agent',
              text: '历史记录已清空。你可以随时开始新的指令对话。',
              timestamp: Date.now(),
            },
          ],
        };
      }
      return c;
    });
    saveConversations(updated);
  };

  const handleDeleteCurrentChat = () => {
    if (conversations.length <= 1) {
      handleClearCurrentChat();
      return;
    }
    const updated = conversations.filter(c => c.id !== activeChatId);
    saveConversations(updated);
    setActiveChatId(updated[0].id);
  };

  // ── Agent Tools Implementation ──────────────────────────────────────────
  const executeTool = async (name: string, args: any): Promise<string> => {
    if (name === 'get_document_content') {
      if (!currentFile) {
        return '错误：当前没有打开或聚焦任何 Markdown 笔记。请先在编辑器中打开一个文件。';
      }
      try {
        const text = await (window as any).electronAPI.readFile(currentFile);
        const lines = text.split('\n');
        const formatted = lines.map((line, idx) => `${idx + 1}:${line}`).join('\n');
        return `成功获取当前文档内容，全文如下（格式为 行号:文字）：\n\n\`\`\`text\n${formatted}\n\`\`\``;
      } catch (err: any) {
        return `错误：读取文件失败。${err.message}`;
      }
    }

    if (name === 'edit_document_lines') {
      if (!currentFile) {
        return '错误：当前没有打开任何文档，无法编辑。';
      }
      const { replacementText } = args;
      if (replacementText === undefined) {
        return '错误：参数缺失，必须指定 replacementText。';
      }
      try {
        const text = await (window as any).electronAPI.readFile(currentFile);
        const lines = text.split('\n');
        
        const linesToReplace = replacementText.split('\n');
        let lastParsedLineNum = 0;

        for (const rawLine of linesToReplace) {
          // Keep empty lines if we are inside the replacement block, but skip if it is a completely empty rawLine at the end
          if (rawLine === '' && lastParsedLineNum === 0) continue;

          const match = rawLine.match(/^(\d+):(.*)$/);
          if (match) {
            const lineNum = parseInt(match[1], 10);
            const lineContent = match[2];
            
            if (lineNum < 1) continue;

            // Pad lines if lineNum is out of bounds
            while (lines.length < lineNum) {
              lines.push('');
            }
            lines[lineNum - 1] = lineContent;
            lastParsedLineNum = lineNum;
          } else {
            // If the line has no line number prefix, append it as a newline to the last edited line block to support multi-line insertion
            if (lastParsedLineNum > 0) {
              lines[lastParsedLineNum - 1] += '\n' + rawLine;
            } else {
              return `错误：未能解析修改文本的行号前缀。请确保每一行修改以 "行号:" 开头或作为前一行的换行延伸。`;
            }
          }
        }

        const updatedText = lines.join('\n');
        await (window as any).electronAPI.writeFile(currentFile, updatedText);

        // Notify DNOTE that the file has changed to trigger editor live-refresh!
        updateBloodKey(BC.events.fileSaved(currentFile), Date.now());

        return `成功应用文档修改。已同步写入磁盘并刷新编辑器页面。`;
      } catch (err: any) {
        return `错误：写入修改失败。${err.message}`;
      }
    }

    return `未知工具: ${name}`;
  };

  // ── Conversational Streaming Loop ───────────────────────────────────────
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputText.trim();
    if (!prompt || isProcessing || !activeChatId) return;

    // Add user message to UI state (clean message)
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: Date.now(),
    };

    let chatMessages = [...activeChat.messages, userMsg];
    updateChatMessages(chatMessages);
    setInputText('');
    setIsProcessing(true);
    setStreamText('');

    // Fetch active editor context (selection, cursor, document content) and generate contextSuffix
    let contextSuffix = '';
    if (currentFile) {
      const filename = currentFile.split(/[/\\]/).pop() || '未命名';
      let fileContent = '';
      try {
        fileContent = await (window as any).electronAPI.readFile(currentFile);
      } catch (_) {}

      contextSuffix += `\n\n---
【当前编辑器环境上下文（AI 自动追加，不可见于用户界面）】
- 活跃文件: ${filename}
- 光标位置: ${cursorData ? `第 ${cursorData.line} 行, 第 ${cursorData.column} 列` : '未知'}
- 当前选中的文本: ${cursorData?.selectedText ? `\n\`\`\`markdown\n${cursorData.selectedText}\n\`\`\`` : '（无选中文本）'}
`;
      if (fileContent) {
        const fileLines = fileContent.split('\n');
        const formattedDoc = fileLines.map((line, idx) => `${idx + 1}:${line}`).join('\n');
        contextSuffix += `- 当前文档全文内容（带有 "行号:文字" 前缀）：\n\`\`\`text\n${formattedDoc}\n\`\`\`\n`;
      }
    }

    try {
      // Define the tools array
      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_document_content',
            description: '获取当前聚焦文档的全部文本内容。每个行都带有 "行号:内容" 的前缀。'
          }
        },
        {
          type: 'function',
          function: {
            name: 'edit_document_lines',
            description: '编辑当前聚焦文档的指定行，支持一次性编辑多行及超出范围的行。',
            parameters: {
              type: 'object',
              properties: {
                replacementText: {
                  type: 'string',
                  description: '要替换进去的新文本。每行必须为 "行号:文字" 的格式，例如："3:修改后的第三行\n4:修改后的第四行\n8:超出范围的新内容"'
                }
              },
              required: ['replacementText']
            }
          }
        }
      ];

      // Format messages history for OpenAI API
      // Add system prompt to guide agent behavior
      const systemPrompt = `You are a bionic copilot for DNOTE, a dual-link note editor.
You only service the currently opened document.
You always receive the active document content (formatted as "line_number:content"), the cursor position, and any selected text at the end of the user's message.
When you need to edit or rewrite lines in the document, you MUST use the \`edit_document_lines\` tool.
Your input to the \`edit_document_lines\` tool must be formatted as "line_number:content" (one modification per line), e.g.:
3:Modified line 3 content
4:Modified line 4 content
8:New appended line 8 content
You can write to lines beyond the current total line count to append or insert new lines.
After calling the tool, briefly explain your edits in Chinese. Keep explanations concise.`;

      let apiMessages: any[] = [{ role: 'system', content: systemPrompt }];
      chatMessages.forEach(msg => {
        if (msg.sender === 'user') {
          if (msg.id === userMsg.id) {
            apiMessages.push({ role: 'user', content: msg.text + contextSuffix });
          } else {
            apiMessages.push({ role: 'user', content: msg.text });
          }
        } else if (msg.sender === 'agent') {
          apiMessages.push({ role: 'assistant', content: msg.text });
        }
      });

      let keepRunning = true;
      let loopCount = 0;

      while (keepRunning && loopCount < 5) {
        loopCount++;
        keepRunning = false;

        const requestBody: any = {
          model: model,
          messages: apiMessages,
          stream: true,
        };

        // Only supply tools if the LLM provider supports function calling
        if (provider !== 'anthropic') {
          requestBody.tools = tools;
          requestBody.tool_choice = 'auto';
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API Response Error (${response.status}): ${errText}`);
        }

        if (!response.body) {
          throw new Error('Response body is empty.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantContent = '';
        let toolCalls: any[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            if (cleanLine === 'data: [DONE]') break;
            if (cleanLine.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(cleanLine.substring(6));
                const delta = parsed.choices?.[0]?.delta;
                
                if (delta) {
                  if (delta.content) {
                    assistantContent += delta.content;
                    setStreamText(assistantContent);
                  }
                  if (delta.tool_calls) {
                    delta.tool_calls.forEach((tc: any) => {
                      const idx = tc.index;
                      if (!toolCalls[idx]) {
                        toolCalls[idx] = { id: '', name: '', arguments: '' };
                      }
                      if (tc.id) toolCalls[idx].id = tc.id;
                      if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                      if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
                    });
                  }
                }
              } catch (_) {}
            }
          }
        }

        // Clean up empty indexes from toolCalls
        toolCalls = toolCalls.filter(t => t !== undefined && t.name !== '');

        if (assistantContent) {
          // Commit stream text to conversation
          const agentMsg: ChatMessage = {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            text: assistantContent,
            timestamp: Date.now(),
          };
          chatMessages = [...chatMessages, agentMsg];
          updateChatMessages(chatMessages);
          apiMessages.push({ role: 'assistant', content: assistantContent });
          setStreamText('');
        }

        if (toolCalls.length > 0) {
          // We have tools to execute!
          const assistantToolCallRecord = {
            role: 'assistant',
            content: null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments }
            }))
          };
          apiMessages.push(assistantToolCallRecord);

          for (const tc of toolCalls) {
            // Append system log to user chat view
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.arguments);
            } catch (_) {}

            let logLabel = `🔧 调用工具 [${tc.name}]`;
            if (tc.name === 'get_document_content') logLabel = '📖 正在读取文档文本内容...';
            if (tc.name === 'edit_document_lines') {
              logLabel = '✍️ 正在重构并修改文档内容...';
            }

            const toolLogMsg: ChatMessage = {
              id: `tool-log-${Date.now()}-${Math.random()}`,
              sender: 'tool',
              text: logLabel,
              timestamp: Date.now(),
            };
            chatMessages = [...chatMessages, toolLogMsg];
            updateChatMessages(chatMessages);

            // Execute tool action
            const toolResultText = await executeTool(tc.name, parsedArgs);
            
            // Format success indicator
            const resultMsg: ChatMessage = {
              id: `tool-res-${Date.now()}-${Math.random()}`,
              sender: 'system',
              text: `✅ ${tc.name} 执行完成：${toolResultText.length > 150 ? toolResultText.substring(0, 150) + '...' : toolResultText}`,
              timestamp: Date.now(),
            };
            chatMessages = [...chatMessages, resultMsg];
            updateChatMessages(chatMessages);

            // Add result to API parameters
            apiMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: toolResultText
            });
          }

          // Loop back to LLM to explain the results
          keepRunning = true;
        }
      }
    } catch (err: any) {
      console.error('[Agent] Chat error:', err);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'system',
        text: `❌ 发生错误：${err.message || String(err)}\n请点击右上角 ⚙️ 检查你的模型配置、API 秘钥及网络连通性。`,
        timestamp: Date.now(),
      };
      chatMessages = [...chatMessages, errMsg];
      updateChatMessages(chatMessages);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateChatMessages = (messages: ChatMessage[]) => {
    const updated = conversations.map(c => {
      if (c.id === activeChatId) {
        return { ...c, messages };
      }
      return c;
    });
    saveConversations(updated);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1b1b22', // Sleek dark styling
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <select
            value={activeChatId}
            onChange={(e) => setActiveChatId(e.target.value)}
            style={{
              backgroundColor: '#262630',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '11px',
              outline: 'none',
              maxWidth: '120px',
              cursor: 'pointer'
            }}
          >
            {conversations.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          
          <button
            onClick={handleNewConversation}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--accent-color, #3b82f6)',
              border: 'none',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600
            }}
            title="新建会话"
          >
            + 新建
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleDeleteCurrentChat}
            style={{
              backgroundColor: 'transparent',
              color: '#ef4444',
              border: 'none',
              fontSize: '11px',
              cursor: 'pointer',
              opacity: 0.8
            }}
            title="删除当前会话"
          >
            🗑️ 删除
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              backgroundColor: showSettings ? '#2b2b35' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              borderRadius: '4px',
              padding: '3px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: '#e2e8f0'
            }}
          >
            ⚙️ 模型设置
          </button>
        </div>
      </div>

      {/* Model Settings Drawer Panel */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            top: '37px',
            left: 0,
            right: 0,
            backgroundColor: '#262630',
            borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px', color: 'var(--accent-color)' }}>
            🤖 AI 接口及重构模型配置
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '9px', color: '#94a3b8' }}>API 供应商</label>
              <select
                value={provider}
                onChange={(e) => saveSetting('dnote_agent_provider', e.target.value, setProvider)}
                style={{ backgroundColor: '#1b1b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
              >
                <option value="ollama">Ollama (本地)</option>
                <option value="openai">OpenAI (官方)</option>
                <option value="openai-compatible">自定义 OpenAI 兼容 API</option>
              </select>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '9px', color: '#94a3b8' }}>模型名称</label>
              <input
                type="text"
                value={model}
                placeholder="e.g. gpt-4o-mini"
                onChange={(e) => saveSetting('dnote_agent_model', e.target.value, setModel)}
                style={{ backgroundColor: '#1b1b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '9px', color: '#94a3b8' }}>接口基础端点 (Base URL)</label>
            <input
              type="text"
              value={baseURL}
              placeholder="e.g. https://api.openai.com/v1"
              onChange={(e) => saveSetting('dnote_agent_base_url', e.target.value, setBaseURL)}
              style={{ backgroundColor: '#1b1b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '9px', color: '#94a3b8' }}>API 密钥 (API Key)</label>
            <input
              type="password"
              value={apiKey}
              placeholder={provider === 'ollama' ? '本地 Ollama 不需要密钥' : '请输入 API 访问密钥'}
              onChange={(e) => saveSetting('dnote_agent_api_key', e.target.value, setApiKey)}
              style={{ backgroundColor: '#1b1b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
            />
          </div>

          <button
            onClick={() => setShowSettings(false)}
            style={{
              backgroundColor: 'var(--accent-color, #3b82f6)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '4px'
            }}
          >
            保存并关闭
          </button>
        </div>
      )}

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
              <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '11px', padding: '0 4px', fontStyle: 'italic' }}>
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
                backgroundColor: isUser ? 'var(--accent-color, #3b82f6)' : '#262630',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                fontSize: '12px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                border: isUser ? 'none' : '1px solid rgba(255,255,255,0.06)'
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
              backgroundColor: '#262630',
              color: '#ffffff',
              padding: '8px 12px',
              borderRadius: '12px 12px 12px 2px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              fontSize: '12px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              border: '1px solid rgba(255,255,255,0.06)'
            }}
          >
            {streamText}
            <span style={{ display: 'inline-block', width: '4px', height: '14px', backgroundColor: '#e2e8f0', marginLeft: '2px', animation: 'blink 1s step-end infinite' }}>|</span>
          </div>
        )}

        {isProcessing && !streamText && (
          <div style={{ alignSelf: 'flex-start', color: '#94a3b8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '4px' }}>
            <span>⚡ AI 正在思考中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* active file context tag indicator */}
      {currentFile && (
        <div style={{ fontSize: '10px', color: '#94a3b8', padding: '4px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📖 当前聚焦笔记: <strong style={{ color: 'var(--accent-color)' }}>{currentFile.split(/[/\\]/).pop()}</strong></span>
          {cursorData && (
            <span>📍 光标行: {cursorData.line}</span>
          )}
        </div>
      )}

      {/* Message input bar */}
      <form
        onSubmit={handleSend}
        style={{
          display: 'flex',
          padding: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.15)',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={currentFile ? "发送指令来重构当前打开的笔记..." : "请先在左侧树双击打开一个笔记文件..."}
          disabled={isProcessing || !currentFile}
          style={{
            flexGrow: 1,
            backgroundColor: '#1b1b22',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#e2e8f0',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isProcessing || !inputText.trim() || !currentFile}
          style={{
            backgroundColor: isProcessing || !inputText.trim() || !currentFile ? '#262630' : 'var(--accent-color, #3b82f6)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          发送
        </button>
      </form>
    </div>
  );
}
