export interface FileTreeSearchSyncDecision {
  nextLinkedQuery: string;
  adoptLinkedQuery: string | null;
  publishLocalQuery: string | null;
}

export function decideFileTreeSearchSync(
  previousLinkedQuery: string,
  linkedQuery: string,
  localQuery: string,
): FileTreeSearchSyncDecision {
  if (previousLinkedQuery !== linkedQuery) {
    return {
      nextLinkedQuery: linkedQuery,
      adoptLinkedQuery: localQuery === linkedQuery ? null : linkedQuery,
      publishLocalQuery: null,
    };
  }

  return {
    nextLinkedQuery: linkedQuery,
    adoptLinkedQuery: null,
    publishLocalQuery: localQuery === linkedQuery ? null : localQuery,
  };
}
