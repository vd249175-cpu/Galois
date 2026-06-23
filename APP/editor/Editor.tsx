import { useEffect, useState, useRef } from 'react';
import { parseFrontmatterTags } from '../utils';

export const EditorComponent = {
  typeId: 'editor',
  displayName: 'Lattice Editor',
  iconName: 'document',
  component: EditorView,
  actions: [
    {
      id: 'editor.save',
      label: 'Save Note',
      defaultShortcut: 'meta+s',
      isToolbar: true,
    },
    {
      id: 'editor.toggleMode',
      label: 'Toggle Markdown Mode (Edit/Preview)',
      defaultShortcut: 'meta+e',
      isToolbar: true,
    },
  ],
  bloodChannels: (areaId: string) => [
    'project.path',
    'project.resolvedTags',
    `events.openFile.${areaId}`,
    'system.focusedAreaId',
    'system.activeEditors',
    'system.lastFocusedEditorId',
    'script_json:'
  ]
};

// Helper to serialize tags list and body text into Markdown frontmatter format
function serializeFrontmatter(tags: string[], body: string): string {
  let yaml = '---\n';
  yaml += 'tags:\n';
  tags.forEach((t) => {
    yaml += `  - ${t}\n`;
  });
  yaml += '---\n';
  return yaml + body;
}

// Helper to separate frontmatter block from body content
function parseMarkdownBody(content: string): string {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  if (match) {
    return match[2];
  }
  return content;
}

// Helper to count the number of lines taken by the YAML frontmatter block
function getFrontmatterLineCount(content: string): number {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  if (match) {
    const lines = content.split('\n');
    if (lines[0].trim() === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
          return i + 1; // Number of lines including the second ---
        }
      }
    }
  }
  return 0;
}

// Helper to replace or insert tags list in the YAML frontmatter of full content
function updateYamlFrontmatterTags(content: string, newTags: string[]): string {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  
  const cleanTags = Array.from(new Set(newTags.map((t) => t.trim()).filter(Boolean))).sort();
  const tagsYamlLines = ['tags:'];
  cleanTags.forEach((t) => {
    tagsYamlLines.push(`  - ${t}`);
  });

  if (match) {
    const yamlText = match[1];
    const bodyText = match[2];
    
    const lines = yamlText.split('\n');
    let tagsStartIndex = -1;
    let tagsEndIndex = -1;
    let inTagsList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const trimLine = lines[i].trim();
      if (trimLine.startsWith('tags:')) {
        tagsStartIndex = i;
        const inlineValue = trimLine.substring(5).trim();
        if (inlineValue && inlineValue !== '-') {
          tagsEndIndex = i;
        } else {
          inTagsList = true;
        }
      } else if (inTagsList) {
        if (trimLine.startsWith('-')) {
          tagsEndIndex = i;
        } else if (trimLine === '') {
          // ignore
        } else if (lines[i].includes(':')) {
          inTagsList = false;
        }
      }
    }
    
    let newYamlText = '';
    if (tagsStartIndex !== -1) {
      const beforeTags = lines.slice(0, tagsStartIndex);
      const afterTags = lines.slice(tagsEndIndex + 1);
      newYamlText = [...beforeTags, ...tagsYamlLines, ...afterTags].join('\n');
    } else {
      newYamlText = yamlText + '\n' + tagsYamlLines.join('\n');
    }
    
    return `---\n${newYamlText.trim()}\n---\n${bodyText}`;
  } else {
    let yaml = '---\n';
    yaml += 'tags:\n';
    cleanTags.forEach((t) => {
      yaml += `  - ${t}\n`;
    });
    yaml += '---\n';
    return yaml + content;
  }
}

