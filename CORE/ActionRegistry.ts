import { Blood } from './Blood';
import type React from 'react';

export interface ActionContext {
  areaId: string;
  focusedAreaId: string | null;
}

export interface Action {
  id: string;
  label: string;
  defaultShortcut?: string; // Default hardcoded shortcut
  icon?: React.ReactNode;
  sourceType?: string;
  isGlobal?: boolean;
  run: (context: ActionContext) => void;
}

interface FileShortcut {
  key: string;
  modifiers: string[];
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
  private shortcuts = new Map<string, Set<string>>(); // combo -> actionIds
  private actionShortcuts = new Map<string, string>(); // actionId -> combo

  public register(action: Action) {
    const existing = this.registry.get(action.id);
    this.registry.set(action.id, { ...existing, ...action });
    if (action.defaultShortcut && !this.actionShortcuts.has(action.id)) {
      this.registerShortcut(action.defaultShortcut, action.id);
    }
  }

  public unregister(actionId: string) {
    this.removeShortcutForAction(actionId);
    this.registry.delete(actionId);
  }

  public registerShortcut(combo: string, actionId: string) {
    const action = this.registry.get(actionId);
    if (!action) {
      console.warn(`[ActionRegistry] Cannot bind shortcut for unknown action: ${actionId}`);
      return;
    }

    // Clear old shortcut bound to this action if any
    const oldCombo = this.actionShortcuts.get(actionId);
    if (oldCombo) {
      const oldSet = this.shortcuts.get(oldCombo);
      oldSet?.delete(actionId);
      if (oldSet && oldSet.size === 0) {
        this.shortcuts.delete(oldCombo);
      }
    }

    const cleanCombo = combo.toLowerCase().trim();

    // Shortcuts are scoped: global actions conflict with everyone; page actions
    // conflict only inside the same component type.
    const occupants = this.shortcuts.get(cleanCombo) || new Set<string>();
    occupants.forEach((occupantId) => {
      const occupant = this.registry.get(occupantId);
      const conflicts =
        action.isGlobal ||
        occupant?.isGlobal ||
        (action.sourceType && action.sourceType === occupant?.sourceType);

      if (conflicts) {
        occupants.delete(occupantId);
        this.actionShortcuts.delete(occupantId);
      }
    });

    occupants.add(actionId);
    this.shortcuts.set(cleanCombo, occupants);
    this.actionShortcuts.set(actionId, cleanCombo);
  }

  private removeActionFromShortcutMap(actionId: string, combo: string) {
    const actionIds = this.shortcuts.get(combo);
    if (!actionIds) return;

    actionIds.delete(actionId);
    if (actionIds.size === 0) {
      this.shortcuts.delete(combo);
    }
  }

  public removeShortcutForAction(actionId: string) {
    const oldCombo = this.actionShortcuts.get(actionId);
    if (oldCombo) {
      this.removeActionFromShortcutMap(actionId, oldCombo);
      this.actionShortcuts.delete(actionId);
    }
  }

  public getAction(id: string): Action | undefined {
    return this.registry.get(id);
  }

  public getAllActions(): Action[] {
    return Array.from(this.registry.values());
  }

  public getActionsForScope(sourceType: string | null): Action[] {
    return this.getAllActions().filter((action) => {
      return action.isGlobal || (sourceType && action.sourceType === sourceType);
    });
  }

  public getShortcutForAction(actionId: string): string | undefined {
    return this.actionShortcuts.get(actionId);
  }

  public getActionIdByShortcut(combo: string, focusedComponentType: string | null = null): string | undefined {
    const actionIds = Array.from(this.shortcuts.get(combo.toLowerCase().trim()) || []);
    if (actionIds.length === 0) return undefined;

    const focusedAction = actionIds.find((id) => {
      const action = this.registry.get(id);
      return action?.sourceType && action.sourceType === focusedComponentType;
    });
    if (focusedAction) return focusedAction;

    return actionIds.find((id) => this.registry.get(id)?.isGlobal);
  }

  // Load custom shortcuts from JSON file contents or object
  public loadShortcuts(data: Record<string, any> | string) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      for (const [actionId, combo] of Object.entries(parsed)) {
        if (typeof combo === 'string') {
          this.registerShortcut(combo, actionId);
        } else if (combo && typeof combo === 'object') {
          const fs = combo as FileShortcut;
          if (fs.key) {
            const comboStr = fileShortcutToCombo(fs);
            this.registerShortcut(comboStr, actionId);
          }
        }
      }
    } catch (e) {
      console.error('[ActionRegistry] Failed to parse/load shortcuts:', e);
    }
  }

  // Save current shortcuts into flat JSON format
  public serializeShortcuts(): string {
    const data: Record<string, string> = {};
    this.actionShortcuts.forEach((combo, actionId) => {
      data[actionId] = combo;
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

// ──────────────────────────────────────────────────────────────────────────────
// CORE global layout actions  (layout.* blood channel, isGlobal=true)
// Icons are stored as SVG path strings; RightSidebar renders them.
// ──────────────────────────────────────────────────────────────────────────────

ActionRegistry.register({
  id: 'panel.splitHorizontal',
  label: 'Split Horizontally',
  defaultShortcut: 'meta+d',
  isGlobal: true,
  run: (context) => {
    Blood.updateKey(`layout.splitArea.${context.areaId}`, 'horizontal');
  },
});

ActionRegistry.register({
  id: 'panel.splitVertical',
  label: 'Split Vertically',
  defaultShortcut: 'meta+shift+d',
  isGlobal: true,
  run: (context) => {
    Blood.updateKey(`layout.splitArea.${context.areaId}`, 'vertical');
  },
});

ActionRegistry.register({
  id: 'panel.popOut',
  label: 'Pop Out Panel',
  defaultShortcut: 'meta+shift+p',
  isGlobal: true,
  run: (context) => {
    Blood.updateKey(`layout.popArea.${context.areaId}`, Date.now());
  },
});

ActionRegistry.register({
  id: 'panel.close',
  label: 'Close Panel',
  defaultShortcut: 'meta+w',
  isGlobal: true,
  run: (context) => {
    Blood.updateKey(`layout.removeArea.${context.areaId}`, true);
  },
});

