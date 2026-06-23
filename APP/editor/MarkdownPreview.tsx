import React from 'react';
import { ReactiveExpression } from './ReactiveExpression';
import { parseMarkdownBody } from '../utils';

interface MarkdownPreviewProps {
  content: string;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  handleLinkClick: (targetNodeText: string) => void;
  isPreviewMode: boolean;
  hoveredLineIndex: number | null;
  setHoveredLineIndex: (idx: number | null) => void;
  handleLineDrop: (e: React.DragEvent, lineIdx: number) => void;
}

export function MarkdownPreview({
  content,
  areaId,
  projectPath,
  state,
  updateBloodKey,
  handleLinkClick,
  isPreviewMode,
  hoveredLineIndex,
  setHoveredLineIndex,
  handleLineDrop,
}: MarkdownPreviewProps) {
  const getLineDragProps = (lineIdx: number) => {
    if (!isPreviewMode) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
          setHoveredLineIndex(lineIdx);
        }
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setHoveredLineIndex((prev) => (prev === lineIdx ? null : prev));
      },
      onDrop: (e: React.DragEvent) => {
        handleLineDrop(e, lineIdx);
      }
    };
  };

  const getLineStyle = (lineIdx: number, baseStyle: React.CSSProperties = {}): React.CSSProperties => {
    if (isPreviewMode && hoveredLineIndex === lineIdx) {
      return {
        ...baseStyle,
        backgroundColor: 'var(--highlight-color)',
        boxShadow: '0 0 0 2px var(--accent-color)',
        borderRadius: '6px',
        transition: 'all 0.15s ease',
        padding: '4px 8px',
        margin: '6px 0',
      };
    }
    return baseStyle;
  };

  const parseMarkdown = (md: string) => {
    const body = parseMarkdownBody(md);
    const lines = body.split('\n');
    return lines.map((line, idx) => {
      let content = line;
      if (content.startsWith('# ')) {
        return (
          <h1
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: '18px 0 10px 0', fontSize: '20px', fontWeight: '700' })}
          >
            {renderInline(content.substring(2))}
          </h1>
        );
      }
      if (content.startsWith('## ')) {
        return (
          <h2
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px', margin: '16px 0 8px 0', fontSize: '16px', fontWeight: '600' })}
          >
            {renderInline(content.substring(3))}
          </h2>
        );
      }
      if (content.startsWith('### ')) {
        return (
          <h3
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { margin: '14px 0 6px 0', fontSize: '14px', fontWeight: '600' })}
          >
            {renderInline(content.substring(4))}
          </h3>
        );
      }
      if (content.startsWith('- [ ] ')) {
        return (
          <div
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0' })}
          >
            <input type="checkbox" disabled checked={false} />
            <span>{renderInline(content.substring(6))}</span>
          </div>
        );
      }
      if (content.startsWith('- [x] ')) {
        return (
          <div
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0', opacity: 0.55 })}
          >
            <input type="checkbox" disabled checked={true} />
            <span style={{ textDecoration: 'line-through' }}>{renderInline(content.substring(6))}</span>
          </div>
        );
      }
      if (content.startsWith('- ')) {
        return (
          <li
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { marginLeft: '16px', margin: '4px 0', fontSize: '13px' })}
          >
            {renderInline(content.substring(2))}
          </li>
        );
      }
      if (content.startsWith('> ')) {
        return (
          <blockquote
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { borderLeft: '3px solid var(--accent-color)', paddingLeft: '12px', color: 'var(--text-muted)', margin: '10px 0', fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.01)', padding: '6px 12px', borderRadius: '0 4px 4px 0' })}
          >
            {renderInline(content.substring(2))}
          </blockquote>
        );
      }
      if (content.trim() === '') {
        return (
          <div
            key={idx}
            {...getLineDragProps(idx)}
            style={getLineStyle(idx, { height: '14px', margin: '4px 0' })}
          />
        );
      }
      return (
        <p
          key={idx}
          {...getLineDragProps(idx)}
          style={getLineStyle(idx, { margin: '6px 0', lineHeight: '1.6', fontSize: '13px' })}
        >
          {renderInline(content)}
        </p>
      );
    });
  };

  const renderInline = (text: string) => {
    let parts: React.ReactNode[] = [text];

    // 0. Reactive template bindings {{ ... }}
    parts = splitByRegex(parts, /\{\{([\s\S]+?)\}\}/g, (match, idx) => {
      const rawExpression = match[1];
      const stableKey = `reactive_${rawExpression.replace(/\s+/g, '_')}_${idx}`;
      return (
        <ReactiveExpression
          key={stableKey}
          rawExpression={rawExpression}
          areaId={areaId}
          projectPath={projectPath}
          state={state}
          updateBloodKey={updateBloodKey}
        />
      );
    });

    // 1. WikiLinks [[Note Name]]
    parts = splitByRegex(parts, /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, idx) => {
      const target = match[1].trim();
      const label = match[2] ? match[2].trim() : target;
      const stableKey = `wiki_${target}_${idx}`;
      return (
        <span
          key={stableKey}
          onClick={() => handleLinkClick(target)}
          className="wiki-link"
          style={{
            color: 'var(--accent-color)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      );
    });

    // 2. Standard Markdown Images / Media tags
    parts = splitByRegex(parts, /!\[([^\]]*)\]\(([^)]+)\)/g, (match, idx) => {
      const alt = match[1];
      const url = match[2];
      
      let finalSrc = url;
      const isWeb = url.startsWith('http://') || url.startsWith('https://');
      
      if (!isWeb) {
        let cleanPath = url;
        if (url.startsWith('file://')) {
          cleanPath = url.replace('file://', '');
        }
        const isRelative = !cleanPath.startsWith('/');
        const absolutePath = isRelative ? `${projectPath}/${cleanPath}` : cleanPath;
        finalSrc = `dnote-file://${absolutePath}`;
      }

      const ext = url.split('.').pop()?.toLowerCase() || '';
      const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
      const isAudio = ['mp3', 'wav', 'aac', 'm4a'].includes(ext);

      if (isVideo) {
        return (
          <video
            key={`video_${url}_${idx}`}
            src={finalSrc}
            controls
            style={{ maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--border-color)', margin: '8px 0', display: 'block' }}
          />
        );
      }
      if (isAudio) {
        return (
          <audio
            key={`audio_${url}_${idx}`}
            src={finalSrc}
            controls
            style={{ width: '100%', margin: '8px 0', display: 'block' }}
          />
        );
      }

      return (
        <img
          key={`img_${url}_${idx}`}
          src={finalSrc}
          alt={alt}
          style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'block', margin: '10px 0' }}
        />
      );
    });

    // 3. Document links
    parts = splitByRegex(parts, /\[([^\]]+)\]\(([^)]+)\)/g, (match, idx) => {
      const label = match[1];
      const url = match[2];
      const isMd = url.endsWith('.md');
      const stableKey = `link_${url}_${idx}`;
      return (
        <span
          key={stableKey}
          onClick={() => {
            if (isMd) {
              handleLinkClick(url.replace('.md', ''));
            } else {
              window.open(url, '_blank');
            }
          }}
          style={{ color: 'var(--accent-color)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 500 }}
        >
          {label}
        </span>
      );
    });

    // 4. Bold
    parts = splitByRegex(parts, /\*\*([^*]+)\*\*/g, (match, idx) => (
      <strong key={`bold_${match[1]}_${idx}`}>{match[1]}</strong>
    ));

    // 5. Italic
    parts = splitByRegex(parts, /\*([^*]+)\*/g, (match, idx) => (
      <em key={`italic_${match[1]}_${idx}`}>{match[1]}</em>
    ));

    // 6. Code
    parts = splitByRegex(parts, /`([^`]+)`/g, (match, idx) => (
      <code
        key={`code_${match[1]}_${idx}`}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          backgroundColor: 'rgba(0, 0, 0, 0.04)',
          padding: '2px 5px',
          borderRadius: '4px',
          color: 'var(--text-main)',
        }}
      >
        {match[1]}
      </code>
    ));

    return parts;
  };

  const splitByRegex = (
    parts: React.ReactNode[],
    regex: RegExp,
    renderMatch: (match: RegExpExecArray, matchIndex: number) => React.ReactNode
  ): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    parts.forEach((part) => {
      if (typeof part !== 'string') {
        result.push(part);
        return;
      }
      let lastIndex = 0;
      let match;
      let count = 0;
      regex.lastIndex = 0;
      while ((match = regex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(renderMatch(match, count++));
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < part.length) {
        result.push(part.substring(lastIndex));
      }
    });
    return result;
  };

  return (
    <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px', backgroundColor: 'transparent', color: 'var(--text-main)', userSelect: 'text' }}>
      {content ? parseMarkdown(content) : <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No content. Switch to edit mode to write.</div>}
    </div>
  );
}
