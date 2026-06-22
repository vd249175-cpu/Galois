import React from 'react';
import { Blood } from './Blood';
import { ActionRegistry } from './ActionRegistry';

export interface OrganAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  defaultShortcut?: string;
  isToolbar?: boolean;
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
          run: (context) => {
            // Modify Blood state to trigger action on targeted area
            Blood.updateKey(`actions.${act.id}.${context.areaId}`, true);
          },
        });

        // Register shortcut
        if (act.defaultShortcut) {
          ActionRegistry.registerShortcut(act.defaultShortcut, act.id);
        }

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

