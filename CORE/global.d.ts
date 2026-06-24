export interface ElectronAPI {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  deleteFile: (filePath: string) => Promise<boolean>;
  listDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDir: boolean; size: number }>>;
  openDirectory: () => Promise<string | null>;
  archiveMedia: (srcPath: string, projectPath: string) => Promise<string>;
  getPathForFile: (file: File) => string;

  execCommand: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string }>;
  openTerminal: (dirPath: string) => Promise<boolean>;
  openAgentTerminal: (dirPath: string) => Promise<boolean>;
  runScript: (scriptPath: string, stdin: string, cwd: string) => Promise<{ stdout: string; stderr: string }>;
  getServiceScriptPath: (pluginFolder: string, scriptName: string) => Promise<string>;
  getAppPath: () => Promise<string>;

  openSecondaryWindow: (id: string, componentType: string, title: string) => Promise<void>;
  closeSecondaryWindow: (id: string) => Promise<void>;
  onSecondaryClosed: (callback: (id: string) => void) => () => void;

  getBloodState: () => Promise<Record<string, any>>;
  updateBloodState: (values: Record<string, any>) => Promise<void>;
  onBloodStateChanged: (callback: (values: Record<string, any>) => void) => () => void;

  spawnTerminal: (id: string, cwd: string, cols: number, rows: number) => Promise<boolean>;
  writeTerminal: (id: string, data: string) => Promise<boolean>;
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<boolean>;
  killTerminal: (id: string) => Promise<boolean>;
  onTerminalOutput: (id: string, callback: (data: string) => void) => () => void;
  onTerminalExit: (id: string, callback: () => void) => () => void;

  getDevDefaultProject: () => Promise<string>;
  getConfig: () => Promise<any>;
  setConfig: (config: any) => Promise<boolean>;
  getShortcuts: () => Promise<any>;
  setShortcuts: (shortcuts: any) => Promise<boolean>;
  getLayout: () => Promise<any>;
  setLayout: (layout: any) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
