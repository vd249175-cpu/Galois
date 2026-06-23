import { useEffect } from 'react';

export function useProjectLifecycle(projectPath: string) {
  useEffect(() => {
    if (!projectPath) return;

    let isUnloading = false;

    // Helper to check if a script exists in the script/ directory
    const checkScriptExists = async (scriptName: string) => {
      try {
        const list = await (window as any).electronAPI.listDir(projectPath);
        const hasScriptDir = list.some((f: any) => f.isDir && f.name === 'script');
        if (!hasScriptDir) return false;
        
        const scriptDir = `${projectPath}/script`;
        const scriptList = await (window as any).electronAPI.listDir(scriptDir);
        return scriptList.some((f: any) => !f.isDir && f.name === scriptName);
      } catch (err) {
        return false;
      }
    };

    // 1. Run on_project_open.py and on_project_run.py
    const triggerLifecycleScripts = async () => {
      const scriptDir = `${projectPath}/script`;
      
      // A. Open hook (runs once, blocking subsequent commands)
      const hasOpenScript = await checkScriptExists('on_project_open.py');
      if (hasOpenScript) {
        console.log('[Project Lifecycle] Executing on_project_open.py...');
        const outPath = `${projectPath}/script/on_project_open.json`;
        const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_open.py`;
        try {
          await (window as any).electronAPI.execCommand(cmd, scriptDir);
          console.log('[Project Lifecycle] on_project_open.py completed successfully.');
        } catch (err: any) {
          console.error('[Project Lifecycle] on_project_open.py failed:', err.message || err);
        }
      }

      // B. Run hook (spawns in background as a daemon)
      const hasRunScript = await checkScriptExists('on_project_run.py');
      if (hasRunScript) {
        console.log('[Project Lifecycle] Executing on_project_run.py (background daemon)...');
        const outPath = `${projectPath}/script/on_project_run.json`;
        // Use '&' to run in background in macOS shell
        const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_run.py &`;
        try {
          await (window as any).electronAPI.execCommand(cmd, scriptDir);
        } catch (err: any) {
          console.error('[Project Lifecycle] Failed to launch on_project_run.py daemon:', err.message || err);
        }
      }
    };

    triggerLifecycleScripts();

    // 2. Handle app close (window exit) via beforeunload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUnloading) return; // Allow unload if already completed/handling

      // Prevent immediate close
      e.preventDefault();
      e.returnValue = ''; // Standard cancellation returnValue

      isUnloading = true;

      // Run cleanup close script
      const runCloseOnUnload = async () => {
        try {
          const hasCloseScript = await checkScriptExists('on_project_close.py');
          if (hasCloseScript) {
            console.log('[Project Lifecycle] Executing on_project_close.py on unload...');
            const scriptDir = `${projectPath}/script`;
            const outPath = `${projectPath}/script/on_project_close.json`;
            const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_close.py`;
            await (window as any).electronAPI.execCommand(cmd, scriptDir);
            console.log('[Project Lifecycle] on_project_close.py unload completed.');
          }
        } catch (err: any) {
          console.error('[Project Lifecycle] on_project_close.py unload failed:', err.message || err);
        } finally {
          // Re-trigger window close which will exit since isUnloading is now true
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
          const hasCloseScript = await checkScriptExists('on_project_close.py');
          if (hasCloseScript) {
            console.log('[Project Lifecycle] Executing on_project_close.py on switch from:', projectPath);
            const scriptDir = `${projectPath}/script`;
            const outPath = `${projectPath}/script/on_project_close.json`;
            const cmd = `DNOTE_THREAD_ID="project_lifecycle" DNOTE_OUTPUT_FILE="${outPath}" uv run on_project_close.py`;
            await (window as any).electronAPI.execCommand(cmd, scriptDir);
            console.log('[Project Lifecycle] on_project_close.py switch completed.');
          }
        } catch (err: any) {
          console.error('[Project Lifecycle] on_project_close.py switch failed:', err.message || err);
        }
      };

      runCloseOnSwitch();
    };
  }, [projectPath]);
}
