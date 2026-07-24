import React from 'react';
import { MarkdownPreviewSurface } from './MarkdownPreviewSurface';
import { useMarkdownPreviewEditing } from './useMarkdownPreviewEditing';

interface MarkdownPreviewProps {
  content: string;
  onContentChange: (newContent: string) => void;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  handleLinkClick: (targetNodeText: string) => void;
  isPreviewMode: boolean;
  hoveredLineIndex: number | null;
  setHoveredLineIndex: React.Dispatch<React.SetStateAction<number | null>>;
  handleLineDrop: (e: React.DragEvent, lineIdx: number) => void;
  handleDropAtIndex: (e: React.DragEvent, insertIndex: number) => void;
  handlePasteAtIndex: (e: React.ClipboardEvent, insertIndex: number, sourceContent?: string) => void;
  currentFile: string;
  slashCommands?: any[];
  getShortcutDisplay?: (id: string) => string;
  onExecuteSlashCommand?: (cmd: any, start: number, end: number, sourceContent?: string) => void;
  embedded?: boolean;
}

export function MarkdownPreview({
  content,
  onContentChange,
  areaId,
  projectPath,
  state,
  updateBloodKey,
  handleLinkClick,
  isPreviewMode,
  hoveredLineIndex,
  setHoveredLineIndex,
  handleLineDrop,
  handleDropAtIndex,
  handlePasteAtIndex,
  currentFile,
  slashCommands = [],
  getShortcutDisplay = () => '',
  onExecuteSlashCommand,
  embedded = false,
}: MarkdownPreviewProps) {
  const editing = useMarkdownPreviewEditing({ content, currentFile, handlePasteAtIndex, onContentChange, onExecuteSlashCommand, projectPath, slashCommands });
  return <MarkdownPreviewSurface
    {...editing}
    areaId={areaId} content={content} currentFile={currentFile} embedded={embedded}
    getShortcutDisplay={getShortcutDisplay} handleDropAtIndex={handleDropAtIndex}
    handleLineDrop={handleLineDrop} handleLinkClick={handleLinkClick} handlePasteAtIndex={handlePasteAtIndex}
    hoveredLineIndex={hoveredLineIndex} isPreviewMode={isPreviewMode} projectPath={projectPath}
    setHoveredLineIndex={setHoveredLineIndex} slashCommands={slashCommands} state={state}
    updateBloodKey={updateBloodKey}
  />;
}
