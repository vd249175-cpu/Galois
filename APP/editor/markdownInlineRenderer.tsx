import React from 'react';
import { InlineClipPlayer } from './InlineClipPlayer';
import { MathRenderer } from './MathRenderer';
import { ReactiveExpression } from './ReactiveExpression';
import { UniversalVideoPlayer } from './UniversalVideoPlayer';
import { parseMarkdownEmphasis, type MarkdownEmphasisSegment } from './markdownEmphasis';
import { getMarkdownMediaKind, resolveMarkdownMediaPath, toDnoteMediaUrl } from './mediaUtils';

export function createInlineRenderer(options: any) {
  const {
    areaId, beginEditingLine, currentFile, getShortcutDisplay, handleLinkClick,
    projectPath, slashCommands, state, updateBloodKey,
  } = options;
  const renderInline = (
    text: string,
    lineIndex: number,
    onToggleInlineTask?: (matchIndex: number, currentlyChecked: boolean) => void
  ) => {
    let parts: React.ReactNode[] = [text];

    // Protect inline code before parsing any other Markdown syntax, including
    // dollar-delimited math contained in code samples.
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

    // -2. Task markers inside table cells. Block task items use the dedicated
    // todo renderer above; inline markers need a cell-aware write-back callback.
    parts = splitByRegex(parts, /\[( |x|X)\](?!\()/g, (match, idx) => {
      const isChecked = match[1].toLowerCase() === 'x';
      return (
        <input
          key={`inline_task_${lineIndex}_${idx}`}
          type="checkbox"
          checked={isChecked}
          disabled={!onToggleInlineTask}
          aria-label={isChecked ? '标记为未完成' : '标记为完成'}
          title={isChecked ? '标记为未完成' : '标记为完成'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleInlineTask?.(idx, isChecked)}
          style={{ cursor: onToggleInlineTask ? 'pointer' : 'default', verticalAlign: 'middle' }}
        />
      );
    });

    // -1. @video clip embeds — @video[label](filename?t=start,end) (supports legacy #t= format as well)
    parts = splitByRegex(parts, /@video\[([^\]]*)\]\((.+?)[#?]t=([\d.]+),([\d.]+)\)/g, (match, idx) => {
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
          onRequestEdit={() => beginEditingLine(lineIndex)}
          handleLinkClick={handleLinkClick}
          slashCommands={slashCommands}
          getShortcutDisplay={getShortcutDisplay}
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
          onClick={(e) => {
            e.stopPropagation();
            handleLinkClick(target);
          }}
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
      
      const finalSrc = toDnoteMediaUrl(url, projectPath);
      const mediaKind = getMarkdownMediaKind(url);

      if (mediaKind === 'video') {
        return (
          <UniversalVideoPlayer
            key={`video_${url}_${idx}`}
            src={finalSrc}
            filePath={resolveMarkdownMediaPath(url, projectPath)}
            title={alt || url.split('/').pop()}
          />
        );
      }
      if (mediaKind === 'audio') {
        return (
          <audio
            key={`audio_${url}_${idx}`}
            src={finalSrc}
            controls
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            style={{ width: '100%', margin: '8px 0', display: 'block' }}
          />
        );
      }

      return (
        <img
          key={`img_${url}_${idx}`}
          src={finalSrc}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            display: 'block',
            margin: '10px 0',
            objectFit: 'contain',
          }}
        />
      );
    });

    // 3. Document links
    parts = splitByRegex(parts, /\[([^\]]+)\]\(([^)]+)\)/g, (match, idx) => {
      const label = match[1];
      const url = match[2];
      const isMd = url.endsWith('.md');
      const stableKey = `link_${url}_${idx}`;
      if (getMarkdownMediaKind(url) === 'audio') {
        return (
          <span
            key={stableKey}
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', maxWidth: '100%', verticalAlign: 'middle' }}
          >
            <span style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{label}</span>
            <audio
              src={toDnoteMediaUrl(url, projectPath)}
              controls
              preload="metadata"
              style={{ width: '240px', maxWidth: 'min(240px, 60vw)', height: '30px' }}
            />
          </span>
        );
      }
      return (
        <span
          key={stableKey}
          onClick={(e) => {
            e.stopPropagation();
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

    // 4. Inline math. $$ is handled by the block parser; escaped dollars and
    // whitespace-only expressions remain literal text.
    parts = splitByRegex(parts, /(?<!\\)(?<!\$)\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\$)/g, (match, idx) => (
      <MathRenderer key={`math_dollar_${lineIndex}_${idx}`} expression={match[1]} />
    ));
    parts = splitByRegex(parts, /\\\((.+?)\\\)/g, (match, idx) => (
      <MathRenderer key={`math_paren_${lineIndex}_${idx}`} expression={match[1]} />
    ));

    // 5. Emphasis is parsed in one pass. Sequential bold/italic regexes leave
    // spare stars for adjacent patterns such as *first* ***middle*** *last*.
    const renderEmphasisSegments = (segments: MarkdownEmphasisSegment[], keyPrefix: string): React.ReactNode[] => (
      segments.map((segment, segmentIndex) => {
        const key = `${keyPrefix}_${segmentIndex}_${segment.start}`;
        const children = segment.children?.length
          ? renderEmphasisSegments(segment.children, key)
          : segment.text;
        if (segment.style === 'boldItalic') return <strong key={key}><em>{children}</em></strong>;
        if (segment.style === 'bold') return <strong key={key}>{children}</strong>;
        if (segment.style === 'italic') return <em key={key}>{children}</em>;
        return segment.text;
      })
    );

    const emphasizedParts: React.ReactNode[] = [];
    parts.forEach((part, partIndex) => {
      if (typeof part !== 'string') {
        emphasizedParts.push(part);
        return;
      }
      emphasizedParts.push(...renderEmphasisSegments(parseMarkdownEmphasis(part), `emphasis_${partIndex}`));
    });
    parts = emphasizedParts;

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


  return renderInline;
}

