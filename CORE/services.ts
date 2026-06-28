import { createDecorator } from './instantiation';
import { Event, Emitter, IDisposable } from './events';
import { Blood } from './Blood';
import { BC } from './BloodChannels';

// ============================================================================
// 1. IStateService — Global synced state service
// ============================================================================

export const IStateService = createDecorator<IStateService>('stateService');

export interface IStateService {
  readonly _serviceBrand: undefined;
  getValue<T>(key: string, defaultValue: T): T;
  updateKey(key: string, value: any): void;
  onDidChangeKey: Event<{ key: string; value: any }>;
}

export class StateService implements IStateService {
  declare readonly _serviceBrand: undefined;
  private readonly _onDidChangeKey = new Emitter<{ key: string; value: any }>();
  readonly onDidChangeKey: Event<{ key: string; value: any }> = this._onDidChangeKey.event;

  constructor() {
    Blood.subscribe((changedKeys) => {
      for (const key of changedKeys) {
        this._onDidChangeKey.fire({ key, value: Blood.getValue(key, undefined) });
      }
    });
  }

  getValue<T>(key: string, defaultValue: T): T {
    return Blood.getValue(key, defaultValue);
  }

  updateKey(key: string, value: any): void {
    Blood.updateKey(key, value);
  }
}

// ============================================================================
// 2. ILayoutService — Layout split, merge, and focus service
// ============================================================================

export const ILayoutService = createDecorator<ILayoutService>('layoutService');

export interface ILayoutService {
  readonly _serviceBrand: undefined;
  getFocusedAreaId(): string | null;
  setFocusedAreaId(areaId: string | null): void;
  getAreaComponentType(areaId: string): string | null;
  setAreaComponentType(areaId: string, type: string): void;
  splitArea(areaId: string, direction: 'horizontal' | 'vertical'): void;
  removeArea(areaId: string): void;
  onDidFocusArea: Event<string | null>;
  onDidLayoutChange: Event<void>;
}

export class LayoutService implements ILayoutService {
  declare readonly _serviceBrand: undefined;
  private readonly _onDidFocusArea = new Emitter<string | null>();
  readonly onDidFocusArea: Event<string | null> = this._onDidFocusArea.event;

  private readonly _onDidLayoutChange = new Emitter<void>();
  readonly onDidLayoutChange: Event<void> = this._onDidLayoutChange.event;

  constructor(@IStateService private readonly stateService: IStateService) {
    this.stateService.onDidChangeKey((e) => {
      if (e.key === BC.system.focusedAreaId) {
        this._onDidFocusArea.fire(e.value);
      } else if (e.key.startsWith('layout.') || e.key.startsWith('system.areaComponentTypes.')) {
        this._onDidLayoutChange.fire();
      }
    });
  }

  getFocusedAreaId(): string | null {
    return this.stateService.getValue(BC.system.focusedAreaId, null);
  }

  setFocusedAreaId(areaId: string | null): void {
    this.stateService.updateKey(BC.system.focusedAreaId, areaId);
  }

  getAreaComponentType(areaId: string): string | null {
    return this.stateService.getValue(BC.system.areaComponentTypes(areaId), null);
  }

  setAreaComponentType(areaId: string, type: string): void {
    this.stateService.updateKey(BC.system.areaComponentTypes(areaId), type);
  }

  splitArea(areaId: string, direction: 'horizontal' | 'vertical'): void {
    this.stateService.updateKey(BC.layout.splitArea(areaId), { direction, timestamp: Date.now() });
  }

  removeArea(areaId: string): void {
    this.stateService.updateKey(BC.layout.removeArea(areaId), Date.now());
  }
}

// ============================================================================
// 3. IWorkspaceService — DNOTE projects, files, and note operations
// ============================================================================

export const IWorkspaceService = createDecorator<IWorkspaceService>('workspaceService');

export interface IWorkspaceService {
  readonly _serviceBrand: undefined;
  getProjectPath(): string | null;
  setProjectPath(path: string | null): void;
  openFileInArea(areaId: string, filePath: string): void;
  notifyFileSaved(filePath: string): void;
  onDidOpenFile: Event<{ areaId: string; filePath: string }>;
  onDidSaveFile: Event<string>;
}

export class WorkspaceService implements IWorkspaceService {
  declare readonly _serviceBrand: undefined;
  private readonly _onDidOpenFile = new Emitter<{ areaId: string; filePath: string }>();
  readonly onDidOpenFile: Event<{ areaId: string; filePath: string }> = this._onDidOpenFile.event;

  private readonly _onDidSaveFile = new Emitter<string>();
  readonly onDidSaveFile: Event<string> = this._onDidSaveFile.event;

  constructor(@IStateService private readonly stateService: IStateService) {
    this.stateService.onDidChangeKey((e) => {
      if (e.key === BC.system.projectPath) {
        // Project folder opened/changed
      } else if (e.key.startsWith('events.openFile.')) {
        const areaId = e.key.split('.').pop()!;
        this._onDidOpenFile.fire({ areaId, filePath: e.value });
      } else if (e.key.startsWith('events.fileSaved.')) {
        const filePath = e.key.slice('events.fileSaved.'.length);
        this._onDidSaveFile.fire(filePath);
      }
    });
  }

  getProjectPath(): string | null {
    return this.stateService.getValue(BC.system.projectPath, null);
  }

