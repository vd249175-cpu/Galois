import { useEffect, useState, useRef } from 'react';
import { GraphControls } from './GraphControls';
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

  // Toggle mode for hierarchical tag decomposition (級數拆解 / 隐式关联模式)
  const [isHierarchicalMode, setIsHierarchicalMode] = useState(false);

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

        for (const file of mdFiles) {
          let tags = currentResolvedTags[file.path] || [];
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
            const isRepresented = rawNodes.some(rn => rn.label === tag || rn.id.endsWith(`/${tag}.md`) || rn.id.endsWith(`\\${tag}.md`));
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

  // Listen for dynamic zoom/recenter actions triggered from sidebar
  useEffect(() => {
    if (lastAction) {
      if (lastAction.id === 'graphView.zoomIn') {
        handleZoom(1.15);
      } else if (lastAction.id === 'graphView.zoomOut') {
        handleZoom(0.85);
      } else if (lastAction.id === 'graphView.recenter') {
        setPan({ x: 300, y: 250 });
        setZoom(1.0);
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


      {/* Floating Parameters Adjustment Panel (斥力和箭头可调 UI) */}
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
            <path d="M 0 2 L 8 5 L 0 8 z" fill="var(--text-muted)" fillOpacity={0.45} />
          </marker>
          <marker
            id="arrowhead-hovered"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            orient="auto"
          >
            <path d="M 0 2 L 8 5 L 0 8 z" fill="var(--accent-color)" />
          </marker>
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
            // Anchor arrow tip exactly to target node boundary (independent of arrow size)
            const isTargetHovered = hoveredNode === link.target;
            const targetRadius = isTargetHovered ? 8.8 : 7.2; 
            const x2 = target.x - (dx / len) * targetRadius;
            const y2 = target.y - (dy / len) * targetRadius;

            return (
              <line
                key={`link-${idx}`}
                x1={source.x}
                y1={source.y}
                x2={x2}
                y2={y2}
                stroke={isRelated ? 'var(--accent-color)' : 'var(--text-muted)'}
                strokeWidth={isRelated ? 1.8 : 1.1}
                strokeOpacity={hoveredNode && !isRelated ? 0.15 : 0.45}
                markerEnd={isRelated ? 'url(#arrowhead-hovered)' : 'url(#arrowhead-default)'}
                style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
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
                {/* Glow ring */}
                <circle
                  r={isHovered ? 14 : 9}
                  fill="var(--accent-color)"
                  opacity={isHovered ? 0.18 : 0.05}
                  style={{ transition: 'r 0.15s, opacity 0.15s' }}
                />
                {/* Node Center Dot or Tag Pill */}
                {node.isVirtual ? (
                  <rect
                    x={-Math.max(36, node.label.length * 5.2 + 8) / 2}
                    y={-7}
                    width={Math.max(36, node.label.length * 5.2 + 8)}
                    height={14}
                    rx={4}
                    fill={isHovered ? 'var(--accent-color)' : 'rgba(124, 124, 133, 0.08)'}
                    stroke={isHovered ? 'var(--accent-color)' : 'var(--text-muted)'}
                    strokeWidth="1.1"
                    strokeDasharray="3,2"
                    style={{ transition: 'fill 0.15s, stroke 0.15s' }}
                  />
                ) : (
                  <circle
                    r={isHovered ? 7 : 5.5}
                    fill={isHovered ? 'var(--accent-color)' : 'var(--text-main)'}
                    stroke="var(--bg-main)"
                    strokeWidth="1.5"
                    style={{ transition: 'fill 0.15s, r 0.15s' }}
                  />
                )}
                
                {/* Node Title Box Label */}
                <g transform={node.isVirtual ? "translate(0, 3)" : "translate(0, 18)"} style={{ pointerEvents: 'none' }}>
                  <text
                    textAnchor="middle"
                    fill={isHovered ? (node.isVirtual ? '#ffffff' : 'var(--accent-color)') : 'var(--text-main)'}
                    style={{
                      fontSize: node.isVirtual ? '8px' : '8.5px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-sans)',
                      userSelect: 'none',
                      textShadow: node.isVirtual ? 'none' : '0px 1px 2px var(--bg-main), 0px 1px 2px var(--bg-main)',
                      transition: 'fill 0.15s',
                    }}
                  >
                    {node.label}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
export default GraphViewComponent;
