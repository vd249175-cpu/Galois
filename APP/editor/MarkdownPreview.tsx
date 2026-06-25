import React, { useEffect, useRef, useState } from 'react';
import { ReactiveExpression } from './ReactiveExpression';
import { parseMarkdownBody } from '../utils';
import { InlineClipPlayer } from './InlineClipPlayer';

// Global state to track dynamic loading of Mermaid CDN library
let mermaidLoading = false;
let mermaidLoaded = false;
const mermaidLoadCallbacks = new Set<() => void>();

function loadMermaid(callback: () => void) {
  if (mermaidLoaded) {
    callback();
    return;
  }
  mermaidLoadCallbacks.add(callback);
  if (mermaidLoading) return;
  mermaidLoading = true;

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
  script.async = true;
  script.onload = () => {
    mermaidLoaded = true;
    const mermaid = (window as any).mermaid;
    if (mermaid) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
    }
    mermaidLoadCallbacks.forEach((cb) => cb());
    mermaidLoadCallbacks.clear();
  };
  document.body.appendChild(script);
}

export function MermaidRenderer({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadMermaid(() => {
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const mermaid = (window as any).mermaid;
    if (!mermaid || !containerRef.current) return;

    let isMounted = true;
    const renderId = `mermaid-render-${Math.random().toString(36).substring(2, 9)}`;

    const renderDiagram = async () => {
      try {
        const cleanCode = code.trim();
        const { svg: renderedSvg } = await mermaid.render(renderId, cleanCode);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        console.error('[Mermaid] render error:', err);
        const badEl = document.getElementById(renderId);
        if (badEl) badEl.remove();

        if (isMounted) {
          setError(err.message || String(err));
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, loaded]);

  if (error) {
    return (
      <div style={{ margin: '14px 0', border: '1px solid #fecaca', backgroundColor: '#fef2f2', padding: '10px 14px', borderRadius: '6px' }}>
        <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>Mermaid 渲染失败</div>
        <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#991b1b', whiteSpace: 'pre-wrap' }}>
          {error}
        </pre>
        <details style={{ marginTop: '6px' }}>
          <summary style={{ fontSize: '11px', cursor: 'pointer', color: '#7f1d1d' }}>查看源代码</summary>
          <pre style={{ margin: '4px 0 0 0', padding: '6px', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#374151' }}>
            {code}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        margin: '14px 0',
        padding: '12px',
        border: '1.2px solid var(--border-color)',
        borderRadius: '6px',
        backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.01))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflowX: 'auto'
      }}
    >
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          正在渲染 Mermaid 图表...
        </div>
      )}
    </div>
  );
}

interface MarkdownPreviewProps {
  content: string;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  handleLinkClick: (targetNodeText: string) => void;
  isPreviewMode: boolean;
  hoveredLineIndex: number | null;
  setHoveredLineIndex: React.Dispatch<React.SetStateAction<number | null>>;
  handleLineDrop: (e: React.DragEvent, lineIdx: number) => void;
  currentFile: string;
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
  currentFile,
}: MarkdownPreviewProps) {
  const getLineDragProps = (lineIdx: number) => {
    if (!isPreviewMode) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/x-dnote-clip')) {
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
    let frontmatterLinesOffset = 0;
    const body = parseMarkdownBody(md);
    if (body !== md) {
      const bodyIndex = md.indexOf(body);
      const prefix = md.substring(0, bodyIndex);
      // Split the prefix and count elements to get the correct line breaks offset
      frontmatterLinesOffset = prefix.split('\n').length - 1;
    }

    const lines = body.split('\n');
    const elements: React.ReactNode[] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fileLineIndex = frontmatterLinesOffset + i;

      // ── Code Block & Mermaid Parsing ─────────────────────────────────────────
      if (line.trim().startsWith('```')) {
        const lang = line.trim().substring(3).trim();
        const codeLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith('```')) {
          codeLines.push(lines[j]);
          j++;
        }
        const codeText = codeLines.join('\n');
        
        if (lang.toLowerCase() === 'mermaid') {
          elements.push(
            <MermaidRenderer key={`mermaid_${i}`} code={codeText} />
          );
        } else {
          elements.push(
            <div key={`codeblock_${i}`} style={{ margin: '14px 0', overflowX: 'auto' }}>
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-secondary, rgba(0, 0, 0, 0.03))',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  margin: 0,
                  whiteSpace: 'pre'
                }}
              >
                <code>{codeText}</code>
              </pre>
            </div>
          );
        }

        i = j + 1; // skip past closing backticks
        continue;
      }

      // ── Table Parsing ────────────────────────────────────────────────────────
      const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|');
      const isSeparatorRow = (l: string) => l.trim().startsWith('|') && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(l.trim());

      if (i + 1 < lines.length && isTableRow(line) && isSeparatorRow(lines[i+1])) {
        const headerRow = line;
        const separatorRow = lines[i+1];
        
        // Parse headers
        const headerCells = headerRow.split('|').map(c => c.trim());
        if (headerCells[0] === '') headerCells.shift();
        if (headerCells[headerCells.length - 1] === '') headerCells.pop();

        // Parse alignments
        const separatorCells = separatorRow.split('|').map(c => c.trim());
        if (separatorCells[0] === '') separatorCells.shift();
        if (separatorCells[separatorCells.length - 1] === '') separatorCells.pop();

        const alignments = separatorCells.map(cell => {
          const left = cell.startsWith(':');
          const right = cell.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          return 'left';
        });

        // Parse data rows
        const dataRows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && isTableRow(lines[j])) {
          const cells = lines[j].split('|').map(c => c.trim());
          if (cells[0] === '') cells.shift();
          if (cells[cells.length - 1] === '') cells.pop();
          dataRows.push(cells);
          j++;
        }

        // Render table
        elements.push(
          <div key={`table_${i}`} style={{ overflowX: 'auto', margin: '14px 0' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                border: '1.2px solid var(--border-color)',
                borderRadius: '6px'
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.015)' }}>
                  {headerCells.map((cell, colIdx) => (
                    <th
                      key={`th_${colIdx}`}
                      style={{
                        padding: '8px 12px',
                        fontWeight: '600',
                        textAlign: (alignments[colIdx] || 'left') as any,
                        color: 'var(--text-main)',
                        borderBottom: '2px solid var(--border-color)'
                      }}
                    >
                      {renderInline(cell, fileLineIndex)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((rowCells, rowIdx) => (
                  <tr
                    key={`tr_${rowIdx}`}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: rowIdx % 2 === 1 ? 'rgba(0,0,0,0.005)' : 'transparent'
                    }}
                  >
                    {headerCells.map((_, colIdx) => {
                      const cellVal = rowCells[colIdx] || '';
                      return (
                        <td
                          key={`td_${rowIdx}_${colIdx}`}
                          style={{
                            padding: '8px 12px',
                            textAlign: (alignments[colIdx] || 'left') as any,
                            color: 'var(--text-main)'
                          }}
                        >
                          {renderInline(cellVal, fileLineIndex + 2 + rowIdx)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        i = j; // skip forward
        continue;
      }

      // Default line parsers
      let content = line;
      const isHorizontalRule = (l: string) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l);

      if (isHorizontalRule(content)) {
        elements.push(
          <hr
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, {
              border: 'none',
              borderTop: '1px solid var(--border-color)',
              margin: '16px 0'
            })}
          />
        );
      } else if (content.startsWith('# ')) {
        elements.push(
          <h1
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: '18px 0 10px 0', fontSize: '20px', fontWeight: '700' })}
          >
            {renderInline(content.substring(2), fileLineIndex)}
          </h1>
        );
      } else if (content.startsWith('## ')) {
        elements.push(
          <h2
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px', margin: '16px 0 8px 0', fontSize: '16px', fontWeight: '600' })}
          >
            {renderInline(content.substring(3), fileLineIndex)}
          </h2>
        );
      } else if (content.startsWith('### ')) {
        elements.push(
          <h3
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { margin: '14px 0 6px 0', fontSize: '14px', fontWeight: '600' })}
          >
            {renderInline(content.substring(4), fileLineIndex)}
          </h3>
        );
      } else if (content.startsWith('- [ ] ')) {
        elements.push(
          <div
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0' })}
          >
            <input type="checkbox" disabled checked={false} />
            <span>{renderInline(content.substring(6), fileLineIndex)}</span>
          </div>
        );
      } else if (content.startsWith('- [x] ')) {
        elements.push(
          <div
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0', opacity: 0.55 })}
          >
            <input type="checkbox" disabled checked={true} />
            <span style={{ textDecoration: 'line-through' }}>{renderInline(content.substring(6), fileLineIndex)}</span>
          </div>
        );
      } else if (content.startsWith('- ')) {
        elements.push(
          <li
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { marginLeft: '16px', margin: '4px 0', fontSize: '13px' })}
          >
            {renderInline(content.substring(2), fileLineIndex)}
          </li>
        );
      } else if (content.startsWith('> ')) {
        elements.push(
          <blockquote
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { borderLeft: '3px solid var(--accent-color)', paddingLeft: '12px', color: 'var(--text-muted)', margin: '10px 0', fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.01)', padding: '6px 12px', borderRadius: '0 4px 4px 0' })}
          >
            {renderInline(content.substring(2), fileLineIndex)}
          </blockquote>
        );
      } else if (content.trim() === '') {
        elements.push(
          <div
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { height: '14px', margin: '4px 0' })}
          />
        );
      } else {
        elements.push(
          <p
            key={i}
            {...getLineDragProps(i)}
            style={getLineStyle(i, { margin: '6px 0', lineHeight: '1.6', fontSize: '13px' })}
          >
            {renderInline(content, fileLineIndex)}
          </p>
        );
      }
      i++;
    }

    return elements;
  };

  const renderInline = (text: string, lineIndex: number) => {
    let parts: React.ReactNode[] = [text];

    // -1. @video clip embeds — @video[label](filename#t=start,end)
    parts = splitByRegex(parts, /@video\[([^\]]*)\]\(([^#)]+)#t=([\d.]+),([\d.]+)\)/g, (match, idx) => {
      const label = match[1];
      const fileName = match[2];
      const start = parseFloat(match[3]);
      const end = parseFloat(match[4]);
      return (
        <InlineClipPlayer
          key={`clip_${fileName}_${start}_${idx}`}
          label={label}
          fileName={fileName}
          start={start}
          end={end}
          projectPath={projectPath}
        />
      );
    });

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
          currentFile={currentFile}
          lineIndex={lineIndex}
        />
      );
    });

    // 0.5 HTML Spans with inline styles (e.g. for rainbow colors)
    parts = splitByRegex(parts, /<span\s+[^>]*?style=["']([^"']*)["'][^>]*?>([\s\S]*?)<\/span>/gi, (match, idx) => {
      const styleStr = match[1];
      const innerText = match[2];
      
      const styleObj: React.CSSProperties = {};
      const stylePairs = styleStr.split(';');
      for (const pair of stylePairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx !== -1) {
          const key = pair.substring(0, colonIdx).trim().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
          const val = pair.substring(colonIdx + 1).trim();
          if (key && val) {
            (styleObj as any)[key] = val;
          }
        }
      }
      
      const stableKey = `html_span_${idx}`;
      return (
        <span key={stableKey} style={styleObj}>
          {renderInline(innerText, lineIndex)}
        </span>
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

      const cleanUrl = url.split('#')[0].split('?')[0];
      const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';
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
    const activeRegex = regex.global
      ? regex
      : new RegExp(regex.source, regex.flags + 'g');

    const result: React.ReactNode[] = [];
    parts.forEach((part) => {
      if (typeof part !== 'string') {
        result.push(part);
        return;
      }
      let lastIndex = 0;
      let match;
      let count = 0;
      activeRegex.lastIndex = 0;
      while ((match = activeRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(renderMatch(match, count++));
        lastIndex = activeRegex.lastIndex;
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
