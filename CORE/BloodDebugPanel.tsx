import { useEffect, useState } from 'react';
import { Blood } from './Blood';
import { ActionRegistry } from './ActionRegistry';

/**
 * BloodDebugPanel — dev-only panel. Toggle with Ctrl+Shift+D.
 * Shows: focusedAreaId, focusedComponentType, registered actions,
 * current toolbar actions, last Blood changes.
 */
export function BloodDebugPanel() {
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<Record<string, any>>({});
  const [recentChanges, setRecentChanges] = useState<{ key: string; value: any; ts: number }[]>([]);

  // Toggle on Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        setVisible((v) => !v);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Live snapshot of Blood state
  useEffect(() => {
    if (!visible) return;

    const refresh = () => setSnapshot({ ...Blood.getRawState() });
    refresh();

    const unsubscribe = Blood.subscribe((changedKeys) => {
      const ts = Date.now();
      setRecentChanges((prev) => {
        const next = [
          ...Array.from(changedKeys).map((key) => ({
            key,
            value: Blood.getValue(key, undefined),
            ts,
          })),
          ...prev,
        ].slice(0, 30);
        return next;
      });
      refresh();
    });
    return unsubscribe;
  }, [visible]);

  if (!visible) return null;

  const focusedAreaId = snapshot['system.focusedAreaId'] ?? '—';
  const focusedType = focusedAreaId !== '—'
    ? (snapshot[`system.areaComponentTypes.${focusedAreaId}`] ?? '—')
    : '—';

  const allActions = ActionRegistry.getAllActions();
  const toolbarActions = allActions.filter((a) => (a as any).isToolbar);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        width: 420,
        maxHeight: '70vh',
        overflowY: 'auto',
        background: 'rgba(10, 10, 16, 0.94)',
        border: '1px solid rgba(100, 120, 255, 0.35)',
        borderRadius: 10,
        padding: '14px 16px',
        color: '#c8d0e8',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        zIndex: 99999,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#7c8cff', fontWeight: 700, letterSpacing: 1, fontSize: 12 }}>
          🩸 BLOOD DEBUG
        </span>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Focus State */}
      <Section title="Focus">
        <Row label="focusedAreaId" value={focusedAreaId} />
        <Row label="componentType" value={focusedType} />
      </Section>

      {/* Registered Actions */}
      <Section title={`Actions (${allActions.length})`}>
        {allActions.map((a) => (
          <Row
            key={a.id}
            label={a.id}
            value={`${a.isGlobal ? '🌐' : '📦'} ${ActionRegistry.getShortcutForAction(a.id) ?? '—'}`}
          />
        ))}
      </Section>

      {/* Toolbar Actions */}
      <Section title={`Toolbar Actions (${toolbarActions.length})`}>
        {toolbarActions.length === 0
          ? <div style={{ color: '#666' }}>none</div>
          : toolbarActions.map((a) => <Row key={a.id} label={a.id} value={a.label} />)
        }
      </Section>

      {/* Recent Blood Changes */}
      <Section title="Recent Changes (last 30)">
        {recentChanges.length === 0
          ? <div style={{ color: '#666' }}>no changes yet</div>
          : recentChanges.map((c, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <span style={{ color: '#7c8cff' }}>{c.key}</span>
              <span style={{ color: '#555', margin: '0 4px' }}>→</span>
              <span style={{ color: '#a8e6a3' }}>
                {JSON.stringify(c.value)?.slice(0, 60)}
              </span>
            </div>
          ))
        }
      </Section>

      {/* Raw Blood State */}
      <Section title={`Blood State (${Object.keys(snapshot).length} keys)`}>
        {Object.entries(snapshot)
          .filter(([k]) => !k.startsWith('system.areaFrames'))
          .map(([k, v]) => (
            <Row key={k} label={k} value={JSON.stringify(v)?.slice(0, 80) ?? '—'} />
          ))
        }
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: '#4a5588', borderBottom: '1px solid #222', marginBottom: 5, paddingBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 2, lineHeight: '16px' }}>
      <span style={{ color: '#5a6aaa', minWidth: 180, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: '#c0c8e8', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
