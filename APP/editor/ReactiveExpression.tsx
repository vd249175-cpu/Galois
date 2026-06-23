import { useState, useEffect } from 'react';
import { parseExpression, getNestedValue } from './editorUtils';

interface ReactiveExpressionProps {
  rawExpression: string;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
}

export function ReactiveExpression({
  rawExpression,
  areaId,
  projectPath,
  state,
  updateBloodKey,
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

  // 1. Generate unique execution scope ID on mount
  const [uniqueId] = useState(() => 'exec_' + Math.random().toString(36).substring(2, 9));

  // 2. Resolve final JSON relative path and thread_id
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

  // 3. Read JSON data from injected state prop instead of using useBloodChannel
  const jsonData = state[`script_json:${resolvedRelativeJsonPath}`] || null;

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
          updateBloodKey(`script_json:${resolvedRelativeJsonPath}`, parsedData);
        }
      } catch (e) {
        // File might not exist yet
      }
    };
    loadInitialJson();
  }, [projectPath, resolvedRelativeJsonPath, absoluteOutputPath]);

  // 5. Script execution runner
  const runScript = async () => {
    if (!projectPath || !run) return;
    setStatus('running');
    setErrorMsg(null);

    try {
      // Pre-write empty JSON if not exists
      try {
        await (window as any).electronAPI.readFile(absoluteOutputPath);
      } catch (e) {
        await (window as any).electronAPI.writeFile(absoluteOutputPath, '{}');
      }

      const workingDir = `${projectPath}/script`;
      const cmd = `DNOTE_THREAD_ID="${threadId}" DNOTE_OUTPUT_FILE="${absoluteOutputPath}" uv run "${run}"`;

      await (window as any).electronAPI.execCommand(cmd, workingDir);

      // Read the newly created/updated file
      const updatedContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
      if (updatedContent) {
        const parsedData = JSON.parse(updatedContent);
        updateBloodKey(`script_json:${resolvedRelativeJsonPath}`, parsedData);
      }
      setStatus('success');
    } catch (err: any) {
      console.error('[ReactiveExpression] Execution error:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Execution failed');
    }
  };

  // 6. Trigger run on mount
  useEffect(() => {
    if (run) {
      runScript();
    }
  }, [run]);

  // 7. Interval scheduler
  useEffect(() => {
    if (!run || !interval || interval <= 0) return;
    const timer = setInterval(() => {
      runScript();
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

  const isRunning = status === 'running';
  const isError = status === 'error';

  return (
    <span
      className="reactive-pill-container"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: isError ? 'rgba(255, 59, 48, 0.08)' : 'var(--highlight-color)',
        color: isError ? 'var(--error-color)' : 'var(--accent-color)',
        border: `1.2px solid ${isError ? 'var(--error-color)' : 'var(--accent-color)'}`,
        padding: '1px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
        cursor: 'default',
        verticalAlign: 'middle',
        margin: '0 2px',
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
      
      <span className="reactive-pill-value">{formattedValue}</span>

      {run && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            runScript();
          }}
          disabled={isRunning}
          style={{
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
          title="Run script manually"
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
          <div style={{ fontWeight: 700, borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '3px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚡ DNOTE RUNNER</span>
            <span style={{
              fontSize: '8px',
              padding: '1px 4px',
              borderRadius: '4px',
              backgroundColor: isError ? 'rgba(255, 59, 48, 0.1)' : 'rgba(0, 122, 255, 0.1)',
              color: isError ? 'var(--error-color)' : '#007aff',
            }}>
              {status.toUpperCase()}
            </span>
          </div>
          <div><strong>JSON Path:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>script/{resolvedRelativeJsonPath}</code></div>
          <div><strong>Key Path:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>{keyPath}</code></div>
          {run && <div><strong>Script:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>script/{run}</code></div>}
          <div><strong>Isolation:</strong> {isolate || 'project'}</div>
          <div><strong>Thread ID:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.04)', padding: '1px 3px', borderRadius: '3px' }}>{threadId}</code></div>
          {interval && <div><strong>Interval:</strong> {interval} seconds</div>}
          {isError && errorMsg && (
            <div style={{ marginTop: '4px', padding: '4px', backgroundColor: 'rgba(255, 59, 48, 0.05)', borderRadius: '4px', borderLeft: '2px solid var(--error-color)', color: 'var(--error-color)', maxHeight: '60px', overflowY: 'auto', wordBreak: 'break-all' }}>
              {errorMsg}
            </div>
          )}
        </span>
      )}
    </span>
  );
}
