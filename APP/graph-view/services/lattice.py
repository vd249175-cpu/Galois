# /// script
# dependencies = []
# ///

import json
import math
import sys
from collections import Counter, defaultdict
from itertools import combinations


DEFAULT_MAX_VIRTUAL_NODES = 180
DEFAULT_MAX_PAIR_CHECKS = 120_000
DEFAULT_MAX_CANDIDATE_POOL = 900


def clean_tags(node):
    return sorted({str(t).strip() for t in node.get("tags", []) if str(t).strip()})


def build_masks(nodes):
    all_tags = sorted({tag for node in nodes for tag in clean_tags(node)})
    tag_to_idx = {tag: idx for idx, tag in enumerate(all_tags)}
    masks = []
    for node in nodes:
        mask = 0
        tags = clean_tags(node)
        for tag in tags:
            mask |= 1 << tag_to_idx[tag]
        masks.append(mask)
    return all_tags, masks


def mask_tags(mask, vocab):
    return [tag for idx, tag in enumerate(vocab) if mask & (1 << idx)]


def is_subset(mask_a, mask_b):
    return mask_a != 0 and (mask_a & mask_b) == mask_a


def support_ids(candidate_mask, real_masks, real_nodes):
    return {
        real_nodes[idx]["id"]
        for idx, real_mask in enumerate(real_masks)
        if is_subset(candidate_mask, real_mask)
    }


def score_candidate(candidate_mask, support, vocab, tag_doc_freq, real_count):
    tags = mask_tags(candidate_mask, vocab)
    tag_count = len(tags)
    support_count = len(support)
    if support_count < 2:
        return -1.0

    avg_freq = sum(tag_doc_freq[tag] for tag in tags) / max(tag_count, 1)
    generic_penalty = max(0.0, (avg_freq / max(real_count, 1)) - 0.62) * 8.0
    too_specific_penalty = 2.0 if support_count == 2 and tag_count >= 4 else 0.0
    bridge_value = support_count * math.log2(tag_count + 1)
    simplification_gain = max(0, support_count - 1) * max(0, tag_count - 1)
    return bridge_value + simplification_gain * 0.65 - generic_penalty - too_specific_penalty


def trim_redundant_candidates(candidates):
    """Drop broader concepts if a more specific concept covers the same real notes."""
    keys = list(candidates.keys())
    redundant = set()
    for i, mask_a in enumerate(keys):
        if mask_a in redundant:
            continue
        support_a = candidates[mask_a]["support"]
        for j, mask_b in enumerate(keys):
            if i == j or mask_b in redundant:
                continue
            if mask_a.bit_count() >= mask_b.bit_count():
                continue
            if (mask_a & mask_b) == mask_a and support_a == candidates[mask_b]["support"]:
                redundant.add(mask_a)
                break
    return {mask: data for mask, data in candidates.items() if mask not in redundant}


def merge_candidates_by_support(candidates, real_nodes, real_masks, real_frozensets, vocab):
    """Each support equivalence class must render as at most one closure node."""
    grouped = {}
    for data in candidates.values():
        support_key = frozenset(data["support"])
        if len(support_key) < 2:
            continue
        grouped.setdefault(support_key, data)

    merged = {}
    node_index_by_id = {node["id"]: idx for idx, node in enumerate(real_nodes)}
    for support_key in grouped:
        closure_mask = None
        for node_id in support_key:
            idx = node_index_by_id.get(node_id)
            if idx is None:
                continue
            closure_mask = real_masks[idx] if closure_mask is None else closure_mask & real_masks[idx]
        if not closure_mask:
            continue
        closure_tags = frozenset(mask_tags(closure_mask, vocab))
        if closure_tags in real_frozensets:
            continue
        merged[closure_mask] = {"support": set(support_key), "score": 0.0}
    return merged


