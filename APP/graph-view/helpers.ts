import { Node, Link } from './types';

// Bypasses virtual nodes by connecting all of their neighbors to each other in a hierarchical direction
export function contractVirtualNodes(nodes: Node[], links: Link[]): { nodes: Node[], links: Link[] } {
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

export function getPillWidth(label: string, fs: number): number {
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

export function getDownstreamFocusPath(
  focusNodeId: string | null,
  links: Link[],
): { visibleNodeIds: Set<string>; highlightedLinkIds: Set<string> } {
  const visibleNodeIds = new Set<string>();
  const highlightedLinkIds = new Set<string>();
  if (!focusNodeId) return { visibleNodeIds, highlightedLinkIds };

  const outgoing = new Map<string, Link[]>();
  links.forEach((link) => {
    const bucket = outgoing.get(link.source) || [];
    bucket.push(link);
    outgoing.set(link.source, bucket);
  });

  visibleNodeIds.add(focusNodeId);
  const queue = [focusNodeId];
  while (queue.length > 0) {
    const source = queue.shift()!;
    for (const link of outgoing.get(source) || []) {
      highlightedLinkIds.add(`${link.source}\u0000${link.target}`);
      if (visibleNodeIds.has(link.target)) continue;
      visibleNodeIds.add(link.target);
      queue.push(link.target);
    }
  }

  // Keep one direct parent layer as context while the complete child chain is
  // shown through the deepest reachable level.
  links.forEach((link) => {
    if (link.target !== focusNodeId) return;
    visibleNodeIds.add(link.source);
    highlightedLinkIds.add(`${link.source}\u0000${link.target}`);
  });

  return { visibleNodeIds, highlightedLinkIds };
}
