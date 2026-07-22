import { useCallback, useEffect, useRef, useState } from 'react';

export interface ProjectCommand {
  id: string;
  label: string;
  desc?: string;
  content?: string;
  defaultShortcut?: string;
  shortcut?: string;
  script?: string;
  scope?: string | boolean;
  isGlobal?: boolean;
}

function parseProjectCommands(raw: string): ProjectCommand[] {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.commands)) return parsed.commands;
  return [];
}

export function useProjectCommands(projectPath: string, commandsSavedEvent: unknown) {
  const [commands, setCommands] = useState<ProjectCommand[]>([]);
  const lastRawRef = useRef('');

  const reload = useCallback(async () => {
    if (!projectPath) return;
    const configPath = `${projectPath}/command/commands.json`;
    try {
      const raw = await (window as any).electronAPI.readFile(configPath);
      if (typeof raw !== 'string' || raw === lastRawRef.current) return;
      const nextCommands = parseProjectCommands(raw);
      lastRawRef.current = raw;
      setCommands(nextCommands);
    } catch (error) {
      // External agents may replace the file in more than one filesystem step.
      // Keep the last valid command set until a complete JSON document is ready.
      console.warn('[Editor] Project commands reload deferred:', error);
    }
  }, [projectPath]);

  useEffect(() => {
    lastRawRef.current = '';
    if (!projectPath) {
      setCommands([]);
      return;
    }

    void reload();
    const intervalId = window.setInterval(() => void reload(), 1000);
    const handleFocus = () => void reload();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [projectPath, reload]);

  useEffect(() => {
    if (commandsSavedEvent) void reload();
  }, [commandsSavedEvent, reload]);

  return commands;
}