def compute_virtual_nodes(real_nodes, vocab, real_masks, virtual_detail, max_virtual_nodes):
    """
    Build virtual concept nodes safely.

    Real note tags are never removed from the computation, but virtual concept
    nodes are merged by closure and filtered by the detail slider.
    """
    if not real_nodes or not vocab:
        return []

    detail = max(0.0, min(1.0, float(virtual_detail)))
    max_virtual_nodes = max(0, int(max_virtual_nodes))
    real_count = len(real_nodes)
    real_frozensets = {frozenset(clean_tags(n)) for n in real_nodes}
    tag_doc_freq = Counter(tag for node in real_nodes for tag in clean_tags(node))

    candidates = {}

    def add_candidate(mask):
        if mask == 0:
            return
        support = support_ids(mask, real_masks, real_nodes)
        if len(support) < 2:
            return
        closure_mask = None
        for idx, real_node in enumerate(real_nodes):
            if real_node["id"] in support:
                closure_mask = real_masks[idx] if closure_mask is None else closure_mask & real_masks[idx]
        if not closure_mask:
            return
        closure_tags = frozenset(mask_tags(closure_mask, vocab))
        if closure_tags in real_frozensets:
            return
        entry = candidates.setdefault(closure_mask, {"support": support, "score": 0.0})
        entry["support"] = support

    for tag_idx, tag in enumerate(vocab):
        if tag_doc_freq[tag] >= 2:
            add_candidate(1 << tag_idx)

    total_pairs = real_count * (real_count - 1) // 2
    stride = max(1, math.ceil(total_pairs / DEFAULT_MAX_PAIR_CHECKS)) if total_pairs else 1
    pair_index = 0

    for i, j in combinations(range(real_count), 2):
        pair_index += 1
        if pair_index % stride != 0:
            continue
        intersection = real_masks[i] & real_masks[j]
        if intersection == 0 or intersection.bit_count() < 2:
            continue
        add_candidate(intersection)

    if not candidates or max_virtual_nodes <= 0:
        return []

    candidates = merge_candidates_by_support(candidates, real_nodes, real_masks, real_frozensets, vocab)

    for mask, data in list(candidates.items()):
        data["score"] = score_candidate(mask, data["support"], vocab, tag_doc_freq, real_count)
        if data["score"] < 0:
            del candidates[mask]

    ranked_pool = sorted(
        candidates.items(),
        key=lambda item: (-item[1]["score"], -len(item[1]["support"]), -item[0].bit_count(), mask_tags(item[0], vocab)),
    )[:DEFAULT_MAX_CANDIDATE_POOL]
    candidates = trim_redundant_candidates(dict(ranked_pool))

    ranked_masks = sorted(
        candidates,
        key=lambda m: (-candidates[m]["score"], -len(candidates[m]["support"]), -m.bit_count(), mask_tags(m, vocab)),
    )
    core_count = min(len(ranked_masks), max(0, min(8, math.ceil(math.sqrt(real_count) / 2))))
    detail_count = math.ceil((len(ranked_masks) - core_count) * (detail ** 1.7))
    keep_count = min(max_virtual_nodes, core_count + detail_count)
    return make_virtual_nodes(ranked_masks[:keep_count], vocab)


def make_virtual_nodes(masks, vocab):
    nodes = []
    seen = set()
    for mask in masks:
        if mask in seen:
            continue
        seen.add(mask)
        tags = mask_tags(mask, vocab)
        if not tags:
            continue
        nodes.append({
            "id": "virtual:" + "|".join(tags),
            "tags": tags,
            "label": "#" + "#".join(tags),
            "isVirtual": True,
        })
    return nodes


def compute_lattice_edges(nodes, masks):
    if not nodes:
        return []

    tag_members = defaultdict(set)
    counts = [mask.bit_count() for mask in masks]
    for idx, mask in enumerate(masks):
        bit = 0
        value = mask
        while value:
            if value & 1:
                tag_members[bit].add(idx)
            value >>= 1
            bit += 1

    edges = []
    for source_idx, source_mask in enumerate(masks):
        if source_mask == 0:
            continue
        member_sets = [tag_members[bit] for bit in range(source_mask.bit_length()) if source_mask & (1 << bit)]
        if not member_sets:
            continue
        candidate_indices = set(min(member_sets, key=len))
        for member_set in member_sets:
            candidate_indices &= member_set

        candidates = [
            idx for idx in candidate_indices
            if idx != source_idx and counts[idx] > counts[source_idx]
        ]
        candidates.sort(key=lambda idx: (counts[idx], nodes[idx]["id"]))

        direct_supersets = []
        for target_idx in candidates:
            target_mask = masks[target_idx]
            if any(is_subset(selected_mask, target_mask) for selected_mask in direct_supersets):
                continue
            direct_supersets.append(target_mask)
            edges.append({
                "source": nodes[source_idx]["id"],
                "target": nodes[target_idx]["id"],
            })

    return edges


def main():
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"nodes": [], "edges": [], "meta": {}}))
            return

        payload = json.loads(input_data)
        if isinstance(payload, list):
            real_nodes = payload
            show_virtual = False
            virtual_detail = 0.0
            max_virtual_nodes = DEFAULT_MAX_VIRTUAL_NODES
        else:
            real_nodes = payload.get("nodes", [])
            show_virtual = bool(payload.get("showVirtual", False))
            virtual_detail = float(payload.get("virtualDetail", 1.0))
            max_virtual_nodes = int(payload.get("maxVirtualNodes", DEFAULT_MAX_VIRTUAL_NODES))

        if not real_nodes:
            print(json.dumps({"nodes": [], "edges": [], "meta": {}}))
            return

        vocab, real_masks = build_masks(real_nodes)
        virtual_nodes = []
        if show_virtual:
            virtual_nodes = compute_virtual_nodes(real_nodes, vocab, real_masks, virtual_detail, max_virtual_nodes)

        all_nodes = real_nodes + virtual_nodes
        _, all_masks = build_masks(all_nodes)
        edges = compute_lattice_edges(all_nodes, all_masks)
        print(json.dumps({
            "nodes": virtual_nodes,
            "edges": edges,
            "meta": {
                "tagCount": len(vocab),
                "realNodeCount": len(real_nodes),
                "virtualNodeCount": len(virtual_nodes),
                "virtualDetail": virtual_detail,
                "maxVirtualNodes": max_virtual_nodes,
            },
        }, ensure_ascii=False))

    except Exception as e:
        sys.stderr.write(f"Error in lattice calculation: {str(e)}\n")
        print(json.dumps({"nodes": [], "edges": [], "meta": {}}))


if __name__ == "__main__":
    main()
