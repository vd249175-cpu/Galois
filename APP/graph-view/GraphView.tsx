import { useEffect, useState, useRef } from 'react';
import { GraphControls, PALETTE_PRESETS } from './GraphControls';
import { graphViewActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';

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
  displayName: 'Lattice Graph',
  iconName: 'git-branch',
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

  // Toggle mode for hierarchical tag decomposition (级数拆解 / 隐式关联模式)
  const [isHierarchicalMode, setIsHierarchicalMode] = useState(true);

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
        const allUniqueDecomposedTags = new Set<string>();
        const originalTagsSet = new Set<string>();

        for (const file of mdFiles) {
          let tags = currentResolvedTags[file.path] || [];
          // Keep track of original tags before decomposition
          tags.forEach((t: string) => originalTagsSet.add(t));

          if (isHierarchicalMode) {
            const decomposed = new Set<string>();
            tags.forEach((tag: string) => {
              const parts = tag.split(/[#/]/).map(p => p.trim()).filter(Boolean);
              let path = '';
              parts.forEach((part, index) => {
                path = index === 0 ? part : `${path}#${part}`;
                decomposed.add(path);
                decomposed.add(part);
              });
              decomposed.add(tag);
            });
            tags = Array.from(decomposed);
            tags.forEach((t: string) => allUniqueDecomposedTags.add(t));
          }
          const noteTitle = file.name.substring(0, file.name.lastIndexOf('.md'));
          rawNodes.push({ id: file.path, tags, label: noteTitle });
        }

        // Add virtual nodes for tags that are not represented by explicit notes
        if (isHierarchicalMode) {
          allUniqueDecomposedTags.forEach((tag) => {
            const isRepresented = originalTagsSet.has(tag) || rawNodes.some(rn => rn.label === tag || rn.id.endsWith(`/${tag}.md`) || rn.id.endsWith(`\\${tag}.md`));
            if (!isRepresented) {
              const decomposed = new Set<string>();
              const parts = tag.split(/[#/]/).map(p => p.trim()).filter(Boolean);
              let path = '';
              parts.forEach((part, index) => {
                path = index === 0 ? part : `${path}#${part}`;
                decomposed.add(path);
                decomposed.add(part);
              });
              decomposed.add(tag);

              rawNodes.push({
                id: `tag:${tag}`,
                tags: Array.from(decomposed),
                label: `#${tag}`,
                isVirtual: true
              });
            }
          });
        }

        if (rawNodes.length === 0) {
          simRef.current = { nodes: [], links: [] };
          setNodes([]);
          setLinks([]);
          return;
        }

        // Call Python lattice.py via generic runScript IPC
        // lattice.py 位于 APP/graph-view/services/ 目录下
        const scriptPath = await (window as any).electronAPI.getServiceScriptPath('graph-view', 'lattice.py');
        const result = await (window as any).electronAPI.runScript(scriptPath, JSON.stringify(rawNodes), projectPath);

        if (result.stderr && result.stderr.trim()) {
          updateBloodKey(BC.events.scriptError('graphView'), { message: result.stderr.trim(), ts: Date.now() });
        }

        let calculatedEdges: Link[] = [];
        try {
          calculatedEdges = JSON.parse(result.stdout || '[]');
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


        simRef.current = { nodes: physicsNodes, links: calculatedEdges };
        setNodes(physicsNodes);
        setLinks(calculatedEdges);
        wakeSimulation();
      } catch (err) {
        console.error('Lattice builder error:', err);
      }
    };

    buildLatticeGraph();
  }, [projectPath, state[BC.system.resolvedTags], fileSavedEvent, isHierarchicalMode]);

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

  const handleSVGMouseUp = () => {
    isPanning.current = false;
    dragNodeId.current = null;
  };

  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dragNodeId.current = nodeId;
    const node = simRef.current.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.vx = 0;
      node.vy = 0;
    }
    wakeSimulation();
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    if (nodeId.startsWith('tag:')) {
      // It's a virtual tag node.
      return;
    }
    const targetEditorId = state[BC.system.lastFocusedEditorId]
      || (state[BC.system.activeEditors] || [])[0];

    if (targetEditorId) {
      updateBloodKey(BC.events.openFile(targetEditorId), nodeId);
    } else {
      updateBloodKey(BC.events.openFile('global'), nodeId);
    }
  };

  const handleZoom = (factor: number) => {
    setZoom((prev) => Math.max(0.2, Math.min(3.0, prev * factor)));
  };

  // Listen for dynamic zoom/recenter/color actions triggered from sidebar
  useEffect(() => {
    if (lastAction) {
      if (lastAction.id === 'graphView.zoomIn') {
        handleZoom(1.15);
      } else if (lastAction.id === 'graphView.zoomOut') {
        handleZoom(0.85);
      } else if (lastAction.id === 'graphView.recenter') {
        setPan({ x: 300, y: 250 });
        setZoom(1.0);
      } else if (lastAction.id === 'graphView.colorTahoe') {
        setActivePaletteName('Tahoe');
      } else if (lastAction.id === 'graphView.colorSunset') {
        setActivePaletteName('Sunset');
      } else if (lastAction.id === 'graphView.colorNordic') {
        setActivePaletteName('Nordic');
      } else if (lastAction.id === 'graphView.colorMono') {
        setActivePaletteName('Mono');
      }
    }
  }, [lastAction]);

  if (!projectPath) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px', color: 'var(--text-muted)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '10px' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>No Project Folder Opened</div>
        <div style={{ fontSize: '11px', marginTop: '4px' }}>Select a folder in Lattices Explorer to compute the Tag Lattice relationship graph.</div>
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
        isHierarchicalMode={isHierarchicalMode}
        setIsHierarchicalMode={setIsHierarchicalMode}
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

            const isRelated = hoveredNode === link.source || hoveredNode === link.target;
            
            // Calculate proper directional line endpoints with arrow markers
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Anchor arrow tip exactly to target node boundary based on target node type and size
            const isTargetHovered = hoveredNode === link.target;
            let targetRadius = 6;
            if (target.isVirtual) {
              const dTarget = target.degree || 0;
              const fsTarget = 8 + 3 * (dTarget / (dTarget + 3.0));
              const wTarget = getPillWidth(target.label, fsTarget);
              targetRadius = isTargetHovered ? (wTarget / 2) + 2.5 : (wTarget / 2);
            } else {
              const dTarget = target.degree || 0;
              const rTarget = 6 + 10 * (dTarget / (dTarget + 3.0));
              targetRadius = isTargetHovered ? rTarget + 3.5 : rTarget + 1.8;
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
                strokeOpacity={isRelated ? 0.8 : (hoveredNode ? 0.12 : 0.35)}
                markerEnd={`url(#${markerId})`}
                style={{ transition: 'stroke 0.15s, stroke-width 0.15s, stroke-opacity 0.15s' }}
              />
            );
          })}

          {/* Render Lattice Nodes */}
          {nodes.map((node) => {
            const isHovered = hoveredNode === node.id;
            const isDimmed = hoveredNode !== null && !isHovered && 
              !links.some((l) => (l.source === node.id && l.target === hoveredNode) || (l.target === node.id && l.source === hoveredNode));

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
                    const height = 14 + 8 * (d / (d + 3.0));
                    const fontSize = 8 + 3 * (d / (d + 3.0));
                    const width = getPillWidth(node.label, fontSize);

                    return (
                      <>
                        {/* Glow ring */}
                        <rect
                          x={-width / 2 - 4}
                          y={-height / 2 - 4}
                          width={width + 8}
                          height={height + 8}
                          rx={6}
                          fill={nodeColor}
                          opacity={isHovered ? 0.22 : 0.04}
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
                          fillOpacity={isHovered ? 0.22 : 0.08}
                          stroke={nodeColor}
                          strokeWidth={isHovered ? 1.6 : 1.1}
                          strokeDasharray={isHovered ? "none" : "3,2"}
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
                            {node.label}
                          </text>
                        </g>
                      </>
                    );
                  } else {
                    const radius = 6 + 10 * (d / (d + 3.0));
                    const rCurrent = isHovered ? radius + 2.5 : radius;
                    const textY = rCurrent + 11;
                    const textFS = isHovered ? 9.5 : 8.5;

                    return (
                      <>
                        {/* Glow ring */}
                        <circle
                          r={rCurrent + 7}
                          fill={nodeColor}
                          opacity={isHovered ? 0.25 : 0.06}
                          style={{ transition: 'r 0.15s, opacity 0.15s' }}
                        />
                        {/* Node Center Dot */}
                        <circle
                          r={rCurrent}
                          fill={isHovered ? nodeColor : 'var(--bg-main)'}
                          stroke={nodeColor}
                          strokeWidth={isHovered ? 2.5 : 1.8}
                          style={{ transition: 'fill 0.15s, stroke 0.15s, r 0.15s' }}
                        />
                        {/* Node Title Label (Below) */}
                        <g transform={`translate(0, ${textY})`} style={{ pointerEvents: 'none' }}>
                          <text
                            textAnchor="middle"
                            fill={isHovered ? nodeColor : 'var(--text-main)'}
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

      {/* Frosted Glass Overlay for Color Palette Manager */}
      {isPaletteEditorOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            width: '320px',
            maxHeight: '400px',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            color: 'var(--text-main)',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
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
                {editingPaletteName ? `Edit Palette: ${editingPaletteName}` : 'Theme Palettes (色组管理)'}
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
                              Delete
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
                          + Add Color
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
                          Back
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
                              Edit
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
                      placeholder="New palette name..."
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
                      + Add
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
