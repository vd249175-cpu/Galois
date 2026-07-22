import { BC } from '../../CORE/BloodChannels';

export function useEditorCommands(props: any) {
  const { applyFormatting, content, currentFile, markHistoryContent, projectCommands, projectPath,
    pushStateToUndoStack, rememberSlashCommandUse, saveNodeFile, setContent, setIsCustomCommandsOpen,
    setShowSlashMenu, setStatusMessage, showPrompt, showSlashMenu, slashIndex, textareaRef, updateBloodKey } = props;
const getEditorCaretCoordinates = (position: number) => {
  return textareaRef.current?.getCaretCoordinates(position) || { left: 12, top: 36 };
};

const handleExecuteCommand = (
  cmd: { id: string; label: string; desc?: string; icon?: any; content?: string },
  rangeStart?: number,
  rangeEnd?: number,
  sourceContent?: string
) => {
  rememberSlashCommandUse(cmd.id);
  const activeEditor = textareaRef.current;
  const workingContent = sourceContent ?? content;
  const hasExplicitRange = rangeStart !== undefined && rangeEnd !== undefined;
  if (!activeEditor && !hasExplicitRange && cmd.id !== 'custom.add_new' && cmd.id !== 'custom.manage') return;

  const selectionStart = activeEditor?.selectionStart ?? workingContent.length;
  const selectionEnd = activeEditor?.selectionEnd ?? selectionStart;
  const actualStart = Math.max(0, Math.min(
    workingContent.length,
    hasExplicitRange ? rangeStart! : (showSlashMenu ? slashIndex : selectionStart)
  ));
  const actualEnd = Math.max(actualStart, Math.min(
    workingContent.length,
    hasExplicitRange ? rangeEnd! : selectionEnd
  ));
  const restoreSelection = (start: number, end: number) => {
    if (!activeEditor) return;
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start, end);
      }
    }, 0);
  };

  if (cmd.id === 'custom.add_new' || cmd.id === 'custom.manage') {
    setShowSlashMenu(false);
    setIsCustomCommandsOpen(true);
    return;
  }

  if (cmd.id.startsWith('custom.')) {
    pushStateToUndoStack(workingContent, actualStart, actualEnd);
    
    const before = workingContent.substring(0, actualStart);
    const after = workingContent.substring(actualEnd);
    
    const snippet = cmd.content || '';
    const textAfterInsert = before + snippet + after;
    setContent(textAfterInsert);
    markHistoryContent(textAfterInsert);
    saveNodeFile(textAfterInsert);
    setShowSlashMenu(false);
    restoreSelection(actualStart + snippet.length, actualStart + snippet.length);
    return;
  }

  if (cmd.id.startsWith('project.')) {
    const projCmd = projectCommands.find((p: any) => p.id === cmd.id);
    if (projCmd && projCmd.content) {
      // Run it like a custom command (insert content snippet)
      pushStateToUndoStack(workingContent, actualStart, actualEnd);
      const before = workingContent.substring(0, actualStart);
      const after = workingContent.substring(actualEnd);
      const snippet = projCmd.content || '';
      const textAfterInsert = before + snippet + after;
      setContent(textAfterInsert);
      markHistoryContent(textAfterInsert);
      saveNodeFile(textAfterInsert);
      setShowSlashMenu(false);
      restoreSelection(actualStart + snippet.length, actualStart + snippet.length);
      return;
    }

    // Fallback: Run project script command
    pushStateToUndoStack(workingContent, actualStart, actualEnd);
    
    const before = workingContent.substring(0, actualStart);
    const after = workingContent.substring(actualEnd);
    const cleanContent = before + after;
    
    setContent(cleanContent);
    markHistoryContent(cleanContent);
    saveNodeFile(cleanContent);
    setShowSlashMenu(false);
    
    if (projCmd) {
      setTimeout(() => {
        if (activeEditor && textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(actualStart, actualStart);
        }
        handleExecuteProjectCommand(projCmd);
      }, 0);
    }
    return;
  }

  const start = (hasExplicitRange || showSlashMenu) ? actualStart : selectionStart;
  const end = (hasExplicitRange || showSlashMenu) ? actualEnd : selectionEnd;
  const before = workingContent.substring(0, start);
  const after = workingContent.substring(end);
  const baseContent = before + after;

  if (cmd.id === 'link') {
    setShowSlashMenu(false);
    showPrompt('输入超链接 URL:', 'https://', (url: string) => {
      if (!url) return;
      pushStateToUndoStack(workingContent, start, start);
      const res = applyFormatting('link', baseContent, start, start, url);
      setContent(res.text);
      markHistoryContent(res.text);
      saveNodeFile(res.text);
      restoreSelection(res.newStart, res.newEnd);
    });
    return;
  }

  pushStateToUndoStack(workingContent, start, start);
  const res = applyFormatting(cmd.id, baseContent, start, start);
  setContent(res.text);
  markHistoryContent(res.text);
  saveNodeFile(res.text);

  setShowSlashMenu(false);
  restoreSelection(res.newStart, res.newEnd);
};

