import { useEffect, useState, useRef } from 'react';
import { parseFrontmatterTags, parseMarkdownBody } from '../utils';
import { getFrontmatterLineCount, updateYamlFrontmatterTags } from './editorUtils';
import { MarkdownPreview } from './MarkdownPreview';
import { TagToolbar } from './TagToolbar';

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

      <TagToolbar
        currentFile={currentFile}
        tags={tags}
        handleRemoveTag={handleRemoveTag}
        ruleMatches={ruleMatches}
        expandedRule={expandedRule}
        setExpandedRule={setExpandedRule}
        handleAddTag={handleAddTag}
        newTagInput={newTagInput}
        setNewTagInput={setNewTagInput}
        maxIterations={state['project.maxIterations'] || 3}
        updateBloodKey={updateBloodKey}
      />

      {/* Editor Body */}
      {isPreviewMode ? (
        <MarkdownPreview
          content={content}
          areaId={areaId}
          projectPath={projectPath}
          state={state}
          updateBloodKey={updateBloodKey}
          handleLinkClick={handleLinkClick}
          isPreviewMode={isPreviewMode}
          hoveredLineIndex={hoveredLineIndex}
          setHoveredLineIndex={setHoveredLineIndex}
          handleLineDrop={handleLineDrop}
        />
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
