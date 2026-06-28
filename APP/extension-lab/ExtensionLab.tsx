import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { extensionLabActions } from './actions';
import { BC } from '../../CORE/BloodChannels';
import { useService } from '../../CORE/instantiation';
import { IExtensionHostService } from '../../CORE/extensionHost';
import type { ExtensionCommandContribution, ExtensionRecord, ExtensionServiceDiagnostic } from '../../CORE/platform';

type SideLoadedExtension = ExtensionRecord;

export const ExtensionLabComponent = {
  typeId: 'extensionLab',
  displayName: '侧载扩展实验室',
  shortName: '扩展',
  iconName: 'package',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 5.5 8 2.5l5.5 3-5.5 3-5.5-3Z" />
      <path d="M2.5 5.5v5L8 13.5l5.5-3v-5" />
      <path d="M8 8.5v5" />
    </svg>
  ),
  component: ExtensionLab,
  actions: extensionLabActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.runtimeMode,
    BC.system.extensionPath,
  ],
  manifest: {
    description: '检查并运行 userData/extensions 中的侧载扩展服务脚本',
    reads: [
      BC.system.projectPath,
      BC.system.runtimeMode,
      BC.system.extensionPath,
    ],
    writes: [
      BC.events.scriptError('extensionLab'),
    ],
    dependsOn: [],
  },
};

