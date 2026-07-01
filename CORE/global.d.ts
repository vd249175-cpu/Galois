export interface ElectronAPI {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  deleteFile: (filePath: string) => Promise<boolean>;
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>;
  listDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDir: boolean; size: number }>>;
  pathExists: (targetPath: string) => Promise<boolean>;
  openDirectory: () => Promise<string | null>;
  archiveMedia: (srcPath: string, projectPath: string) => Promise<string>;
  archiveMediaData: (fileName: string, mimeType: string, data: ArrayBuffer, projectPath: string) => Promise<string>;
  getPathForFile: (file: File) => string;

  execCommand: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string }>;
  openTerminal: (dirPath: string) => Promise<boolean>;
  openAgentTerminal: (dirPath: string) => Promise<boolean>;
  runScript: (scriptPath: string, stdin: string, cwd: string, envExtra?: Record<string, string>) => Promise<{ stdout: string; stderr: string }>;
  runProjectScript: (projectPath: string, request: {
    command?: string;
    scriptName?: string;
    cwd?: string;
    stdin?: string;
    envExtra?: Record<string, string>;
    useUv?: boolean;
  }) => Promise<{ stdout: string; stderr: string }>;
  getServiceScriptPath: (pluginFolder: string, scriptName: string) => Promise<string>;
  getExtensionServiceScriptPath: (extensionId: string, scriptName: string) => Promise<string>;
  diagnoseExtensionService: (extensionId: string, serviceName: string) => Promise<{
    extensionId: string;
    extensionPath: string;
    manifestPath: string;
    serviceName: string;
    scriptPath: string;
    scriptExists: boolean;
    runtime: string;
    interpreter: string;
    interpreterSource: string;
    usingFallbackInterpreter: boolean;
    cwd: string;
  }>;
  getAppPath: () => Promise<string>;
  getRuntimeInfo: () => Promise<{
    mode: 'source-dev' | 'installed-app';
    isPackaged: boolean;
    appPath: string;
    galoisHomePath: string;
    classicCodePath: string;
    extensionPath: string;
    extensionDevPaths: string[];
    sourcePluginPath: string;
    canWriteSourcePlugins: boolean;
    agentWorkspace: {
      writableDirs: string[];
      readableDirs: string[];
    };
    extensions: Array<{
      id: string;
      name: string;
      path: string;
      manifestPath: string;
      manifest: any;
      source?: 'userData' | 'development';
      developmentPath?: string;
      writable?: boolean;
    }>;
  }>;
  getClassicCodeWorkspace: () => Promise<{
    sourcePath: string;
    workspacePath: string;
  }>;
  restoreClassicCodeWorkspace: () => Promise<{
    sourcePath: string;
    workspacePath: string;
    copied: boolean;
  }>;
  ensureExtensionsDir: () => Promise<string>;
  listExtensions: () => Promise<Array<{
    id: string;
    name: string;
    path: string;
    manifestPath: string;
    manifest: any;
    source?: 'userData' | 'development';
    developmentPath?: string;
    writable?: boolean;
  }>>;
  seedExtensions: () => Promise<Array<{
    id: string;
    name: string;
    path: string;
    manifestPath: string;
    manifest: any;
    source?: 'userData' | 'development';
    developmentPath?: string;
    writable?: boolean;
  }>>;
  addExtensionDevPath: (devPath: string) => Promise<Array<{
    id: string;
    name: string;
    path: string;
    manifestPath: string;
    manifest: any;
    source?: 'userData' | 'development';
    developmentPath?: string;
    writable?: boolean;
  }>>;
  removeExtensionDevPath: (devPath: string) => Promise<Array<{
    id: string;
    name: string;
    path: string;
    manifestPath: string;
    manifest: any;
    source?: 'userData' | 'development';
    developmentPath?: string;
    writable?: boolean;
  }>>;
  openPath: (targetPath: string) => Promise<boolean>;
  importExtensionArchive: (archivePath: string) => Promise<{
    extensionPath: string;
    extensions: Array<{
      id: string;
      name: string;
      path: string;
      manifestPath: string;
      manifest: any;
      source?: 'userData' | 'development';
      developmentPath?: string;
      writable?: boolean;
    }>;
  }>;
  getEnvironmentStatus: () => Promise<Record<string, any>>;
  inspectProjectEnvironment: (projectPath: string) => Promise<{
    projectPath: string;
    usesUv: boolean;
    hasPyproject: boolean;
    manifestPath: string | null;
    pyprojectPath: string | null;
    packages: Array<{
      name: string;
      importName: string;
      source: string;
      installed: boolean;
    }>;
  }>;
  repairProjectEnvironment: (projectPath: string) => Promise<{
    projectPath: string;
    commands: string[];
    before: any;
    after: any;
    repaired: boolean;
  }>;
  ensureNotebookProjectDeclaration: (projectPath: string) => Promise<{
    projectPath: string;
    created: string[];
  }>;
  inspectPluginEnvironment: (extensionId: string) => Promise<{
    extensionId: string;
    extensionPath: string;
    manifestPath: string;
    interpreter: string;
    packages: Array<{
      name: string;
      importName: string;
      source: string;
      installed: boolean;
    }>;
  }>;
  repairPluginEnvironment: (extensionId: string) => Promise<{
    extensionId: string;
    extensionPath: string;
    commands: string[];
    before: any;
    after: any;
    repaired: boolean;
  }>;
  logRendererError: (errorMsg: any) => Promise<boolean>;

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
  listThemes: () => Promise<Array<{ id: string; name: string; path: string; source: string }>>;
  getThemeCss: (themeId: string) => Promise<string>;
  getShortcuts: () => Promise<any>;
  setShortcuts: (shortcuts: any) => Promise<boolean>;
  getLayout: () => Promise<any>;
  setLayout: (layout: any) => Promise<boolean>;
  getProjectState: (projectPath: string) => Promise<any>;
  setProjectState: (projectPath: string, state: any) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
