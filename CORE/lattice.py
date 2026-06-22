# /// script
# dependencies = [
#   "numpy",
# ]
# ///

import sys
import json
import numpy as np

def main():
    try:
        # Read JSON list of nodes from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps([]))
            return
            
        nodes = json.loads(input_data)
        if not nodes:
            print(json.dumps([]))
            return

        # Build unique tags vocabulary
        all_tags = set()
        for node in nodes:
            # Normalize tags (strip # and spaces)
            tags = [t.strip() for t in node.get('tags', []) if t.strip()]
            all_tags.update(tags)
            
        vocab = sorted(list(all_tags))
        
        if not vocab:
            # No tags, no connections
            print(json.dumps([]))
            return

        N = len(nodes)
        M = len(vocab)
        tag_to_idx = {tag: i for i, tag in enumerate(vocab)}

        # Construct binary matrix X of shape (N, M)
        X = np.zeros((N, M), dtype=int)
        for i, node in enumerate(nodes):
            for tag in node.get('tags', []):
                t_clean = tag.strip()
                if t_clean in tag_to_idx:
                    X[i, tag_to_idx[t_clean]] = 1

        # Calculate tag counts for each node (row sums)
        c = X.sum(axis=1)  # shape: (N,)

        # Compute dot product matrix D (size of intersection between subsets)
        D = np.dot(X, X.T)  # shape: (N, N)

        # Broadcast c to compare all pairs
        c_col = c.reshape(-1, 1)  # shape: (N, 1) - c_col[i] is size of node i
        c_row = c.reshape(1, -1)  # shape: (1, N) - c_row[k] is size of node k

        # Condition 1: Tags(i) is subset of Tags(k) -> size of intersection equals size of node i
        inclusion = (D == c_col)

        # Condition 2: Proper subset -> size of node i is strictly less than size of node k, and node i must have at least one tag
        proper = (c_col < c_row) & (c_col > 0)

        # Boolean matrix of derived lattice edges
        adjacency = inclusion & proper

        # Extract source and target indices where True
        sources, targets = np.where(adjacency)

        edges = []
        for s, t in zip(sources, targets):
            edges.append({
                "source": nodes[s]["id"],
                "target": nodes[t]["id"]
            })

        print(json.dumps(edges, indent=2, ensure_ascii=False))

    except Exception as e:
        # Return error message as standard output for debugging
        sys.stderr.write(f"Error in lattice calculation: {str(e)}\n")
        print(json.dumps([]))

if __name__ == "__main__":
    main()
