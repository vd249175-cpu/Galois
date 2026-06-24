import { useEffect, useState, useRef } from 'react';
import { linkGraphActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';

interface LinkNode {
  id: string; // The canonical name (e.g., "00_新手指引")
  filePath?: string; // Full file path if it exists
  exists: boolean; // True if it's a real file, false if it's a phantom link
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number; // Number of connections
}

interface LinkEdge {
  source: string;
  target: string;
}

export const LinkGraphComponent = {
  typeId: 'linkGraph',
  displayName: '双链关系图谱',
  iconName: 'network',
  component: LinkGraphView,
  actions: linkGraphActions,
  bloodChannels: [
    BC.system.projectPath,
    BC_PREFIX.fileSavedAll,
    BC.system.lastFocusedEditorId,
    BC.system.activeEditors,
  ],
  manifest: {
    description: 'Obsidian 风格双链图谱，动态展示笔记文件之间的引用链接结构',
    reads: [
      BC.system.projectPath,
      BC_PREFIX.fileSavedAll,
      BC.system.lastFocusedEditorId,
      BC.system.activeEditors,
    ],
    writes: [
      BC.events.openFile('*'),
    ],
  },
};

function LinkGraphView({
  areaId: _areaId,
  state = {},
  updateBloodKey,
  lastAction,
}: {
  areaId: string;
  state?: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = state[BC.system.projectPath] || '';
  const fileSavedMap = state[BC_PREFIX.fileSavedAll] || {};
  const fileSavedEvent = Object.values(fileSavedMap).reduce((max: number, val: any) => Math.max(max, Number(val) || 0), 0);

  const [nodes, setNodes] = useState<LinkNode[]>([]);
  const [links, setLinks] = useState<LinkEdge[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // SVG Pan & Zoom states
  const [pan, setPan] = useState({ x: 300, y: 250 });
  const [zoom, setZoom] = useState(1.0);
  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Simulation parameters (customizable in controls panel)
  const [repulsion, setRepulsion] = useState(2500);
  const [gravity, setGravity] = useState(0.015);
  const [linkDistance, setLinkDistance] = useState(120);
  const [showLabels, setShowLabels] = useState(true);
  const [showPhantoms, setShowPhantoms] = useState(true);

  // Physics Simulation running status
  const alpha = useRef(1.0);
  const isSimulationRunning = useRef(false);
  const requestRef = useRef<number | null>(null);
  const dragNodeId = useRef<string | null>(null);

  const simRef = useRef<{ nodes: LinkNode[]; links: LinkEdge[] }>({ nodes: [], links: [] });
  simRef.current = { nodes, links };

  // Ref tracking if component is currently mounted to prevent async state setting leaks
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const wakeSimulation = () => {
    alpha.current = 1.0;
    if (!isSimulationRunning.current) {
      isSimulationRunning.current = true;
      if (tickRef.current) {
        requestRef.current = requestAnimationFrame(tickRef.current);
      }
    }
  };

  const lastProjectPathRef = useRef<string>('');

  // 1. Scan files and build graph nodes/edges
  useEffect(() => {
    if (!projectPath) {
      setNodes([]);
      setLinks([]);
      lastProjectPathRef.current = '';
      return;
    }

    // Reset coordinates and files when project path changes to prevent layout confusion
    if (projectPath !== lastProjectPathRef.current) {
      setNodes([]);
      setLinks([]);
      lastProjectPathRef.current = projectPath;
    }

    let isMounted = true;

    const buildGraph = async () => {
      try {
        const scanDirRecursive = async (dir: string): Promise<any[]> => {
          const raw = await (window as any).electronAPI.listDir(dir);
          const dirList = Array.isArray(raw) ? raw : [];
          const files: any[] = [];
          
          for (const item of dirList) {
            if (item.isDir) {
              const nameLower = item.name.toLowerCase();
              if (item.name.startsWith('.') || 
                  nameLower === 'node_modules' || 
                  nameLower === 'dist' || 
                  nameLower === 'dist-electron' || 
                  nameLower === 'build' ||
                  nameLower === 'venv' || 
                  nameLower === '.venv' ||
                  nameLower === 'bin' ||
                  nameLower === 'templates' ||
                  nameLower === 'template') {
                continue;
              }
              const subFiles = await scanDirRecursive(item.path);
              files.push(...subFiles);
            } else {
              files.push(item);
            }
          }
          return files;
        };

        const list = await scanDirRecursive(projectPath);
        const mdFiles = list.filter((f: any) => !f.isDir && f.name && f.name.endsWith('.md'));
        
        const noteMap = new Map<string, { filePath: string; links: string[] }>();
        const existingTitles = new Set<string>();

        // Phase 1: Read all contents and collect links
        for (const file of mdFiles) {
          if (!isMounted) return;
          const content = await (window as any).electronAPI.readFile(file.path);
          const safeContent = typeof content === 'string' ? content : '';
          const canonicalTitle = file.name.substring(0, file.name.length - 3);
          existingTitles.add(canonicalTitle);

          const foundLinks: string[] = [];

          // Match WikiLinks: [[Target]] or [[Target|Label]]
          const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
          let match;
          while ((match = wikiRegex.exec(safeContent)) !== null) {
            const target = match[1].trim();
            if (target) {
              const cleanTarget = target.endsWith('.md') ? target.substring(0, target.length - 3) : target;
              foundLinks.push(cleanTarget);
            }
          }

          // Match Markdown Links: [label](target.md)
          const mdLinkRegex = /\[[^\]]+\]\(([^)]+\.md)\)/g;
          while ((match = mdLinkRegex.exec(safeContent)) !== null) {
            const targetPath = match[1].trim();
            // Get filename without path and ext
            const parts = targetPath.split('/');
            const filename = parts[parts.length - 1];
            const cleanTarget = filename.substring(0, filename.length - 3);
            foundLinks.push(cleanTarget);
          }

          noteMap.set(canonicalTitle, { filePath: file.path, links: foundLinks });
        }

        if (!isMounted) return;

        // Phase 2: Create nodes & edges
        const tempNodesMap = new Map<string, LinkNode>();
        const tempEdges: LinkEdge[] = [];
        
        // Preserve coordinates from existing nodes to avoid resetting layout
        const prevNodesMap = new Map<string, LinkNode>();
        simRef.current.nodes.forEach(n => prevNodesMap.set(n.id, n));

        const getOrCreateNode = (title: string, exists: boolean, filePath?: string): LinkNode => {
          if (tempNodesMap.has(title)) {
            return tempNodesMap.get(title)!;
          }
          const prev = prevNodesMap.get(title);
          const n: LinkNode = {
            id: title,
            filePath,
            exists,
            x: prev ? prev.x : (Math.random() - 0.5) * 200 + 300,
            y: prev ? prev.y : (Math.random() - 0.5) * 200 + 250,
            vx: prev ? prev.vx : 0,
            vy: prev ? prev.vy : 0,
            degree: 0,
          };
          tempNodesMap.set(title, n);
          return n;
        };

        // Create nodes for existing files
        noteMap.forEach((info, title) => {
          getOrCreateNode(title, true, info.filePath);
        });

        // Add links
        noteMap.forEach((info, sourceTitle) => {
          info.links.forEach(targetTitle => {
            const isTargetReal = existingTitles.has(targetTitle);
            
            // Skip phantoms if configured
            if (!isTargetReal && !showPhantoms) return;

            getOrCreateNode(targetTitle, isTargetReal);

            // Avoid double edges or self loops
            if (sourceTitle !== targetTitle) {
              const edgeExists = tempEdges.some(
                e => (e.source === sourceTitle && e.target === targetTitle) ||
                     (e.source === targetTitle && e.target === sourceTitle)
              );
              if (!edgeExists) {
                tempEdges.push({ source: sourceTitle, target: targetTitle });
              }
            }
          });
        });

        // Calculate degrees
        const finalNodes = Array.from(tempNodesMap.values());
        tempEdges.forEach(edge => {
          const s = tempNodesMap.get(edge.source);
          const t = tempNodesMap.get(edge.target);
          if (s) s.degree++;
          if (t) t.degree++;
        });

        setNodes(finalNodes);
        setLinks(tempEdges);
        wakeSimulation();
      } catch (err) {
        console.error('[LinkGraph] Failed to build graph:', err);
      }
    };

    buildGraph();

    return () => {
      isMounted = false;
    };
  }, [projectPath, fileSavedEvent, showPhantoms]);

  // 2. Physics Simulation Loop (Verlet simulation)
  const tickRef = useRef<() => void>(null as any);
  useEffect(() => {
    const tick = () => {
      if (!isMountedRef.current) return;
      if (alpha.current < 0.01) {
        isSimulationRunning.current = false;
        return;
      }

      const simNodes = [...simRef.current.nodes];
      const simLinks = simRef.current.links;
      const currentAlpha = alpha.current;

      const nodeMap = new Map<string, LinkNode>();
      simNodes.forEach(n => nodeMap.set(n.id, n));

      // ── Coulomb Repulsion ────────────────────────────────────────────────
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const n1 = simNodes[i];
          const n2 = simNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;
          
          if (dist < 400) {
            const force = (repulsion / Math.max(15, dist)) * currentAlpha * 0.2;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            n1.vx -= fx;
            n1.vy -= fy;
            n2.vx += fx;
            n2.vy += fy;
          }
        }
      }

      // ── Hooke Link Attraction ────────────────────────────────────────────
      simLinks.forEach(link => {
        const n1 = nodeMap.get(link.source);
        const n2 = nodeMap.get(link.target);
        if (!n1 || !n2) return;

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;
        
        // Attraction force matches distance difference
        const k = 0.045 * currentAlpha;
        const force = k * (dist - linkDistance);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        n1.vx += fx;
        n1.vy += fy;
        n2.vx -= fx;
        n2.vy -= fy;
      });

      // ── Gravity (pull towards central coordinate) ──────────────────────
      const centerX = 300;
      const centerY = 250;
      simNodes.forEach(n => {
        const dx = centerX - n.x;
        const dy = centerY - n.y;
        n.vx += dx * gravity * currentAlpha;
        n.vy += dy * gravity * currentAlpha;
      });

      // ── Apply velocity & damping ──────────────────────────────────────────
      const damping = 0.82;
      simNodes.forEach(n => {
        if (n.id === dragNodeId.current) return; // Locked while dragging
        
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= damping;
        n.vy *= damping;
      });

      if (isMountedRef.current) {
        setNodes([...simNodes]);
      }

      // Decay temperature
      const isDragging = dragNodeId.current !== null;
      if (isDragging) {
        alpha.current = Math.max(alpha.current, 0.2); // Keep simulated hot while dragging
      } else {
        alpha.current *= 0.98;
      }

      if (isMountedRef.current && (alpha.current >= 0.01 || isDragging)) {
        requestRef.current = requestAnimationFrame(tick);
      } else {
        isSimulationRunning.current = false;
      }
    };

    tickRef.current = tick;
  }, [repulsion, gravity, linkDistance]);

  // Handle active hotkey actions from sidebars
  useEffect(() => {
    if (lastAction) {
      if (lastAction.id === 'linkGraph.zoomIn') {
        setZoom(prev => Math.min(3.0, prev * 1.15));
      } else if (lastAction.id === 'linkGraph.zoomOut') {
        setZoom(prev => Math.max(0.2, prev * 0.85));
      } else if (lastAction.id === 'linkGraph.recenter') {
        setPan({ x: 300, y: 250 });
        setZoom(1.0);
      }
    }
  }, [lastAction]);

  // Non-passive wheel event listener to allow preventDefault inside the SVG container
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoom(z => Math.max(0.2, Math.min(3.0, z * zoomFactor)));
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // 3. User SVG Pan/Zoom & Drag Handlers
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
      const node = simRef.current.nodes.find(n => n.id === dragNodeId.current);
      if (node && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        // Convert screen coordinates to zoomed/panned SVG spaces
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

  const handleNodeMouseDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dragNodeId.current = id;
    const node = simRef.current.nodes.find(n => n.id === id);
    if (node) {
      node.vx = 0;
      node.vy = 0;
    }
    wakeSimulation();
  };

  const handleNodeDoubleClick = (node: LinkNode) => {
    if (!node.exists || !node.filePath) {
      // If it doesn't exist, create it!
      const newPath = `${projectPath}/${node.id}.md`;
      const defaultContent = `---\ntags:\n  - ${node.id}\n---\n# ${node.id}\n\nStart writing here...\n`;
      (window as any).electronAPI.writeFile(newPath, defaultContent).then(() => {
        updateBloodKey(BC.events.fileSaved(newPath), Date.now());
        const editorId = state[BC.system.lastFocusedEditorId] || (state[BC.system.activeEditors] || [])[0] || 'editor-root';
        updateBloodKey(BC.events.openFile(editorId), newPath);
      });
      return;
    }

    const editorId = state[BC.system.lastFocusedEditorId] || (state[BC.system.activeEditors] || [])[0] || 'editor-root';
    updateBloodKey(BC.events.openFile(editorId), node.filePath);
  };

  // Determine if edge or node is highlighted
  const isHighlighted = (nodeId: string) => {
    if (!hoveredNodeId) return true;
    if (nodeId === hoveredNodeId) return true;
    // Check if connected
    return links.some(
      l => (l.source === hoveredNodeId && l.target === nodeId) ||
           (l.target === hoveredNodeId && l.source === nodeId)
    );
  };

  const isLinkHighlighted = (link: LinkEdge) => {
    if (!hoveredNodeId) return true;
    return link.source === hoveredNodeId || link.target === hoveredNodeId;
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
        color: 'var(--text-main, #e2e8f0)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Svg Canvas */}
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', cursor: isPanning.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleSVGMouseDown}
        onMouseMove={handleSVGMouseMove}
        onMouseUp={handleSVGMouseUp}
        onMouseLeave={handleSVGMouseUp}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          <g>
            {links.map((link, idx) => {
              const sNode = nodes.find(n => n.id === link.source);
              const tNode = nodes.find(n => n.id === link.target);
              if (!sNode || !tNode) return null;

              const active = isLinkHighlighted(link);

              return (
                <line
                  key={`edge_${idx}`}
                  x1={sNode.x}
                  y1={sNode.y}
                  x2={tNode.x}
                  y2={tNode.y}
                  stroke={active ? 'var(--accent-color, #ff453a)' : 'var(--border-color, rgba(255, 255, 255, 0.06))'}
                  strokeWidth={active ? 1.5 : 0.8}
                  opacity={hoveredNodeId && !active ? 0.15 : 1}
                  style={{ transition: 'stroke 0.25s, stroke-width 0.25s, opacity 0.25s' }}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const active = isHighlighted(node.id);
              const isHovered = node.id === hoveredNodeId;

              // Calculate radius based on degree
              const baseRadius = node.exists ? 6 : 4;
              const r = baseRadius + Math.min(6, node.degree * 0.8);

              // Colors
              let fill = 'var(--accent-color, #ff453a)'; // Real node = theme accent
              if (!node.exists) {
                fill = 'var(--error-color, #ff453a)'; // Phantom node = error color
              }

              return (
                <g key={`node_group_${node.id}`}>
                  {/* Outer highlight halo */}
                  {isHovered && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 4}
                      fill="rgba(59, 130, 246, 0.2)"
                      style={{ transition: 'all 0.15s' }}
                    />
                  )}

                  {/* Core node */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={fill}
                    opacity={node.exists ? (active ? 1 : 0.15) : (active ? 0.5 : 0.1)}
                    style={{
                      cursor: 'pointer',
                      stroke: node.exists ? 'var(--border-color, rgba(255, 255, 255, 0.15))' : 'var(--error-color, rgba(239, 68, 68, 0.2))',
                      strokeWidth: 1,
                      transition: 'opacity 0.25s, fill 0.2s',
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onDoubleClick={() => handleNodeDoubleClick(node)}
                  />

                  {/* Label */}
                  {showLabels && (isHovered || (node.degree >= 2 && active)) && (
                    <text
                      x={node.x}
                      y={node.y - r - 6}
                      textAnchor="middle"
                      fill={isHovered ? 'var(--accent-color, #ff453a)' : 'var(--text-main, #2b2b2f)'}
                      opacity={active ? 1 : 0.15}
                      style={{
                        fontSize: isHovered ? '11px' : '10px',
                        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        fontWeight: isHovered ? 600 : 500,
                        textShadow: '0 1.5px 3px var(--bg-main, #121214), 0 -1.5px 3px var(--bg-main, #121214), 1.5px 0 3px var(--bg-main, #121214), -1.5px 0 3px var(--bg-main, #121214)'
                      }}
                    >
                      {node.id}
                      {!node.exists && ' (非存在)'}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Hover Information / Quick Help Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          backgroundColor: 'var(--bg-panel, rgba(30, 30, 34, 0.75))',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '11px',
          pointerEvents: 'none',
          maxWidth: '240px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--accent-color, #ff453a)', marginBottom: '4px' }}>🕸️ Obsidian 双链图谱</div>
        <div style={{ color: 'var(--text-muted, #94a3b8)', lineHeight: '1.4' }}>
          • 拖拽背景：平移视角<br />
          • 滚轮缩放：聚焦至指针<br />
          • 双击节点：打开/创建对应笔记<br />
          • 节点颜色：实体为主色，<span style={{ color: 'var(--error-color, #ff453a)' }}>红色/幻影色</span>为虚构引用
        </div>
      </div>

      {/* Floating Control Panel */}
      <GraphControls
        repulsion={repulsion}
        setRepulsion={setRepulsion}
        gravity={gravity}
        setGravity={setGravity}
        linkDistance={linkDistance}
        setLinkDistance={setLinkDistance}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        showPhantoms={showPhantoms}
        setShowPhantoms={setShowPhantoms}
        wakeSimulation={wakeSimulation}
      />
    </div>
  );
}

// ── Control Panel Component ───────────────────────────────────────────────
function GraphControls({
  repulsion,
  setRepulsion,
  gravity,
  setGravity,
  linkDistance,
  setLinkDistance,
  showLabels,
  setShowLabels,
  showPhantoms,
  setShowPhantoms,
  wakeSimulation,
}: {
  repulsion: number;
  setRepulsion: (v: number) => void;
  gravity: number;
  setGravity: (v: number) => void;
  linkDistance: number;
  setLinkDistance: (v: number) => void;
  showLabels: boolean;
  setShowLabels: (b: boolean) => void;
  showPhantoms: boolean;
  setShowPhantoms: (b: boolean) => void;
  wakeSimulation: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12px',
        right: '12px',
        backgroundColor: 'var(--bg-panel, rgba(30, 30, 34, 0.85))',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '8px',
        padding: isOpen ? '16px' : '6px 12px',
        width: isOpen ? '250px' : 'auto',
        maxHeight: '380px',
        overflowY: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 50,
      }}
    >
      {!isOpen ? (
        <div
          onClick={() => setIsOpen(true)}
          style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          ⚙️ 调整图谱设置
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))', paddingBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>⚙️ 图谱物理参数</span>
            <span onClick={() => setIsOpen(false)} style={{ cursor: 'pointer', fontSize: '11px', opacity: 0.6, color: 'var(--text-muted)' }}>收起 ✕</span>
          </div>

          {/* Repulsion */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted, #94a3b8)' }}>
              <span>排斥力 (斥力强度)</span>
              <span>{repulsion}</span>
            </div>
            <input
              type="range"
              min="500"
              max="8000"
              step="100"
              value={repulsion}
              onChange={(e) => {
                setRepulsion(Number(e.target.value));
                wakeSimulation();
              }}
              style={{ width: '100%', accentColor: 'var(--accent-color)' }}
            />
          </div>

          {/* Gravity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted, #94a3b8)' }}>
              <span>重力 (向中心收缩力)</span>
              <span>{gravity.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min="0.002"
              max="0.08"
              step="0.002"
              value={gravity}
              onChange={(e) => {
                setGravity(Number(e.target.value));
                wakeSimulation();
              }}
              style={{ width: '100%', accentColor: 'var(--accent-color)' }}
            />
          </div>

          {/* Link Distance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted, #94a3b8)' }}>
              <span>连线拉力距离</span>
              <span>{linkDistance}px</span>
            </div>
            <input
              type="range"
              min="50"
              max="350"
              step="10"
              value={linkDistance}
              onChange={(e) => {
                setLinkDistance(Number(e.target.value));
                wakeSimulation();
              }}
              style={{ width: '100%', accentColor: 'var(--accent-color)' }}
            />
          </div>

          {/* Toggle Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.06))', paddingTop: '10px', marginTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => {
                  setShowLabels(e.target.checked);
                  wakeSimulation();
                }}
                style={{ accentColor: 'var(--accent-color)' }}
              />
              显示节点文本
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPhantoms}
                onChange={(e) => {
                  setShowPhantoms(e.target.checked);
                  wakeSimulation();
                }}
                style={{ accentColor: 'var(--accent-color)' }}
              />
              显示幻影节点 (非存在文件)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
