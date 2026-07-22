import { useRef } from 'react';
import { MarkdownPreview } from './MarkdownPreview';
import { applyMarkdownFormatting } from './markdownEditing';
import { useMediaDrop } from './hooks/useMediaDrop';

interface ReactiveMarkdownValueProps {
  markdown: string;
  onChange: (markdown: string) => void;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  handleLinkClick: (target: string) => void;
  currentFile: string;
  valueId: string;
  slashCommands: any[];
  getShortcutDisplay: (id: string) => string;
}

export function ReactiveMarkdownValue({
  markdown,
  onChange,
  areaId,
  projectPath,
  state,
  updateBloodKey,
  handleLinkClick,
  currentFile,
  valueId,
  slashCommands,
  getShortcutDisplay,
}: ReactiveMarkdownValueProps) {
  const contentRef = useRef(markdown);
  contentRef.current = markdown;
  const media = useMediaDrop({
    projectPath,
    currentFile,
    isPreviewMode: true,
    contentRef,
    setContent: onChange,
    saveNodeFile: () => {},
    setStatusMessage: (message) => {
      if (message.toLowerCase().includes('failed')) console.error(`[ReactiveMarkdown] ${message}`);
    },
  });

  const executeSlashCommand = (
    cmd: { id: string; content?: string },
    start: number,
    end: number,
    sourceContent = markdown
  ) => {
    if (cmd.content !== undefined || cmd.id.startsWith('custom.') || cmd.id.startsWith('project.')) {
      onChange(sourceContent.substring(0, start) + (cmd.content || '') + sourceContent.substring(end));
      return;
    }
    const baseContent = sourceContent.substring(0, start) + sourceContent.substring(end);
    onChange(applyMarkdownFormatting(cmd.id, baseContent, start, start).text);
  };

  return (
    <MarkdownPreview
      content={markdown}
      onContentChange={onChange}
      areaId={`${areaId}-reactive-${valueId}`}
      projectPath={projectPath}
      state={state}
      updateBloodKey={updateBloodKey}
      handleLinkClick={handleLinkClick}
      isPreviewMode={true}
      hoveredLineIndex={media.hoveredLineIndex}
      setHoveredLineIndex={media.setHoveredLineIndex}
      handleLineDrop={media.handleLineDrop}
      handleDropAtIndex={media.handleDropAtIndex}
      handlePasteAtIndex={media.handlePasteAtIndex}
      currentFile={`${currentFile}#reactive:${valueId}`}
      slashCommands={slashCommands}
      getShortcutDisplay={getShortcutDisplay}
      onExecuteSlashCommand={executeSlashCommand}
      embedded
    />
  );
}