function ExtensionLab({
  state,
  updateBloodKey,
  lastAction,
}: {
  areaId: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = state[BC.system.projectPath] || '';
  const runtimeMode = state[BC.system.runtimeMode] || 'source-dev';
  const extensionPath = state[BC.system.extensionPath] || '';
  const extensionHostService = useService(IExtensionHostService);
  const [extensions, setExtensions] = useState<SideLoadedExtension[]>([]);
  const [commands, setCommands] = useState<ExtensionCommandContribution[]>([]);
  const [runningKey, setRunningKey] = useState('');
  const [output, setOutput] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState<Record<string, ExtensionServiceDiagnostic>>({});
  const [message, setMessage] = useState('');
  const [isDraggingPackage, setIsDraggingPackage] = useState(false);

  const applyExtensions = (list: SideLoadedExtension[]) => {
    setExtensions(list);
    setCommands(extensionHostService.getCommands());
  };

  const refresh = async () => {
    const list = await extensionHostService.refreshExtensions();
    applyExtensions(list);
  };

  const addDevelopmentPath = async () => {
    const { extensions: list, selectedPath } = await extensionHostService.addDevelopmentPath();
    if (!selectedPath) return;
    try {
      applyExtensions(list);
      setMessage(`已添加开发扩展目录：${selectedPath}`);
    } catch (err: any) {
      setMessage(err?.message || '添加开发扩展目录失败');
    }
  };

  const removeDevelopmentPath = async (devPath: string) => {
    try {
      const list = await extensionHostService.removeDevelopmentPath(devPath);
      applyExtensions(list);
      setMessage(`已移除开发扩展目录：${devPath}`);
    } catch (err: any) {
      setMessage(err?.message || '移除开发扩展目录失败');
    }
  };

  const runService = async (extension: SideLoadedExtension, serviceName: string) => {
    const key = `${extension.id}/${serviceName}`;
    setRunningKey(key);
    try {
      const result = await extensionHostService.runExtensionService(extension.id, serviceName, {
        projectPath,
        mode: runtimeMode,
        sample: [2, 4, 6, 8],
      });
      const text = result.stderr ? `${result.stdout}\n\nstderr:\n${result.stderr}` : result.stdout;
      setOutput((prev) => ({ ...prev, [key]: text }));
    } catch (err: any) {
      const message = err?.message || String(err);
      setOutput((prev) => ({ ...prev, [key]: message }));
      updateBloodKey(BC.events.scriptError('extensionLab'), { message, ts: Date.now() });
    } finally {
      setRunningKey('');
    }
  };

  const diagnoseService = async (extension: SideLoadedExtension, serviceName: string) => {
    const key = `${extension.id}/${serviceName}`;
    try {
      const diagnostic = await extensionHostService.diagnoseExtensionService(extension.id, serviceName);
      setDiagnostics((prev) => ({ ...prev, [key]: diagnostic }));
    } catch (err: any) {
      const message = err?.message || String(err);
      setOutput((prev) => ({ ...prev, [key]: message }));
      updateBloodKey(BC.events.scriptError('extensionLab'), { message, ts: Date.now() });
    }
  };

  const repairExtensionEnvironment = async (extension: SideLoadedExtension) => {
    try {
      setMessage(`正在修复插件依赖：${extension.id}`);
      const result = await window.electronAPI.repairPluginEnvironment(extension.id);
      setMessage(result.repaired
        ? `插件依赖已就绪：${extension.id}`
        : `插件依赖修复后仍有缺失：${extension.id}`);
    } catch (err: any) {
      const text = err?.message || String(err);
      setMessage(`插件依赖修复失败：${text}`);
      updateBloodKey(BC.events.scriptError('extensionLab'), { message: text, ts: Date.now() });
    }
  };


  const runCommand = async (command: ExtensionCommandContribution) => {
    const key = command.command;
    setRunningKey(key);
    try {
      const result = await extensionHostService.runExtensionCommand(command.command, {
        projectPath,
        mode: runtimeMode,
        sample: [2, 4, 6, 8],
      });
      const text = result.stderr ? `${result.stdout}\n\nstderr:\n${result.stderr}` : result.stdout;
      setOutput((prev) => ({ ...prev, [key]: text }));
    } catch (err: any) {
      const message = err?.message || String(err);
      setOutput((prev) => ({ ...prev, [key]: message }));
      updateBloodKey(BC.events.scriptError('extensionLab'), { message, ts: Date.now() });
    } finally {
      setRunningKey('');
    }
  };

  const importExtensionPackage = async (archivePath: string) => {
    try {
      setMessage('正在导入扩展包...');
      const result = await window.electronAPI.importExtensionArchive(archivePath);
      applyExtensions(result.extensions);
      const imported = result.extensions.find((extension) => extension.path === result.extensionPath);
      if (imported) {
        setMessage(`已导入扩展包，正在根据 plugin.json 安装依赖：${imported.id}`);
        const repair = await window.electronAPI.repairPluginEnvironment(imported.id);
        setMessage(repair.repaired
          ? `已导入并修复插件依赖：${result.extensionPath}`
          : `已导入插件，但仍有依赖不可用：${result.extensionPath}`);
      } else {
        setMessage(`已导入扩展包：${result.extensionPath}`);
      }
    } catch (err: any) {
      const text = err?.message || String(err);
      setMessage(`导入失败：${text}`);
      updateBloodKey(BC.events.scriptError('extensionLab'), { message: text, ts: Date.now() });
    }
  };

  const handlePackageDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingPackage(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const archivePath = window.electronAPI.getPathForFile(file);
    if (!archivePath.toLowerCase().endsWith('.zip')) {
      setMessage('请拖入 .zip 扩展包。');
      return;
    }
    await importExtensionPackage(archivePath);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (lastAction?.id === 'extensionLab.refresh') {
      refresh();
    }
  }, [lastAction]);

  return (
    <div style={{ height: '100%', padding: '18px', boxSizing: 'border-box', overflow: 'auto', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '860px' }}>
        <header>
          <h2 style={{ margin: '0 0 6px', fontSize: '18px' }}>侧载扩展实验室</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
            这里运行的是 Electron userData/extensions 下的扩展服务脚本。宿主 UI 在 APP 内置，扩展包本身在可写目录中。
          </p>
        </header>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="settings-action-btn" onClick={refresh}>刷新扩展</button>
          <button className="settings-action-btn" onClick={addDevelopmentPath}>添加开发扩展目录</button>
          <button className="settings-action-btn" onClick={() => extensionHostService.openUserExtensionsDir()}>
            打开侧载目录
          </button>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingPackage(true);
          }}
          onDragLeave={() => setIsDraggingPackage(false)}
          onDrop={handlePackageDrop}
          style={{
            border: `1.5px dashed ${isDraggingPackage ? 'var(--accent-color)' : 'var(--border-color)'}`,
            borderRadius: '14px',
            padding: '16px',
            background: isDraggingPackage
              ? 'color-mix(in srgb, var(--accent-color) 14%, var(--bg-input))'
              : 'var(--bg-input)',
            color: 'var(--text-muted)',
            fontSize: '12px',
            lineHeight: 1.6,
          }}
        >
          将 APP 插件压缩包拖到这里安装。压缩包需要包含 <code>plugin.json</code>，安装后会进入可写的
          <code> userData/extensions/</code>，不会修改只读的 App bundle。
        </div>

        <code style={codeStyle}>{extensionPath || '侧载目录尚未写入 Blood，点击刷新扩展'}</code>
        {message && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{message}</div>}

        {extensions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>还没有发现侧载扩展。</div>
        ) : (
          <section style={cardStyle}>
            <h3 style={{ margin: '0 0 4px', fontSize: '14px' }}>命令贡献</h3>
            {commands.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>当前扩展还没有声明 contributes.commands。</div>
            ) : commands.map((command) => {
              const key = command.command;
              return (
                <div key={command.command} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px' }}>
                      {command.category ? `${command.category}: ` : ''}{command.title}
                      <span style={{ color: 'var(--text-muted)' }}> · {command.command}</span>
                    </div>
                    <button className="settings-action-btn" onClick={() => runCommand(command)} disabled={runningKey === key}>
                      {runningKey === key ? '运行中...' : '运行命令'}
                    </button>
                  </div>
                  {output[key] && <pre style={preStyle}>{output[key]}</pre>}
                </div>
              );
            })}
          </section>
        )}

        {extensions.map((extension) => (
          <section key={extension.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '14px' }}>{extension.name}</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  {extension.id} · {extension.source === 'development' ? '开发目录' : '用户侧载目录'} · {extension.writable ? '可写' : '只读'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <code style={{ ...codeStyle, maxWidth: '360px' }}>{extension.path}</code>
                {extension.source === 'development' && (
                  <button className="settings-action-btn" onClick={() => removeDevelopmentPath(extension.developmentPath || extension.path)}>
                    移除开发目录
                  </button>
                )}
                <button className="settings-action-btn" onClick={() => repairExtensionEnvironment(extension)}>
                  修复插件依赖
                </button>
              </div>
            </div>
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
              {extension.manifest?.description || 'No description'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {(extension.manifest?.services || []).map((service: any) => {
                const key = `${extension.id}/${service.name}`;
                return (
                  <div key={service.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px' }}>
                        {service.label || service.name}
                        <span style={{ color: 'var(--text-muted)' }}> · {service.runtime || 'script'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="settings-action-btn" onClick={() => diagnoseService(extension, service.name)}>
                          诊断
                        </button>
                        <button className="settings-action-btn" onClick={() => runService(extension, service.name)} disabled={runningKey === key}>
                          {runningKey === key ? '运行中...' : '运行服务脚本'}
                        </button>
                      </div>
                    </div>
                    {diagnostics[key] && <pre style={preStyle}>{formatDiagnostic(diagnostics[key])}</pre>}
                    {output[key] && <pre style={preStyle}>{output[key]}</pre>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function formatDiagnostic(diagnostic: ExtensionServiceDiagnostic): string {
  return [
    `service: ${diagnostic.extensionId}/${diagnostic.serviceName}`,
    `runtime: ${diagnostic.runtime}`,
    `script: ${diagnostic.scriptPath}`,
    `script exists: ${diagnostic.scriptExists ? 'yes' : 'no'}`,
    `interpreter: ${diagnostic.interpreter || '(direct executable)'}`,
    `interpreter source: ${diagnostic.interpreterSource}`,
    `fallback: ${diagnostic.usingFallbackInterpreter ? 'yes' : 'no'}`,
    `manifest: ${diagnostic.manifestPath}`,
  ].join('\n');
}

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '12px',
  background: 'var(--bg-panel)',
} as const;

const codeStyle = {
  display: 'block',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-main)',
  fontSize: '11px',
  wordBreak: 'break-all',
} as const;

const preStyle = {
  margin: 0,
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-main)',
  fontSize: '11px',
  lineHeight: 1.45,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
} as const;