  setProjectPath(path: string | null): void {
    this.stateService.updateKey(BC.system.projectPath, path);
  }

  openFileInArea(areaId: string, filePath: string): void {
    this.stateService.updateKey(BC.events.openFile(areaId), filePath);
  }

  notifyFileSaved(filePath: string): void {
    this.stateService.updateKey(BC.events.fileSaved(filePath), Date.now());
  }
}

// ============================================================================
// 4. IFileService — Unified file access and watch notifications facade
// ============================================================================

export const IFileService = createDecorator<IFileService>('fileService');

export interface IFileService {
  readonly _serviceBrand: undefined;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  listDir(dirPath: string): Promise<any[]>;
  onDidFileChange: Event<string>;
}

export class FileService implements IFileService {
  declare readonly _serviceBrand: undefined;
  private readonly _onDidFileChange = new Emitter<string>();
  readonly onDidFileChange: Event<string> = this._onDidFileChange.event;

  constructor(@IStateService private readonly stateService: IStateService) {
    this.stateService.onDidChangeKey((e) => {
      if (e.key.startsWith('events.fileSaved.')) {
        const filePath = e.key.slice('events.fileSaved.'.length);
        this._onDidFileChange.fire(filePath);
      }
    });
  }

  async readFile(filePath: string): Promise<string> {
    return window.electronAPI.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await window.electronAPI.writeFile(filePath, content);
    this.stateService.updateKey(`events.fileSaved.${filePath}`, Date.now());
  }

  async deleteFile(filePath: string): Promise<void> {
    await window.electronAPI.deleteFile(filePath);
    this.stateService.updateKey(`events.fileSaved.${filePath}`, Date.now());
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await window.electronAPI.renameFile(oldPath, newPath);
    this.stateService.updateKey(`events.fileSaved.${oldPath}`, Date.now());
    this.stateService.updateKey(`events.fileSaved.${newPath}`, Date.now());
  }

  async listDir(dirPath: string): Promise<any[]> {
    return window.electronAPI.listDir(dirPath);
  }
}

// ============================================================================
// 5. IScriptExecutionService — Run external background python/shell tasks
// ============================================================================

export const IScriptExecutionService = createDecorator<IScriptExecutionService>('scriptExecutionService');

export interface IScriptExecutionService {
  readonly _serviceBrand: undefined;
  runScript(pluginFolder: string, scriptName: string, stdin: string, envExtra?: Record<string, string>): Promise<{ stdout: string; stderr: string }>;
  runProjectScript(request: {
    command?: string;
    scriptName?: string;
    cwd?: string;
    stdin?: string;
    envExtra?: Record<string, string>;
    useUv?: boolean;
  }): Promise<{ stdout: string; stderr: string }>;
  execCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string }>;
  onDidScriptFinish: Event<{ scriptName: string; exitCode: number }>;
}

export class ScriptExecutionService implements IScriptExecutionService {
  declare readonly _serviceBrand: undefined;
  private readonly _onDidScriptFinish = new Emitter<{ scriptName: string; exitCode: number }>();
  readonly onDidScriptFinish: Event<{ scriptName: string; exitCode: number }> = this._onDidScriptFinish.event;

  constructor(@IStateService private readonly stateService: IStateService) {
    this.stateService.onDidChangeKey((e) => {
      if (e.key.startsWith('events.commandExecuted.')) {
        const commandId = e.key.slice('events.commandExecuted.'.length);
        this._onDidScriptFinish.fire({ scriptName: commandId, exitCode: 0 });
      }
    });
  }

  async runScript(pluginFolder: string, scriptName: string, stdin: string, envExtra?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
    const scriptPath = await window.electronAPI.getServiceScriptPath(pluginFolder, scriptName);
    const projectPath = this.stateService.getValue(BC.system.projectPath, '');
    const result = await window.electronAPI.runScript(scriptPath, stdin, projectPath, envExtra);
    this.stateService.updateKey(`events.commandExecuted.${scriptName}`, Date.now());
    return result;
  }

  async runProjectScript(request: {
    command?: string;
    scriptName?: string;
    cwd?: string;
    stdin?: string;
    envExtra?: Record<string, string>;
    useUv?: boolean;
  }): Promise<{ stdout: string; stderr: string }> {
    const projectPath = this.stateService.getValue(BC.system.projectPath, '');
    return window.electronAPI.runProjectScript(projectPath, request);
  }

  async execCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
    return window.electronAPI.execCommand(command, cwd);
  }
}

// ============================================================================
// 6. ICommandService — Global action commands dispatcher
// ============================================================================

export const ICommandService = createDecorator<ICommandService>('commandService');

export interface ICommandService {
  readonly _serviceBrand: undefined;
  registerCommand(id: string, handler: (...args: any[]) => void): IDisposable;
  executeCommand(id: string, ...args: any[]): void;
}

export class CommandService implements ICommandService {
  declare readonly _serviceBrand: undefined;
  private readonly _commands = new Map<string, (...args: any[]) => void>();

  registerCommand(id: string, handler: (...args: any[]) => void): IDisposable {
    this._commands.set(id, handler);
    return {
      dispose: () => {
        this._commands.delete(id);
      }
    };
  }

  executeCommand(id: string, ...args: any[]): void {
    const handler = this._commands.get(id);
    if (handler) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[CommandService] Error executing command ${id}:`, err);
      }
    } else {
      console.warn(`[CommandService] Command ${id} is not registered`);
    }
  }
}
