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
  ],
};

function EditorView({ areaId }: { areaId: string }) {
  const [content, setContent] = useState<string>('// Select a file in the File Explorer to edit...');
  const [currentFile, setCurrentFile] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('No file open');
  
  const contentRef = useRef(content);
  contentRef.current = content;

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
      
      // If we closed the last focused editor, fall back to another active editor
      if (Blood.getValue<string | null>('system.lastFocusedEditorId', null) === areaId) {
        Blood.updateKey('system.lastFocusedEditorId', remaining[0] || null);
      }
    };
  }, [areaId]);

  // 2. Listen for focus state to update lastFocusedEditorId in Blood
  const isFocused = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null) === areaId
  );

  useEffect(() => {
    if (isFocused) {
      Blood.updateKey('system.lastFocusedEditorId', areaId);
    }
  }, [isFocused, areaId]);

  // 3. Listen for open file events targeting this specific Editor instance in Blood
  const openedFile = useBloodChannel([`events.openFile.${areaId}`], () =>
    Blood.getValue<string>(`events.openFile.${areaId}`, '')
  );

  // Load file content when openedFile changes
  useEffect(() => {
    if (!openedFile) return;
    
    const loadFile = async () => {
      try {
        const text = await (window as any).electronAPI.readFile(openedFile);
        setContent(text);
        setCurrentFile(openedFile);
        setStatusMessage(`Editing: ${openedFile.split('/').pop()}`);
      } catch (err: any) {
        console.error(err);
        setStatusMessage(`Error loading file: ${err.message}`);
      }
    };
    
    loadFile();
  }, [openedFile]);

  // Handle saving the file
  const saveFile = async () => {
    if (!currentFile) {
      setStatusMessage('No file open to save');
      return;
    }
    try {
      await (window as any).electronAPI.writeFile(currentFile, contentRef.current);
      setStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      // Notify other parts of the app that a file changed
      Blood.updateKey(`events.fileSaved.${currentFile}`, Date.now());
    } catch (err: any) {
      setStatusMessage(`Error saving: ${err.message}`);
    }
  };

  // Organ Antibody: listen for save triggers carried by Blood state
  useOrganAntibody([
    {
      key: `actions.editor.save.${areaId}`,
      condition: (val) => val === true,
      action: () => saveFile(),
      autoResetValue: false,
    },
  ]);

  const handleFocus = () => {
    Blood.updateKey('system.focusedAreaId', areaId);
  };

  return (
    <div className="code-editor">
      <textarea
        className="code-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={handleFocus}
        spellCheck={false}
      />
      <div className="editor-statusbar">
        <span style={{ flexGrow: 1 }}>{statusMessage}</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
}