// Helper to parse key-value expression options
function parseExpression(expr: string) {
  const parts = expr.trim().split('|');
  const pathAndKey = parts[0].trim();
  
  const colonIndex = pathAndKey.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }
  const jsonPath = pathAndKey.substring(0, colonIndex).trim();
  const keyPath = pathAndKey.substring(colonIndex + 1).trim();

  const options: Record<string, string> = {};
  if (parts[1]) {
    const params = parts[1].trim().split('&');
    for (const param of params) {
      const eqIndex = param.indexOf('=');
      if (eqIndex !== -1) {
        const key = param.substring(0, eqIndex).trim();
        let value = param.substring(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        options[key] = value;
      }
    }
  }

  return {
    jsonPath,
    keyPath,
    run: options.run || null,
    interval: options.interval ? parseInt(options.interval, 10) : null,
    isolate: options.isolate || null,
  };
}

// Helper to extract nested values like foo.bar from an object
function getNestedValue(obj: any, keyPath: string): any {
  if (!obj || !keyPath) return undefined;
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

// Reactive expression binding component
function ReactiveExpression({
  rawExpression,
  areaId,
  projectPath,
  state,
  updateBloodKey,
}: {
  rawExpression: string;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
}) {
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
      // Pre-write empty JSON if not exists (triggers folder creation in main.ts writeFile)
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

function EditorView({
  areaId,
  state,
  updateBloodKey,
  lastAction,
}: {
  areaId: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const [tags, setTags] = useState<string[]>([]); // Raw tags list (as in YAML, e.g. run:x.py)
  const [activeTags, setActiveTags] = useState<string[]>([]); // Resolved tags (fully evaluated)
  const [derivedTags, setDerivedTags] = useState<string[]>([]); // Evaluated regex/script tags
  const [content, setContent] = useState<string>(''); // Full Markdown content including YAML header
  const [currentFile, setCurrentFile] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('No file open');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dnote_editor_preview_mode');
    return saved !== null ? saved === 'true' : true;
  });
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const [ruleMatches, setRuleMatches] = useState<Record<string, string[]>>({});
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      // Show full-editor overlay only when in Edit Mode
      if (!isPreviewMode) {
        setIsDraggingFile(true);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

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

  const handleLineDrop = async (e: React.DragEvent, lineIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredLineIndex(null);

    if (!projectPath || !currentFile) {
      setStatusMessage('Open a notebook directory and select a note first.');
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    setStatusMessage('Archiving media drop to target line...');
    let fileAdded = false;

    // Use the first file dropped for precise inline insertion
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(ext);

    if (isMedia) {
      try {
        const sysPath = (window as any).electronAPI.getPathForFile(file);
        if (!sysPath) {
          throw new Error('Could not retrieve file path.');
        }
        const relativePath = await (window as any).electronAPI.archiveMedia(sysPath, projectPath);
        
        let linkMarkup = `![media](${relativePath})`;
        if (['mp4', 'webm'].includes(ext)) {
          linkMarkup = `![video](${relativePath})`;
        } else if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) {
          linkMarkup = `![audio](${relativePath})`;
        }

        const yamlLinesCount = getFrontmatterLineCount(contentRef.current);
        const lines = contentRef.current.split('\n');
        // Insert below the targeted paragraph line (accounting for yaml block offset)
        lines.splice(yamlLinesCount + lineIdx + 1, 0, linkMarkup);
        const nextContent = lines.join('\n');
        
        setContent(nextContent);
        saveNodeFile(nextContent);
        fileAdded = true;
      } catch (err: any) {
        console.error(err);
        setStatusMessage(`Failed to archive ${file.name}: ${err.message}`);
      }
    }

    if (fileAdded) {
      setStatusMessage('Media successfully inserted into targeted line.');
    } else {
      setStatusMessage('Only image, audio, and video files are supported.');
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const lastSavedContentRef = useRef<string>('');

  const projectPath = state['project.path'] || '';

  // 1. Register editor instance
  useEffect(() => {
    const editors = state['system.activeEditors'] || [];
    if (!editors.includes(areaId)) {
      updateBloodKey('system.activeEditors', [...editors, areaId]);
    }
    if (!state['system.lastFocusedEditorId']) {
      updateBloodKey('system.lastFocusedEditorId', areaId);
    }
    return () => {
      const remaining = (state['system.activeEditors'] || []).filter((id: string) => id !== areaId);
      updateBloodKey('system.activeEditors', remaining);
      if (state['system.lastFocusedEditorId'] === areaId) {
        updateBloodKey('system.lastFocusedEditorId', remaining[0] || null);
      }
    };
  }, [areaId]);

  // 2. Focus state tracking
  const isFocused = state['system.focusedAreaId'] === areaId;

  useEffect(() => {
    if (isFocused) {
      updateBloodKey('system.lastFocusedEditorId', areaId);
    }
  }, [isFocused, areaId]);

  // 3. Listen to file loading requests targeting this area
  const openedFile = state[`events.openFile.${areaId}`] || '';

  useEffect(() => {
    if (!openedFile) return;

    const loadMarkdownFile = async () => {
      try {
        const rawContent = await (window as any).electronAPI.readFile(openedFile);
        const parsedTags = parseFrontmatterTags(rawContent);

        lastSavedContentRef.current = rawContent;
        setTags(parsedTags);
        setContent(rawContent);
        setCurrentFile(openedFile);
        
        const noteName = openedFile.split('/').pop()?.replace('.md', '') || '';
        setStatusMessage(`Editing Note: ${noteName}`);
      } catch (err: any) {
        console.error('Failed to load note:', openedFile, err);
        setStatusMessage(`Error loading note file.`);
      }
    };

    loadMarkdownFile();
  }, [openedFile]);

  // 4. Resolve raw tags to active tags (handles regex and reads script-calculated tags from Blood state)
  useEffect(() => {
    if (!currentFile || !projectPath) return;

    const staticTags = tags.filter((t) => !t.startsWith('re:') && !t.startsWith('run:'));
    const bodyText = parseMarkdownBody(content);
    const matchesMap: Record<string, string[]> = {};
    const allRegexMatches: string[] = [];

    // Resolve regex matches locally in real-time for each regex rule
    for (const tag of tags) {
      if (tag.startsWith('re:')) {
        const patternStr = tag.substring(3).trim();
        const ruleMatchesList: string[] = [];
        try {
          let regex: RegExp;
          const slashMatch = patternStr.match(/^\/(.+)\/([a-z]*)$/);
          if (slashMatch) {
            regex = new RegExp(slashMatch[1], slashMatch[2].includes('g') ? slashMatch[2] : slashMatch[2] + 'g');
          } else {
            regex = new RegExp(patternStr, 'g');
          }
          
          const matches = bodyText.matchAll(regex);
          for (const m of matches) {
            const val = m[1] !== undefined ? m[1].trim() : m[0].trim();
            if (val && isNaN(Number(val)) && !ruleMatchesList.includes(val)) {
              ruleMatchesList.push(val);
              allRegexMatches.push(val);
            }
          }
        } catch (e) {
          console.error('[Tags Resolver] Invalid regex:', patternStr, e);
        }
        matchesMap[tag] = ruleMatchesList.sort();
      }
    }

    // Retrieve globally resolved tags for this file (computed iteratively on project open/save)
    const globalResolved = state['project.resolvedTags']?.[currentFile] || [];
    
    // Script-calculated tags are those in globalResolved that are not static tags
    const scriptDerived = globalResolved.filter((t: string) => !staticTags.includes(t));

    // Distribute script-calculated tags to the run: scripts
    const runScripts = tags.filter(t => t.startsWith('run:'));
    if (runScripts.length > 0) {
      const pureScriptTags = scriptDerived.filter(t => !allRegexMatches.includes(t));
      runScripts.forEach((scriptTag) => {
        matchesMap[scriptTag] = pureScriptTags.sort();
      });
    }

    // Combine local regex matches and script-derived tags
    const combinedDerived = Array.from(new Set([...allRegexMatches, ...scriptDerived])).sort();
    const combinedActive = Array.from(new Set([...staticTags, ...combinedDerived])).sort();

    setRuleMatches(matchesMap);
    setDerivedTags(combinedDerived);
    setActiveTags(combinedActive);
  }, [tags, content, currentFile, projectPath, state['project.resolvedTags']]);

  // Handle saving content (merges YAML frontmatter + body)
  const saveNodeFile = async (customContent?: string) => {
    if (!currentFile) {
      updateBloodKey('debug.editorSaveError', 'No file open to save');
      setStatusMessage('No file open to save');
      return;
    }
    const fullContent = customContent !== undefined ? customContent : contentRef.current;
    if (fullContent === lastSavedContentRef.current) {
      return; // skip saving identical content
    }
    updateBloodKey('debug.editorSaveAttempt', { file: currentFile, contentLen: fullContent.length });
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      lastSavedContentRef.current = fullContent;
      setStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      // Notify sidebar & graph view
      updateBloodKey(`events.fileSaved.${currentFile}`, Date.now());
    } catch (err: any) {
      updateBloodKey('debug.editorSaveError', err.message);
      setStatusMessage(`Error saving: ${err.message}`);
    }
  };

  // Modify tags list in YAML and write back to the same file
  const handleUpdateTags = async (nextTags: string[]) => {
    if (!currentFile) {
      updateBloodKey('debug.editorTagsError', 'No file open to update tags');
      return;
    }

    const cleanTags = Array.from(new Set(nextTags.map((t) => t.trim()).filter(Boolean))).sort();
    setTags(cleanTags);

    const fullContent = updateYamlFrontmatterTags(contentRef.current, cleanTags);
    if (fullContent === lastSavedContentRef.current) {
      return; // skip saving identical content
    }
    updateBloodKey('debug.editorTagsAttempt', { file: currentFile, cleanTags, contentLen: fullContent.length });
    setContent(fullContent);
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      lastSavedContentRef.current = fullContent;
      setStatusMessage(`Tags updated inline.`);
      
      // Notify HMR / redraw
      updateBloodKey(`events.fileSaved.${currentFile}`, Date.now());
    } catch (err: any) {
      updateBloodKey('debug.editorTagsError', err.message);
      alert(`Failed to save tag updates: ${err.message}`);
    }
  };

  // Debounced Auto-Save effect when content is edited
  useEffect(() => {
    if (!currentFile || isPreviewMode) return;
    if (content === '') return;

    const timer = setTimeout(() => {
      saveNodeFile(content);
    }, 1200);

    return () => clearTimeout(timer);
  }, [content, currentFile, isPreviewMode]);

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = newTagInput.trim();
    if (!cleanInput) return;

    const nextTags = [...tags, cleanInput];
    handleUpdateTags(nextTags);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    handleUpdateTags(nextTags);
  };

  // Drag and drop media auto-archiver
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingFile(false);

    if (!projectPath || !currentFile) {
      setStatusMessage('Open a notebook directory and select a note first.');
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    setStatusMessage('Archiving media drop...');
    let fileAdded = false;
    let errorOccurred = false;

    // Process the first dropped file (most typical case)
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(ext);

    if (isMedia) {
      try {
        const sysPath = (window as any).electronAPI.getPathForFile(file);
        if (!sysPath) {
          throw new Error('Could not retrieve file path. Empty drop target.');
        }
        const relativePath = await (window as any).electronAPI.archiveMedia(sysPath, projectPath);
        
        if (isPreviewMode) {
          // Dropped in the blank workspace background: append to note tail
          let linkMarkup = `![media](${relativePath})`;
          if (['mp4', 'webm'].includes(ext)) {
            linkMarkup = `![video](${relativePath})`;
          } else if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) {
            linkMarkup = `![audio](${relativePath})`;
          }
          const nextContent = contentRef.current + '\n' + linkMarkup + '\n';
          setContent(nextContent);
          saveNodeFile(nextContent);
        } else {
          // Edit mode text insertion
          insertMediaLink(relativePath);
        }
        fileAdded = true;
      } catch (err: any) {
        console.error(err);
        setStatusMessage(`Failed to archive ${file.name}: ${err.message}`);
        errorOccurred = true;
      }
    }

    if (errorOccurred) {
      return;
    }

    if (fileAdded) {
      setStatusMessage('Media archived and embedded successfully.');
    } else {
      setStatusMessage('Only image, audio, and video files are supported.');
    }
  };

  const insertMediaLink = (mediaRelativePath: string) => {
    const textarea = textareaRef.current;
    const text = contentRef.current;
    const ext = mediaRelativePath.split('.').pop()?.toLowerCase() || '';
    
    let linkMarkup = `![media](${mediaRelativePath})`;
    if (['mp4', 'webm'].includes(ext)) {
      linkMarkup = `![video](${mediaRelativePath})`;
    } else if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) {
      linkMarkup = `![audio](${mediaRelativePath})`;
    }

    let nextContent = '';
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      nextContent = text.substring(0, start) + '\n' + linkMarkup + '\n' + text.substring(end);
    } else {
      nextContent = text + '\n' + linkMarkup + '\n';
    }

    setContent(nextContent);
    saveNodeFile(nextContent);
  };

  // Click on WikiLinks or standard note links
  const handleLinkClick = async (targetNodeText: string) => {
    if (!projectPath) return;

    const cleanTargetName = targetNodeText.trim().replace(/\.md$/, '');
    const targetFilename = `${cleanTargetName}.md`;
    const targetFilePath = `${projectPath}/${targetFilename}`;

    try {
      const list = await (window as any).electronAPI.listDir(projectPath);
      const exists = list.some((f: any) => f.name.toLowerCase() === targetFilename.toLowerCase());

      if (exists) {
        // Navigate
        updateBloodKey(`events.openFile.${areaId}`, targetFilePath);
      } else {
        // Create if missing
        const create = confirm(`Note "${cleanTargetName}" does not exist. Do you want to create it?`);
        if (create) {
          const defaultContent = `---\ntags:\n  - ${cleanTargetName}\n---\n# ${cleanTargetName}\n\nStart writing here...\n`;
          await (window as any).electronAPI.writeFile(targetFilePath, defaultContent);
          updateBloodKey(`events.fileSaved.${targetFilePath}`, Date.now());
          updateBloodKey(`events.openFile.${areaId}`, targetFilePath);
        }
      }
    } catch (e) {
      console.error('Failed to resolve note links:', e);
    }
  };

  const togglePreviewMode = () => {
    setIsPreviewMode((prev) => {
      const next = !prev;
      localStorage.setItem('dnote_editor_preview_mode', String(next));
      return next;
    });
  };



  // Listen for action triggers carried by lastAction prop
  useEffect(() => {
    if (lastAction) {
      if (lastAction.id === 'editor.save') {
        saveNodeFile();
      } else if (lastAction.id === 'editor.toggleMode') {
        togglePreviewMode();
      }
    }
  }, [lastAction]);

  const handleFocus = () => {
    updateBloodKey('system.focusedAreaId', areaId);
  };

  // Custom Markdown Parser
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
        // Map to our privileged protocol dnote-file://
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
    <div
      className="code-editor"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {/* Editor Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', height: '26px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {isPreviewMode ? '✨ NOTE PREVIEW' : '✍️ NOTE EDITOR'}
        </span>
        <button
          className="area-btn"
          title="Toggle mode (meta+e)"
          onClick={togglePreviewMode}
          style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '10px' }}
        >
          {isPreviewMode ? 'Edit Note' : 'Preview'}
        </button>
      </div>

      {/* YAML Tag Editor Toolbar */}
      {currentFile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.005)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>
            Note Tags (YAML):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            {/* Static Tags (Deletable) */}
            {tags.filter(t => !t.startsWith('re:') && !t.startsWith('run:')).map((t) => (
              <span
                key={t}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'var(--highlight-color)',
                  color: 'var(--accent-color)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1.2px solid var(--accent-color)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                }}
              >
                #{t}
                <button
                  onClick={() => handleRemoveTag(t)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Remove tag"
                >
                  &times;
                </button>
              </span>
            ))}

            {/* Dynamic Rules Pills (Click to expand matched tags) */}
            {tags.filter(t => t.startsWith('re:') || t.startsWith('run:')).map((rule) => {
              const matches = ruleMatches[rule] || [];
              const count = matches.length;
              const isExpanded = expandedRule === rule;

              return (
                <span
                  key={`rule_pill_${rule}`}
                  onClick={() => setExpandedRule(isExpanded ? null : rule)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4.5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: isExpanded ? 'var(--highlight-color)' : 'rgba(255, 255, 255, 0.04)',
                    color: 'var(--accent-color)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: `1.2px ${isExpanded ? 'solid' : 'dashed'} var(--accent-color)`,
                    opacity: 0.9,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title={`Click to ${isExpanded ? 'collapse' : 'expand'} matched tags for this rule`}
                >
                  ⚡️ {rule}
                  <span style={{
                    fontSize: '9.5px',
                    backgroundColor: isExpanded ? 'var(--accent-color)' : 'rgba(255, 59, 48, 0.15)',
                    color: isExpanded ? '#fff' : 'var(--accent-color)',
                    padding: '1px 5px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    marginLeft: '2px'
                  }}>
                    {count}
                  </span>
                </span>
              );
            })}
            
            {/* Add Tag Form */}
            <form onSubmit={handleAddTag} style={{ display: 'inline-block' }}>
              <input
                type="text"
                placeholder="+ Add tag..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                style={{
                  border: '1px dashed var(--border-color)',
                  backgroundColor: 'transparent',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  outline: 'none',
                  color: 'var(--text-main)',
                  width: '75px',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent-color)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-color)')}
              />
            </form>

          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
            <span>Iteration Limit:</span>
            <select
              value={state['project.maxIterations'] || 3}
              onChange={(e) => updateBloodKey('project.maxIterations', Number(e.target.value))}
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                borderRadius: '4px',
                padding: '1px 4px',
                fontSize: '10px',
                outline: 'none',
                cursor: 'pointer'
              }}
              title="Set max iteration depth for dynamic tag propagation"
            >
              <option value={1}>1 (No Propagation)</option>
              <option value={2}>2</option>
              <option value={3}>3 (Default)</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>

          {expandedRule && ruleMatches[expandedRule] && (
            <div style={{
              width: '100%',
              marginTop: '8px',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              maxHeight: '110px',
              overflowY: 'auto',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ width: '100%', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>⚡️ TAGS MATCHED BY "{expandedRule}" ({ruleMatches[expandedRule].length})</span>
                <span onClick={() => setExpandedRule(null)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Collapse ×</span>
              </div>
              {ruleMatches[expandedRule].length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                  No matches found for this rule in the current document.
                </div>
              ) : (
                ruleMatches[expandedRule].map((t) => (
                  <span
                    key={`expanded_match_${t}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      color: 'var(--accent-color)',
                      padding: '1.5px 6px',
                      borderRadius: '10px',
                      border: '1px dashed var(--accent-color)',
                    }}
                  >
                    ⚡️ #{t}
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor Body */}
      {isPreviewMode ? (
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px', backgroundColor: 'transparent', color: 'var(--text-main)', userSelect: 'text' }}>
          {content ? parseMarkdown(content) : <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No content. Switch to edit mode to write.</div>}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="code-textarea"
          value={content}
          onChange={(e) => {
            const nextVal = e.target.value;
            setContent(nextVal);
            // Parse tags in real-time as the user types
            try {
              const parsed = parseFrontmatterTags(nextVal);
              setTags((prev) => {
                const prevClean = prev.slice().sort().join(',');
                const nextClean = parsed.slice().sort().join(',');
                return prevClean === nextClean ? prev : parsed;
              });
            } catch (e) {
              // ignore syntax errors during typing
            }
          }}
          onFocus={handleFocus}
          placeholder="Start writing note..."
          spellCheck={false}
          style={{ border: 'none', resize: 'none', overflowY: 'auto' }}
        />
      )}

      {/* Status Bar */}
      <div className="editor-statusbar">
        <span style={{ flexGrow: 1 }}>{statusMessage}</span>
        <span>{activeTags.length} tags</span>
      </div>

      {isDraggingFile && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            border: '2.5px dashed var(--accent-color)',
            margin: '8px',
            borderRadius: '10px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '20px',
              borderRadius: '50%',
              backgroundColor: 'var(--highlight-color)',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
            Drop media to import
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Supports Image, Audio, and Video files
          </span>
        </div>
      )}
    </div>
  );
}
