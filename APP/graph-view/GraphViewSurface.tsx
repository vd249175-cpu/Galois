import { GraphControls } from './GraphControls';
import { PaletteManagerModal } from './PaletteManagerModal';
import { SelectedNodeDrawer } from './SelectedNodeDrawer';
import { getPillWidth } from './helpers';

export function GraphViewSurface(props: any) {
  const {
    activePaletteName, arrowSize, getLevelColor, graphMode, graphNodeBaseFontSize,
    handleNodeActivate, handleNodeMouseDown, handleSVGMouseDown, handleSVGMouseMove,
    handleSVGMouseUp, hoveredNode, isPanning, isPaletteEditorOpen, links, neighborById,
    nodeById, nodes, palettes, pan, projectPath, repulsion, searchFocus, selectedNodeId,
    setActivePaletteName, setArrowSize, setGraphMode, setHoveredNode, setIsPaletteEditorOpen,
    setPalettes, setPan, setRepulsion, setSelectedNodeId, setSpacing, setVirtualDetail,
    spacing, svgRef, virtualDetail, zoom, matchesSearchFocus,
  } = props;
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
          {(palettes[activePaletteName] || palettes.Tahoe || ['#4F46E5']).map((color: string, pIdx: number) => (
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
          {links.map((link: any, idx: number) => {
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
          {nodes.map((node: any) => {
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
                        <title>{(node.tags || []).map((t: string) => '#' + t).join(' ')}</title>
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
          handleNodeActivate={handleNodeActivate}
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
