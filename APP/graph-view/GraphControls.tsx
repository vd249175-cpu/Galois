import { useState } from 'react';

export const PALETTE_PRESETS = {
  Tahoe: ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'],
  Sunset: ['#EA580C', '#E11D48', '#D97706', '#BE185D', '#9F1239'],
  Nordic: ['#059669', '#0891B2', '#0F766E', '#1E3A8A', '#0D9488'],
  Mono: ['#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB'],
};

interface GraphControlsProps {
  repulsion: number;
  setRepulsion: (val: number) => void;
  arrowSize: number;
  setArrowSize: (val: number) => void;
  spacing: number;
  setSpacing: (val: number) => void;
  isHierarchicalMode: boolean;
  setIsHierarchicalMode: (val: boolean) => void;
  activePaletteName: string;
  setActivePaletteName: (val: any) => void;
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
  activePaletteName,
  setActivePaletteName,
}: GraphControlsProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      backgroundColor: 'var(--bg-panel)',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 10,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      backdropFilter: 'blur(8px)',
      width: isCollapsed ? '100px' : '180px',
      fontSize: '11px',
      transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* Header Row */}
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ 
          fontWeight: 600, 
          color: 'var(--text-muted)', 
          textTransform: 'uppercase', 
          letterSpacing: '0.5px', 
          fontSize: '9px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3h12M2 8h12M2 13h12" />
          </svg>
          {!isCollapsed && 'Graph Config'}
        </div>
        <svg 
          width="10" 
          height="10" 
          viewBox="0 0 16 16" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          style={{ 
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', 
            transition: 'transform 0.2s',
            color: 'var(--text-muted)'
          }}
        >
          <path d="M3 6l5 5 5-5" />
        </svg>
      </div>

      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
            <span style={{ color: 'var(--text-main)' }}>Implicit Deconstruct</span>
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

          {/* Color Palette Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
            <div style={{ color: 'var(--text-main)', fontWeight: 500, marginBottom: '2px' }}>Color Theme</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {Object.keys(PALETTE_PRESETS).map((presetName) => {
                const isActive = activePaletteName === presetName;
                const colors = PALETTE_PRESETS[presetName as keyof typeof PALETTE_PRESETS];
                const previewColors = colors.slice(0, 3);
                return (
                  <button
                    key={presetName}
                    onClick={() => setActivePaletteName(presetName as any)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      backgroundColor: isActive ? 'rgba(255, 59, 48, 0.08)' : 'rgba(0,0,0,0.02)',
                      border: isActive ? '1.2px solid var(--accent-color)' : '1.2px solid var(--border-color)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: isActive ? 'var(--accent-color)' : 'var(--text-main)',
                      fontSize: '9px',
                      fontWeight: 600,
                      transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
                    }}
                  >
                    <span>{presetName}</span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {previewColors.map((color, cIdx) => (
                        <div 
                          key={cIdx} 
                          style={{ 
                            width: '5px', 
                            height: '5px', 
                            borderRadius: '50%', 
                            backgroundColor: color 
                          }} 
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
