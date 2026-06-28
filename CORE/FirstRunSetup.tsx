import { Blood, useBloodChannel } from './Blood';
import { BC } from './BloodChannels';

const FIRST_RUN_KEY = 'dnote.firstRunSetup.completed';

type ToolStatus = {
  available?: boolean;
  version?: string;
  path?: string;
  error?: string;
};

interface FirstRunSetupProps {
  onDone: () => void;
  onOpenEnvironmentSettings: () => void;
}

function statusLabel(status?: ToolStatus, optional = false): string {
  if (status?.available) return status.version || status.path || '已就绪';
  return optional ? '可选，未检测到' : '需要配置';
}

function statusColor(status?: ToolStatus, optional = false): string {
  if (status?.available) return 'var(--success-color, #2e7d32)';
  return optional ? 'var(--text-muted)' : 'var(--danger-color, #c0392b)';
}

function completeFirstRun(onDone: () => void) {
  localStorage.setItem(FIRST_RUN_KEY, 'true');
  onDone();
}

export function shouldShowFirstRunSetup(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) !== 'true';
}

export function FirstRunSetup({ onDone, onOpenEnvironmentSettings }: FirstRunSetupProps) {
  const runtimeSnapshot = useBloodChannel([BC.system.environmentStatus, BC.system.runtimeMode], () => ({
    environmentStatus: Blood.getValue<Record<string, ToolStatus>>(BC.system.environmentStatus, {}),
    runtimeMode: Blood.getValue<string>(BC.system.runtimeMode, 'source-dev'),
  }));
  const { environmentStatus, runtimeMode } = runtimeSnapshot;

  const requiredReady = Boolean(environmentStatus.uv?.available && environmentStatus.python?.available);

  const rows: Array<[string, ToolStatus | undefined, boolean, string]> = [
    ['uv', environmentStatus.uv, false, 'Python 插件服务、项目脚本依赖解析'],
    ['Python', environmentStatus.python, false, '笔记项目脚本和动态标签'],
    ['Node.js', environmentStatus.node, true, '插件开发和源码模式构建'],
    ['agy', environmentStatus.agy, true, '外部命令行助手，不随 DNOTE 打包'],
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        background: 'rgba(10, 12, 14, 0.42)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px',
      }}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
          borderRadius: '22px',
          border: '1px solid var(--border-color)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--bg-main) 94%, white), var(--bg-main))',
          boxShadow: '0 28px 90px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '28px 30px 20px',
            borderBottom: '1px solid var(--border-color)',
            background:
              'radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--accent-color) 18%, transparent), transparent 36%)',
          }}
        >
          <div style={{ fontSize: '11px', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>
            DNOTE FIRST RUN
          </div>
          <h2 style={{ margin: '8px 0 8px', fontSize: '24px', color: 'var(--text-main)' }}>
            先把环境边界理清楚
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.65, fontSize: '13px' }}>
            DNOTE 不内置 Python 依赖环境，也不内置 agy/Antigravity。App 本体负责启动和调度；
            插件、笔记项目脚本、命令行助手分别使用自己的外部环境。
          </p>
        </div>

        <div style={{ padding: '22px 30px', display: 'grid', gap: '14px' }}>
          <div
            style={{
              padding: '12px 14px',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              background: 'var(--bg-input)',
              color: requiredReady ? 'var(--text-main)' : 'var(--text-muted)',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            当前模式：<strong>{runtimeMode}</strong>。{requiredReady
              ? '核心脚本工具已经可用，可以进入工作区。'
              : '建议先完成 uv 和 Python 配置，否则动态标签、插件服务或项目脚本可能无法运行。'}
          </div>

          <div style={{ display: 'grid', gap: '8px' }}>
            {rows.map(([name, status, optional, description]) => (
              <div
                key={name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr',
                  gap: '12px',
                  alignItems: 'center',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, var(--bg-main) 86%, var(--bg-input))',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{name}</div>
                <div style={{ display: 'grid', gap: '3px' }}>
                  <div style={{ fontSize: '12px', color: statusColor(status, optional), fontWeight: 650 }}>
                    {statusLabel(status, optional)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{description}</div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px dashed var(--border-color)',
              padding: '12px 14px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              lineHeight: 1.6,
            }}
          >
            推荐安装命令：<code>brew install uv python</code>。如果不用 Homebrew，也可以用
            <code> curl -LsSf https://astral.sh/uv/install.sh | sh</code> 安装 uv。
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '18px 30px 24px',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <button
            onClick={() => completeFirstRun(onDone)}
            style={{
              border: '1px solid var(--border-color)',
              background: 'transparent',
              color: 'var(--text-muted)',
              padding: '9px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
            }}
          >
            稍后再说
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onOpenEnvironmentSettings}
              style={{
                border: '1px solid var(--accent-color)',
                background: 'var(--highlight-color)',
                color: 'var(--accent-color)',
                padding: '9px 16px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              打开环境与扩展
            </button>
            <button
              onClick={() => completeFirstRun(onDone)}
              style={{
                border: '1px solid var(--accent-color)',
                background: 'var(--accent-color)',
                color: 'var(--bg-main)',
                padding: '9px 16px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              进入工作区
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
