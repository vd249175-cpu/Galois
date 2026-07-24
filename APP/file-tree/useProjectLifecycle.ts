import { useEffect } from 'react';

export function useProjectLifecycle(projectPath: string) {
  useEffect(() => {
    if (!projectPath) return;

    let isUnloading = false;

    // Helper to find a project lifecycle script in the script/ directory by prefix (e.g. on_project_open.*)
    const findScriptPath = async (baseName: string): Promise<string | null> => {
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        const hasScriptDir = list.some((f: any) => f.isDir && f.name === 'script');
        if (!hasScriptDir) return null;
        
        const scriptDir = `${projectPath}/script`;
        const scriptList = await (window as any).electronAPI.listDir(scriptDir);
        const found = scriptList.find((f: any) => {
          if (f.isDir) return false;
          const name = f.name.toLowerCase();
          return name.startsWith(baseName.toLowerCase() + '.') && !name.endsWith('.json');
        });
        return found ? `${scriptDir}/${found.name}` : null;
      } catch (err) {
        return null;
      }
    };

    // 1. Run open and run scripts
    const triggerLifecycleScripts = async () => {
      // A. Open hook (runs once, blocking subsequent commands)
      const openScriptPath = await findScriptPath('on_project_open');
      if (openScriptPath) {
        console.log('[Project Lifecycle] Executing open script:', openScriptPath);
        const outPath = `${projectPath}/script/on_project_open.json`;
        const envExtra = {
          DNOTE_PROJECT_PATH: projectPath,
          DNOTE_THREAD_ID: "project_lifecycle",
          DNOTE_OUTPUT_FILE: outPath
        };
        try {
          await (window as any).electronAPI.runScript(openScriptPath, '', projectPath, envExtra);
          console.log('[Project Lifecycle] Open script completed successfully.');
        } catch (err: any) {
          console.error('[Project Lifecycle] Open script failed:', err.message || err);
        }
      }

      // B. Run hook (spawns in background as a daemon)
      const runScriptPath = await findScriptPath('on_project_run');
      if (runScriptPath) {
        console.log('[Project Lifecycle] Executing run script (background daemon):', runScriptPath);
        const outPath = `${projectPath}/script/on_project_run.json`;
        const envExtra = {
          DNOTE_PROJECT_PATH: projectPath,
          DNOTE_THREAD_ID: "project_lifecycle",
          DNOTE_OUTPUT_FILE: outPath
        };
        // Run in background (do not await)
        (window as any).electronAPI.runScript(runScriptPath, '', projectPath, envExtra)
          .then(() => console.log('[Project Lifecycle] Run daemon exited.'))
          .catch((err: any) => console.error('[Project Lifecycle] Run daemon error:', err));
      }
    };

    triggerLifecycleScripts();

    // 2. Handle app close (window exit) via beforeunload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUnloading) return;

      e.preventDefault();
      e.returnValue = '';

      isUnloading = true;

      const runCloseOnUnload = async () => {
        try {
          const closeScriptPath = await findScriptPath('on_project_close');
          if (closeScriptPath) {
            console.log('[Project Lifecycle] Executing close script on unload:', closeScriptPath);
            const outPath = `${projectPath}/script/on_project_close.json`;
            const envExtra = {
              DNOTE_PROJECT_PATH: projectPath,
              DNOTE_THREAD_ID: "project_lifecycle",
              DNOTE_OUTPUT_FILE: outPath
            };
            await (window as any).electronAPI.runScript(closeScriptPath, '', projectPath, envExtra);
            console.log('[Project Lifecycle] Close script unload completed.');
          }
        } catch (err: any) {
          console.error('[Project Lifecycle] Close script unload failed:', err.message || err);
        } finally {
          window.close();
        }
      };

      runCloseOnUnload();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // 3. Handle project switch (cleanup of previous project)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      const runCloseOnSwitch = async () => {
        try {
          const closeScriptPath = await findScriptPath('on_project_close');
          if (closeScriptPath) {
            console.log('[Project Lifecycle] Executing close script on switch:', closeScriptPath);
            const outPath = `${projectPath}/script/on_project_close.json`;
            const envExtra = {
              DNOTE_PROJECT_PATH: projectPath,
              DNOTE_THREAD_ID: "project_lifecycle",
              DNOTE_OUTPUT_FILE: outPath
            };
            await (window as any).electronAPI.runScript(closeScriptPath, '', projectPath, envExtra);
            console.log('[Project Lifecycle] Close script switch completed.');
          }
        } catch (err: any) {
          console.error('[Project Lifecycle] Close script switch failed:', err.message || err);
        }
      };

      runCloseOnSwitch();
    };
  }, [projectPath]);
}
