
export interface SettingsDrawerProps {
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  baseURL: string;
  setBaseURL: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  saveSetting: (key: string, val: string, setter: (v: string) => void) => void;
  onClose: () => void;
}

export function SettingsDrawer({
  provider,
  setProvider,
  model,
  setModel,
  baseURL,
  setBaseURL,
  apiKey,
  setApiKey,
  saveSetting,
  onClose,
}: SettingsDrawerProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '37px',
        left: 0,
        right: 0,
        backgroundColor: 'var(--bg-header, #262630)',
        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        zIndex: 100,
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 600, borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))', paddingBottom: '4px', color: 'var(--accent-color)' }}>
        🤖 AI 接口及重构模型配置
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '9px', color: 'var(--text-muted, #94a3b8)' }}>API 供应商</label>
          <select
            value={provider}
            onChange={(e) => saveSetting('dnote_agent_provider', e.target.value, setProvider)}
            style={{ backgroundColor: 'var(--bg-input, #1b1b22)', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', color: 'var(--text-main, #e2e8f0)', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
          >
            <option value="ollama">Ollama (本地)</option>
            <option value="openai">OpenAI (官方)</option>
            <option value="openai-compatible">自定义 OpenAI 兼容 API</option>
          </select>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '9px', color: 'var(--text-muted, #94a3b8)' }}>模型名称</label>
          <input
            type="text"
            value={model}
            placeholder="e.g. gpt-4o-mini"
            onChange={(e) => saveSetting('dnote_agent_model', e.target.value, setModel)}
            style={{ backgroundColor: 'var(--bg-input, #1b1b22)', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', color: 'var(--text-main, #e2e8f0)', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <label style={{ fontSize: '9px', color: 'var(--text-muted, #94a3b8)' }}>接口基础端点 (Base URL)</label>
        <input
          type="text"
          value={baseURL}
          placeholder="e.g. https://api.openai.com/v1"
          onChange={(e) => saveSetting('dnote_agent_base_url', e.target.value, setBaseURL)}
          style={{ backgroundColor: 'var(--bg-input, #1b1b22)', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', color: 'var(--text-main, #e2e8f0)', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <label style={{ fontSize: '9px', color: 'var(--text-muted, #94a3b8)' }}>API 密钥 (API Key)</label>
        <input
          type="password"
          value={apiKey}
          placeholder={provider === 'ollama' ? '本地 Ollama 不需要密钥' : '请输入 API 访问密钥'}
          onChange={(e) => saveSetting('dnote_agent_api_key', e.target.value, setApiKey)}
          style={{ backgroundColor: 'var(--bg-input, #1b1b22)', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', color: 'var(--text-main, #e2e8f0)', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none' }}
        />
      </div>

      <button
        onClick={onClose}
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
  );
}
