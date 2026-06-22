import { Blood } from './Blood';

export interface ActionContext {
  areaId: string;
  focusedAreaId: string | null;
}

export interface Action {
  id: string;
  label: string;
  defaultShortcut?: string; // Default hardcoded shortcut
  icon?: React.ReactNode;
  run: (context: ActionContext) => void;
}

interface FileShortcut {
  key: string;
  modifiers: string[];
}

// Convert "meta+shift+d" to JSON format { key: "d", modifiers: ["command", "shift"] }
function comboToFileShortcut(combo: string): FileShortcut {
  const parts = combo.split('+');
  const rawKey = parts[parts.length - 1];
  
  // Normalize key names for storage if needed
  let key = rawKey;
  const modifiers = parts.slice(0, parts.length - 1).map((mod) => {
    if (mod === 'meta') return 'command';
    return mod;
  });
  
  return { key, modifiers };
}

// Convert JSON format { key: "d", modifiers: ["command", "shift"] } to combo "meta+shift+d"
function fileShortcutToCombo(sh: FileShortcut): string {
  const mods = sh.modifiers.map((mod) => {
    if (mod === 'command') return 'meta';
    return mod;
  });
  return [...mods, sh.key].join('+');
}

class ActionRegistryClass {
  private registry = new Map<string, Action>();
  private shortcuts = new Map<string, string>(); // combo -> actionId
  private actionShortcuts = new Map<string, string>(); // actionId -> combo

  public register(action: Action) {
    this.registry.set(action.id, action);
    if (action.defaultShortcut && !this.actionShortcuts.has(action.id)) {
      this.registerShortcut(action.defaultShortcut, action.id);
    }
  }

  public registerShortcut(combo: string, actionId: string) {
    // Clear old shortcut bound to this action if any
    const oldCombo = this.actionShortcuts.get(actionId);
    if (oldCombo) {
      this.shortcuts.delete(oldCombo);
    }

    const cleanCombo = combo.toLowerCase().trim();

    // Clear who occupied this new combo
    const previousOccupantId = this.shortcuts.get(cleanCombo);
    if (previousOccupantId) {
      this.actionShortcuts.delete(previousOccupantId);
    }

    this.shortcuts.set(cleanCombo, actionId);
    this.actionShortcuts.set(actionId, cleanCombo);
  }

  public removeShortcutForAction(actionId: string) {
    const oldCombo = this.actionShortcuts.get(actionId);
    if (oldCombo) {
      this.shortcuts.delete(oldCombo);
      this.actionShortcuts.delete(actionId);
    }
  }

  public getAction(id: string): Action | undefined {
    return this.registry.get(id);
  }

  public getAllActions(): Action[] {
    return Array.from(this.registry.values());
  }

  public getShortcutForAction(actionId: string): string | undefined {
    return this.actionShortcuts.get(actionId);
  }

  public getActionIdByShortcut(combo: string): string | undefined {
    return this.shortcuts.get(combo.toLowerCase().trim());
  }

  // Load custom shortcuts from JSON file contents
  public loadShortcuts(jsonContent: string) {
    try {
      const data = JSON.parse(jsonContent);
      for (const [actionId, value] of Object.entries(data)) {
        if (value && typeof value === 'object') {
          const fs = value as FileShortcut;
          if (fs.key) {
            const combo = fileShortcutToCombo(fs);
            this.registerShortcut(combo, actionId);
          }
        }
      }
    } catch (e) {
      console.error('[ActionRegistry] Failed to parse shortcuts JSON:', e);
    }
  }

  // Save current shortcuts into JSON format
  public serializeShortcuts(): string {
    const data: Record<string, FileShortcut> = {};
    this.actionShortcuts.forEach((combo, actionId) => {
      data[actionId] = comboToFileShortcut(combo);
    });
    return JSON.stringify(data, null, 2);
  }

  public runAction(id: string, context: ActionContext) {
    const action = this.getAction(id);
    if (action) {
      console.log(`[ACTION] Running ${id} on target area: ${context.areaId}`);
      action.run(context);
    }
  }
}

export const ActionRegistry = new ActionRegistryClass();

// Register CORE workspace actions and their default shortcuts
ActionRegistry.register({
  id: 'panel.splitHorizontal',
  label: 'Split Horizontally',
  defaultShortcut: 'meta+d',
  run: (context) => {
    Blood.updateKey(`layout.splitArea.${context.areaId}`, 'horizontal');
  },
});

ActionRegistry.register({
  id: 'panel.splitVertical',
  label: 'Split Vertically',
  defaultShortcut: 'meta+shift+d',
  run: (context) => {
    Blood.updateKey(`layout.splitArea.${context.areaId}`, 'vertical');
  },
});

ActionRegistry.register({
  id: 'panel.close',
  label: 'Close Panel',
  defaultShortcut: 'meta+w',
  run: (context) => {
    Blood.updateKey(`layout.removeArea.${context.areaId}`, true);
  },
});


