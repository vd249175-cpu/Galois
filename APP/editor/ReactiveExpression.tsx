import { useState, useEffect, useRef } from 'react';
import { parseExpression, getNestedValue, setNestedValue } from './editorUtils';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { ReactiveMarkdownValue } from './ReactiveMarkdownValue';

interface ReactiveExpressionProps {
  rawExpression: string;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  currentFile: string;
  lineIndex: number;
  onRequestEdit?: () => void;
  handleLinkClick?: (targetNodeText: string) => void;
  slashCommands?: any[];
  getShortcutDisplay?: (id: string) => string;
}

export function ReactiveExpression({
  rawExpression,
  areaId,
  projectPath,
  state,
  updateBloodKey,
  currentFile,
  lineIndex,
  onRequestEdit,
  handleLinkClick = () => {},
  slashCommands = [],
  getShortcutDisplay = () => '',
}: ReactiveExpressionProps) {
  const parsed = parseExpression(rawExpression);
  if (!parsed) {
    return (
      <span style={{ color: 'var(--error-color)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        {`{{Invalid Expr: ${rawExpression}}}`}
      </span>
    );
  }

  const { jsonPath, keyPath, run, interval, isolate } = parsed;

  const isMountedRef = useRef(true);
  const manualMarkdownOverrideRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [uniqueId] = useState(() => 'exec_' + Math.random().toString(36).substring(2, 9));

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

  if (resolvedRelativeJsonPath.startsWith('script/')) {
    resolvedRelativeJsonPath = resolvedRelativeJsonPath.substring(7);
  }

  const absoluteOutputPath = `${projectPath}/script/${resolvedRelativeJsonPath}`;

  const jsonData = state[`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`] || null;

  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // 4. Initial load of existing JSON file on disk
  useEffect(() => {
    if (!projectPath || !resolvedRelativeJsonPath) return;
    const loadInitialJson = async () => {
      try {
        const rawContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
        if (rawContent) {
          const parsedData = JSON.parse(rawContent);
          updateBloodKey(`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`, parsedData);
        }
      } catch (e) {
        // File might not exist yet
      }
    };
    loadInitialJson();
  }, [projectPath, resolvedRelativeJsonPath, absoluteOutputPath]);

  const pollFile = async () => {
    if (!projectPath || !resolvedRelativeJsonPath) return;
    try {
      const rawContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
      if (rawContent) {
        const parsedData = JSON.parse(rawContent);
        updateBloodKey(`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`, parsedData);
      }
    } catch (e) {
      // File might not exist yet
    }
  };

  // 5. Script execution runner
  const runScript = async (force = false) => {
    if (!projectPath || !run) return;
    if (manualMarkdownOverrideRef.current && !force) return;
    if (force) manualMarkdownOverrideRef.current = false;
    if (isMountedRef.current) {
      setStatus('running');
      setErrorMsg(null);
    }

    try {
      // Pre-write empty JSON if not exists
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

      // Read the newly created/updated file
      const updatedContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
      if (updatedContent) {
        const parsedData = JSON.parse(updatedContent);
        updateBloodKey(`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`, parsedData);
      }
      if (isMountedRef.current) {
        setStatus('success');
      }
      updateBloodKey(BC.events.commandExecuted(`reactive.${run}`), Date.now());
    } catch (err: any) {
      console.error('[ReactiveExpression] Execution error:', err);
      if (isMountedRef.current) {
        setStatus('error');
        setErrorMsg(err.message || 'Execution failed');
      }
    }
  };

  // 6. Trigger run on mount
  useEffect(() => {
    if (run) {
      runScript();
    } else {
      pollFile();
    }
  }, [run]);

  // 7. Interval scheduler
  useEffect(() => {
    if (!interval || interval <= 0) return;
    const timer = setInterval(() => {
      if (run) {
        runScript();
      } else {
        pollFile();
      }
    }, interval * 1000);

    return () => {
      clearInterval(timer);
    };
  }, [run, interval, absoluteOutputPath]);

  // 8. Delete temporary files for execution-level isolation on unmount
  useEffect(() => {
    return () => {
      if (isIsolatedExecution && projectPath && resolvedRelativeJsonPath) {
        (window as any).electronAPI.deleteFile(absoluteOutputPath).catch(() => {});
      }
    };
  }, [projectPath, resolvedRelativeJsonPath, isIsolatedExecution, absoluteOutputPath]);

  const displayValue = getNestedValue(jsonData, keyPath);
  const formattedValue = displayValue !== undefined ? String(displayValue) : '(no data)';
  const isMarkdown = typeof displayValue === 'string'
    && displayValue.includes('\n')
    && /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~|\|.+\|)/m.test(displayValue);

  const saveGeneratedMarkdown = async (nextMarkdown: string) => {
    if (!jsonData || typeof jsonData !== 'object') return;
    manualMarkdownOverrideRef.current = true;
    const nextData = setNestedValue(jsonData, keyPath, nextMarkdown);
    updateBloodKey(`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`, nextData);
    try {
      await (window as any).electronAPI.writeFile(
        absoluteOutputPath,
        JSON.stringify(nextData, null, 2)
      );
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to save generated Markdown');
    }
  };

  const isRunning = status === 'running';
  const isError = status === 'error';
  const RootElement = isMarkdown ? 'div' : 'span';
  const ValueElement = isMarkdown ? 'div' : 'span';

  return (
    <RootElement
      className="reactive-pill-container"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={(e) => {
        e.stopPropagation();
      }}
      style={{
        position: 'relative',
        display: isMarkdown ? 'block' : 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: isError ? 'rgba(255, 59, 48, 0.08)' : 'var(--highlight-color)',
        color: isError ? 'var(--error-color)' : 'var(--accent-color)',
        border: `1.2px solid ${isError ? 'var(--error-color)' : 'var(--accent-color)'}`,
        padding: isMarkdown ? '10px 14px' : '1px 8px',
        borderRadius: isMarkdown ? '8px' : '12px',
        fontSize: isMarkdown ? 'inherit' : '11px',
        fontWeight: isMarkdown ? 400 : 600,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
        verticalAlign: 'middle',
        margin: isMarkdown ? '8px 0' : '0 2px',
        width: isMarkdown ? '100%' : undefined,
        boxSizing: 'border-box',
        cursor: isMarkdown ? 'text' : 'default',
      }}
    >
      {/* Keyframe loader injection */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .reactive-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
      
      <ValueElement className="reactive-pill-value" style={{ display: isMarkdown ? 'block' : undefined, width: isMarkdown ? '100%' : undefined }}>
        {isMarkdown ? (
          <ReactiveMarkdownValue
            markdown={formattedValue}
            onChange={(nextContent) => { void saveGeneratedMarkdown(nextContent); }}
            areaId={areaId}
            projectPath={projectPath}
            state={state}
            updateBloodKey={updateBloodKey}
            handleLinkClick={handleLinkClick}
            currentFile={currentFile}
            valueId={`${uniqueId}:${resolvedRelativeJsonPath}:${keyPath}`}
            slashCommands={slashCommands}
            getShortcutDisplay={getShortcutDisplay}
          />
        ) : formattedValue}
      </ValueElement>

      {isMarkdown && onRequestEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestEdit();
          }}
          title="编辑反应式表达式"
          style={{ position: 'absolute', top: '6px', right: run ? '28px' : '6px', border: 'none', background: 'transparent', color: 'var(--accent-color)', cursor: 'pointer' }}
        >
          ✎
        </button>
      )}

      {run && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            runScript(true);
          }}
          disabled={isRunning}
          style={{
            position: isMarkdown ? 'absolute' : undefined,
            top: isMarkdown ? '7px' : undefined,
            right: isMarkdown ? '7px' : undefined,
            background: 'none',
            border: 'none',
            color: isError ? 'var(--error-color)' : 'var(--accent-color)',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isRunning ? 0.4 : 0.8,
            transition: 'opacity 0.15s',
            outline: 'none',
          }}
          title="手动运行脚本"
        >
          {isRunning ? (
            <svg
              className="reactive-spin"
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="8" cy="8" r="6" strokeDasharray="18 10" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.5 8L4.5 12V4L11.5 8Z" />
            </svg>
          )}
        </button>
      )}

      {showTooltip && (
        <span
          className="reactive-pill-tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(-6px)',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            zIndex: 1000,
            width: '280px',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: 'var(--text-main)',
            fontSize: '10px',
            fontWeight: 400,
            lineHeight: 1.4,
            textAlign: 'left',
          }}
        >
          <span style={{ fontWeight: 700, borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '3px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚡ Galois RUNNER</span>
            <span style={{
              fontSize: '8px',
              padding: '1px 4px',
              borderRadius: '4px',
              backgroundColor: isError ? 'rgba(255, 59, 48, 0.1)' : 'rgba(0, 122, 255, 0.1)',
              color: isError ? 'var(--error-color)' : '#007aff',
            }}>
              {status.toUpperCase()}
            </span>
          </span>
          <span style={{ display: 'block' }}><strong>JSON Path:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>script/{resolvedRelativeJsonPath}</code></span>
          <span style={{ display: 'block' }}><strong>Key Path:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>{keyPath}</code></span>
          {run && <span style={{ display: 'block' }}><strong>Script:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>script/{run}</code></span>}
          <span style={{ display: 'block' }}><strong>Isolation:</strong> {isolate || 'project'}</span>
          <span style={{ display: 'block' }}><strong>Thread ID:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>{threadId}</code></span>
          {interval && <span style={{ display: 'block' }}><strong>Interval:</strong> {interval} seconds</span>}
          {isError && errorMsg && (
            <span style={{ display: 'block', marginTop: '4px', padding: '4px', backgroundColor: 'rgba(255, 59, 48, 0.05)', borderRadius: '4px', borderLeft: '2px solid var(--error-color)', color: 'var(--error-color)', maxHeight: '60px', overflowY: 'auto', wordBreak: 'break-all' }}>
              {errorMsg}
            </span>
          )}
        </span>
      )}
    </RootElement>
  );
}
