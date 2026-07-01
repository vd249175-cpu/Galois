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
  virtualDetail: number;
  setVirtualDetail: (val: number) => void;
  graphMode: 'hierarchical' | 'contracted' | 'flat';
  setGraphMode: (val: 'hierarchical' | 'contracted' | 'flat') => void;
}

export function GraphControls({
  repulsion,
  setRepulsion,
  arrowSize,
  setArrowSize,
  spacing,
  setSpacing,
  virtualDetail,
  setVirtualDetail,
  graphMode,
  setGraphMode,
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
      fontSize: 'var(--graph-control-font-size, 11px)',
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
          fontSize: 'calc(var(--graph-control-font-size, 11px) - 2px)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3h12M2 8h12M2 13h12" />
          </svg>
          {!isCollapsed && '拓扑配置'}
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
              <span>斥力大小</span>
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
              <span>箭头尺寸</span>
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
              <span>节点间距</span>
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

	          {/* Virtual Concept Granularity Slider */}
	          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
	            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
	              <span>概念粒度</span>
	              <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{Math.round(virtualDetail * 100)}%</span>
	            </div>
	            <input
	              type="range"
	              min="0"
	              max="1"
	              step="0.01"
	              value={virtualDetail}
	              disabled={graphMode === 'flat'}
	              onChange={(e) => setVirtualDetail(Number(e.target.value))}
	              style={{
	                width: '100%',
	                accentColor: 'var(--accent-color)',
	                height: '3px',
	                cursor: graphMode === 'flat' ? 'not-allowed' : 'pointer',
	                opacity: graphMode === 'flat' ? 0.45 : 1,
	              }}
	            />
	            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'calc(var(--graph-control-font-size, 11px) - 3px)', color: 'var(--text-muted)', marginTop: '2px' }}>
	              <span>抽象</span>
	              <span>完整</span>
	            </div>
	            <div style={{ fontSize: 'calc(var(--graph-control-font-size, 11px) - 3px)', color: 'var(--text-muted)', lineHeight: 1.3 }}>
	              真实标签参与计算；可见虚概念会按 support 闭包合并。
	            </div>
	          </div>

	          {/* Display Mode Slider (拖动切换) */}
	          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
              <span>显示模式</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>
                {graphMode === 'hierarchical' && '级数拆解'}
                {graphMode === 'contracted' && '隐藏虚标签'}
                {graphMode === 'flat' && '隐式包含'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="1"
              value={graphMode === 'hierarchical' ? 0 : graphMode === 'contracted' ? 1 : 2}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val === 0) setGraphMode('hierarchical');
                else if (val === 1) setGraphMode('contracted');
                else if (val === 2) setGraphMode('flat');
              }}
              style={{
                width: '100%',
                accentColor: 'var(--accent-color)',
                height: '3px',
                cursor: 'pointer',
              }}
            />
            {/* Ticks Label */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'calc(var(--graph-control-font-size, 11px) - 3px)', color: 'var(--text-muted)', marginTop: '2px' }}>
              <span>级数拆解</span>
              <span>隐藏虚标签</span>
              <span>隐式包含</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
