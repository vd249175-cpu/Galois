import { useEffect, useState } from 'react';
import { Blood, useBloodChannel } from './Blood';
import { BC } from './BloodChannels';

interface RuntimeInfo {
  mode: 'source-dev' | 'installed-app';
  classicCodePath: string;
  extensionPath: string;
  extensionDevPaths: string[];
  sourcePluginPath: string;
  canWriteSourcePlugins: boolean;
  agentWorkspace: {
    writableDirs: string[];
    readableDirs: string[];
  };
}

interface ToolStatus {
  available?: boolean;
  path?: string;
  version?: string;
  error?: string;
}

interface InterpreterConfig {
  python: string;
  node: string;
  typescript: string;
  bash: string;
}

const inputStyle = {
  width: '220px',
  padding: '4px 6px',
  borderRadius: '4px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-main)',
  fontSize: '12px',
  textAlign: 'left',
} as const;

function StatusRow({ label, status, optional = false }: { label: string; status?: ToolStatus; optional?: boolean }) {
  const available = Boolean(status?.available);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-main)' }}>{label}{optional ? '（可选）' : ''}</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
          {available ? (status?.version || status?.path || '已安装') : (status?.error || '未检测到')}
        </span>
      </div>
      <span style={{
        fontSize: '11px',
        padding: '2px 7px',
        borderRadius: '999px',
        color: available ? '#1b5e20' : optional ? '#7a4b00' : '#7f1d1d',
        background: available ? 'rgba(76, 175, 80, 0.18)' : optional ? 'rgba(255, 193, 7, 0.18)' : 'rgba(244, 67, 54, 0.16)',
        whiteSpace: 'nowrap',
      }}>
        {available ? '正常' : optional ? '可跳过' : '需配置'}
      </span>
    </div>
  );
}

function PathBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
      <code style={{
        fontSize: '11px',
        lineHeight: 1.4,
        padding: '6px 8px',
        borderRadius: '6px',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-main)',
        wordBreak: 'break-all',
      }}>
        {value || '未就绪'}
      </code>
    </div>
  );
}

function CommandHint({ label, command }: { label: string; command: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
      <code style={{
        fontSize: '11px',
        lineHeight: 1.4,
        padding: '6px 8px',
        borderRadius: '6px',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-main)',
        userSelect: 'text',
        wordBreak: 'break-all',
      }}>
        {command}
      </code>
    </div>
  );
}

