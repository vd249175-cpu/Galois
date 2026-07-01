import { Node, Link } from './types';

interface SelectedNodeDrawerProps {
  selectedNodeId: string;
  nodes: Node[];
  links: Link[];
  projectPath: string;
  getLevelColor: (level: number) => string;
  setSelectedNodeId: (id: string | null) => void;
  handleNodeDoubleClick: (nodeId: string) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
  zoom: number;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function SelectedNodeDrawer({
  selectedNodeId,
  nodes,
  links,
  projectPath,
  getLevelColor,
  setSelectedNodeId,
  handleNodeDoubleClick,
  svgRef,
  zoom,
  setPan,
}: SelectedNodeDrawerProps) {
  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  // Find connected links and neighbors
  const connectedLinks = links.filter(l => l.source === node.id || l.target === node.id);
  const neighborIds = connectedLinks.map(l => l.source === node.id ? l.target : l.source);
  const neighbors = nodes.filter(n => neighborIds.includes(n.id));

  return (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      right: '12px',
      maxHeight: '170px',
      backgroundColor: 'var(--bg-panel)',
      backdropFilter: 'blur(20px) saturate(120%)',
      WebkitBackdropFilter: 'blur(20px) saturate(120%)',
      border: '1.2px solid var(--border-color)',
      borderRadius: '10px',
      boxShadow: 'inset 1px 1px 0px rgba(255, 255, 255, 0.6), inset -1px -1px 0px rgba(0, 0, 0, 0.02), 0 8px 24px rgba(0, 0, 0, 0.12)',
      display: 'flex',
      flexDirection: 'column',
      padding: '10px 14px',
      color: 'var(--text-main)',
      fontSize: 'var(--graph-drawer-font-size, 12px)',
      fontFamily: 'var(--font-sans)',
      zIndex: 100,
      gap: '8px',
      animation: 'slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: getLevelColor(node.level || 0)
          }} />
          <span style={{ fontWeight: 600 }}>
            {node.isVirtual ? `分类标签聚类 (FCA Concept Node)` : `相关文件详情`}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--graph-drawer-font-size, 12px) - 2px)' }}>
            {node.tags && node.tags.length > 0 ? `含有 ${node.tags.length} 个标签` : `无标签`}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedNodeId(null); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 'var(--graph-drawer-font-size, 12px)',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          ✕
        </button>
      </div>

      {/* Scrollable contents */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
        {/* Tag Badges list */}
        {node.tags && node.tags.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--graph-drawer-font-size, 12px) - 2px)', fontWeight: 600 }}>包含标签:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {node.tags.map((tag, tIdx) => (
                <span
                  key={tIdx}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.03)',
                    border: '1px solid var(--border-color)',
                    fontSize: 'calc(var(--graph-drawer-font-size, 12px) - 1px)',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'default'
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Note / Path details for real node */}
        {!node.isVirtual && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--graph-drawer-font-size, 12px) - 2px)', fontWeight: 600 }}>笔记路径 (双击打开):</div>
            <div
              onClick={() => handleNodeDoubleClick(node.id)}
              style={{
                fontFamily: 'monospace',
                fontSize: 'calc(var(--graph-drawer-font-size, 12px) - 1.5px)',
                color: 'var(--accent-color)',
                cursor: 'pointer',
                textDecoration: 'underline',
                wordBreak: 'break-all'
              }}
            >
              {node.id.replace(projectPath + '/', '')}
            </div>
          </div>
        )}

        {/* Neighbors list */}
        {neighbors.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--graph-drawer-font-size, 12px) - 2px)', fontWeight: 600 }}>关联节点 (点击选中定位 / 虚线为概念节点):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {neighbors.map((neighbor) => (
                <span
                  key={neighbor.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(neighbor.id);
                    // Center the view on neighbor
                    let cx = 300;
                    let cy = 250;
                    if (svgRef.current) {
                      cx = svgRef.current.clientWidth / 2;
                      cy = svgRef.current.clientHeight / 2;
                    }
                    setPan({
                      x: cx - neighbor.x * zoom,
                      y: cy - neighbor.y * zoom
                    });
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: neighbor.isVirtual ? 'rgba(255,255,255,0.4)' : 'rgba(0, 0, 0, 0.02)',
                    border: neighbor.isVirtual ? `1.2px dashed ${getLevelColor(neighbor.level || 0)}` : '1.2px solid var(--border-color)',
                    fontSize: 'calc(var(--graph-drawer-font-size, 12px) - 1px)',
                    color: neighbor.isVirtual ? getLevelColor(neighbor.level || 0) : 'var(--text-main)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                    e.currentTarget.style.borderColor = 'var(--accent-color)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = neighbor.isVirtual ? 'rgba(255,255,255,0.4)' : 'rgba(0, 0, 0, 0.02)';
                    e.currentTarget.style.borderColor = neighbor.isVirtual ? `${getLevelColor(neighbor.level || 0)}` : 'var(--border-color)';
                  }}
                >
                  {neighbor.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
