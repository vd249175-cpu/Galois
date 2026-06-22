import { useEffect, useState, useRef } from 'react';
import { Blood, useBloodChannel } from '../CORE/Blood';

interface Node {
  id: string;
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
  displayName: 'Graph View',
  iconName: 'git-branch',
  component: GraphView,
};

function GraphView() {
  const projectPath = useBloodChannel(['project.path'], () =>
    Blood.getValue<string>('project.path', '')
  );
  
  // Track open file events to refresh graph when editing/saving notes
  const fileSavedEvent = useBloodChannel(['events.fileSaved.'], () =>
    Blood.getValue<Record<string, number>>('events.fileSaved.', {})
  );

  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // SVG Pan and Zoom states
  const [pan, setPan] = useState({ x: 300, y: 300 });
  const [zoom, setZoom] = useState(1.0);
  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });

  // Physics Simulation reference
  const simRef = useRef<{ nodes: Node[]; links: Link[] }>({ nodes: [], links: [] });
  const dragNodeId = useRef<string | null>(null);
  const requestRef = useRef<number | null>(null);

  // 1. Scan directory and parse links in Markdown files
  useEffect(() => {
    if (!projectPath) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const buildGraph = async () => {
      try {
        const files = await (window as any).electronAPI.listDir(projectPath);
        const mdFiles = files.filter((f: any) => !f.isDir && f.name.endsWith('.md'));

        const parsedNodes: Node[] = [];
        const parsedLinks: Link[] = [];

        // Track index for initial grid layout positions
        mdFiles.forEach((file: any, i: number) => {
          const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.md'));
          
          // Use existing position if already active to prevent snapping
          const existing = simRef.current.nodes.find((n) => n.id === file.path);
          
          parsedNodes.push({
            id: file.path,
            label: nameWithoutExt,
            x: existing ? existing.x : Math.cos(i) * 120 + (Math.random() - 0.5) * 40,
            y: existing ? existing.y : Math.sin(i) * 120 + (Math.random() - 0.5) * 40,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
          });
        });

        // Parse content to build links
        for (const file of mdFiles) {
          try {
            const content = await (window as any).electronAPI.readFile(file.path);
            
            // Extract wikilinks [[Target Note]]
            const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
            let match;
            while ((match = wikiRegex.exec(content)) !== null) {
              const targetName = match[1].trim();
              const targetFile = mdFiles.find(
                (f: any) => f.name.toLowerCase() === `${targetName.toLowerCase()}.md`
              );
              if (targetFile && targetFile.path !== file.path) {
                // Prevent duplicate links
                const exists = parsedLinks.some(
                  (l) =>
                    (l.source === file.path && l.target === targetFile.path) ||
                    (l.source === targetFile.path && l.target === file.path)
                );
                if (!exists) {
                  parsedLinks.push({ source: file.path, target: targetFile.path });
                }
              }
            }

            // Extract standard markdown links [label](Target%20Note.md)
            const mdLinkRegex = /\[[^\]]+\]\(([^)]+\.md)\)/g;
            while ((match = mdLinkRegex.exec(content)) !== null) {
              const decodedPath = decodeURIComponent(match[1]);
              const targetFile = mdFiles.find(
                (f: any) =>
                  f.name.toLowerCase() === decodedPath.toLowerCase() ||
                  f.path.toLowerCase().endsWith(decodedPath.toLowerCase())
              );
              if (targetFile && targetFile.path !== file.path) {
                const exists = parsedLinks.some(
                  (l) =>
                    (l.source === file.path && l.target === targetFile.path) ||
                    (l.source === targetFile.path && l.target === file.path)
                );
                if (!exists) {
                  parsedLinks.push({ source: file.path, target: targetFile.path });
                }
              }
            }
          } catch (e) {
            console.error('Failed to read file for graph parsing:', file.path, e);
          }
        }

        simRef.current = { nodes: parsedNodes, links: parsedLinks };
        setNodes(parsedNodes);
        setLinks(parsedLinks);
      } catch (err) {
        console.error('Error scanning folder for graph view:', err);
      }
    };

    buildGraph();
  }, [projectPath, fileSavedEvent]);

  // 2. Physics Simulation Loop (Electrostatic Repulsion + Spring Attraction + Center Gravity)
  useEffect(() => {
    const tick = () => {
      const { nodes: simNodes, links: simLinks } = simRef.current;
      if (simNodes.length === 0) {
        requestRef.current = requestAnimationFrame(tick);
        return;
      }

      const repulsionStrength = 1200;
      const attractionStrength = 0.08;
      const centerGravity = 0.02;
      const damping = 0.85;

      // 2a. Repulsion (All nodes repel each other)
      for (let i = 0; i < simNodes.length; i++) {
        const n1 = simNodes[i];
        for (let j = i + 1; j < simNodes.length; j++) {
          const n2 = simNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);

          if (dist < 350) {
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

      // 2b. Attraction (Linked nodes pull together)
      simLinks.forEach((link) => {
        const sourceNode = simNodes.find((n) => n.id === link.source);
        const targetNode = simNodes.find((n) => n.id === link.target);

        if (sourceNode && targetNode) {
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = 90;
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

      // 2c. Gravity towards center (0,0) and update positions
      simNodes.forEach((n) => {
        if (n.id === dragNodeId.current) return;

        n.vx -= n.x * centerGravity;
        n.vy -= n.y * centerGravity;

        n.vx *= damping;
        n.vy *= damping;

        n.x += n.vx;
        n.y += n.vy;
      });

      // Force refresh React state
      setNodes([...simNodes]);
      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // 3. Mouse Drag & Pan Handlers
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
      // Find drag node and update its position directly
      const node = simRef.current.nodes.find((n) => n.id === dragNodeId.current);
      if (node) {
        // Convert screen coordinates to SVG coordinates
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
        <div style={{ fontSize: '13px', fontWeight: 600 }}>No Project Opened</div>
        <div style={{ fontSize: '11px', marginTop: '4px' }}>Please open a notebook folder in the Sidebar to view note relationship graph.</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Zoom HUD Panel */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          display: 'flex',
          gap: '6px',
          zIndex: 10,
        }}
      >
        <button className="area-btn" onClick={() => handleZoom(1.15)} title="Zoom In">＋</button>
        <button className="area-btn" onClick={() => handleZoom(0.85)} title="Zoom Out">－</button>
        <button className="area-btn" onClick={() => { setPan({ x: 300, y: 300 }); setZoom(1.0); }} title="Recenter">⟲</button>
      </div>

      <svg
        width="100%"
        height="100%"
        onMouseDown={handleSVGMouseDown}
        onMouseMove={handleSVGMouseMove}
        onMouseUp={handleSVGMouseUp}
        style={{ cursor: isPanning.current ? 'grabbing' : 'grab', backgroundColor: 'transparent' }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Render links / lines */}
          {links.map((link, idx) => {
            const source = nodes.find((n) => n.id === link.source);
            const target = nodes.find((n) => n.id === link.target);
            if (!source || !target) return null;

            const isRelated = hoveredNode === link.source || hoveredNode === link.target;
            return (
              <line
                key={`link-${idx}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={isRelated ? 'var(--accent-color)' : 'var(--border-color)'}
                strokeWidth={isRelated ? 1.5 : 1}
                strokeOpacity={hoveredNode && !isRelated ? 0.25 : 0.7}
                style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
              />
            );
          })}

          {/* Render nodes / dots */}
          {nodes.map((node) => {
            const isHovered = hoveredNode === node.id;
            const isDimmed = hoveredNode !== null && !isHovered && 
              !links.some((l) => (l.source === node.id && l.target === hoveredNode) || (l.target === node.id && l.source === hoveredNode));

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => handleSVGMouseUp() || handleNodeMouseDown(node.id, e)}
                onDoubleClick={() => handleNodeDoubleClick(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer', opacity: isDimmed ? 0.3 : 1.0, transition: 'opacity 0.2s' }}
              >
                {/* Node outer glow on hover */}
                {isHovered && (
                  <circle
                    r="12"
                    fill="var(--accent-color)"
                    opacity="0.18"
                    style={{ filter: 'blur(1px)' }}
                  />
                )}
                {/* Node center point */}
                <circle
                  r={isHovered ? 6 : 4.5}
                  fill={isHovered ? 'var(--accent-color)' : 'var(--text-muted)'}
                  stroke="var(--bg-main)"
                  strokeWidth="1.5"
                  style={{ transition: 'fill 0.15s, r 0.15s' }}
                />
                {/* Node Title text label */}
                <text
                  y="15"
                  textAnchor="middle"
                  fill={isHovered ? 'var(--accent-color)' : 'var(--text-main)'}
                  style={{
                    fontSize: isHovered ? '10px' : '9px',
                    fontWeight: isHovered ? '600' : '400',
                    fontFamily: 'var(--font-sans)',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    textShadow: '0px 1px 2px rgba(255, 255, 255, 0.8)',
                    transition: 'font-size 0.15s, font-weight 0.15s',
                  }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