export function EnvironmentPanel() {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [environmentStatus, setEnvironmentStatus] = useState<Record<string, ToolStatus> | null>(null);
  const [message, setMessage] = useState<string>('');
  const [interpreters, setInterpreters] = useState<InterpreterConfig>({
    python: '',
    node: '',
    typescript: '',
    bash: '',
  });
  const [localVenvPath, setLocalVenvPath] = useState('');

  useBloodChannel([BC.system.runtimeMode, BC.system.environmentStatus], () => {
    setEnvironmentStatus(Blood.getValue<Record<string, ToolStatus> | null>(BC.system.environmentStatus, null));
    return null;
  });

  const projectPath = useBloodChannel([BC.system.projectPath], () =>
    Blood.getValue<string | null>(BC.system.projectPath, null)
  );

  const refresh = async () => {
    setMessage('正在检测环境...');
    try {
      const [nextRuntimeInfo, nextEnvironmentStatus] = await Promise.all([
        window.electronAPI.getRuntimeInfo(),
        window.electronAPI.getEnvironmentStatus(),
      ]);
      setRuntimeInfo(nextRuntimeInfo);
      setEnvironmentStatus(nextEnvironmentStatus);
      Blood.updateKey(BC.system.runtimeMode, nextRuntimeInfo.mode);
      Blood.updateKey(BC.system.extensionPath, nextRuntimeInfo.extensionPath);
      Blood.updateKey(BC.system.sourcePluginPath, nextRuntimeInfo.sourcePluginPath);
      Blood.updateKey(BC.system.canWriteSourcePlugins, nextRuntimeInfo.canWriteSourcePlugins);
      Blood.updateKey(BC.system.agentWorkspace, nextRuntimeInfo.agentWorkspace);
      Blood.updateKey(BC.system.environmentStatus, nextEnvironmentStatus);
      setMessage('环境检测已更新');
    } catch (err: any) {
      setMessage(err?.message || '环境检测失败');
    }
  };

  useEffect(() => {
    refresh();
    loadInterpreterConfig();
  }, []);

  useEffect(() => {
    if (!projectPath) {
      setLocalVenvPath('');
      return;
    }
    const checkVenv = async () => {
      try {
        const list = await window.electronAPI.listDir(projectPath);
        const hasVenv = list.some((item: any) => item.isDir && item.name === '.venv');
        setLocalVenvPath(hasVenv ? `${projectPath}/.venv/bin/python` : '');
      } catch (_) {
        setLocalVenvPath('');
      }
    };
    checkVenv();
  }, [projectPath]);

  const loadInterpreterConfig = async () => {
    const config = await window.electronAPI.getConfig();
    setInterpreters({
      python: config?.interpreters?.python || '',
      node: config?.interpreters?.node || '',
      typescript: config?.interpreters?.typescript || '',
      bash: config?.interpreters?.bash || '',
    });
  };

  const saveInterpreter = async (key: keyof InterpreterConfig, value: string) => {
    const nextInterpreters = { ...interpreters, [key]: value };
    setInterpreters(nextInterpreters);
    const config = await window.electronAPI.getConfig();
    const mergedConfig = {
      ...config,
      interpreters: {
        ...(config?.interpreters || {}),
        ...nextInterpreters,
      },
    };
    await window.electronAPI.setConfig(mergedConfig);
    Blood.updateKey(BC.system.config, mergedConfig);
  };

  const openClassicCodeWorkspace = async () => {
    const workspace = await window.electronAPI.getClassicCodeWorkspace();
    await window.electronAPI.openPath(workspace.workspacePath);
  };

  const restoreClassicCodeWorkspace = async () => {
    const ok = window.confirm('优先使用外部工作副本里的 Git 回滚改动。只有 Git 无法恢复或你确认要重置时，才使用这个经典代码恢复。继续会覆盖外部 Galois 源码工作副本。');
    if (!ok) return;
    setMessage('正在恢复经典 Galois 源码...');
    try {
      const result = await window.electronAPI.restoreClassicCodeWorkspace();
      setMessage(`已恢复经典代码到 ${result.workspacePath}`);
      Blood.updateKey(BC.system.agentWorkspace, {
        readableDirs: [result.workspacePath],
        writableDirs: [result.workspacePath],
      });
    } catch (err: any) {
      setMessage(err?.message || '恢复经典代码失败');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        这里用于确认 DMG/源码模式下的外部工具、源码工作区和命令行助手工作区。缺少 agy 不影响笔记编辑；缺少 Git 会让 agent 只能用经典代码恢复兜底。
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>发布可用性判断</span>
        <div style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.5 }}>
          {environmentStatus?.uv?.available && environmentStatus?.python?.available
            ? '当前环境可运行 Python 插件服务和项目脚本。仍需要签名、公证、干净依赖安装后，才建议作为 DMG 分发给普通用户。'
            : '当前环境还缺少必要脚本工具。App 可以编辑笔记，但 Python 插件服务或项目脚本会进入受限状态。'}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>运行模式与扩展目录</span>
        <div style={{ fontSize: '12px', color: 'var(--text-main)' }}>
          当前模式：<strong>{runtimeInfo?.mode === 'installed-app' ? '安装版 App' : '源码开发'}</strong>
        </div>
        <PathBlock label="完整源码工作副本（Agent 默认开发目录）" value={runtimeInfo?.classicCodePath} />
        <PathBlock label="CORE 内核源码目录（外部启动使用）" value={runtimeInfo?.classicCodePath ? `${runtimeInfo.classicCodePath}/CORE` : undefined} />
        <PathBlock label="APP 器官源码目录" value={runtimeInfo?.sourcePluginPath} />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          外部源码工作副本会优先初始化为 Git 仓库；开发出错时先让 agent 使用 Git 查看和回滚，经典代码恢复只作为最后兜底。
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="settings-action-btn" onClick={openClassicCodeWorkspace}>打开源码工作区</button>
          <button className="settings-action-btn" onClick={restoreClassicCodeWorkspace}>恢复经典代码（兜底）</button>
          <button className="settings-action-btn" onClick={refresh}>重新检测</button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>外部工具状态</span>
        <StatusRow label="uv" status={environmentStatus?.uv} />
        <StatusRow label="Python" status={environmentStatus?.python} />
        <StatusRow label="Node.js" status={environmentStatus?.node} />
        <StatusRow label="Git" status={environmentStatus?.git} />
        <StatusRow label="命令行助手 agy" status={environmentStatus?.agy} optional />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>脚本执行器设置</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Python 服务脚本</label>
          <input
            type="text"
            placeholder="uv run (系统默认，支持 PEP 723)"
            value={interpreters.python}
            onChange={(e) => saveInterpreter('python', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Node.js</label>
          <input
            type="text"
            placeholder="node (系统默认)"
            value={interpreters.node}
            onChange={(e) => saveInterpreter('node', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>TypeScript</label>
          <input
            type="text"
            placeholder="node --experimental-strip-types (系统默认)"
            value={interpreters.typescript}
            onChange={(e) => saveInterpreter('typescript', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Shell</label>
          <input
            type="text"
            placeholder="bash (系统默认)"
            value={interpreters.bash}
            onChange={(e) => saveInterpreter('bash', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          项目 `.venv` 仅属于当前笔记项目脚本；插件服务脚本默认走插件自己的 manifest 和 `uv run`。
        </div>
        {localVenvPath && <PathBlock label="当前项目 .venv" value={localVenvPath} />}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>安装指引</span>
        <CommandHint label="推荐安装 uv" command="brew install uv" />
        <CommandHint label="或使用官方安装脚本" command="curl -LsSf https://astral.sh/uv/install.sh | sh" />
        <CommandHint label="推荐安装 Python" command="brew install python" />
        <CommandHint label="推荐安装 Git" command="brew install git" />
        <CommandHint label="可选安装 agy 命令行助手" command="curl -fsSL https://antigravity.google/cli/install.sh | bash" />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          `agy` 是外部可选命令行助手。缺少它不会影响笔记和脚本执行，只会影响终端助手自动接入。
        </div>
      </section>

      {message && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {message}
        </div>
      )}
    </div>
  );
}
