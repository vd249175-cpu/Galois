interface GraphControlsProps {
  repulsion: number;
  setRepulsion: (val: number) => void;
  arrowSize: number;
  setArrowSize: (val: number) => void;
  spacing: number;
  setSpacing: (val: number) => void;
}

export function GraphControls({
  repulsion,
  setRepulsion,
  arrowSize,
  setArrowSize,
  spacing,
  setSpacing,
}: GraphControlsProps) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      backgroundColor: 'var(--bg-panel)',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 10,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      backdropFilter: 'blur(8px)',
      width: '180px',
      fontSize: '11px',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '9px' }}>
        Graph Parameters
      </div>
      
      {/* Repulsion Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
          <span>Repulsion (斥力)</span>
          <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{repulsion}</span>
        </div>
        <input
          type="range"
          min="500"
          max="5000"
          step="100"
          value={repulsion}
          onChange={(e) => setRepulsion(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: 'var(--accent-color)',
            height: '3px',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Arrow Size Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
          <span>Arrow Size (箭头)</span>
          <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{arrowSize}</span>
        </div>
        <input
          type="range"
          min="3"
          max="12"
          step="1"
          value={arrowSize}
          onChange={(e) => setArrowSize(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: 'var(--accent-color)',
            height: '3px',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Node Spacing Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
          <span>Spacing (节点间距)</span>
          <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{spacing}</span>
        </div>
        <input
          type="range"
          min="60"
          max="220"
          step="10"
          value={spacing}
          onChange={(e) => setSpacing(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: 'var(--accent-color)',
            height: '3px',
            cursor: 'pointer',
          }}
        />
      </div>
    </div>
  );
}
