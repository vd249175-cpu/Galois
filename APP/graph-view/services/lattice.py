# /// script
# dependencies = [
#   "numpy",
# ]
# ///

import sys
import json
import numpy as np
from itertools import combinations

def compute_lattice_edges(nodes):
    """
    给定节点列表（每个有 id, tags），用 numpy 计算子集包含关系并做传递归约。
    返回 edges 列表 [{ source, target }]
    """
    if not nodes:
        return []

    all_tags = set()
    for node in nodes:
        for t in node.get('tags', []):
            s = t.strip()
            if s:
                all_tags.add(s)

    vocab = sorted(list(all_tags))
    if not vocab:
        return []

    N = len(nodes)
    M = len(vocab)
    tag_to_idx = {tag: i for i, tag in enumerate(vocab)}

    X = np.zeros((N, M), dtype=int)
    for i, node in enumerate(nodes):
        for tag in node.get('tags', []):
            t_clean = tag.strip()
            if t_clean in tag_to_idx:
                X[i, tag_to_idx[t_clean]] = 1

    c = X.sum(axis=1)
    D = np.dot(X, X.T)
    c_col = c.reshape(-1, 1)
    c_row = c.reshape(1, -1)

    inclusion = (D == c_col)
    proper = (c_col < c_row) & (c_col > 0)
    A = inclusion & proper

    A_int = A.astype(int)
    A2 = np.dot(A_int, A_int)
    adjacency = A & (A2 == 0)

    sources, targets = np.where(adjacency)
    edges = []
    for s, t in zip(sources, targets):
        edges.append({
            "source": nodes[s]["id"],
            "target": nodes[t]["id"]
        })
    return edges


def compute_fca_virtual_nodes(real_nodes):
    """
    形式概念分析（FCA）：计算最少的多标签虚拟节点。

    算法：
    1. 对所有两两笔记组合，计算标签集合的交集（形式概念）
    2. 过滤：空集、已有对应真实节点的集合
    3. 去冗余：若 A ⊊ B 且 support(A) == support(B)，保留 B（更精确），丢弃 A
    4. 剩余即为最小虚节点集合
    """
    real_tag_sets = []
    for n in real_nodes:
        tags = frozenset(t.strip() for t in n.get('tags', []) if t.strip())
        real_tag_sets.append((n, tags))

    real_labels = {n['label'] for n, _ in real_tag_sets}
    real_frozensets = {ts for _, ts in real_tag_sets}

    # 候选：所有两两交集 → { frozenset → set of node ids }
    candidates = {}

    for (n1, ts1), (n2, ts2) in combinations(real_tag_sets, 2):
        intersection = ts1 & ts2
        if not intersection:
            continue
        # 交集已有对应真实节点 → 跳过
        if intersection in real_frozensets:
            continue
        # 单标签且已有同名笔记文件 → 跳过
        if len(intersection) == 1 and next(iter(intersection)) in real_labels:
            continue

        if intersection not in candidates:
            candidates[intersection] = set()
        candidates[intersection].add(n1['id'])
        candidates[intersection].add(n2['id'])

    if not candidates:
        return []

    # 去冗余：若 A ⊊ B 且 support(A) == support(B)，丢弃 A（B 更精确且覆盖相同笔记）
    all_keys = list(candidates.keys())
    redundant = set()
    for i, ki in enumerate(all_keys):
        for j, kj in enumerate(all_keys):
            if i == j:
                continue
            if ki < kj and candidates[ki] == candidates[kj]:
                redundant.add(ki)

    virtual_nodes = []
    for tag_set, _ in candidates.items():
        if tag_set in redundant:
            continue
        sorted_tags = sorted(tag_set)
        virtual_id = "virtual:" + "|".join(sorted_tags)
        virtual_label = "#" + "#".join(sorted_tags)
        virtual_nodes.append({
            "id": virtual_id,
            "tags": sorted_tags,
            "label": virtual_label,
            "isVirtual": True
        })

    return virtual_nodes


def main():
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"nodes": [], "edges": []}))
            return

        payload = json.loads(input_data)
        if not payload:
            print(json.dumps({"nodes": [], "edges": []}))
            return

        # payload 格式: { nodes: [...], showVirtual: bool }
        # 兼容旧格式（直接是数组）
        if isinstance(payload, list):
            real_nodes = payload
            show_virtual = False
        else:
            real_nodes = payload.get('nodes', [])
            show_virtual = payload.get('showVirtual', False)

        if not real_nodes:
            print(json.dumps({"nodes": [], "edges": []}))
            return

        # Step 1: 若开启虚节点，用 FCA 计算最小多标签虚节点
        virtual_nodes = []
        if show_virtual:
            virtual_nodes = compute_fca_virtual_nodes(real_nodes)

        all_nodes = real_nodes + virtual_nodes

        # Step 2: 计算子集包含边 + 传递归约
        edges = compute_lattice_edges(all_nodes)

        # Step 3: 输出（只返回新增虚节点，真实节点 GraphView 已持有）
        print(json.dumps({
            "nodes": virtual_nodes,
            "edges": edges
        }, ensure_ascii=False))

    except Exception as e:
        sys.stderr.write(f"Error in lattice calculation: {str(e)}\n")
        print(json.dumps({"nodes": [], "edges": []}))


if __name__ == "__main__":
    main()
