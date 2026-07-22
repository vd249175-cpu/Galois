import { useEffect } from 'react';
import { ActionRegistry } from './ActionRegistry';
import { AreaLayout } from './AreaLayout';
import { Blood } from './Blood';
import { BC } from './BloodChannels';
import { ComponentRegistry } from './ComponentRegistry';

interface AppBootstrapOptions {
  isPopped: boolean;
  setLayout: (layout: AreaLayout) => void;
}

export function useAppBootstrap({ isPopped, setLayout }: AppBootstrapOptions) {
  useEffect(() => {
    if (isPopped) return;

    // Focus the default area on startup
    Blood.updateKey(BC.system.focusedAreaId, 'editor-root');

    const initApp = async () => {
      let runtimeInfoSnapshot: Awaited<ReturnType<typeof window.electronAPI.getRuntimeInfo>> | null = null;

      // 0. Bootstrap runtime facts used by terminal, settings, and extension tooling.
      try {
        const [runtimeInfo, environmentStatus] = await Promise.all([
          window.electronAPI.getRuntimeInfo(),
          window.electronAPI.getEnvironmentStatus(),
        ]);
        runtimeInfoSnapshot = runtimeInfo;
        Blood.updateKey(BC.system.runtimeMode, runtimeInfo.mode);
        Blood.updateKey(BC.system.extensionPath, runtimeInfo.extensionPath);
        Blood.updateKey(BC.system.sourcePluginPath, runtimeInfo.sourcePluginPath);
        Blood.updateKey(BC.system.canWriteSourcePlugins, runtimeInfo.canWriteSourcePlugins);
        Blood.updateKey(BC.system.agentWorkspace, runtimeInfo.agentWorkspace);
        Blood.updateKey(BC.system.environmentStatus, environmentStatus);
      } catch (err: any) {
        Blood.updateKey(BC.system.environmentStatus, {
          error: err?.message || 'Failed to inspect runtime environment',
        });
      }

      // 1. Load global config and put it in Blood
      try {
        const config = await window.electronAPI.getConfig();
        if (config) {
          Blood.updateKey(BC.system.config, config);
        }
      } catch (_) {}

      // 2. Restore a valid user project from durable app state. localStorage is
      // retained as a one-time compatibility source for existing installations.
      let persistedProject: string | null = null;
      try {
        persistedProject = await window.electronAPI.getLastProjectPath();
      } catch (_) {}
      const legacyProject = localStorage.getItem('dnote_last_project');
      const candidates = [persistedProject, legacyProject].filter(
        (candidate, index, values): candidate is string => Boolean(candidate) && values.indexOf(candidate) === index
      );
      let restoredProject = '';
      for (const candidate of candidates) {
        const pointsAtPackagedTemplate = Boolean(
          runtimeInfoSnapshot?.isPackaged &&
          candidate.includes('/Contents/Resources/template-project')
        );
        if (!pointsAtPackagedTemplate && await window.electronAPI.pathExists(candidate)) {
          restoredProject = candidate;
          break;
        }
      }

      if (restoredProject) {
        Blood.updateKey(BC.system.projectPath, restoredProject);
      } else {
        try {
          const devDefault = await window.electronAPI.getDevDefaultProject();
          if (devDefault) {
            Blood.updateKey(BC.system.projectPath, devDefault);
          }
        } catch (_) {}
      }

      // 2. Load custom shortcuts from the user-visible Galois home.
      try {
        const shortcuts = await window.electronAPI.getShortcuts();
        if (shortcuts) {
          ActionRegistry.loadShortcuts(shortcuts);
          console.log('[App] Custom shortcuts loaded from Galois home.');
        }
      } catch (_) {}

      // 3. Load layout state from the user-visible Galois home.
      try {
        const savedLayout = await window.electronAPI.getLayout();
        const normalizeLayout = (node: AreaLayout): AreaLayout => {
          if (node.type === 'area') {
            const componentType = node.componentType === 'linkGraph'
              ? 'graphView'
              : ComponentRegistry.getComponent(node.componentType)
                ? node.componentType
                : 'editor';
            return { ...node, componentType };
          }
          return {
            ...node,
            first: normalizeLayout(node.first),
            second: normalizeLayout(node.second),
          };
        };
        // Guard: only restore a layout that actually contains at least one area node.
        // An empty/null layout (from a prior session where all panels were closed)
        // would leave the user with a blank screen, so fall back to defaultLayout.
        const hasAnyArea = (node: any): boolean => {
          if (!node) return false;
          if (node.type === 'area') return true;
          return hasAnyArea(node.first) || hasAnyArea(node.second);
        };
        if (savedLayout && hasAnyArea(savedLayout)) {
          setLayout(normalizeLayout(savedLayout));
          console.log('[App] Layout loaded from Galois home.');
        } else if (savedLayout) {
          console.warn('[App] Saved layout has no area nodes — falling back to defaultLayout.');
        }
      } catch (_) {}
    };

    initApp();

    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const restoreProjectState = async (projectPath: string) => {
      if (!projectPath) return;
      try {
        const projectState = await window.electronAPI.getProjectState(projectPath);
        if (!projectState) return;

        const openFiles = projectState.openFiles || {};
        Object.entries(openFiles).forEach(([editorId, filePath]) => {
          if (typeof filePath === 'string' && filePath) {
            Blood.updateKey(BC.events.openFile(editorId), filePath);
          }
        });

        if (Object.keys(openFiles).length === 0 && projectState.activeFile) {
          Blood.updateKey(BC.events.openFile(projectState.activeEditorId || 'editor-root'), projectState.activeFile);
        }

        const cursors = projectState.cursors || {};
        Object.entries(cursors).forEach(([editorId, cursor]) => {
          if (cursor && typeof cursor === 'object') {
            Blood.updateKey(BC.system.editorCursor(editorId), cursor);
          }
        });

        if (projectState.activeEditorId) {
          Blood.updateKey(BC.system.lastFocusedEditorId, projectState.activeEditorId);
          Blood.updateKey(BC.system.focusedAreaId, projectState.activeEditorId);
        }
      } catch (err) {
        console.warn('[App] Failed to restore project state:', err);
      }
    };

    const unsubscribeProjectRestore = Blood.subscribe((changedKeys) => {
      if (!changedKeys.has(BC.system.projectPath)) return;
      const nextProjectPath = Blood.getValue<string>(BC.system.projectPath, '');
      if (nextProjectPath) {
        localStorage.setItem('dnote_last_project', nextProjectPath);
        void window.electronAPI.setLastProjectPath(nextProjectPath);
      }
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => restoreProjectState(nextProjectPath), 150);
    });

    // Validate plugin dependency graph on startup (dev only)
    if (process.env.NODE_ENV === 'development') {
      const issues = ComponentRegistry.validateDependencies();
      if (issues.length > 0) {
        console.warn('[App] Plugin dependency issues:', issues);
      } else {
        console.log('[App] All plugin dependencies satisfied.');
      }
    }

    return () => {
      if (restoreTimer) clearTimeout(restoreTimer);
      unsubscribeProjectRestore();
    };
  }, [isPopped]);

}
