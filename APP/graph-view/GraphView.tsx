import { useEffect, useMemo, useState, useRef } from 'react';
import { GraphControls } from './GraphControls';
import { SelectedNodeDrawer } from './SelectedNodeDrawer';
import { PaletteManagerModal } from './PaletteManagerModal';
import { useLatticeData } from './useLatticeData';
import { usePhysicsSimulation } from './usePhysicsSimulation';
import { getPillWidth } from './helpers';
import { graphViewActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { Blood } from '../../CORE/Blood';

/**
 * GraphViewComponent — Lattice Graph 插件注册对象
 *
 * 契约声明：
 *   READS:  system.projectPath, system.resolvedTags, system.config,
 *           events.fileSaved.*, system.lastFocusedEditorId, system.activeEditors
 *   WRITES: events.openFile.{editorId}  (双击节点跳转)
 *           events.scriptError.graphView (lattice 脚本错误)
 *   DEPENDS ON: fileTree (提供 system.resolvedTags)
 */
export const GraphViewComponent = {
  typeId: 'graphView',
  displayName: '标签拓扑图',
  shortName: '拓扑图',
  iconName: 'git-branch',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <path d="M4 5.5l3.5 5M12 5.5l-3.5 5" />
    </svg>
  ),
  component: GraphView,
  actions: graphViewActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.resolvedTags,
    BC.system.fileSearchQuery,
    BC.system.config,
    BC_PREFIX.fileSavedAll,
    BC.system.lastFocusedEditorId,
    BC.system.activeEditors,
  ],
  manifest: {
    description: 'Tag Lattice 关系图，使用 Python subset-inclusion 算法绘制笔记包含关系',
    reads: [
      BC.system.projectPath,
      BC.system.resolvedTags,       // 由 fileTree 写入，graphView 是消费者
      BC.system.fileSearchQuery,    // 与左侧文件树搜索联动
      BC.system.config,             // 图谱字号配置
      BC_PREFIX.fileSavedAll,       // 文件保存时重建图谱
      BC.system.lastFocusedEditorId,
      BC.system.activeEditors,
    ],
    writes: [
      BC.events.openFile('*'),              // 双击节点时发送打开请求
      BC.system.fileSearchQuery,            // 点击节点时反向更新左侧搜索
      BC.events.scriptError('graphView'),   // lattice.py 失败时广播错误
    ],
    dependsOn: ['fileTree'],  // 依赖 fileTree 提供 resolvedTags（必须先 mount）
  },
};

