import React from 'react';

interface ReadingMediaDeleteButtonProps {
  lineIndex: number;
  markdown: string;
  onDelete?: (lineIndex: number, markdown: string, occurrence: number) => void;
}

export function ReadingMediaDeleteButton({
  lineIndex,
  markdown,
  onDelete,
}: ReadingMediaDeleteButtonProps) {
  const removeToken = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0 || !onDelete) return;
    const media = event.currentTarget.closest<HTMLElement>('[data-dnote-media-token]');
    const contentRoot = media?.closest<HTMLElement>('[data-dnote-block-content]');
    const peers = Array.from(contentRoot?.querySelectorAll<HTMLElement>('[data-dnote-media-token]') || []);
    const peerIndex = media ? peers.indexOf(media) : -1;
    const occurrence = peers.slice(0, Math.max(peerIndex, 0))
      .filter((peer) => peer.dataset.dnoteMediaToken === markdown).length;
    onDelete(lineIndex, markdown, occurrence);
  };

  return (
    <button
      type="button"
      draggable={false}
      className="media-token-delete-btn"
      onPointerDown={removeToken}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      title="从本行移除此媒体引用"
      aria-label="从本行移除此媒体引用"
    >
      ×
    </button>
  );
}
