import { useEffect, useRef } from 'react';
import { Node, Link } from './types';

interface UsePhysicsSimulationProps {
  simRef: React.MutableRefObject<{ nodes: Node[]; links: Link[] }>;
  dragNodeId: React.MutableRefObject<string | null>;
  repulsionRef: React.MutableRefObject<number>;
  spacingRef: React.MutableRefObject<number>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}

export function usePhysicsSimulation({
  simRef,
  dragNodeId,
  repulsionRef,
  spacingRef,
  setNodes,
}: UsePhysicsSimulationProps) {
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

  // Physics Simulation Loop - Free 2D Force-Directed Layout
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

      // Repulsion (Push nodes apart)
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

      // Attraction (Pull connected Concept Nodes together)
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

      // Update positions, applying center gravity and radial hierarchy force
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

  return {
    alpha,
    isSimulationRunning,
    wakeSimulation,
  };
}
