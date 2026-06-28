import { createDecorator } from './instantiation';

export interface ExtensionRecord {
  id: string;
  name: string;
  path: string;
  manifestPath: string;
  manifest: any;
  source?: 'userData' | 'development';
  developmentPath?: string;
  writable?: boolean;
}

export interface ExtensionCommandContribution {
  extensionId: string;
  extensionName: string;
  command: string;
  title: string;
  category?: string;
  service: string;
}

export interface RuntimeInfo {
  mode: 'source-dev' | 'installed-app';
  extensionPath: string;
  extensionDevPaths: string[];
  sourcePluginPath: string;
  canWriteSourcePlugins: boolean;
  agentWorkspace: {
    writableDirs: string[];
    readableDirs: string[];
  };
}

export interface ExtensionServiceDiagnostic {
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
}

export const IPlatformService = createDecorator<IPlatformService>('platformService');

export interface IPlatformService {
  readonly _serviceBrand: undefined;
  ensureExtensionsDir(): Promise<string>;
  seedExtensions(): Promise<ExtensionRecord[]>;
  addExtensionDevPath(devPath: string): Promise<ExtensionRecord[]>;
  removeExtensionDevPath(devPath: string): Promise<ExtensionRecord[]>;
  getRuntimeInfo(): Promise<RuntimeInfo>;
  openDirectory(): Promise<string | null>;
  openPath(targetPath: string): Promise<boolean>;
  getExtensionServiceScriptPath(extensionId: string, scriptName: string): Promise<string>;
  diagnoseExtensionService(extensionId: string, serviceName: string): Promise<ExtensionServiceDiagnostic>;
  runScript(scriptPath: string, stdin: string, cwd: string, envExtra?: Record<string, string>): Promise<{ stdout: string; stderr: string }>;
}

export class PlatformService implements IPlatformService {
  declare readonly _serviceBrand: undefined;

  ensureExtensionsDir(): Promise<string> {
    return window.electronAPI.ensureExtensionsDir();
  }

  seedExtensions(): Promise<ExtensionRecord[]> {
    return window.electronAPI.seedExtensions();
  }

  addExtensionDevPath(devPath: string): Promise<ExtensionRecord[]> {
    return window.electronAPI.addExtensionDevPath(devPath);
  }

  removeExtensionDevPath(devPath: string): Promise<ExtensionRecord[]> {
    return window.electronAPI.removeExtensionDevPath(devPath);
  }

  getRuntimeInfo(): Promise<RuntimeInfo> {
    return window.electronAPI.getRuntimeInfo();
  }

  openDirectory(): Promise<string | null> {
    return window.electronAPI.openDirectory();
  }

  openPath(targetPath: string): Promise<boolean> {
    return window.electronAPI.openPath(targetPath);
  }

  getExtensionServiceScriptPath(extensionId: string, scriptName: string): Promise<string> {
    return window.electronAPI.getExtensionServiceScriptPath(extensionId, scriptName);
  }

  diagnoseExtensionService(extensionId: string, serviceName: string): Promise<ExtensionServiceDiagnostic> {
    return window.electronAPI.diagnoseExtensionService(extensionId, serviceName);
  }

  runScript(scriptPath: string, stdin: string, cwd: string, envExtra?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
    return window.electronAPI.runScript(scriptPath, stdin, cwd, envExtra);
  }
}
