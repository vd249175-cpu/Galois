import { createDecorator } from './instantiation';
import { BC } from './BloodChannels';
import { IStateService } from './services';
import { ExtensionCommandContribution, ExtensionRecord, ExtensionServiceDiagnostic, IPlatformService } from './platform';

export const IExtensionHostService = createDecorator<IExtensionHostService>('extensionHostService');

export interface IExtensionHostService {
  readonly _serviceBrand: undefined;
  refreshExtensions(): Promise<ExtensionRecord[]>;
  getCommands(): ExtensionCommandContribution[];
  addDevelopmentPath(): Promise<{ extensions: ExtensionRecord[]; selectedPath: string | null }>;
  removeDevelopmentPath(devPath: string): Promise<ExtensionRecord[]>;
  openUserExtensionsDir(): Promise<void>;
  diagnoseExtensionService(extensionId: string, serviceName: string): Promise<ExtensionServiceDiagnostic>;
  runExtensionCommand(commandId: string, payload: Record<string, any>): Promise<{ stdout: string; stderr: string }>;
  runExtensionService(extensionId: string, serviceName: string, payload: Record<string, any>): Promise<{ stdout: string; stderr: string }>;
}

export class ExtensionHostService implements IExtensionHostService {
  declare readonly _serviceBrand: undefined;
  private commands: ExtensionCommandContribution[] = [];

  constructor(
    @IPlatformService private readonly platformService: IPlatformService,
    @IStateService private readonly stateService: IStateService
  ) {}

  async refreshExtensions(): Promise<ExtensionRecord[]> {
    const extensionDir = await this.platformService.ensureExtensionsDir();
    const extensions = await this.platformService.seedExtensions();
    this.publishExtensions(extensions);
    await this.syncRuntimeInfo();
    if (!this.stateService.getValue(BC.system.extensionPath, '')) {
      this.stateService.updateKey(BC.system.extensionPath, extensionDir);
    }
    return extensions;
  }

  getCommands(): ExtensionCommandContribution[] {
    return this.commands;
  }

  async addDevelopmentPath(): Promise<{ extensions: ExtensionRecord[]; selectedPath: string | null }> {
    const selectedPath = await this.platformService.openDirectory();
    if (!selectedPath) {
      return { extensions: [], selectedPath: null };
    }
    const extensions = await this.platformService.addExtensionDevPath(selectedPath);
    this.publishExtensions(extensions);
    await this.syncRuntimeInfo();
    return { extensions, selectedPath };
  }

  async removeDevelopmentPath(devPath: string): Promise<ExtensionRecord[]> {
    const extensions = await this.platformService.removeExtensionDevPath(devPath);
    this.publishExtensions(extensions);
    await this.syncRuntimeInfo();
    return extensions;
  }

  async openUserExtensionsDir(): Promise<void> {
    const extensionDir = await this.platformService.ensureExtensionsDir();
    await this.platformService.openPath(extensionDir);
  }

  diagnoseExtensionService(extensionId: string, serviceName: string): Promise<ExtensionServiceDiagnostic> {
    return this.platformService.diagnoseExtensionService(extensionId, serviceName);
  }

  async runExtensionService(extensionId: string, serviceName: string, payload: Record<string, any>): Promise<{ stdout: string; stderr: string }> {
    const scriptPath = await this.platformService.getExtensionServiceScriptPath(extensionId, serviceName);
    const extensionCwd = scriptPath.includes('/services/')
      ? scriptPath.split('/services/')[0]
      : scriptPath.replace(/\/[^/]+$/, '');
    const projectPath = this.stateService.getValue(BC.system.projectPath, '');
    const result = await this.platformService.runScript(scriptPath, JSON.stringify(payload), extensionCwd, {
      DNOTE_PROJECT_PATH: projectPath,
    });
    this.stateService.updateKey(BC.events.commandExecuted(`${extensionId}.${serviceName}`), Date.now());
    return result;
  }

  async runExtensionCommand(commandId: string, payload: Record<string, any>): Promise<{ stdout: string; stderr: string }> {
    const command = this.commands.find((candidate) => candidate.command === commandId);
    if (!command) {
      throw new Error(`Extension command not found: ${commandId}`);
    }
    const result = await this.runExtensionService(command.extensionId, command.service, payload);
    this.stateService.updateKey(BC.events.commandExecuted(command.command), Date.now());
    return result;
  }

  private setExtensions(extensions: ExtensionRecord[]) {
    this.commands = extensions.flatMap((extension) => this.readCommandContributions(extension));
  }

  private publishExtensions(extensions: ExtensionRecord[]) {
    this.setExtensions(extensions);
    this.stateService.updateKey(BC.system.extensions, extensions);
    this.stateService.updateKey(BC.system.extensionCommands, this.commands);
    this.stateService.updateKey(BC.system.extensionRefreshTimestamp, Date.now());
  }

  private readCommandContributions(extension: ExtensionRecord): ExtensionCommandContribution[] {
    const commands = extension.manifest?.contributes?.commands;
    if (!Array.isArray(commands)) return [];
    return commands
      .filter((command: any) => command?.command && command?.title && command?.service)
      .map((command: any) => ({
        extensionId: extension.id,
        extensionName: extension.name,
        command: String(command.command),
        title: String(command.title),
        category: command.category ? String(command.category) : undefined,
        service: String(command.service),
      }));
  }

  private async syncRuntimeInfo() {
    const runtimeInfo = await this.platformService.getRuntimeInfo();
    this.stateService.updateKey(BC.system.runtimeMode, runtimeInfo.mode);
    this.stateService.updateKey(BC.system.extensionPath, runtimeInfo.extensionPath);
    this.stateService.updateKey(BC.system.sourcePluginPath, runtimeInfo.sourcePluginPath);
    this.stateService.updateKey(BC.system.canWriteSourcePlugins, runtimeInfo.canWriteSourcePlugins);
    this.stateService.updateKey(BC.system.agentWorkspace, runtimeInfo.agentWorkspace);
  }
}
