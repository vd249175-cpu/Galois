import { useEffect, useState, useRef } from 'react';
import { Blood, useBloodChannel } from '../CORE/Blood';
import { useOrganAntibody } from '../CORE/Antibody';

export const EditorComponent = {
  typeId: 'editor',
  displayName: 'Code Editor',
  iconName: 'document',
  component: EditorView,
  actions: [
    {
      id: 'editor.save',
      label: 'Save File',
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

function EditorView({ areaId }: { areaId: string }) {
  const [content, setContent] = useState<string>('# Welcome to DNOTE Notebooks\n\nDouble click a note from the project sidebar to start editing.\n\nYou can use `[[WikiLinks]]` to connect notes together and view them in the Graph View!\n\nTry dragging and dropping images or other media files directly into this editor area to automatically archive and display them.');
  const [currentFile, setCurrentFile] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('No file open');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  const projectPath = useBloodChannel(['project.path'], () =>
    Blood.getValue<string>('project.path', '')
  );

  // 1. Register editor instance in Blood system
  useEffect(() => {
    const editors = Blood.getValue<string[]>('system.activeEditors', []);
    if (!editors.includes(areaId)) {
      Blood.updateKey('system.activeEditors', [...editors, areaId]);
    }
    
    // If no lastFocusedEditorId is set, make this the active one
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

  // 3. Listen to file loading requests targeting this specific area
  const openedFile = useBloodChannel([`events.openFile.${areaId}`], () =>
    Blood.getValue<string>(`events.openFile.${areaId}`, '')
  );

  useEffect(() => {
    if (!openedFile) return;
    
    const loadFile = async () => {
      try {
        const text = await (window as any).electronAPI.readFile(openedFile);
        setContent(text);
        setCurrentFile(openedFile);
        setStatusMessage(`Editing: ${openedFile.split('/').pop()}`);
        setIsPreviewMode(false); // Default to edit mode on open
      } catch (err: any) {
        console.error(err);
        setStatusMessage(`Error loading file: ${err.message}`);
      }
    };
    
    loadFile();
  }, [openedFile]);

  // Handle saving
  const saveFile = async (customContent?: string) => {
    if (!currentFile) {
      setStatusMessage('No file open to save');
      return;
    }
    const textToSave = customContent !== undefined ? customContent : contentRef.current;
    try {
      await (window as any).electronAPI.writeFile(currentFile, textToSave);
      setStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      Blood.updateKey(`events.fileSaved.${currentFile}`, Date.now());
    } catch (err: any) {
      setStatusMessage(`Error saving: ${err.message}`);
    }
  };

  // Drag and Drop media archiving handler
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!projectPath || !currentFile) {
      setStatusMessage('Please open a project and select a file first.');
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    setStatusMessage('Archiving media drop...');
    let fileAdded = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext);
      const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
      const isAudio = ['mp3', 'wav', 'aac', 'm4a'].includes(ext);

      if (isImage || isVideo || isAudio) {
        try {
          const relativePath = await (window as any).electronAPI.archiveMedia(file.path, projectPath);
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
      setStatusMessage('Unsupported format dragged. Only image, video, and audio files are automatically archived.');
    }
  };

  const insertMediaLink = (mediaRelativePath: string) => {
    const textarea = textareaRef.current;
    const text = contentRef.current;
    
    const ext = mediaRelativePath.split('.').pop()?.toLowerCase() || '';
    const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
    const isAudio = ['mp3', 'wav', 'aac', 'm4a'].includes(ext);
    
    let linkMarkup = `![media](${mediaRelativePath})`;
    if (isVideo) {
      linkMarkup = `![video](${mediaRelativePath})`;
    } else if (isAudio) {
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
    saveFile(nextContent);
  };

  const handleLinkClick = (targetNoteName: string) => {
    if (!projectPath) return;
    const cleanNoteName = targetNoteName.replace('.md', '').trim();
    const targetFilePath = `${projectPath}/${cleanNoteName}.md`;
    
    // Trigger file loading on this editor
    Blood.updateKey(`events.openFile.${areaId}`, targetFilePath);
  };

  // Organ Antibodies: listen for Save and Mode Toggle shortcut events
  useOrganAntibody([
    {
      key: `actions.editor.save.${areaId}`,
      condition: (val) => val === true,
      action: () => saveFile(),
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

  // Markdown Parser
  const parseMarkdown = (md: string) => {
    const lines = md.split('\n');
    return lines.map((line, idx) => {
      let content = line;
      
      // Headers
      if (content.startsWith('# ')) {
        return <h1 key={idx} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: '18px 0 10px 0', fontSize: '20px', fontWeight: '700' }}>{renderInline(content.substring(2))}</h1>;
      }
      if (content.startsWith('## ')) {
        return <h2 key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px', margin: '16px 0 8px 0', fontSize: '16px', fontWeight: '600' }}>{renderInline(content.substring(3))}</h2>;
      }
      if (content.startsWith('### ')) {
        return <h3 key={idx} style={{ margin: '14px 0 6px 0', fontSize: '14px', fontWeight: '600' }}>{renderInline(content.substring(4))}</h3>;
      }

      // Checklists
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

      // Blockquote
      if (content.startsWith('> ')) {
        return (
          <blockquote key={idx} style={{ borderLeft: '3px solid var(--accent-color)', paddingLeft: '12px', color: 'var(--text-muted)', margin: '10px 0', fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.01)', padding: '6px 12px', borderRadius: '0 4px 4px 0' }}>
            {renderInline(content.substring(2))}
          </blockquote>
        );
      }

      // Empty line spacer
      if (content.trim() === '') {
        return <div key={idx} style={{ height: '10px' }} />;
      }

      return <p key={idx} style={{ margin: '6px 0', lineHeight: '1.6', fontSize: '13px' }}>{renderInline(content)}</p>;
    });
  };

  const renderInline = (text: string) => {
    let parts: React.ReactNode[] = [text];

    // 1. WikiLinks [[Link]]
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

    // 2. Embedded files ![label](url)
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
            style={{
              maxWidth: '100%',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              margin: '8px 0',
              display: 'block',
            }}
          />
        );
      }
      if (isAudio) {
        return (
          <audio
            key={Math.random()}
            src={absoluteSrc}
            controls
            style={{
              width: '100%',
              margin: '8px 0',
              display: 'block',
            }}
          />
        );
      }

      return (
        <img
          key={Math.random()}
          src={absoluteSrc}
          alt={alt}
          style={{
            maxWidth: '100%',
            maxHeight: '320px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            display: 'block',
            margin: '10px 0',
          }}
        />
      );
    });

    // 3. Document link [label](url)
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
          style={{
            color: 'var(--accent-color)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      );
    });

    // 4. Bold **text**
    parts = splitByRegex(parts, /\*\*([^*]+)\*\*/g, (match) => (
      <strong key={Math.random()}>{match[1]}</strong>
    ));

    // 5. Italic *text*
    parts = splitByRegex(parts, /\*([^*]+)\*/g, (match) => (
      <em key={Math.random()}>{match[1]}</em>
    ));

    // 6. Code block `code`
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', height: '26px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {isPreviewMode ? '✨ RENDER PREVIEW (Read-Only)' : '✍️ SOURCE EDITOR (Markdown)'}
        </span>
        <button
          className="area-btn"
          title="Toggle mode (meta+e)"
          onClick={() => setIsPreviewMode((prev) => !prev)}
          style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '10px', display: 'flex', gap: '3px' }}
        >
          <span>{isPreviewMode ? 'Edit Source' : 'Preview'}</span>
        </button>
      </div>

      {isPreviewMode ? (
        <div
          style={{
            flexGrow: 1,
            overflowY: 'auto',
            padding: '20px',
            backgroundColor: 'transparent',
            color: 'var(--text-main)',
            userSelect: 'text',
          }}
        >
          {parseMarkdown(content)}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="code-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={handleFocus}
          placeholder="# New markdown note..."
          spellCheck={false}
          style={{ border: 'none', resize: 'none', overflowY: 'auto' }}
        />
      )}

      <div className="editor-statusbar">
        <span style={{ flexGrow: 1 }}>{statusMessage}</span>
        <span>{content.length} chars</span>
      </div>
    </div>
  );
}
