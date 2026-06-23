interface GraphControlsProps {
  repulsion: number;
  setRepulsion: (val: number) => void;
  arrowSize: number;
  setArrowSize: (val: number) => void;
  spacing: number;
  setSpacing: (val: number) => void;
  isHierarchicalMode: boolean;
  setIsHierarchicalMode: (val: boolean) => void;
}

export function GraphControls({
  repulsion,
  setRepulsion,
  arrowSize,
  setArrowSize,
  spacing,
  setSpacing,
  isHierarchicalMode,
  setIsHierarchicalMode,
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

      {/* Hierarchical Decomposition Mode Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
        <span style={{ color: 'var(--text-main)' }}>Implicit Deconstruct (级数拆解)</span>
        <button
          onClick={() => setIsHierarchicalMode(!isHierarchicalMode)}
          style={{
            background: isHierarchicalMode ? 'var(--accent-color)' : 'rgba(0,0,0,0.08)',
            border: 'none',
            borderRadius: '12px',
            width: '32px',
            height: '18px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            position: 'absolute',
            left: isHierarchicalMode ? '16px' : '2px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>
    </div>
  );
}
