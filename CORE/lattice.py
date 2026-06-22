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

        # Step 1: Compute proper subset inclusion DAG matrix A
        # A[i, k] is True if Tags(i) is a proper subset of Tags(k) and Tags(i) is non-empty
        inclusion = (D == c_col)
        proper = (c_col < c_row) & (c_col > 0)
        A = inclusion & proper

        # Step 2: Compute transitive reduction of A to remove redundant edges.
        # Since A is transitively closed, any path of length >= 2 implies a path of length exactly 2.
        # A2[i, k] > 0 if there is some node j such that A[i, j] and A[j, k] are True.
        A_int = A.astype(int)
        A2 = np.dot(A_int, A_int)

        # Keep only edges in A where there is no path of length 2 (direct covering relations)
        adjacency = A & (A2 == 0)

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
