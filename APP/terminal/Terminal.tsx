import React, { useEffect, useRef, useState } from 'react';
import { terminalActions } from './actions';
import { Blood, useBloodChannel } from '../../CORE/Blood';

export interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
  autoStarted: boolean;
}

export const TerminalComponent = {
  typeId: 'terminal',
  displayName: '终端控制台',
  iconName: 'terminal',
  component: TerminalView,
  actions: terminalActions,
  bloodChannels: ['system.projectPath'],
  manifest: {
    description: '终端模拟器，后台持久化运行，进入时自动启动 agy 助手',
    reads: ['system.projectPath'],
    writes: [],
    dependsOn: [],
  },
};

function TerminalView({
  lastAction,
}: {
  areaId: string;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = useBloodChannel(['system.projectPath'], () =>
    Blood.getValue<string>('system.projectPath', '')
  );

  const tabs = useBloodChannel(['system.terminalTabs'], () =>
    Blood.getValue<TerminalTab[]>('system.terminalTabs', [])
  );

  const activeTabId = useBloodChannel(['system.terminalActiveTabId'], () =>
    Blood.getValue<string>('system.terminalActiveTabId', 'tab-default')
  );

  const history = useBloodChannel(
    activeTabId ? [`system.terminalHistory.${activeTabId}`] : [],
    () => activeTabId ? Blood.getValue<string>(`system.terminalHistory.${activeTabId}`, '') : ''
  );

  const [inputVal, setInputVal] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef<Map<string, () => void>>(new Map());

  // Initialize tabs if none exist
  useEffect(() => {
    if (tabs.length === 0) {
      const defaultTab: TerminalTab = {
        id: 'tab-default',
        name: '终端 1',
        cwd: projectPath || '.',
        autoStarted: false,
      };
      Blood.update({
        'system.terminalTabs': [defaultTab],
        'system.terminalActiveTabId': 'tab-default',
        'system.terminalHistory.tab-default': '连接中...\n',
      });
    }
  }, [tabs.length, projectPath]);

  // Keep processes spawned and listen for output changes stably
  useEffect(() => {
    if (tabs.length === 0) return;

    // 1. Remove listeners for tabs that no longer exist
    const tabIds = new Set(tabs.map(t => t.id));
    for (const [id, unsub] of listenersRef.current.entries()) {
      if (!tabIds.has(id)) {
        unsub();
        listenersRef.current.delete(id);
      }
    }

    // 2. Add spawn and listeners for new/unregistered tabs
    tabs.forEach((tab) => {
      if (listenersRef.current.has(tab.id)) return;

      // Spawn process
      (window as any).electronAPI.spawnTerminal(tab.id, tab.cwd)
        .then(() => {
          if (!tab.autoStarted) {
            tab.autoStarted = true;
            // Update tabs array
            const currentTabs = Blood.getValue<TerminalTab[]>('system.terminalTabs', []);
            const updated = currentTabs.map(t => t.id === tab.id ? { ...t, autoStarted: true } : t);
            Blood.updateKey('system.terminalTabs', updated);

            // Execute agy directly
            const startCommands = process.platform === 'win32'
              ? 'cls && agy\n'
              : 'clear && agy\n';
            (window as any).electronAPI.writeTerminal(tab.id, startCommands);

            if (projectPath) {
              setTimeout(() => {
                (window as any).electronAPI.writeTerminal(tab.id, `/add-dir ${projectPath}\n`);
              }, 1200);
            }
          }
        })
        .catch((err: any) => console.error('[Terminal] Spawn failed:', err));

      // Listen for output streaming
      const unsub = (window as any).electronAPI.onTerminalOutput(tab.id, (data: string) => {
        const currentHist = Blood.getValue<string>(`system.terminalHistory.${tab.id}`, '');
        Blood.updateKey(`system.terminalHistory.${tab.id}`, currentHist + data);
      });

      listenersRef.current.set(tab.id, unsub);
    });
  }, [tabs, projectPath]);

  // Clean up all output listeners on unmount
  useEffect(() => {
    return () => {
      for (const unsub of listenersRef.current.values()) {
        unsub();
      }
      listenersRef.current.clear();
    };
  }, []);

  // Scroll to bottom on output updates
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Listen for toolbar commands like clear
  useEffect(() => {
    if (!lastAction) return;

    if (lastAction.id === 'terminal.clear') {
      // Clear output history
      Blood.updateKey(`system.terminalHistory.${activeTabId}`, '');
      // Write system clear command to clean terminal stdout
      const clearCmd = process.platform === 'win32' ? 'cls\n' : 'clear\n';
      (window as any).electronAPI.writeTerminal(activeTabId, clearCmd);
    } else if (lastAction.id === 'terminal.openNative') {
      (window as any).electronAPI.openTerminal(projectPath || '.');
    }
  }, [lastAction, activeTabId, projectPath]);

  const addNewTab = () => {
    const nextIndex = tabs.length + 1;
    const newTabId = `tab-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newTabId,
      name: `终端 ${nextIndex}`,
      cwd: projectPath || '.',
      autoStarted: false,
    };

    Blood.update({
      [`system.terminalHistory.${newTabId}`]: '连接中...\n',
      'system.terminalTabs': [...tabs, newTab],
      'system.terminalActiveTabId': newTabId,
    });
  };

  const closeTab = (tabIdToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;

    (window as any).electronAPI.killTerminal(tabIdToClose);

    const index = tabs.findIndex((t) => t.id === tabIdToClose);
    const updated = tabs.filter((t) => t.id !== tabIdToClose);

    Blood.updateKey('system.terminalTabs', updated);
    Blood.updateKey(`system.terminalHistory.${tabIdToClose}`, undefined);

    if (activeTabId === tabIdToClose) {
      const nextActiveIndex = Math.max(0, index - 1);
      Blood.updateKey('system.terminalActiveTabId', updated[nextActiveIndex].id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const command = inputVal;
      // Write directly to standard input stream of shell
      (window as any).electronAPI.writeTerminal(activeTabId, command + '\n');
      setInputVal('');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-panel)',
      }}
    >
      {/* Dynamic Tab Bar Navigation */}
      <div className="terminal-tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab-item ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => Blood.updateKey('system.terminalActiveTabId', tab.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
              <path d="M4 6.5l2 1.5-2 1.5" />
              <line x1="7.5" y1="9.5" x2="10.5" y2="9.5" />
            </svg>
            <span>{tab.name}</span>
            {tabs.length > 1 && (
              <span className="terminal-tab-close" onClick={(e) => closeTab(tab.id, e)}>
                &times;
              </span>
            )}
          </div>
        ))}
        <button className="terminal-tab-add" onClick={addNewTab} title="添加新标签页">
          +
        </button>
      </div>

      {/* Terminal History Display */}
      <div
        className="terminal-view"
        style={{
          flexGrow: 1,
          padding: '12px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          lineHeight: '1.4',
        }}
      >
        {history}
        <div ref={terminalEndRef} />
      </div>

      {/* Input Prompt Box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderTop: '1px solid var(--border-color)',
          padding: '6px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
        }}
      >
        <span style={{ color: 'var(--terminal-green)' }}>dnote-macOS ~ %</span>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flexGrow: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-normal)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
          autoFocus
        />
      </div>
    </div>
  );
}
