import { useState } from 'react';
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
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');
  const runtimeSnapshot = useBloodChannel([BC.system.environmentStatus, BC.system.runtimeMode], () => ({
    environmentStatus: Blood.getValue<Record<string, ToolStatus>>(BC.system.environmentStatus, {}),
    runtimeMode: Blood.getValue<string>(BC.system.runtimeMode, 'source-dev'),
    projectPath: Blood.getValue<string>(BC.system.projectPath, ''),
  }));
  const { environmentStatus, runtimeMode, projectPath } = runtimeSnapshot;

  const requiredReady = Boolean(environmentStatus.uv?.available && environmentStatus.node?.available);

  const rows: Array<[string, ToolStatus | undefined, boolean, string]> = [
    ['uv', environmentStatus.uv, false, '笔记项目 Python 环境、依赖安装和脚本运行'],
    ['Node.js', environmentStatus.node, false, '插件开发、扩展包工具链和源码模式构建'],
    ['Python', environmentStatus.python, true, '通常由 uv 自动创建项目解释器'],
    ['agy', environmentStatus.agy, true, '外部命令行助手，不随 DNOTE 打包'],
  ];

  const handleRepairProjectEnvironment = async () => {
    if (!projectPath || repairing) return;
    setRepairing(true);
    setRepairMessage('正在根据项目声明安装缺失包...');
    try {
      const result = await window.electronAPI.repairProjectEnvironment(projectPath);
      Blood.updateKey(BC.system.projectEnvironmentRepair, {
        ...result,
        timestamp: Date.now(),
      });
      setRepairMessage(result.repaired
        ? '项目环境已按声明修复完成。'
        : '已执行修复，但仍有包不可用，请查看环境详情。');
    } catch (err: any) {
      setRepairMessage(`修复失败：${err?.message || String(err)}`);
    } finally {
      setRepairing(false);
    }
  };

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
            DNOTE 不要求用户手动维护 Python 包。App 本体负责启动和调度；笔记项目默认通过
            <code> uv</code> 声明、创建并修复 Python 环境；插件开发则依赖 Node.js 和可写扩展目录。
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
              : '建议先完成 uv 和 Node.js 配置；Python 解释器和包依赖会优先由 uv 根据项目声明创建。'}
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
            推荐安装命令：<code>brew install uv node</code>。如果不用 Homebrew，也可以用
            <code> curl -LsSf https://astral.sh/uv/install.sh | sh</code> 安装 uv。
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              padding: '12px 14px',
              display: 'grid',
              gap: '10px',
              background: 'color-mix(in srgb, var(--bg-main) 88%, var(--accent-color))',
            }}
          >
            <div style={{ color: 'var(--text-main)', fontSize: '12px', fontWeight: 700 }}>
              项目依赖由声明自动安装
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
              当前笔记项目会读取 <code>pyproject.toml</code> 和脚本 PEP 723 依赖声明，然后用
              <code> uv</code> 同步缺失包。插件包依赖则由 Extension Lab 读取插件自己的
              <code> plugin.json</code>。
            </div>
            {repairMessage && (
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{repairMessage}</div>
            )}
            <button
              onClick={handleRepairProjectEnvironment}
              disabled={!projectPath || repairing || !environmentStatus.uv?.available}
              style={{
                justifySelf: 'start',
                border: '1px solid var(--accent-color)',
                background: repairing ? 'var(--bg-input)' : 'var(--accent-color)',
                color: repairing ? 'var(--text-muted)' : 'var(--bg-main)',
                padding: '8px 12px',
                borderRadius: '9px',
                cursor: repairing ? 'default' : 'pointer',
                fontWeight: 700,
              }}
            >
              {repairing ? '正在修复...' : '一键修复当前项目环境'}
            </button>
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
              打开基础偏好
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
