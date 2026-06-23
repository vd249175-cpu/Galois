import { useEffect, useState, useRef } from 'react';
import { Blood, useBloodChannel } from '../../CORE/Blood';
import { useOrganAntibody } from '../../CORE/Antibody';
import { parseFrontmatterTags } from '../file-tree/FileTree';

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
}: {
  rawExpression: string;
  areaId: string;
  projectPath: string;
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

  // 3. Subscribe to Blood channel for this JSON data
  const jsonData = useBloodChannel([`script_json:${resolvedRelativeJsonPath}`], () =>
    Blood.getValue<any>(`script_json:${resolvedRelativeJsonPath}`, null)
  );

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
          Blood.updateKey(`script_json:${resolvedRelativeJsonPath}`, parsedData);
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
        Blood.updateKey(`script_json:${resolvedRelativeJsonPath}`, parsedData);
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

function EditorView({ areaId }: { areaId: string }) {
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState<string>(''); // Body content only
  const [currentFile, setCurrentFile] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('No file open');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [newTagInput, setNewTagInput] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;

  const projectPath = useBloodChannel(['project.path'], () =>
    Blood.getValue<string>('project.path', '')
  );

  // 1. Register editor instance
  useEffect(() => {
    const editors = Blood.getValue<string[]>('system.activeEditors', []);
    if (!editors.includes(areaId)) {
      Blood.updateKey('system.activeEditors', [...editors, areaId]);
    }
    if (!Blood.getValue<string | null>('system.lastFocusedEditorId', null)) {
      Blood.updateKey('system.lastFocusedEditorId', areaId);
    }
    return () => {
      const remaining = Blood.getValue<string[]>('system.activeEditors', [])
        .filter((id) => id !== areaId);
      Blood.updateKey('system.activeEditors', remaining);
      if (Blood.getValue<string | null>('system.lastFocusedEditorId', null) === areaId) {
        Blood.updateKey('system.lastFocusedEditorId', remaining[0] || null);
      }
    };
  }, [areaId]);

  // 2. Focus state tracking
  const isFocused = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null) === areaId
  );

  useEffect(() => {
    if (isFocused) {
      Blood.updateKey('system.lastFocusedEditorId', areaId);
    }
  }, [isFocused, areaId]);

  // 3. Listen to file loading requests targeting this area
  const openedFile = useBloodChannel([`events.openFile.${areaId}`], () =>
    Blood.getValue<string>(`events.openFile.${areaId}`, '')
  );

  useEffect(() => {
    if (!openedFile) return;

    const loadMarkdownFile = async () => {
      try {
        const rawContent = await (window as any).electronAPI.readFile(openedFile);
        const parsedTags = parseFrontmatterTags(rawContent);
        const parsedBody = parseMarkdownBody(rawContent);

        setTags(parsedTags);
        setContent(parsedBody);
        setCurrentFile(openedFile);
        
        const noteName = openedFile.split('/').pop()?.replace('.md', '') || '';
        setStatusMessage(`Editing Note: ${noteName}`);
        setIsPreviewMode(false);
      } catch (err: any) {
        console.error('Failed to load note:', openedFile, err);
        setStatusMessage(`Error loading note file.`);
      }
    };

    loadMarkdownFile();
  }, [openedFile]);

  // Handle saving content (merges YAML frontmatter + body)
  const saveNodeFile = async (customContent?: string) => {
    if (!currentFile) {
      setStatusMessage('No file open to save');
      return;
    }
    const bodyToSave = customContent !== undefined ? customContent : contentRef.current;
    const fullContent = serializeFrontmatter(tagsRef.current, bodyToSave);
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      setStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      // Notify sidebar & graph view
      Blood.updateKey(`events.fileSaved.${currentFile}`, Date.now());
    } catch (err: any) {
      setStatusMessage(`Error saving: ${err.message}`);
    }
  };

  // Modify tags list in YAML and write back to the same file
  const handleUpdateTags = async (nextTags: string[]) => {
    if (!currentFile) return;

    const cleanTags = Array.from(new Set(nextTags.map((t) => t.trim()).filter(Boolean))).sort();
    setTags(cleanTags);

    const fullContent = serializeFrontmatter(cleanTags, contentRef.current);
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      setStatusMessage(`Tags updated inline.`);
      
      // Notify HMR / redraw
      Blood.updateKey(`events.fileSaved.${currentFile}`, Date.now());
    } catch (err: any) {
      alert(`Failed to save tag updates: ${err.message}`);
    }
  };

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
    if (!projectPath || !currentFile) {
      setStatusMessage('Open a notebook directory and select a note first.');
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    setStatusMessage('Archiving media drop...');
    let fileAdded = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(ext);

      if (isMedia) {
        try {
          const relativePath = await (window as any).electronAPI.archiveMedia((file as any).path, projectPath);
          insertMediaLink(relativePath);
          fileAdded = true;
        } catch (err: any) {
          console.error(err);
          setStatusMessage(`Failed to archive: ${err.message}`);
        }
      }
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
        Blood.updateKey(`events.openFile.${areaId}`, targetFilePath);
      } else {
        // Create if missing
        const create = confirm(`Note "${cleanTargetName}" does not exist. Do you want to create it?`);
        if (create) {
          const defaultContent = `---\ntags:\n  - ${cleanTargetName}\n---\n# ${cleanTargetName}\n\nStart writing here...\n`;
          await (window as any).electronAPI.writeFile(targetFilePath, defaultContent);
          Blood.updateKey(`events.fileSaved.${targetFilePath}`, Date.now());
          Blood.updateKey(`events.openFile.${areaId}`, targetFilePath);
        }
      }
    } catch (e) {
      console.error('Failed to resolve note links:', e);
    }
  };

  // Organ Antibodies
  useOrganAntibody([
    {
      key: `actions.editor.save.${areaId}`,
      condition: (val) => val === true,
      action: () => saveNodeFile(),
      autoResetValue: false,
    },
    {
      key: `actions.editor.toggleMode.${areaId}`,
      condition: (val) => val === true,
      action: () => setIsPreviewMode((prev) => !prev),
      autoResetValue: false,
    },
  ]);

  const handleFocus = () => {
    Blood.updateKey('system.focusedAreaId', areaId);
  };

  // Custom Markdown Parser
  const parseMarkdown = (md: string) => {
    const lines = md.split('\n');
    return lines.map((line, idx) => {
      let content = line;
      if (content.startsWith('# ')) {
        return <h1 key={idx} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: '18px 0 10px 0', fontSize: '20px', fontWeight: '700' }}>{renderInline(content.substring(2))}</h1>;
      }
      if (content.startsWith('## ')) {
        return <h2 key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px', margin: '16px 0 8px 0', fontSize: '16px', fontWeight: '600' }}>{renderInline(content.substring(3))}</h2>;
      }
      if (content.startsWith('### ')) {
        return <h3 key={idx} style={{ margin: '14px 0 6px 0', fontSize: '14px', fontWeight: '600' }}>{renderInline(content.substring(4))}</h3>;
      }
      if (content.startsWith('- [ ] ')) {
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0' }}>
            <input type="checkbox" disabled checked={false} />
            <span>{renderInline(content.substring(6))}</span>
          </div>
        );
      }
      if (content.startsWith('- [x] ')) {
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0', opacity: 0.55 }}>
            <input type="checkbox" disabled checked={true} />
            <span style={{ textDecoration: 'line-through' }}>{renderInline(content.substring(6))}</span>
          </div>
        );
      }
      if (content.startsWith('- ')) {
        return (
          <li key={idx} style={{ marginLeft: '16px', margin: '4px 0', fontSize: '13px' }}>
            {renderInline(content.substring(2))}
          </li>
        );
      }
      if (content.startsWith('> ')) {
        return (
          <blockquote key={idx} style={{ borderLeft: '3px solid var(--accent-color)', paddingLeft: '12px', color: 'var(--text-muted)', margin: '10px 0', fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.01)', padding: '6px 12px', borderRadius: '0 4px 4px 0' }}>
            {renderInline(content.substring(2))}
          </blockquote>
        );
      }
      if (content.trim() === '') {
        return <div key={idx} style={{ height: '10px' }} />;
      }
      return <p key={idx} style={{ margin: '6px 0', lineHeight: '1.6', fontSize: '13px' }}>{renderInline(content)}</p>;
    });
  };

  const renderInline = (text: string) => {
    let parts: React.ReactNode[] = [text];

    // 0. Reactive template bindings {{ ... }}
    parts = splitByRegex(parts, /\{\{([\s\S]+?)\}\}/g, (match) => {
      const rawExpression = match[1];
      return (
        <ReactiveExpression
          key={Math.random()}
          rawExpression={rawExpression}
          areaId={areaId}
          projectPath={projectPath}
        />
      );
    });

    // 1. WikiLinks [[Note Name]]
    parts = splitByRegex(parts, /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match) => {
      const target = match[1].trim();
      const label = match[2] ? match[2].trim() : target;
      return (
        <span
          key={Math.random()}
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
    parts = splitByRegex(parts, /!\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
      const alt = match[1];
      const url = match[2];
      
      const isRelative = !url.startsWith('http') && !url.startsWith('file://') && !url.startsWith('/');
      const absoluteSrc = isRelative ? `file://${projectPath}/${url}` : url;

      const ext = url.split('.').pop()?.toLowerCase() || '';
      const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
      const isAudio = ['mp3', 'wav', 'aac', 'm4a'].includes(ext);

      if (isVideo) {
        return (
          <video
            key={Math.random()}
            src={absoluteSrc}
            controls
            style={{ maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--border-color)', margin: '8px 0', display: 'block' }}
          />
        );
      }
      if (isAudio) {
        return (
          <audio
            key={Math.random()}
            src={absoluteSrc}
            controls
            style={{ width: '100%', margin: '8px 0', display: 'block' }}
          />
        );
      }

      return (
        <img
          key={Math.random()}
          src={absoluteSrc}
          alt={alt}
          style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'block', margin: '10px 0' }}
        />
      );
    });

    // 3. Document links
    parts = splitByRegex(parts, /\[([^\]]+)\]\(([^)]+)\)/g, (match) => {
      const label = match[1];
      const url = match[2];
      const isMd = url.endsWith('.md');
      return (
        <span
          key={Math.random()}
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
    parts = splitByRegex(parts, /\*\*([^*]+)\*\*/g, (match) => (
      <strong key={Math.random()}>{match[1]}</strong>
    ));

    // 5. Italic
    parts = splitByRegex(parts, /\*([^*]+)\*/g, (match) => (
      <em key={Math.random()}>{match[1]}</em>
    ));

    // 6. Code
    parts = splitByRegex(parts, /`([^`]+)`/g, (match) => (
      <code
        key={Math.random()}
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
    renderMatch: (match: RegExpExecArray) => React.ReactNode
  ): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    parts.forEach((part) => {
      if (typeof part !== 'string') {
        result.push(part);
        return;
      }
      let lastIndex = 0;
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(renderMatch(match));
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
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Editor Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', height: '26px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {isPreviewMode ? '✨ NOTE PREVIEW' : '✍️ NOTE EDITOR'}
        </span>
        <button
          className="area-btn"
          title="Toggle mode (meta+e)"
          onClick={() => setIsPreviewMode((prev) => !prev)}
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
            {tags.map((t) => (
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
          onChange={(e) => setContent(e.target.value)}
          onFocus={handleFocus}
          placeholder="Start writing note..."
          spellCheck={false}
          style={{ border: 'none', resize: 'none', overflowY: 'auto' }}
        />
      )}

      {/* Status Bar */}
      <div className="editor-statusbar">
        <span style={{ flexGrow: 1 }}>{statusMessage}</span>
        <span>{tags.length} tags</span>
      </div>
    </div>
  );
}
