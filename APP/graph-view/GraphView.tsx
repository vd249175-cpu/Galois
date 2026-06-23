import { useEffect, useState, useRef } from 'react';
import { Blood, useBloodChannel } from '../../CORE/Blood';
import { parseFrontmatterTags } from '../file-tree/FileTree';

interface Node {
  id: string;
  tags: string[];
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Link {
  source: string;
  target: string;
}

export const GraphViewComponent = {
  typeId: 'graphView',
  displayName: 'Lattice Graph',
  iconName: 'git-branch',
  component: GraphView,
};

function GraphView() {
  const projectPath = useBloodChannel(['project.path'], () =>
    Blood.getValue<string>('project.path', '')
  );

  const fileSavedEvent = useBloodChannel(['events.fileSaved.'], () =>
    Blood.getValue<Record<string, number>>('events.fileSaved.', {})
  );

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

  useEffect(() => {
    repulsionRef.current = repulsion;
  }, [repulsion]);

  useEffect(() => {
    arrowSizeRef.current = arrowSize;
  }, [arrowSize]);

  useEffect(() => {
    spacingRef.current = spacing;
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
  }, [projectPath, nodes]);

  // Physics Simulation
  const simRef = useRef<{ nodes: Node[]; links: Link[] }>({ nodes: [], links: [] });
  const dragNodeId = useRef<string | null>(null);
  const requestRef = useRef<number | null>(null);

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

        const rawNodes: { id: string; tags: string[]; label: string }[] = [];
        for (const file of mdFiles) {
          try {
            const rawContent = await (window as any).electronAPI.readFile(file.path);
            const tags = parseFrontmatterTags(rawContent);
            const noteTitle = file.name.substring(0, file.name.lastIndexOf('.md'));
            rawNodes.push({
              id: file.path,
              tags,
              label: noteTitle,
            });
          } catch (e) {
            console.error('Lattice parser file error:', file.path, e);
          }
        }

        if (rawNodes.length === 0) {
          simRef.current = { nodes: [], links: [] };
          setNodes([]);
          setLinks([]);
          return;
        }

        // Call the Python backend matrix inclusion algorithm via IPC
        const calculatedEdges: Link[] = await (window as any).electronAPI.calculateLattice(rawNodes, projectPath);

        // Convert raw nodes to physics-enabled nodes
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
          };
        });

        simRef.current = { nodes: physicsNodes, links: calculatedEdges };
        setNodes(physicsNodes);
        setLinks(calculatedEdges);
      } catch (err) {
        console.error('Lattice builder error:', err);
      }
    };

    buildLatticeGraph();
  }, [projectPath, fileSavedEvent]);

  // 2. Physics Simulation Loop - Free 2D Force-Directed Layout
  useEffect(() => {
    const tick = () => {
      const { nodes: simNodes, links: simLinks } = simRef.current;
      if (simNodes.length === 0) {
        requestRef.current = requestAnimationFrame(tick);
        return;
      }

      const repulsionStrength = repulsionRef.current;
      const attractionStrength = 0.05;
      const damping = 0.85;

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
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

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
          const k = attractionStrength * (dist - desiredDist);
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
        
        // General concepts (fewer tags) go to the center, specific concepts (more tags) go to the edge
        const tagCount = n.tags ? n.tags.length : 1;
        const targetR = Math.max(0, tagCount - 1) * spacingRef.current; // Dynamic spacing per level
        
        // Radial constraint force pulling/pushing the node towards targetR
        const radialStrength = 0.055;
        const radialForce = (targetR - d) * radialStrength;
        n.vx += (n.x / d) * radialForce;
        n.vy += (n.y / d) * radialForce;

        // Centering weak gravity to keep layout centered
        const centeringGravity = 0.005;
        n.vx -= n.x * centeringGravity;
        n.vy -= n.y * centeringGravity;

        n.vx *= damping;
        n.vy *= damping;

        n.x += n.vx;
        n.y += n.vy;
      });

      setNodes([...simNodes]);
      requestRef.current = requestAnimationFrame(tick);
    };

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
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    const targetEditorId = Blood.getValue<string | null>('system.lastFocusedEditorId', null)
      || Blood.getValue<string[]>('system.activeEditors', [])[0];

    if (targetEditorId) {
      Blood.updateKey(`events.openFile.${targetEditorId}`, nodeId);
    } else {
      Blood.updateKey('events.openFile.global', nodeId);
    }
  };

  const handleZoom = (factor: number) => {
    setZoom((prev) => Math.max(0.2, Math.min(3.0, prev * factor)));
  };

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
      {/* Zoom HUD */}
      <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 10 }}>
        <button className="area-btn" onClick={() => handleZoom(1.15)} title="Zoom In">＋</button>
        <button className="area-btn" onClick={() => handleZoom(0.85)} title="Zoom Out">－</button>
        <button className="area-btn" onClick={() => { setPan({ x: 300, y: 250 }); setZoom(1.0); }} title="Recenter">⟲</button>
      </div>

      {/* Floating Parameters Adjustment Panel (斥力和箭头可调 UI) */}
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
      </div>

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
            <path d="M 0 2 L 8 5 L 0 8 z" fill="var(--border-color)" />
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
                stroke={isRelated ? 'var(--accent-color)' : 'var(--border-color)'}
                strokeWidth={isRelated ? 1.8 : 1.1}
                strokeOpacity={hoveredNode && !isRelated ? 0.2 : 0.8}
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
                
                {/* Node Center Dot */}
                <circle
                  r={isHovered ? 7 : 5.5}
                  fill={isHovered ? 'var(--accent-color)' : 'var(--text-main)'}
                  stroke="var(--bg-main)"
                  strokeWidth="1.5"
                  style={{ transition: 'fill 0.15s, r 0.15s' }}
                />
                
                {/* Node Title Box Label */}
                <g transform="translate(0, 18)" style={{ pointerEvents: 'none' }}>
                  <text
                    textAnchor="middle"
                    fill={isHovered ? 'var(--accent-color)' : 'var(--text-main)'}
                    style={{
                      fontSize: '8.5px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-sans)',
                      userSelect: 'none',
                      textShadow: '0px 1px 2px var(--bg-main), 0px 1px 2px var(--bg-main)', // Enhance readability against lines
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