const handleExecuteProjectCommand = async (cmd: { id: string; label: string; script?: string }) => {
  if (!projectPath || !cmd.script) return;
  setStatusMessage(`正在运行项目指令: ${cmd.label}...`);

  let cursorLine = 0;
  let cursorCol = 0;
  let selectedText = '';
  if (textareaRef.current) {
    const { selectionStart, selectionEnd } = textareaRef.current;
    const subStr = content.substring(0, selectionStart);
    const lines = subStr.split('\n');
    cursorLine = lines.length - 1;
    cursorCol = lines[lines.length - 1].length;
    selectedText = content.substring(selectionStart, selectionEnd);
  }

  const cacheDir = `${projectPath}/.dnote_cache`;
  const absoluteOutputPath = `${cacheDir}/${cmd.id}.json`;

  try {
    try {
      await (window as any).electronAPI.readFile(absoluteOutputPath);
    } catch (e) {
      await (window as any).electronAPI.writeFile(absoluteOutputPath, '{}');
    }

    console.log(`[Editor] Executing project command: ${cmd.script}`);
    await (window as any).electronAPI.runProjectScript(projectPath, {
      command: cmd.script,
      cwd: projectPath,
      envExtra: {
        DNOTE_ACTIVE_FILE: currentFile,
        DNOTE_OUTPUT_FILE: absoluteOutputPath,
        DNOTE_CURSOR_LINE: String(cursorLine),
        DNOTE_CURSOR_COL: String(cursorCol),
        DNOTE_SELECTED_TEXT: selectedText,
      },
    });

    let parsedData: any = null;
    try {
      const updatedContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
      if (updatedContent) {
        parsedData = JSON.parse(updatedContent);
        updateBloodKey(`events.commandExecuted.${cmd.id}`, { timestamp: Date.now(), data: parsedData });
      }
    } catch (e) {
      console.error('[Editor] Failed to read output file:', e);
    }

    if (parsedData && parsedData.status === 'success') {
      setStatusMessage(`${cmd.label} 执行成功: ${parsedData.message || ''}`);
      if (parsedData.message) {
        alert(`${cmd.label} 执行成功！\n\n${parsedData.message}\n${parsedData.data ? JSON.stringify(parsedData.data, null, 2) : ''}`);
      }
    } else if (parsedData && parsedData.status === 'error') {
      setStatusMessage(`${cmd.label} 执行失败: ${parsedData.message || ''}`);
      alert(`${cmd.label} 执行失败！\n\n${parsedData.message || ''}`);
    } else {
      setStatusMessage(`${cmd.label} 执行完成。`);
    }

    updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
  } catch (err: any) {
    console.error('[Editor] Project command execution failed:', err);
    setStatusMessage(`${cmd.label} 执行失败: ${err.message}`);
    alert(`${cmd.label} 执行失败: ${err.message}`);
  }
};

  return { getEditorCaretCoordinates, handleExecuteCommand, handleExecuteProjectCommand };
}
