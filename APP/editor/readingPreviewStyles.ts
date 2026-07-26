export const readingPreviewStyles = `
.preview-block-wrapper {
  position: relative;
  width: 100%;
  padding-left: 20px;
  margin-left: -20px;
  cursor: text;
  border-radius: 5px;
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
}
.preview-block-wrapper[data-dnote-block-selected="true"] {
  background: color-mix(in srgb, var(--accent-color, #7000ff) 14%, transparent);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--accent-color, #7000ff) 62%, transparent);
}
.preview-block-wrapper[data-dnote-block-editing="true"] {
  background: transparent;
}
.markdown-preview-container {
  font-size: var(--editor-font-size, 14px);
  line-height: var(--editor-line-height, 1.6);
  font-family: var(--editor-font-family, var(--font-sans));
}
.galois-math-inline {
  display: inline-block;
  max-width: 100%;
  vertical-align: middle;
}
.galois-math-display {
  display: block;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
}
.galois-math-display > .katex-display { margin: 0.45em 0; }
.preview-block-wrapper:active { cursor: grabbing; }
.preview-block-wrapper:hover .drag-handle { opacity: 0.5 !important; }
.drag-handle:hover {
  opacity: 1 !important;
  color: var(--accent-color, #7000ff) !important;
}
.drag-handle {
  user-select: none;
  -webkit-user-drag: element;
}
.wiki-link:hover { opacity: 0.8; }
.media-delete-btn,
.media-copy-btn {
  position: absolute;
  top: 16px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  z-index: 100;
}
.media-delete-btn {
  right: 16px;
  background: rgba(255, 59, 48, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 59, 48, 0.25);
  color: #ff3b30;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(0.9);
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s, color 0.2s, box-shadow 0.2s;
}
.media-copy-btn {
  right: 48px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-main) 88%, transparent);
  color: var(--text-muted);
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.preview-block-wrapper:hover .media-delete-btn,
.preview-block-wrapper:hover .media-copy-btn {
  opacity: 1;
  transform: scale(1);
}
.media-copy-btn:hover {
  color: var(--accent-color, #7000ff);
  border-color: var(--accent-color, #7000ff);
}
.media-delete-btn:hover {
  background: #ff3b30;
  color: #ffffff;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(255, 59, 48, 0.4);
}
.reading-table-shell:hover .reading-table-toolbar { opacity: 1 !important; }
.reading-table-toolbar button:hover {
  color: var(--accent-color, #7000ff) !important;
  border-color: var(--accent-color, #7000ff) !important;
  background: var(--highlight-color, rgba(112, 0, 255, 0.08)) !important;
}
.reading-buffer-row {
  min-height: 34px;
  margin: 4px 0;
  border-radius: 8px;
  border: 1px dashed transparent;
  display: flex;
  align-items: center;
  padding: 0 12px;
  opacity: 0.38;
  cursor: text;
  transition: border-color 0.14s ease, background-color 0.14s ease, opacity 0.14s ease;
}
.reading-image-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  margin: 10px 0;
}
.reading-image-row > .reading-media-image {
  flex: 1 1 220px;
  min-width: min(180px, 100%);
  max-height: min(62vh, 620px);
}
.reading-media-item {
  position: relative;
  border-radius: 9px;
  outline: 2px solid transparent;
  outline-offset: 2px;
}
.reading-media-video,
.reading-media-audio,
.reading-media-item:has(.inline-clip-player) {
  display: block;
  width: 100%;
}
.reading-media-item.is-selected {
  outline-color: var(--accent-color, #7000ff);
  background: color-mix(in srgb, var(--accent-color, #7000ff) 10%, transparent);
}
.reading-buffer-row:hover,
.reading-buffer-row.is-over {
  opacity: 1;
  border-color: var(--accent-color, #7000ff);
  background: rgba(112, 0, 255, 0.06);
}
`;
