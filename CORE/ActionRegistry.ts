import React from 'react';
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
  sourceType?: string;
  sourceOwner?: 'component' | 'dynamic';
  isGlobal?: boolean;
  run: (context: ActionContext) => void;
}

export interface ShortcutActionSnapshot {
  id: string;
  label: string;
  sourceType: string | null;
  isGlobal: boolean;
  defaultShortcut: string | null;
  activeShortcut: string | null;
  status: 'default' | 'overridden' | 'unbound';
}

export interface ShortcutRegistrySnapshot {
  generatedAt: number;
  actions: ShortcutActionSnapshot[];
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
  private shortcutOverrides = new Map<string, string>(); // persisted/user shortcuts
  private listeners = new Set<() => void>();

  private notifyChanged() {
    this.listeners.forEach((listener) => listener());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public register(action: Action) {
    const existing = this.registry.get(action.id);
    this.registry.set(action.id, { ...existing, ...action });
    if (action.defaultShortcut && !this.actionShortcuts.has(action.id)) {
      this.bindShortcut(action.defaultShortcut, action.id);
    }
    const override = this.shortcutOverrides.get(action.id);
    if (override) {
      this.bindShortcut(override, action.id);
    }
    this.notifyChanged();
  }

  public unregister(actionId: string) {
    this.removeShortcutBindingForAction(actionId);
    this.registry.delete(actionId);
    this.notifyChanged();
  }

  public registerShortcut(combo: string, actionId: string) {
    this.shortcutOverrides.set(actionId, combo);
    this.bindShortcut(combo, actionId);
    this.notifyChanged();
  }

  private bindShortcut(combo: string, actionId: string) {
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
    this.shortcutOverrides.delete(actionId);
    this.removeShortcutBindingForAction(actionId);
    this.notifyChanged();
  }

  private removeShortcutBindingForAction(actionId: string) {
    const oldCombo = this.actionShortcuts.get(actionId);
    if (oldCombo) {
      this.removeActionFromShortcutMap(actionId, oldCombo);
      this.actionShortcuts.delete(actionId);
    }
  }

  public unregisterBySourceType(sourceType: string) {
    const ids = this.getAllActions()
      .filter((action) => action.sourceType === sourceType && action.sourceOwner === 'component')
      .map((action) => action.id);
    ids.forEach((id) => this.unregister(id));
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

  public getShortcutSnapshot(): ShortcutRegistrySnapshot {
    const actions = this.getAllActions()
      .map((action): ShortcutActionSnapshot => {
        const activeShortcut = this.actionShortcuts.get(action.id) || null;
        const defaultShortcut = action.defaultShortcut || null;
        return {
          id: action.id,
          label: action.label,
          sourceType: action.sourceType || null,
          isGlobal: Boolean(action.isGlobal),
          defaultShortcut,
          activeShortcut,
          status: !activeShortcut
            ? 'unbound'
            : this.shortcutOverrides.has(action.id)
              ? 'overridden'
              : 'default',
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    return { generatedAt: Date.now(), actions };
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
      this.shortcutOverrides.clear();
      for (const actionId of Array.from(this.actionShortcuts.keys())) {
        this.removeShortcutBindingForAction(actionId);
      }
      this.registry.forEach((action) => {
        if (action.defaultShortcut) {
          this.bindShortcut(action.defaultShortcut, action.id);
        }
      });
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
      this.notifyChanged();
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
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 1.5 }),
    React.createElement('line', { x1: 8, y1: 2, x2: 8, y2: 14 })
  ),
  run: (context) => {
    Blood.updateKey(`layout.splitArea.${context.areaId}`, 'horizontal');
  },
});

ActionRegistry.register({
  id: 'panel.splitVertical',
  label: 'Split Vertically',
  isGlobal: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 1.5 }),
    React.createElement('line', { x1: 2, y1: 8, x2: 14, y2: 8 })
  ),
  run: (context) => {
    Blood.updateKey(`layout.splitArea.${context.areaId}`, 'vertical');
  },
});

ActionRegistry.register({
  id: 'panel.popOut',
  label: 'Pop Out Panel',
  defaultShortcut: 'meta+shift+p',
  isGlobal: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9' }),
    React.createElement('path', { d: 'M10 2h4v4' }),
    React.createElement('line', { x1: 14, y1: 2, x2: 7.5, y2: 8.5 })
  ),
  run: (context) => {
    Blood.updateKey(`layout.popArea.${context.areaId}`, Date.now());
  },
});

ActionRegistry.register({
  id: 'panel.close',
  label: 'Close Panel',
  defaultShortcut: 'meta+w',
  isGlobal: true,
  icon: React.createElement(
    'svg',
    { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M1.5 1.5l9 9M10.5 1.5l-9 9' })
  ),
  run: (context) => {
    // 必须使用 timestamp：同一按钮连续单击也要触发，boolean 无法区分
    Blood.updateKey(`layout.removeArea.${context.areaId}`, Date.now());
  },
});