function GraphView({
  areaId: _areaId,
  state,
  updateBloodKey,
  lastAction,
}: {
  areaId: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = state[BC.system.projectPath] || '';
  const fileSearchQuery = String(state[BC.system.fileSearchQuery] || '');
  const graphConfig = state[BC.system.config]?.graph || {};
  const graphNodeBaseFontSize = Number(graphConfig.nodeFontSize) || 9;
  const fileSavedMap = state[BC_PREFIX.fileSavedAll] || {};
  const fileSavedEvent = Object.values(fileSavedMap).reduce((max: number, val: any) => Math.max(max, Number(val) || 0), 0);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Click vs drag position tracking
  const nodeDragStartPos = useRef<{ x: number; y: number } | null>(null);
  const svgClickStartPos = useRef<{ x: number; y: number } | null>(null);

  // SVG Pan and Zoom states
  const [pan, setPan] = useState({ x: 300, y: 250 });
  const [zoom, setZoom] = useState(1.0);
  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Real-time Physics & Graphics Adjustment States (斥力、外挂箭头和间距可调)
  const [repulsion, setRepulsion] = useState(1800);
  const [arrowSize, setArrowSize] = useState(5);
  const [spacing, setSpacing] = useState(120);
  const [virtualDetail, setVirtualDetail] = useState(() => {
    const saved = Number(localStorage.getItem('dnote_graph_virtual_detail'));
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.55;
  });

  const repulsionRef = useRef(repulsion);
  const arrowSizeRef = useRef(arrowSize);
  const spacingRef = useRef(spacing);

  // Toggle modes for graph visualization:
  // 'hierarchical': 级数拆解模式 (show real & virtual nodes)
  // 'contracted': 隐藏虚标签 (run hierarchical, but hide/contract virtual nodes)
  // 'flat': 隐式包含模式 (no virtual nodes computed at all)
  const [graphMode, setGraphMode] = useState<'hierarchical' | 'contracted' | 'flat'>('hierarchical');

  // Color Palette state
  const [palettes, setPalettes] = useState<Record<string, string[]>>({
    Tahoe: ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'],
    Sunset: ['#EA580C', '#E11D48', '#D97706', '#BE185D', '#9F1239'],
    Nordic: ['#059669', '#0891B2', '#0F766E', '#1E3A8A', '#0D9488'],
    Mono: ['#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB'],
  });
  const [activePaletteName, setActivePaletteName] = useState<string>('Tahoe');
  const [isPaletteEditorOpen, setIsPaletteEditorOpen] = useState(false);

  const getLevelColor = (level: number) => {
    const colors = palettes[activePaletteName] || palettes.Tahoe || ['#4F46E5'];
    return colors[level % colors.length];
  };

  const wakeSimulationRef = useRef<() => void>(() => {});

  const {
    nodes,
    links,
    setNodes,
    simRef,
  } = useLatticeData({
    projectPath,
    resolvedTags: state[BC.system.resolvedTags],
    fileSavedEvent,
    graphMode,
    virtualDetail,
    updateBloodKey,
    wakeSimulation: () => wakeSimulationRef.current(),
  });

  const dragNodeId = useRef<string | null>(null);

  const {
    wakeSimulation,
  } = usePhysicsSimulation({
    simRef,
    dragNodeId,
    repulsionRef,
    spacingRef,
    setNodes,
  });

  wakeSimulationRef.current = wakeSimulation;

  useEffect(() => {
    repulsionRef.current = repulsion;
    wakeSimulation();
  }, [repulsion]);

  useEffect(() => {
    arrowSizeRef.current = arrowSize;
    wakeSimulation();
  }, [arrowSize]);

  useEffect(() => {
    spacingRef.current = spacing;
    wakeSimulation();
  }, [spacing]);

  useEffect(() => {
    localStorage.setItem('dnote_graph_virtual_detail', String(virtualDetail));
  }, [virtualDetail]);

  // Mouse Wheel Zoom-to-Cursor Effect
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const zoomFactor = 1.03;
      const factor = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
      
      const rect = svg.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      setZoom((prevZoom) => {
        const nextZoom = Math.max(0.2, Math.min(3.0, prevZoom * factor));
        const actualFactor = nextZoom / prevZoom;
        
        setPan((prevPan) => ({
          x: screenX - (screenX - prevPan.x) * actualFactor,
          y: screenY - (screenY - prevPan.y) * actualFactor,
        }));
        
        return nextZoom;
      });
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Mouse Pan/Zoom & Drag Handlers
  const handleSVGMouseDown = (e: React.MouseEvent) => {
    if (dragNodeId.current) return;
    isPanning.current = true;
    startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    svgClickStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleSVGMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) {
      setPan({
        x: e.clientX - startPan.current.x,
        y: e.clientY - startPan.current.y,
      });
    } else if (dragNodeId.current) {
      const node = simRef.current.nodes.find((n) => n.id === dragNodeId.current);
      if (node) {
        const rect = e.currentTarget.getBoundingClientRect();
        const svgX = (e.clientX - rect.left - pan.x) / zoom;
        const svgY = (e.clientY - rect.top - pan.y) / zoom;
        node.x = svgX;
        node.y = svgY;
        node.vx = 0;
        node.vy = 0;
        setNodes([...simRef.current.nodes]);
        wakeSimulation();
      }
    }
  };

  const getSearchQueryForNode = (nodeId: string) => {
    const node = simRef.current.nodes.find((item) => item.id === nodeId);
    const tags = node?.tags || [];
    if (tags.length > 0) {
      return tags.map((tag) => `#${tag}`).join(' ');
    }
    if (nodeId.startsWith('tag:')) {
      return `#${nodeId.substring(4)}`;
    }
    return node?.label || '';
  };

  const handleSVGMouseUp = (e?: React.MouseEvent) => {
    const wasPanning = isPanning.current;
    isPanning.current = false;
    
    if (dragNodeId.current) {
      if (e && nodeDragStartPos.current) {
        const dx = e.clientX - nodeDragStartPos.current.x;
        const dy = e.clientY - nodeDragStartPos.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) {
          setSelectedNodeId(dragNodeId.current);
          updateBloodKey(BC.system.fileSearchQuery, getSearchQueryForNode(dragNodeId.current));
        }
      }
      dragNodeId.current = null;
      return;
    }

    if (wasPanning && e && svgClickStartPos.current) {
      const dx = e.clientX - svgClickStartPos.current.x;
      const dy = e.clientY - svgClickStartPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) {
        setSelectedNodeId(null);
      }
    }
  };

  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dragNodeId.current = nodeId;
    nodeDragStartPos.current = { x: e.clientX, y: e.clientY };
    const node = simRef.current.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.vx = 0;
      node.vy = 0;
    }
    wakeSimulation();
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    let targetPath = nodeId;
    if (nodeId.startsWith('virtual:')) {
      const tags = nodeId.substring(8).split('|');
      targetPath = `${projectPath}/#${tags.join('#')}.md`;
    } else if (nodeId.startsWith('tag:')) {
      const tagName = nodeId.substring(4);
      targetPath = `${projectPath}/${tagName}.md`;
    }
    
    const lastFocused = Blood.getValue<string | null>(BC.system.lastFocusedEditorId, null);
    const activeEds = Blood.getValue<string[]>(BC.system.activeEditors, []);
    let targetEditorId = lastFocused || activeEds[0];
    if (!targetEditorId) {
      const allState = Blood.getRawState() || {};
      const prefix = 'system.areaComponentTypes.';
      for (const [key, value] of Object.entries(allState)) {
        if (key.startsWith(prefix) && value === 'editor') {
          targetEditorId = key.substring(prefix.length);
          break;
        }
      }
    }
    if (!targetEditorId) targetEditorId = 'editor-root';

    updateBloodKey(BC.events.openFile(targetEditorId), targetPath);
  };

  const handleZoom = (factor: number) => {
    setZoom((prev) => Math.max(0.2, Math.min(3.0, prev * factor)));
  };

  // Listen for dynamic zoom/recenter/color actions triggered from sidebar
  useEffect(() => {
    console.log('[GraphView] Received lastAction:', lastAction);
    if (lastAction) {
      if (lastAction.id === 'graphView.zoomIn') {
        handleZoom(1.15);
      } else if (lastAction.id === 'graphView.zoomOut') {
        handleZoom(0.85);
      } else if (lastAction.id === 'graphView.recenter') {
        setPan({ x: 300, y: 250 });
        setZoom(1.0);
      } else if (lastAction.id === 'graphView.openPaletteManager') {
        console.log('[GraphView] Opening Palette Manager...');
        setIsPaletteEditorOpen(true);
      }
    }
  }, [lastAction]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const neighborById = useMemo(() => {
    const neighbors = new Map<string, Set<string>>();
    nodes.forEach((node) => neighbors.set(node.id, new Set()));
    links.forEach((link) => {
      neighbors.get(link.source)?.add(link.target);
      neighbors.get(link.target)?.add(link.source);
    });
    return neighbors;
  }, [nodes, links]);

  const searchFocus = useMemo(() => {
    const query = fileSearchQuery.trim().toLowerCase();
    if (!query) return { active: false, tags: [] as string[], text: '' };
    const tags = Array.from(query.matchAll(/#([^\s#()]+)/g)).map((match) => match[1].toLowerCase());
    const text = query.replace(/#([^\s#()]+)/g, '').trim();
    return { active: true, tags, text };
  }, [fileSearchQuery]);

  const matchesSearchFocus = (node: any) => {
    if (!searchFocus.active) return true;
    const nodeTags = (node.tags || []).map((tag: string) => tag.toLowerCase());
    const tagMatched = searchFocus.tags.length > 0
      ? searchFocus.tags.every((tag) => nodeTags.some((nodeTag: string) => nodeTag.includes(tag)))
      : false;
    const textMatched = searchFocus.text
      ? String(node.label || '').toLowerCase().includes(searchFocus.text)
      : false;
    return tagMatched || textMatched;
  };

  if (!projectPath) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px', color: 'var(--text-muted)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: '10px' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <div style={{ fontSize: 'calc(var(--graph-control-font-size, 11px) + 2px)', fontWeight: 600 }}>未打开项目文件夹</div>
        <div style={{ fontSize: 'var(--graph-control-font-size, 11px)', marginTop: '4px' }}>请在左侧笔记本中打开文件夹以计算标签格子关系图。</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>


      {/* Floating Parameters Adjustment Panel (斥力和颜色预设可调 UI) */}
      <GraphControls
        repulsion={repulsion}
        setRepulsion={setRepulsion}
        arrowSize={arrowSize}
        setArrowSize={setArrowSize}
        spacing={spacing}
        setSpacing={setSpacing}
        virtualDetail={virtualDetail}
        setVirtualDetail={setVirtualDetail}
        graphMode={graphMode}
        setGraphMode={setGraphMode}
      />


      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onMouseDown={handleSVGMouseDown}
        onMouseMove={handleSVGMouseMove}
        onMouseUp={handleSVGMouseUp}
        style={{ cursor: isPanning.current ? 'grabbing' : 'grab', backgroundColor: 'transparent' }}
      >
        <defs>
          <marker
            id="arrowhead-default"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            orient="auto"
          >
            <path d="M 0 2 L 8 5 L 0 8 z" fill="var(--text-muted)" fillOpacity={0.35} />
          </marker>
          {/* Dynamic hover arrowheads for each color in the active palette */}
          {(palettes[activePaletteName] || palettes.Tahoe || ['#4F46E5']).map((color, pIdx) => (
            <marker
              key={`arrow-${pIdx}`}
              id={`arrowhead-hover-${pIdx}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={arrowSize}
              markerHeight={arrowSize}
              orient="auto"
            >
              <path d="M 0 2 L 8 5 L 0 8 z" fill={color} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Render Lattice links */}
          {links.map((link, idx) => {
            const source = nodeById.get(link.source);
            const target = nodeById.get(link.target);
            if (!source || !target) return null;

            const activeFocusNode = hoveredNode || selectedNodeId;
            const isRelated = activeFocusNode === link.source || activeFocusNode === link.target;
            
            // Calculate proper directional line endpoints with arrow markers
            const isTargetFocused = activeFocusNode === link.target;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Anchor arrow tip exactly to target node boundary based on target node type and size
            let targetRadius = 6;
            if (target.isVirtual) {
              const dTarget = target.degree || 0;
              const fsTarget = 8 + 3 * (dTarget / (dTarget + 3.0));
              const wTarget = getPillWidth(target.label, fsTarget);
              const hTarget = 14 + 8 * (dTarget / (dTarget + 3.0));
              
              const absDx = Math.abs(dx);
              const absDy = Math.abs(dy);
              if (absDx === 0 && absDy === 0) {
                targetRadius = hTarget / 2;
              } else {
                const tx = (wTarget / 2) / (absDx / len);
                const ty = (hTarget / 2) / (absDy / len);
                targetRadius = Math.min(tx, ty);
              }
            } else {
              const dTarget = target.degree || 0;
              const rTarget = 6 + 10 * (dTarget / (dTarget + 3.0));
              targetRadius = isTargetFocused ? rTarget + 3.5 : rTarget + 1.8;
            }

            const x2 = target.x - (dx / len) * targetRadius;
            const y2 = target.y - (dy / len) * targetRadius;

            const sourceColor = getLevelColor(source.level || 0);
            const linkColor = isRelated ? sourceColor : 'var(--text-muted)';
            const paletteLength = (palettes[activePaletteName] || palettes.Tahoe || ['#4F46E5']).length;
            const markerId = isRelated 
              ? `arrowhead-hover-${(source.level || 0) % paletteLength}`
              : 'arrowhead-default';

            return (
              <line
                key={`link-${idx}`}
                x1={source.x}
                y1={source.y}
                x2={x2}
                y2={y2}
                stroke={linkColor}
                strokeWidth={isRelated ? 1.8 : 1.1}
                strokeOpacity={isRelated ? 0.8 : (activeFocusNode ? 0.12 : 0.35)}
                markerEnd={`url(#${markerId})`}
                style={{ transition: 'stroke 0.15s, stroke-width 0.15s, stroke-opacity 0.15s' }}
              />
            );
          })}

          {/* Render Lattice Nodes */}
          {nodes.map((node) => {
            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNodeId === node.id;
            const isHighlight = isHovered || isSelected;
            const isSearchMatched = matchesSearchFocus(node);

            const activeFocusNode = hoveredNode || selectedNodeId;
            const isFocusDimmed = activeFocusNode !== null && !isHovered && !isSelected && 
              !(neighborById.get(node.id)?.has(activeFocusNode));
            const isDimmed = isFocusDimmed || (searchFocus.active && !isSearchMatched);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => { handleSVGMouseUp(); handleNodeMouseDown(node.id, e); }}
                onDoubleClick={() => handleNodeDoubleClick(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer', opacity: isDimmed ? 0.18 : 1.0, transition: 'opacity 0.25s' }}
              >
                {(() => {
                  const d = node.degree || 0;
                  const nodeColor = getLevelColor(node.level || 0);

                  if (node.isVirtual) {
                    const displayLabel = (() => {
                      const tags = node.tags || [];
                      if (tags.length <= 3) {
                        return '#' + tags.join('#');
                      }
                      return '#' + tags.slice(0, 2).join('#') + '... [' + tags.length + ']';
                    })();
                    const height = graphNodeBaseFontSize + 5 + 8 * (d / (d + 3.0));
                    const fontSize = graphNodeBaseFontSize + 2 * (d / (d + 3.0));
                    const width = getPillWidth(displayLabel, fontSize);

                    return (
                      <>
                        <title>{(node.tags || []).map(t => '#' + t).join(' ')}</title>
                        {/* Glow ring */}
                        <rect
                          x={-width / 2 - 4}
                          y={-height / 2 - 4}
                          width={width + 8}
                          height={height + 8}
                          rx={6}
                          fill={nodeColor}
                          opacity={isHighlight ? 0.22 : 0.04}
                          style={{ transition: 'opacity 0.15s' }}
                        />
                        {/* Tag Pill */}
                        <rect
                          x={-width / 2}
                          y={-height / 2}
                          width={width}
                          height={height}
                          rx={5}
                          fill={nodeColor}
                          fillOpacity={isHighlight ? 0.22 : 0.08}
                          stroke={nodeColor}
                          strokeWidth={isHighlight ? 1.6 : 1.1}
                          strokeDasharray={isSelected ? "none" : (isHovered ? "none" : "3,2")}
                          style={{ transition: 'fill-opacity 0.15s, stroke-width 0.15s' }}
                        />
                        {/* Node Label (Inside) */}
                        <g transform={`translate(0, ${fontSize * 0.35})`} style={{ pointerEvents: 'none' }}>
                          <text
                            textAnchor="middle"
                            fill={nodeColor}
                            style={{
                              fontSize: `${fontSize}px`,
                              fontWeight: 700,
                              fontFamily: 'var(--font-sans)',
                              userSelect: 'none',
                              transition: 'fill 0.15s, font-size 0.15s',
                            }}
                          >
                            {displayLabel}
                          </text>
                        </g>
                      </>
                    );
                  } else {
                    const radius = 6 + 10 * (d / (d + 3.0));
                    const rCurrent = isHighlight ? radius + 2.5 : radius;
                    const textY = rCurrent + graphNodeBaseFontSize + 2;
                    const textFS = isHighlight ? graphNodeBaseFontSize + 1 : graphNodeBaseFontSize;

                    return (
                      <>
                        {/* Glow ring */}
                        <circle
                          r={rCurrent + 7}
                          fill={nodeColor}
                          opacity={isHighlight ? 0.25 : 0.06}
                          style={{ transition: 'r 0.15s, opacity 0.15s' }}
                        />
                        {/* Node Center Dot */}
                        <circle
                          r={rCurrent}
                          fill={isHighlight ? nodeColor : 'var(--bg-main)'}
                          stroke={nodeColor}
                          strokeWidth={isHighlight ? 2.5 : 1.8}
                          style={{ transition: 'fill 0.15s, stroke 0.15s, r 0.15s' }}
                        />
                        {/* Node Title Label (Below) */}
                        <g transform={`translate(0, ${textY})`} style={{ pointerEvents: 'none' }}>
                          <text
                            textAnchor="middle"
                            fill={isHighlight ? nodeColor : 'var(--text-main)'}
                            style={{
                              fontSize: `${textFS}px`,
                              fontWeight: 600,
                              fontFamily: 'var(--font-sans)',
                              userSelect: 'none',
                              textShadow: '0px 1px 2px var(--bg-main), 0px 1px 2px var(--bg-main)',
                              transition: 'fill 0.15s, font-size 0.15s',
                            }}
                          >
                            {node.label}
                          </text>
                        </g>
                      </>
                    );
                  }
                })()}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Styled slideUp keyframes dynamically injected */}
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(16px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Selected Node Details Drawer Panel */}
      {selectedNodeId && (
        <SelectedNodeDrawer
          selectedNodeId={selectedNodeId}
          nodes={nodes}
          links={links}
          projectPath={projectPath}
          getLevelColor={getLevelColor}
          setSelectedNodeId={setSelectedNodeId}
          handleNodeDoubleClick={handleNodeDoubleClick}
          svgRef={svgRef}
          zoom={zoom}
          setPan={setPan}
        />
      )}

      {/* Frosted Glass Overlay for Color Palette Manager */}
      <PaletteManagerModal
        isOpen={isPaletteEditorOpen}
        onClose={() => setIsPaletteEditorOpen(false)}
        palettes={palettes}
        setPalettes={setPalettes}
        activePaletteName={activePaletteName}
        setActivePaletteName={setActivePaletteName}
      />
    </div>
  );
}

export default GraphViewComponent;
