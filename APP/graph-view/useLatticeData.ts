import { useState, useEffect, useRef } from 'react';
import { Node, Link } from './types';
import { contractVirtualNodes } from './helpers';
import { BC } from '../../CORE/BloodChannels';
import { isUvProgressStderr } from '../utils';

interface UseLatticeDataProps {
  projectPath: string;
  resolvedTags: any;
  fileSavedEvent: number;
  graphMode: 'hierarchical' | 'contracted' | 'flat';
  virtualDetail: number;
  updateBloodKey: (key: string, value: any) => void;
  wakeSimulation: () => void;
}

export function useLatticeData({
  projectPath,
  resolvedTags,
  fileSavedEvent,
  graphMode,
  virtualDetail,
  updateBloodKey,
  wakeSimulation,
}: UseLatticeDataProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const simRef = useRef<{ nodes: Node[]; links: Link[] }>({ nodes: [], links: [] });
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const requestGeneration = ++requestGenerationRef.current;
    let disposed = false;
    const isStale = () => disposed || requestGeneration !== requestGenerationRef.current;

    if (!projectPath) {
      setNodes([]);
      setLinks([]);
      simRef.current = { nodes: [], links: [] };
      return;
    }

    // Zero detail is a hard "no virtual concepts" boundary. Clear the previous
    // virtual layer synchronously so a slow service call cannot leave stale
    // pills visible while the real-only graph is being recalculated.
    if (virtualDetail <= 0 || graphMode === 'flat') {
      const realNodes = simRef.current.nodes.filter((node) => !node.isVirtual);
      const realNodeIds = new Set(realNodes.map((node) => node.id));
      const realLinks = simRef.current.links.filter(
        (link) => realNodeIds.has(link.source) && realNodeIds.has(link.target),
      );
      simRef.current = { nodes: realNodes, links: realLinks };
      setNodes(realNodes);
      setLinks(realLinks);
    }

    const buildLatticeGraph = async () => {
      try {
        const files = await (window as any).electronAPI.listDir(projectPath);
        if (isStale()) return;
        const mdFiles = files.filter((f: any) => !f.isDir && f.name.endsWith('.md'));

        const currentResolvedTags = resolvedTags || {};
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
        if (isStale()) return;
        const showVirtual = graphMode !== 'flat' && virtualDetail > 0;
        const latticePayload = JSON.stringify({
          nodes: rawNodes,
          showVirtual,
          virtualDetail,
          maxVirtualNodes: 180,
        });
        const result = await (window as any).electronAPI.runScript(scriptPath, latticePayload, projectPath);
        if (isStale()) return;

        if (result.stderr && result.stderr.trim()) {
          // uv writes normal first-run progress (venv creation, package installs) to stderr.
          // Use shared filter to avoid false "脚本执行错误" toasts.
          const stderrTrimmed = result.stderr.trim();
          if (!isUvProgressStderr(stderrTrimmed)) {
            updateBloodKey(BC.events.scriptError('graphView'), { message: stderrTrimmed, ts: Date.now() });
          } else {
            console.log('[useLatticeData] uv setup progress (not an error):', stderrTrimmed.split('\n')[0]);
          }
        }

        let calculatedEdges: Link[] = [];
        try {
          const latticeResult = JSON.parse(result.stdout || '{"nodes":[],"edges":[]}');
          // lattice.py 返回 FCA 生成的虚节点（合并进 rawNodes 用于渲染）
          const returnedVirtualNodes: { id: string; tags: string[]; label: string; isVirtual: boolean }[] =
            latticeResult.nodes || [];
          const rawNodeIds = new Set(rawNodes.map((rn) => rn.id));
          returnedVirtualNodes.forEach((vn) => {
            if (!rawNodeIds.has(vn.id)) {
              rawNodes.push(vn);
              rawNodeIds.add(vn.id);
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

        const previousNodes = new Map(simRef.current.nodes.map((n) => [n.id, n]));
        const physicsNodes: Node[] = rawNodes.map((rn, i) => {
          const existing = previousNodes.get(rn.id);
          
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

        if (isStale()) return;
        simRef.current = { nodes: displayNodes, links: displayEdges };
        setNodes(displayNodes);
        setLinks(displayEdges);
        wakeSimulation();
      } catch (err) {
        if (isStale()) return;
        console.error('Lattice builder error:', err);
      }
    };

    void buildLatticeGraph();
    return () => { disposed = true; };
  }, [projectPath, resolvedTags, fileSavedEvent, graphMode, virtualDetail]);

  return {
    nodes,
    links,
    setNodes,
    setLinks,
    simRef,
  };
}
