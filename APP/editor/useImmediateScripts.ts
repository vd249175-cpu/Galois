import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { parseExpression } from './editorUtils';

export function useImmediateScripts(props: any) {
  const { areaId, currentFile, projectPath, setStatusMessage, triggeredImmediateRefs, updateBloodKey } = props;
const triggerImmediateScripts = async (fileContent: string) => {
  if (!projectPath || !currentFile) return;

  const exprRegex = /\{\{([\s\S]*?)\}\}/g;
  const lines = fileContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    exprRegex.lastIndex = 0;

    while ((match = exprRegex.exec(line)) !== null) {
      const rawExpr = match[0];
      const exprInner = match[1];

      if (triggeredImmediateRefs.current.has(rawExpr)) {
        continue;
      }

      const parsed = parseExpression(exprInner);
      if (!parsed || !parsed.run) continue;

      // Skip periodic scheduled scripts
      if (parsed.interval && parsed.interval > 0) continue;

      triggeredImmediateRefs.current.add(rawExpr);
      executeImmediateScript(parsed as any, i, rawExpr);
    }
  }
};

const executeImmediateScript = async (
  parsed: { jsonPath: string; keyPath: string; run: string; isolate: string | null },
  lineIndex: number,
  _rawExpr: string
) => {
  const { jsonPath, run, isolate } = parsed;
  const uniqueId = 'exec_' + Math.random().toString(36).substring(2, 9);

  let resolvedRelativeJsonPath = jsonPath;
  let threadId = 'project';

  const isIsolatedWindow = isolate === 'window' || isolate === 'true';
  const isIsolatedExecution = isolate === 'execution' || isolate === 'single';

  if (isIsolatedWindow) {
    threadId = areaId;
    const extIndex = jsonPath.lastIndexOf('.json');
    if (extIndex !== -1) {
      resolvedRelativeJsonPath = jsonPath.substring(0, extIndex) + `_${areaId}.json`;
    } else {
      resolvedRelativeJsonPath = jsonPath + `_${areaId}`;
    }
  } else if (isIsolatedExecution) {
    threadId = uniqueId;
    const extIndex = jsonPath.lastIndexOf('.json');
    if (extIndex !== -1) {
      resolvedRelativeJsonPath = jsonPath.substring(0, extIndex) + `_${uniqueId}.json`;
    } else {
      resolvedRelativeJsonPath = jsonPath + `_${uniqueId}`;
    }
  }

  const absoluteOutputPath = `${projectPath}/script/${resolvedRelativeJsonPath}`;
  setStatusMessage(`Running immediate script: ${run}...`);

  try {
    try {
      await (window as any).electronAPI.readFile(absoluteOutputPath);
    } catch (e) {
      await (window as any).electronAPI.writeFile(absoluteOutputPath, '{}');
    }

    await (window as any).electronAPI.runProjectScript(projectPath, {
      scriptName: run,
      cwd: `${projectPath}/script`,
      envExtra: {
        DNOTE_THREAD_ID: threadId,
        DNOTE_OUTPUT_FILE: absoluteOutputPath,
        DNOTE_NOTE_PATH: currentFile,
        DNOTE_NOTE_LINE: String(lineIndex),
      },
    });

    try {
      const updatedContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
      if (updatedContent) {
        const parsedData = JSON.parse(updatedContent);
        updateBloodKey(`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`, parsedData);
      }
    } catch (e) {}

    setStatusMessage(`Script ${run} executed successfully.`);
    updateBloodKey(BC.events.commandExecuted(`reactive.${run}`), Date.now());

    if (isIsolatedExecution) {
      setTimeout(() => {
        (window as any).electronAPI.deleteFile(absoluteOutputPath).catch(() => {});
      }, 1000);
    }
  } catch (err: any) {
    console.error('[Editor] Immediate script run failed:', err);
    setStatusMessage(`Immediate script failed: ${err.message}`);
  }
};

  return { triggerImmediateScripts };
}

