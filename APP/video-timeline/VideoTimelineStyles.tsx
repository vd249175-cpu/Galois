export function VideoTimelineStyles() {
  return (
<style dangerouslySetInnerHTML={{ __html: `
  .dropzone {
    border: 2px dashed rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 20px;
    flex: 1;
    background: rgba(255, 255, 255, 0.02);
    backdrop-filter: blur(8px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
  }
  .dropzone:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--accent-color, #7000ff);
    box-shadow: 0 0 20px rgba(112, 0, 255, 0.15);
  }
  .ctrl-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.9);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: calc(var(--video-timeline-font-size, 11px) + 1px);
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s;
  }
  .ctrl-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.34);
    color: #fff;
  }
  .ctrl-btn:active {
    transform: translateY(1px);
  }
  .ctrl-btn.active {
    background: #2f80c9;
    color: #fff;
    border-color: #75baff;
  }
  .ctrl-btn:disabled {
    color: rgba(255, 255, 255, 0.42);
    background: rgba(255, 255, 255, 0.035);
    border-color: rgba(255, 255, 255, 0.09);
    cursor: not-allowed;
  }
  .frame-reference-btn {
    margin-left: 4px;
    padding: 3px 8px;
    border-color: #3f7fae;
    background: rgba(48, 116, 166, 0.18);
    color: #b9dcf5;
  }
  .frame-reference-btn:hover:not(:disabled) {
    border-color: #68a9d8;
    background: rgba(58, 133, 187, 0.28);
    color: #e4f4ff;
  }
  .segment-block {
    position: absolute;
    top: 0px;
    bottom: 0px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px 8px;
    font-size: var(--video-timeline-font-size, 11px);
    color: white;
    cursor: grab;
    transition: border-color 0.2s, background-color 0.2s;
    box-shadow: inset 0 0 6px rgba(0,0,0,0.3);
    overflow: hidden;
  }
  .segment-block:hover {
    background: rgba(255, 255, 255, 0.03) !important;
  }
  .segment-block.selected {
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.2), inset 0 0 6px rgba(0,0,0,0.3);
  }
  .segment-delete-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    cursor: pointer;
    font-size: calc(var(--video-timeline-font-size, 11px) - 1px);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .segment-block:hover .segment-delete-btn {
    opacity: 1;
  }
  .segment-delete-btn:hover {
    background: #ff3b30;
  }
  .timeline-container {
    position: relative;
    background: #121212;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin: 0;
    overflow: hidden;
  }
  .timeline-scroll-container {
    position: relative;
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .timeline-scroll-container::-webkit-scrollbar {
    height: 6px;
  }
  .timeline-scroll-container::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.02);
  }
  .timeline-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.15);
    border-radius: 3px;
  }
  .settings-input {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    color: white;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: calc(var(--video-timeline-font-size, 11px) + 1px);
    width: 48px;
    text-align: center;
  }
  .settings-input:focus {
    border-color: var(--accent-color, #7000ff);
    outline: none;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
` }} />
  );
}

