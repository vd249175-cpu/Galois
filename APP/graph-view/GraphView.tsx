import { useEffect, useState, useRef } from 'react';
import { GraphControls } from './GraphControls';
import { graphViewActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { Blood } from '../../CORE/Blood';

interface Node {
  id: string;
  tags: string[];
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  level?: number;
  isVirtual?: boolean;
  degree?: number;
}

interface Link {
  source: string;
  target: string;
}

// Bypasses virtual nodes by connecting all of their neighbors to each other in a hierarchical direction
function contractVirtualNodes(nodes: Node[], links: Link[]): { nodes: Node[], links: Link[] } {
  const realNodes = nodes.filter(n => !n.isVirtual);
  const virtualNodes = nodes.filter(n => n.isVirtual);

  let currentLinks = [...links];

  // Contract each virtual node by connecting its neighbors pairwise
  virtualNodes.forEach(vn => {
    // Find all nodes connected to this virtual node (source or target)
    const connectedIds = currentLinks
      .filter(l => l.source === vn.id || l.target === vn.id)
      .map(l => l.source === vn.id ? l.target : l.source);

    const uniqueNeighbors = Array.from(new Set(connectedIds));

    // Connect all neighbors to each other in the hierarchical direction
    for (let i = 0; i < uniqueNeighbors.length; i++) {
      for (let j = i + 1; j < uniqueNeighbors.length; j++) {
        const n1 = uniqueNeighbors[i];
        const n2 = uniqueNeighbors[j];

        if (n1 !== n2) {
          const node1 = nodes.find(n => n.id === n1);
          const node2 = nodes.find(n => n.id === n2);

          if (node1 && node2) {
            const lvl1 = node1.level || 0;
            const lvl2 = node2.level || 0;

            let src = n1;
            let tgt = n2;

            if (lvl1 > lvl2) {
              src = n2;
              tgt = n1;
            } else if (lvl1 === lvl2) {
              // Tie-breaker based on ID comparison to maintain a stable single direction
              if (n1 > n2) {
                src = n2;
                tgt = n1;
              }
            }

            const exists = currentLinks.some(l => l.source === src && l.target === tgt);
            if (!exists) {
              currentLinks.push({ source: src, target: tgt });
            }
          }
        }
      }
    }

    // Remove all links connected to/from this virtual node
    currentLinks = currentLinks.filter(l => l.source !== vn.id && l.target !== vn.id);
  });

  return { nodes: realNodes, links: currentLinks };
}

/**
 * GraphViewComponent — Lattice Graph 插件注册对象
 *
 * 契约声明：
 *   READS:  system.projectPath, system.resolvedTags, events.fileSaved.*,
 *           system.lastFocusedEditorId, system.activeEditors
 *   WRITES: events.openFile.{editorId}  (双击节点跳转)
 *           events.scriptError.graphView (lattice 脚本错误)
 *   DEPENDS ON: fileTree (提供 system.resolvedTags)
 */
export const GraphViewComponent = {
  typeId: 'graphView',
  displayName: '标签拓扑图',
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
    BC_PREFIX.fileSavedAll,
    BC.system.lastFocusedEditorId,
    BC.system.activeEditors,
  ],
  manifest: {
    description: 'Tag Lattice 关系图，使用 Python subset-inclusion 算法绘制笔记包含关系',
    reads: [
      BC.system.projectPath,
      BC.system.resolvedTags,       // 由 fileTree 写入，graphView 是消费者
      BC_PREFIX.fileSavedAll,       // 文件保存时重建图谱
      BC.system.lastFocusedEditorId,
      BC.system.activeEditors,
    ],
    writes: [
      BC.events.openFile('*'),              // 双击节点时发送打开请求
      BC.events.scriptError('graphView'),   // lattice.py 失败时广播错误
    ],
    dependsOn: ['fileTree'],  // 依赖 fileTree 提供 resolvedTags（必须先 mount）
  },
};

