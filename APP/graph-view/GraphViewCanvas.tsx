import { useEffect, useMemo, useState, useRef } from 'react';
import { useLatticeData } from './useLatticeData';
import { usePhysicsSimulation } from './usePhysicsSimulation';
import { GraphViewSurface } from './GraphViewSurface';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { Blood } from '../../CORE/Blood';

export function GraphView({
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

  return <GraphViewSurface {...{
    activePaletteName, arrowSize, getLevelColor, graphMode, graphNodeBaseFontSize,
    handleNodeDoubleClick, handleNodeMouseDown, handleSVGMouseDown, handleSVGMouseMove,
    handleSVGMouseUp, hoveredNode, isPanning, isPaletteEditorOpen, links, neighborById,
    nodeById, nodes, palettes, pan, projectPath, repulsion, searchFocus, selectedNodeId,
    setActivePaletteName, setArrowSize, setGraphMode, setHoveredNode, setIsPaletteEditorOpen,
    setPalettes, setPan, setRepulsion, setSelectedNodeId, setSpacing, setVirtualDetail,
    spacing, svgRef, virtualDetail, zoom, matchesSearchFocus,
  }} />;
}
