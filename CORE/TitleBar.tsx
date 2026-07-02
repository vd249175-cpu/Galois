/**
 * CORE/TitleBar.tsx
 *
 * 窗口标题栏组件（无框窗口标题）。
 * 从 CORE/App.tsx 拆分至此。
 */

import { Blood, useBloodChannel } from './Blood';
import { BC } from './BloodChannels';

export function TitleBar({ title = 'Galois Workspace' }: { title?: string }) {
  const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac');
  const hotStatus = useBloodChannel([BC.system.devHotUpdateStatus], () =>
    Blood.getValue<{ kind: string; label: string; timestamp: number } | null>(BC.system.devHotUpdateStatus, null)
  );
  const showHotStatus = Boolean(hotStatus && Date.now() - hotStatus.timestamp < 30_000);

  return (
    <div className="window-titlebar" style={{ paddingLeft: isMac ? '80px' : '12px' }}>
      <span className="window-titlebar-title">{title}</span>
      {showHotStatus && (
        <span
          title="开发热更新已原地应用，没有刷新窗口或打断内置助手。"
          style={{
            marginLeft: 10,
            fontSize: 10,
            color: 'var(--text-muted)',
            opacity: 0.8,
            userSelect: 'none',
          }}
        >
          Hot: {hotStatus!.kind}/{hotStatus!.label}
        </span>
      )}
    </div>
  );
}
