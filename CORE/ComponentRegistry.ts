import React from 'react';
import { Blood } from './Blood';
import { ActionRegistry } from './ActionRegistry';
import { BC } from './BloodChannels';

/**
 * OrganAction — 统一动作与按钮接口定义（见 AGENTS.md §B）
 *
 *   id:              "[plugin-name].[actionName]"   e.g. "editor.save"
 *   icon:            14×14 px 细线条 SVG (currentColor, strokeWidth=1.5)
 *   signal:          actions.[id].[areaId] = Date.now()
 */
export interface OrganAction {
  id: string;               // 全局唯一: "[plugin-name].[actionName]"
  label: string;            // 按钮 tooltip / 动作名
  defaultShortcut?: string; // 小写 + 连接, e.g. "meta+s"
  isToolbar?: boolean;      // 是否挂载到右侧栏
  icon?: React.ReactNode;   // 14×14 SVG
}

/**
 * PluginManifest — 插件契约明文声明
 *
 * 每个 APP 插件必须声明：
 *   reads     — 它读取哪些 Blood 频道（消费者）
 *   writes    — 它写入哪些 Blood 频道（生产者）
 *   dependsOn — 它隐式依赖哪些其他插件提供数据
 *
 * 这消除了插件间的隐式合同，让依赖关系在类型系统层面可见。
 */
export interface PluginManifest {
  /** 这个插件读取的 Blood 频道列表（可含前缀用于通配）*/
  reads: readonly string[];
  /** 这个插件写入的 Blood 频道列表 */
  writes: readonly string[];
  /** 依赖的其他插件 typeId（隐式数据来源，需对方先 mount）*/
  dependsOn?: readonly string[];
  /** 插件功能描述 */
  description?: string;
}

/**
 * AreaComponent — 插件注册对象（完整声明）
 */
export interface AreaComponent {
  typeId: string;
  displayName: string;
  iconName: string;
  icon?: React.ReactNode;
  component: React.ComponentType<{ areaId: string }>;
  actions?: OrganAction[];
  /** 数据频道订阅（ComponentWrapper 用于 stateValues） */
  bloodChannels?: string[] | ((areaId: string) => string[]);
  /** 插件契约声明（明文 reads/writes/dependsOn）*/
  manifest: PluginManifest;
  /**
   * 该插件支持的动态 action ID 前缀列表。
   * ComponentWrapper 收到以这些前缀开头的 action 信号时，会将其注入到该插件的 lastAction prop。
   * 这使 CORE 框架层无需感知具体插件名称即可支持动态 action。
   *
   * @example ['custom.', 'project.']  // editor 插件的动态命令前缀
   */
  dynamicActionPrefixes?: string[];
  /**
   * 在左侧活动栏等 UI 场景下使用的简短中文名称。
   * 不填时回退到 displayName。插件自己声明，CORE 无需 hardcode。
   */
  shortName?: string;
}

class ComponentRegistryClass {
  private registry = new Map<string, AreaComponent>();

  public register(comp: AreaComponent) {
    if (this.registry.has(comp.typeId)) {
      this.unregister(comp.typeId);
    }

    this.registry.set(comp.typeId, comp);

    const toolbarActions: string[] = [];

    // Register actions and default shortcuts dynamically
    if (comp.actions) {
      comp.actions.forEach((act) => {
        ActionRegistry.register({
          id: act.id,
          label: act.label,
          icon: act.icon,
          defaultShortcut: act.defaultShortcut,
          sourceType: comp.typeId,
          run: (context) => {
            // 动作信号必须使用 timestamp（同一按钮连续点击可区分）
            Blood.updateKey(`actions.${act.id}.${context.areaId}`, Date.now());
          },
        });

        if (act.isToolbar) {
          toolbarActions.push(act.id);
        }
      });
    }

    if (toolbarActions.length > 0) {
      Blood.updateKey(BC.system.toolbarInjection(comp.typeId), toolbarActions);
    } else {
      Blood.updateKey(BC.system.toolbarInjection(comp.typeId), []);
    }
    Blood.update({
      [BC.events.registryChanged]: Date.now(),
      [BC.system.devHotUpdateStatus]: {
        kind: 'registry',
        label: comp.typeId,
        timestamp: Date.now(),
      },
    });

    // Dev: log plugin registration with manifest
    console.log(
      `[ComponentRegistry] Registered plugin: ${comp.typeId}`,
      `\n  reads:     ${comp.manifest.reads.join(', ')}`,
      `\n  writes:    ${comp.manifest.writes.join(', ')}`,
      comp.manifest.dependsOn?.length
        ? `\n  dependsOn: ${comp.manifest.dependsOn.join(', ')}`
        : ''
    );
  }

  public getComponent(typeId: string): AreaComponent | undefined {
    return this.registry.get(typeId);
  }

  public unregister(typeId: string) {
    if (!this.registry.has(typeId)) return;
    ActionRegistry.unregisterBySourceType(typeId);
    Blood.updateKey(BC.system.toolbarInjection(typeId), []);
    this.registry.delete(typeId);
    Blood.update({
      [BC.events.registryChanged]: Date.now(),
      [BC.system.devHotUpdateStatus]: {
        kind: 'registry',
        label: `${typeId} removed`,
        timestamp: Date.now(),
      },
    });
  }

  public getAvailableTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /** 检查某插件的依赖是否都已注册（可在启动时校验） */
  public validateDependencies(): { plugin: string; missing: string[] }[] {
    const issues: { plugin: string; missing: string[] }[] = [];
    this.registry.forEach((comp) => {
      const missing = (comp.manifest.dependsOn || []).filter(
        (dep) => !this.registry.has(dep)
      );
      if (missing.length > 0) {
        issues.push({ plugin: comp.typeId, missing });
      }
    });
    return issues;
  }
}

export const ComponentRegistry = new ComponentRegistryClass();
