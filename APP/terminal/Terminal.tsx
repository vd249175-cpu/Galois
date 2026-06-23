import React, { useState, useRef, useEffect } from 'react';
import { terminalActions } from './actions';

export interface TerminalTab {
  id: string;
  name: string;
  history: string;
  inputVal: string;
}

export const TerminalComponent = {
  typeId: 'terminal',
  displayName: 'Terminal Console',
  iconName: 'terminal',
  component: TerminalView,
  actions: terminalActions,
  bloodChannels: []
};

function TerminalView({
  lastAction,
}: {
  areaId: string;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    {
      id: 'tab-default',
      name: 'Terminal 1',
      history: 'dnote-macOS ~ % npm run dev\n[info] Server listening on port 5173\n[ready] React compilation active.\n',
      inputVal: '',
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-default');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const inputVal = activeTab.inputVal;
  const history = activeTab.history;

  const setInputVal = (val: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, inputVal: val } : t))
    );
  };

  const setHistory = (updater: string | ((prev: string) => string)) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          const nextHist = typeof updater === 'function' ? updater(t.history) : updater;
          return { ...t, history: nextHist };
        }
        return t;
      })
    );
  };

  const addNewTab = () => {
    const nextIndex = tabs.length + 1;
    const newTabId = `tab-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newTabId,
      name: `Terminal ${nextIndex}`,
      history: `dnote-macOS ~ % # New terminal shell active\n`,
      inputVal: '',
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTabId);
  };

  const closeTab = (tabIdToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;

    const index = tabs.findIndex((t) => t.id === tabIdToClose);
    const updated = tabs.filter((t) => t.id !== tabIdToClose);
    setTabs(updated);

    if (activeTabId === tabIdToClose) {
      const nextActiveIndex = Math.max(0, index - 1);
      setActiveTabId(updated[nextActiveIndex].id);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const command = inputVal.trim();
      if (!command) return;

      setHistory((prev) => prev + `dnote-macOS ~ % ${command}\n`);
      setInputVal('');

      if (command === 'clear') {
        setHistory('');
        return;
      }

      try {
        const result = await (window as any).electronAPI.execCommand(command, '.');
        if (result.stdout) {
          setHistory((prev) => prev + result.stdout);
        }
        if (result.stderr) {
          setHistory((prev) => prev + `Error: ${result.stderr}`);
        }
      } catch (err: any) {
        setHistory((prev) => prev + `Error: ${err.message}\n`);
      }
    }
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Listen for clear triggers carried by lastAction prop
  useEffect(() => {
    if (lastAction && lastAction.id === 'terminal.clear') {
      setHistory('');
    }
  }, [lastAction]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'transparent',
      }}
    >
      {/* Dynamic Tab Bar Navigation */}
      <div className="terminal-tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab-item ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
        <button className="terminal-tab-add" onClick={addNewTab} title="Add New Tab">
          +
        </button>
      </div>

      <div className="terminal-view" style={{ flexGrow: 1, padding: '10px' }}>
        {history}
        <div ref={terminalEndRef} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderTop: '1px solid var(--border-color)',
          padding: '6px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--terminal-green)',
        }}
      >
        <span>dnote-macOS ~ %</span>
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
            color: 'var(--terminal-green)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
          autoFocus
        />
      </div>
    </div>
  );
}
