import { useEffect } from 'react';
import { ActionRegistry } from '../../CORE/ActionRegistry';
import { Blood } from '../../CORE/Blood';

export function useEditorCommandRegistration(props: any) {
  const { customCommands, editorShortcuts, projectCommands, setStatusMessage } = props;
useEffect(() => {
  // 1. Gather all currently occupied shortcuts (Core & Global Builtins)
  const occupied = new Map<string, string>();
  for (const [id, combo] of Object.entries(editorShortcuts) as Array<[string, string]>) {
    if (combo) {
      occupied.set(combo.toLowerCase().trim(), `editor.${id}`);
    }
  }
  ActionRegistry.getAllActions().forEach(act => {
    if (act.id.startsWith('custom.') || act.id.startsWith('project.')) return;
    const combo = ActionRegistry.getShortcutForAction(act.id);
    if (combo) {
      occupied.set(combo.toLowerCase().trim(), act.id);
    }
  });

  const conflictsToWarn: string[] = [];

  // 2. Register Global User Custom commands (Priority: User Global > Project)
  customCommands.forEach((cmd: any) => {
    ActionRegistry.register({
      id: cmd.id,
      label: cmd.label,
      sourceType: 'editor',
      sourceOwner: 'dynamic',
      defaultShortcut: cmd.defaultShortcut,
      run: (context) => {
        Blood.updateKey(`actions.${cmd.id}.${context.areaId}`, Date.now());
      }
    });

    const userCombo = editorShortcuts[cmd.id];
    const defaultShortcut = (cmd as any).defaultShortcut?.toLowerCase().trim();
    const activeCombo = userCombo !== undefined ? userCombo : defaultShortcut;

    if (activeCombo) {
      const occupant = occupied.get(activeCombo);
      if (occupant && occupant !== `editor.${cmd.id}`) {
        conflictsToWarn.push(`Global custom command "${cmd.label}" shortcut "${activeCombo}" conflicts with "${occupant}".`);
      } else {
        ActionRegistry.registerShortcut(activeCombo, cmd.id);
        occupied.set(activeCombo, cmd.id);
      }
    }
  });

  // 3. Register Project-level commands (Priority: User Global > Project)
  projectCommands.forEach((cmd: any) => {
    // ID collision: skip project command if a global custom command has the same ID
    const hasGlobalOverride = customCommands.some((c: any) => c.id === cmd.id);
    if (hasGlobalOverride) {
      console.warn(`[Editor] Project command "${cmd.id}" overridden by global custom command.`);
      
      // Inherit default shortcut if the global command doesn't have one
      const globalCmd = customCommands.find((c: any) => c.id === cmd.id);
      const cmdShortcut = cmd.defaultShortcut || cmd.shortcut;
      if (globalCmd && !(globalCmd as any).defaultShortcut && cmdShortcut) {
        (globalCmd as any).defaultShortcut = cmdShortcut;
        
        const userCombo = editorShortcuts[cmd.id];
        const activeCombo = userCombo !== undefined ? userCombo : cmdShortcut.toLowerCase().trim();
        if (activeCombo) {
          const occupant = occupied.get(activeCombo);
          if (!occupant || occupant === `editor.${cmd.id}`) {
            ActionRegistry.registerShortcut(activeCombo, cmd.id);
            occupied.set(activeCombo, cmd.id);
          }
        }
      }
      return;
    }

    let targetIsGlobal = false;
    let targetSourceType: string | undefined = undefined;

    if (cmd.scope !== undefined) {
      if (cmd.scope === 'global' || cmd.scope === 'all' || cmd.scope === true) {
        targetIsGlobal = true;
      } else {
        targetIsGlobal = false;
        targetSourceType = String(cmd.scope);
      }
    } else if ((cmd as any).isGlobal !== undefined) {
      targetIsGlobal = !!(cmd as any).isGlobal;
      if (!targetIsGlobal) {
        targetSourceType = 'editor';
      }
    } else {
      // Default behavior: script-based commands are global, insert text commands are editor-only
      targetIsGlobal = !!cmd.script;
      if (!targetIsGlobal) {
        targetSourceType = 'editor';
      }
    }

    ActionRegistry.register({
      id: cmd.id,
      label: cmd.label,
      isGlobal: targetIsGlobal,
      sourceType: targetSourceType,
      sourceOwner: 'dynamic',
      defaultShortcut: cmd.defaultShortcut || cmd.shortcut,
      run: (_context) => {
        // Always route project command execution signals to the active Editor areaId
        const activeEditorId = Blood.getValue<string | null>('system.lastFocusedEditorId', null) || 'editor-root';
        Blood.updateKey(`actions.${cmd.id}.${activeEditorId}`, Date.now());
      }
    });

    const userCombo = editorShortcuts[cmd.id];
    const cmdShortcut = cmd.defaultShortcut || cmd.shortcut;
    const defaultShortcut = cmdShortcut?.toLowerCase().trim();
    const activeCombo = userCombo !== undefined ? userCombo : defaultShortcut;

    if (activeCombo) {
      const occupant = occupied.get(activeCombo);
      if (occupant && occupant !== `editor.${cmd.id}`) {
        conflictsToWarn.push(`Project command "${cmd.label}" shortcut "${activeCombo}" conflicts with "${occupant}". Please reconfigure.`);
      } else {
        ActionRegistry.registerShortcut(activeCombo, cmd.id);
        occupied.set(activeCombo, cmd.id);
      }
    }
  });

  if (conflictsToWarn.length > 0) {
    const msg = `Shortcut Conflict: ${conflictsToWarn.join(' | ')}`;
    console.warn(msg);
    setStatusMessage(`Shortcut Conflict! Check settings or logs for details.`);
    // Also show an alert to user to let them know explicitly
    alert(`Shortcut Conflict Detected:\n${conflictsToWarn.join('\n')}\n\nPlease reconfigure your shortcuts in Settings.`);
  }

  return () => {
    // Cleanup registered shortcuts for custom and project actions on re-runs or unmount
    customCommands.forEach((cmd: any) => {
      ActionRegistry.unregister(cmd.id);
    });
    projectCommands.forEach((cmd: any) => {
      ActionRegistry.unregister(cmd.id);
    });
  };
}, [customCommands, projectCommands, editorShortcuts]);
}
