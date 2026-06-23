import React from 'react';
import { Blood } from './Blood';
import { ActionRegistry } from './ActionRegistry';

/**
 * OrganAction — unified declaration interface for all plugin toolbar buttons and shortcuts.
 * Follows the "仿生双向反射链路" protocol in AGENTS.md.
 *
 *   id format:  "[plugin-name].[actionName]"   e.g. "editor.save"
 *   icon:        14×14 px thin-stroke SVG (currentColor, strokeWidth=1.5)
 *   signal:      actions.[id].[areaId] = Date.now()   (timestamp, not boolean)
 */
export interface OrganAction {
  id: string;               // global unique: "[plugin-name].[actionName]"
  label: string;            // tooltip / display name
  defaultShortcut?: string; // lowercase "+" separated, e.g. "meta+s"
  isToolbar?: boolean;      // mount to right sidebar when focused
  icon?: React.ReactNode;   // 14×14 SVG, currentColor, strokeWidth=1.5
}

export interface AreaComponent {
  typeId: string;
  displayName: string;
  iconName: string;
  component: React.ComponentType<{ areaId: string }>;
  actions?: OrganAction[];
}

class ComponentRegistryClass {
  private registry = new Map<string, AreaComponent>();

  public register(comp: AreaComponent) {
    this.registry.set(comp.typeId, comp);

    const toolbarActions: string[] = [];

    // Register actions and default shortcuts dynamically
    if (comp.actions) {
      comp.actions.forEach((act) => {
        // Register action into central action registry
        ActionRegistry.register({
          id: act.id,
          label: act.label,
          icon: act.icon,
          defaultShortcut: act.defaultShortcut,
          sourceType: comp.typeId,
          run: (context) => {
            // Modify Blood state to trigger action on targeted area
            Blood.updateKey(`actions.${act.id}.${context.areaId}`, Date.now());
          },
        });

        // Add to toolbar if flag is set
        if (act.isToolbar) {
          toolbarActions.push(act.id);
        }
      });
    }

    // Inject toolbar actions into Blood state for this component type
    if (toolbarActions.length > 0) {
      Blood.updateKey(`injections.${comp.typeId}.toolbar`, toolbarActions);
    }
  }

  public getComponent(typeId: string): AreaComponent | undefined {
    return this.registry.get(typeId);
  }

  public getAvailableTypes(): string[] {
    return Array.from(this.registry.keys());
  }
}

export const ComponentRegistry = new ComponentRegistryClass();