function getPillWidth(label: string, fs: number): number {
  let len = 0;
  for (let i = 0; i < label.length; i++) {
    if (label.charCodeAt(i) > 127) {
      len += 1.8;
    } else {
      len += 1.0;
    }
  }
  return Math.max(36, len * (fs * 0.58) + 12);
}

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
  const fileSavedMap = state[BC_PREFIX.fileSavedAll] || {};
  const fileSavedEvent = Object.values(fileSavedMap).reduce((max: number, val: any) => Math.max(max, Number(val) || 0), 0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
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
  const [editingPaletteName, setEditingPaletteName] = useState<string | null>(null);
  const [newPaletteName, setNewPaletteName] = useState('');

  const getLevelColor = (level: number) => {
    const colors = palettes[activePaletteName] || palettes.Tahoe || ['#4F46E5'];
    return colors[level % colors.length];
  };

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

  // Physics Simulation
  const simRef = useRef<{ nodes: Node[]; links: Link[] }>({ nodes: [], links: [] });
  const dragNodeId = useRef<string | null>(null);
  const requestRef = useRef<number | null>(null);
  const isSimulationRunning = useRef(true);
  const tickRef = useRef<() => void>(undefined);
  const alpha = useRef(1.0); // D3-like simulation temperature for cooling

  const wakeSimulation = () => {
    alpha.current = 1.0; // Reset heat/energy
    if (isSimulationRunning.current) return;
    isSimulationRunning.current = true;
    if (tickRef.current) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(tickRef.current);
    }
  };

  // 1. Fetch file list, parse YAML tags, and invoke Python lattice edge calculator
  useEffect(() => {
    if (!projectPath) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const buildLatticeGraph = async () => {
      try {
        const files = await (window as any).electronAPI.listDir(projectPath);
        const mdFiles = files.filter((f: any) => !f.isDir && f.name.endsWith('.md'));

        const currentResolvedTags = state[BC.system.resolvedTags] || {};
        const rawNodes: { id: string; tags: string[]; label: string; isVirtual?: boolean }[] = [];

        // Step 1: 所有笔记节点使用 flat 标签，不做路径拆解
        for (const file of mdFiles) {
          const tags: string[] = currentResolvedTags[file.path] || [];
          const noteTitle = file.name.substring(0, file.name.lastIndexOf('.md'));
          rawNodes.push({ id: file.path, tags, label: noteTitle });
        }

        if (rawNodes.length === 0) {
          simRef.current = { nodes: [], links: [] };
          setNodes([]);
          setLinks([]);
          return;
        }

        // Call Python lattice.py — 传入 { nodes, showVirtual }，由 Python 侧做 FCA 虚节点计算
        const scriptPath = await (window as any).electronAPI.getServiceScriptPath('graph-view', 'lattice.py');
        const showVirtual = graphMode !== 'flat';
        const latticePayload = JSON.stringify({ nodes: rawNodes, showVirtual });
        const result = await (window as any).electronAPI.runScript(scriptPath, latticePayload, projectPath);

        if (result.stderr && result.stderr.trim()) {
          updateBloodKey(BC.events.scriptError('graphView'), { message: result.stderr.trim(), ts: Date.now() });
        }

        let calculatedEdges: Link[] = [];
        try {
          const latticeResult = JSON.parse(result.stdout || '{"nodes":[],"edges":[]}');
          // lattice.py 返回 FCA 生成的虚节点（合并进 rawNodes 用于渲染）
          const returnedVirtualNodes: { id: string; tags: string[]; label: string; isVirtual: boolean }[] =
            latticeResult.nodes || [];
          returnedVirtualNodes.forEach((vn) => {
            if (!rawNodes.find((rn) => rn.id === vn.id)) {
              rawNodes.push(vn);
            }
          });
          calculatedEdges = latticeResult.edges || [];
        } catch (parseErr) {
          updateBloodKey(BC.events.scriptError('graphView'), { message: `lattice.py JSON parse error: ${result.stdout}`, ts: Date.now() });
        }

        // Convert raw nodes to physics-enabled nodes
        const levels: Record<string, number> = {};
        rawNodes.forEach((rn) => {
          levels[rn.id] = 0;
        });

        let changed = true;
        let iterations = 0;
        const maxLevelIterations = rawNodes.length * 2;
        while (changed && iterations < maxLevelIterations) {
          changed = false;
          iterations++;
          calculatedEdges.forEach((edge) => {
            const srcLevel = levels[edge.source] || 0;
            const tgtLevel = levels[edge.target] || 0;
            if (tgtLevel < srcLevel + 1) {
              levels[edge.target] = srcLevel + 1;
              changed = true;
            }
          });
        }

        // Calculate degrees from calculatedEdges (displayed connections only)
        const degrees: Record<string, number> = {};
        rawNodes.forEach((rn) => {
          degrees[rn.id] = 0;
        });
        calculatedEdges.forEach((edge) => {
          if (degrees[edge.source] !== undefined) degrees[edge.source]++;
          if (degrees[edge.target] !== undefined) degrees[edge.target]++;
        });

        const physicsNodes: Node[] = rawNodes.map((rn, i) => {
          const existing = simRef.current.nodes.find((n) => n.id === rn.id);
          
          // Spread nodes uniformly in 2D space
          const angle = (i / rawNodes.length) * Math.PI * 2;
          const radius = 100 + Math.random() * 40;
          const defaultX = Math.cos(angle) * radius;
          const defaultY = Math.sin(angle) * radius;

          return {
            id: rn.id,
            tags: rn.tags,
            label: rn.label,
            x: existing ? existing.x : defaultX,
            y: existing ? existing.y : defaultY,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
            level: levels[rn.id] || 0,
            isVirtual: rn.isVirtual,
            degree: degrees[rn.id] || 0,
          };
        });

        let displayNodes = physicsNodes;
        let displayEdges = calculatedEdges;
 
        if (graphMode === 'contracted') {
          const contracted = contractVirtualNodes(physicsNodes, calculatedEdges);
          displayNodes = contracted.nodes;
          displayEdges = contracted.links;
          
          // Re-calculate degrees for displayNodes based on displayEdges
          const contractedDegrees: Record<string, number> = {};
          displayNodes.forEach(n => { contractedDegrees[n.id] = 0; });
          displayEdges.forEach(edge => {
            if (contractedDegrees[edge.source] !== undefined) contractedDegrees[edge.source]++;
            if (contractedDegrees[edge.target] !== undefined) contractedDegrees[edge.target]++;
          });
          displayNodes = displayNodes.map(n => ({
            ...n,
            degree: contractedDegrees[n.id] || 0
          }));
        }

        simRef.current = { nodes: displayNodes, links: displayEdges };
        setNodes(displayNodes);
        setLinks(displayEdges);
        wakeSimulation();
      } catch (err) {
        console.error('Lattice builder error:', err);
      }
    };

    buildLatticeGraph();
  }, [projectPath, state[BC.system.resolvedTags], fileSavedEvent, graphMode]);

  // 2. Physics Simulation Loop - Free 2D Force-Directed Layout
  useEffect(() => {
    const tick = () => {
      const { nodes: simNodes, links: simLinks } = simRef.current;
      if (simNodes.length === 0) {
        isSimulationRunning.current = false;
        return;
      }

      const repulsionStrength = repulsionRef.current;
      const attractionStrength = 0.05;
      const damping = 0.85;
      const currentAlpha = alpha.current;

      // 2a. Repulsion (Push nodes apart)
      for (let i = 0; i < simNodes.length; i++) {
        const n1 = simNodes[i];
        for (let j = i + 1; j < simNodes.length; j++) {
          const n2 = simNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);

          if (dist < spacingRef.current * 3.0) {
            const force = repulsionStrength / distSq;
            const fx = (dx / dist) * force * currentAlpha;
            const fy = (dy / dist) * force * currentAlpha;

            if (n1.id !== dragNodeId.current) {
              n1.vx -= fx;
              n1.vy -= fy;
            }
            if (n2.id !== dragNodeId.current) {
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }
      }

      // 2b. Attraction (Pull connected Concept Nodes together)
      simLinks.forEach((link) => {
        const sourceNode = simNodes.find((n) => n.id === link.source);
        const targetNode = simNodes.find((n) => n.id === link.target);

        if (sourceNode && targetNode) {
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = spacingRef.current;
          const k = attractionStrength * (dist - desiredDist) * currentAlpha;
          const fx = (dx / dist) * k;
          const fy = (dy / dist) * k;

          if (sourceNode.id !== dragNodeId.current) {
            sourceNode.vx += fx;
            sourceNode.vy += fy;
          }
          if (targetNode.id !== dragNodeId.current) {
            targetNode.vx -= fx;
            targetNode.vy -= fy;
          }
        }
      });

      // 2c. Update positions, applying center gravity and radial hierarchy force
      simNodes.forEach((n) => {
        if (n.id === dragNodeId.current) return;

        const d = Math.sqrt(n.x * n.x + n.y * n.y) || 1;
        
        // General concepts (closer to source nodes in DAG level) go to the center, specific concepts go to the edge
        const level = n.level !== undefined ? n.level : 0;
        const targetR = level * spacingRef.current; // Dynamic spacing per DAG level

        
        // Radial constraint force pulling/pushing the node towards targetR
        const radialStrength = 0.055;
        const radialForce = (targetR - d) * radialStrength * currentAlpha;
        n.vx += (n.x / d) * radialForce;
        n.vy += (n.y / d) * radialForce;

        // Centering weak gravity to keep layout centered
        const centeringGravity = 0.005;
        n.vx -= n.x * centeringGravity * currentAlpha;
        n.vy -= n.y * centeringGravity * currentAlpha;

        n.vx *= damping;
        n.vy *= damping;

        n.x += n.vx;
        n.y += n.vy;
      });

      setNodes([...simNodes]);

      // Decay simulation temperature (alpha) to guarantee layout converges and sleeps
      const isDragging = dragNodeId.current !== null;
      if (isDragging) {
        alpha.current = Math.max(alpha.current, 0.2); // Keep warm during active drags
      } else {
        alpha.current *= 0.97; // Decay temperature
      }

      if (alpha.current < 0.015 && !isDragging) {
        isSimulationRunning.current = false;
      } else {
        requestRef.current = requestAnimationFrame(tick);
      }
    };

    tickRef.current = tick;
    isSimulationRunning.current = true;
    requestRef.current = requestAnimationFrame(tick);
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // 3. Mouse Pan/Zoom & Drag Handlers
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

  if (!projectPath) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px', color: 'var(--text-muted)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: '10px' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>未打开项目文件夹</div>
        <div style={{ fontSize: '11px', marginTop: '4px' }}>请在左侧笔记本中打开文件夹以计算标签格子关系图。</div>
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
            const source = nodes.find((n) => n.id === link.source);
            const target = nodes.find((n) => n.id === link.target);
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

            const activeFocusNode = hoveredNode || selectedNodeId;
            const isDimmed = activeFocusNode !== null && !isHovered && !isSelected && 
              !links.some((l) => (l.source === node.id && l.target === activeFocusNode) || (l.target === node.id && l.source === activeFocusNode));

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => { handleSVGMouseUp(); handleNodeMouseDown(node.id, e); }}
                onDoubleClick={() => handleNodeDoubleClick(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer', opacity: isDimmed ? 0.35 : 1.0, transition: 'opacity 0.25s' }}
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
                    const height = 14 + 8 * (d / (d + 3.0));
                    const fontSize = 8 + 3 * (d / (d + 3.0));
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
                    const textY = rCurrent + 11;
                    const textFS = isHighlight ? 9.5 : 8.5;

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
      {selectedNodeId && (() => {
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
            fontSize: '12px',
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
                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
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
                  fontSize: '12px',
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
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>包含标签:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {node.tags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(0, 0, 0, 0.03)',
                          border: '1px solid var(--border-color)',
                          fontSize: '11px',
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
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>笔记路径 (双击打开):</div>
                  <div
                    onClick={() => handleNodeDoubleClick(node.id)}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '10.5px',
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
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>关联节点 (点击选中定位 / 虚线为概念节点):</div>
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
                          fontSize: '11px',
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
      })()}

      {/* Frosted Glass Overlay for Color Palette Manager */}
      {isPaletteEditorOpen && (
        <div className="pane-modal-overlay" onClick={() => { setIsPaletteEditorOpen(false); setEditingPaletteName(null); }}>
          <div className="pane-modal-content" onClick={(e) => e.stopPropagation()} style={{
            width: '320px',
            maxHeight: '400px',
            color: 'var(--text-main)',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 0
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'rgba(0,0,0,0.02)'
            }}>
              <span style={{ fontWeight: 600 }}>
                {editingPaletteName ? `编辑色板: ${editingPaletteName}` : '色板主题管理'}
              </span>
              <button
                onClick={() => {
                  setIsPaletteEditorOpen(false);
                  setEditingPaletteName(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '14px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {editingPaletteName ? (
                /* Editing a Specific Palette */
                (() => {
                  const paletteColors = palettes[editingPaletteName] || [];
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                        {paletteColors.map((color, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {/* Swatch wrapper */}
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '4px',
                                border: '1.2px solid var(--border-color)',
                                backgroundColor: color,
                                position: 'relative',
                                overflow: 'hidden',
                                cursor: 'pointer'
                              }}>
                                <input
                                  type="color"
                                  value={color}
                                  onChange={(e) => {
                                    const updated = [...paletteColors];
                                    updated[idx] = e.target.value;
                                    setPalettes({
                                      ...palettes,
                                      [editingPaletteName]: updated
                                    });
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: '-4px',
                                    left: '-4px',
                                    width: '28px',
                                    height: '28px',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    opacity: 0
                                  }}
                                />
                              </div>
                              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                                {color.toUpperCase()}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                const updated = paletteColors.filter((_, cIdx) => cIdx !== idx);
                                setPalettes({
                                  ...palettes,
                                  [editingPaletteName]: updated
                                });
                              }}
                              disabled={paletteColors.length <= 1}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: paletteColors.length <= 1 ? 'var(--border-color)' : '#ef4444',
                                cursor: paletteColors.length <= 1 ? 'not-allowed' : 'pointer',
                                fontSize: '10px',
                                fontWeight: 600,
                              }}
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                        <button
                          onClick={() => {
                            setPalettes({
                              ...palettes,
                              [editingPaletteName]: [...paletteColors, '#7C7C82']
                            });
                          }}
                          style={{
                            flex: 1,
                            padding: '5px 8px',
                            backgroundColor: 'rgba(0,0,0,0.03)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: 'var(--text-main)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          + 添加颜色
                        </button>
                        <button
                          onClick={() => setEditingPaletteName(null)}
                          style={{
                            padding: '5px 12px',
                            backgroundColor: 'var(--accent-color)',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#ffffff',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          返回
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Palette List View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {Object.keys(palettes).map((pName) => {
                      const isActive = activePaletteName === pName;
                      const colors = palettes[pName];
                      return (
                        <div
                          key={pName}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            backgroundColor: isActive ? 'rgba(255, 59, 48, 0.06)' : 'rgba(0,0,0,0.015)',
                            border: isActive ? '1.2px solid var(--accent-color)' : '1.2px solid var(--border-color)',
                            borderRadius: '5px',
                            transition: 'border-color 0.15s, background-color 0.15s'
                          }}
                        >
                          {/* Left: select palette click target */}
                          <div
                            onClick={() => setActivePaletteName(pName)}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer' }}
                          >
                            <span style={{ fontWeight: 600, fontSize: '11px', color: isActive ? 'var(--accent-color)' : 'var(--text-main)' }}>
                              {pName}
                            </span>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              {colors.map((color, cIdx) => (
                                <div key={cIdx} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
                              ))}
                            </div>
                          </div>

                          {/* Right: action buttons */}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => setEditingPaletteName(pName)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: 600,
                              }}
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => {
                                const remaining = { ...palettes };
                                delete remaining[pName];
                                setPalettes(remaining);
                                if (activePaletteName === pName) {
                                  setActivePaletteName(Object.keys(remaining)[0]);
                                }
                              }}
                              disabled={Object.keys(palettes).length <= 1}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: Object.keys(palettes).length <= 1 ? 'var(--border-color)' : '#ef4444',
                                cursor: Object.keys(palettes).length <= 1 ? 'not-allowed' : 'pointer',
                                fontSize: '10px',
                                fontWeight: 600,
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add New Palette form */}
                  <div style={{ display: 'flex', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                    <input
                      type="text"
                      placeholder="新建色板名称..."
                      value={newPaletteName}
                      onChange={(e) => setNewPaletteName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '11px',
                        border: '1.2px solid var(--border-color)',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-main)',
                        color: 'var(--text-main)',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => {
                        const name = newPaletteName.trim();
                        if (name && !palettes[name]) {
                          setPalettes({
                            ...palettes,
                            [name]: ['#4F46E5', '#06B6D4', '#10B981']
                          });
                          setActivePaletteName(name);
                          setNewPaletteName('');
                        }
                      }}
                      disabled={!newPaletteName.trim()}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: newPaletteName.trim() ? 'var(--accent-color)' : 'rgba(0,0,0,0.05)',
                        border: 'none',
                        borderRadius: '4px',
                        color: newPaletteName.trim() ? '#ffffff' : 'var(--text-muted)',
                        fontWeight: 600,
                        cursor: newPaletteName.trim() ? 'pointer' : 'not-allowed',
                        fontSize: '11px'
                      }}
                    >
                      + 新增
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default GraphViewComponent;
