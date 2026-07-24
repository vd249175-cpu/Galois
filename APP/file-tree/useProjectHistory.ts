import { useState, useEffect, useMemo } from 'react';

export function useProjectHistory(projectPath: string) {
  const [historyList, setHistoryList] = useState<string[]>([]);
  const [demoPath, setDemoPath] = useState<string>('');

  // Load app path dynamically at mount to determine the absolute demo project path
  useEffect(() => {
    const fetchPaths = async () => {
      try {
        const appPath = await (window as any).electronAPI.getAppPath();
        if (appPath) {
          const pathWithSlash = appPath.endsWith('/') ? appPath : `${appPath}/`;
          setDemoPath(`${pathWithSlash}template-project`);
        }
      } catch (err) {
        console.error('Failed to get app path:', err);
      }
    };
    fetchPaths();
  }, []);

  // Load project history list from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('dnote_project_history');
    let parsed: string[] = [];
    if (stored) {
      try {
        parsed = JSON.parse(stored);
      } catch (_) {}
    }
    if (!Array.isArray(parsed)) {
      parsed = [];
    }
    setHistoryList(parsed);
  }, []);

  // Save projectPath to the renderer-local history. Durable last-project state
  // is owned by CORE/App so it does not depend on this panel being mounted.
  useEffect(() => {
    if (!projectPath) return;
    setHistoryList((prev) => {
      const updated = [projectPath, ...prev.filter((p) => p !== projectPath)];
      const capped = updated.slice(0, 10);
      localStorage.setItem('dnote_project_history', JSON.stringify(capped));
      return capped;
    });
  }, [projectPath]);

  // Displayed history project list: ensure demoPath is always the last option and never duplicated
  const displayedHistory = useMemo(() => {
    const filtered = historyList.filter(p => p !== demoPath && p.trim() !== '');
    return [...filtered, demoPath];
  }, [historyList, demoPath]);

  return {
    displayedHistory,
    demoPath,
  };
}
