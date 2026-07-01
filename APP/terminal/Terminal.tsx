/**
 * APP/terminal/Terminal.tsx
 *
 * 真正的原生 PTY 终端组件（xterm.js + node-pty）
 *
 * 生命周期设计：
 * - tabs / activeTabId 存在 Blood 全局状态（跨卸载/挂载持久）
 * - xtermInstances / startedTabIds 是模块级常量（跨 React 生命周期持久）
 * - 组件卸载后 xterm 容器孤立，重新挂载时 re-attach 到新 wrapper DOM
 * - startedTabIds 防止重挂时重复发送助手初始化命令
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { terminalActions } from './actions';
import { Blood, useBloodChannel } from '../../CORE/Blood';
import { BC } from '../../CORE/BloodChannels';
import '@xterm/xterm/css/xterm.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TerminalTab {
  id: string;
  name: string;
  projectPath: string;
}

interface XTermInstance {
  term: XTerm;
  fit: FitAddon;
  container: HTMLDivElement;
  // IPC unsubscribe functions — persist so we don't double-register
  unsubOutput: () => void;
  unsubExit: () => void;
}

// ─── Module-level state (survives React component mount/unmount) ──────────────

/** All active xterm + PTY instances. Key = tabId */
const xtermInstances = new Map<string, XTermInstance>();

/** Tab IDs that have already had their assistant initialization commands sent */
const startedTabIds = new Set<string>();

/** Last time we attempted to auto-launch AGY for a tab */
const agyLaunchAttempts = new Map<string, number>();

/** Tabs that have emitted Antigravity/AGY output */
const antigravityDetectedTabIds = new Set<string>();

/** Blood keys for terminal state — use BC constants from BloodChannels */
const BLOOD_TABS       = BC.system.terminalTabs;
const BLOOD_ACTIVE_TAB = BC.system.terminalActiveTabId;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeAgentDir(dirPath: string): string {
  return dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
}

function getAgentWorkspaceDirs(notesProject: string): string[] {
  const runtimeWorkspace = Blood.getValue<{ readableDirs?: string[] } | null>(BC.system.agentWorkspace, null);
  const sourcePluginPath = normalizeAgentDir(Blood.getValue<string>(BC.system.sourcePluginPath, ''));
  return Array.from(new Set([
    notesProject,
    ...(runtimeWorkspace?.readableDirs || []),
  ].filter(Boolean)))
    .filter((dirPath) => normalizeAgentDir(dirPath) !== sourcePluginPath)
    .map(normalizeAgentDir);
}

function getAutoStartAgy(config: any): boolean {
  return config?.terminal?.autoStartAgy !== false;
}

function getAgyLaunchThrottleMs(): number {
  return 2500;
}

// ─── Plugin manifest ──────────────────────────────────────────────────────────

export const TerminalComponent = {
  typeId: 'terminal',
  displayName: '终端控制台',
  shortName: '控制台',
  iconName: 'terminal',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M4 6.5l2 1.5-2 1.5" />
      <line x1="7.5" y1="9.5" x2="10.5" y2="9.5" />
    </svg>
  ),
  component: TerminalView,
  actions: terminalActions,
  bloodChannels: [BC.system.projectPath, BC.system.agentWorkspace, BC.system.config],
  manifest: {
    description: '原生 PTY 终端（xterm.js + node-pty），可选接入外部 agy 并同步笔记项目',
    reads: [BC.system.projectPath, BC.system.agentWorkspace, BC.system.config],
    writes: [
      BC.system.terminalTabs,         // Tab 列表持久化到 Blood
      BC.system.terminalActiveTabId,  // 活跃 Tab ID
    ],
    dependsOn: [],
  },
};

// ─── Main Component ───────────────────────────────────────────────────────────

function TerminalView({
  areaId,
  lastAction,
}: {
  areaId: string;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const projectPath = useBloodChannel([BC.system.projectPath], () =>
    Blood.getValue<string>(BC.system.projectPath, '')
  );
  const focusedAreaId = useBloodChannel([BC.system.focusedAreaId], () =>
    Blood.getValue<string | null>(BC.system.focusedAreaId, null)
  );
  const terminalFontSize = useBloodChannel([BC.system.config], () => {
    const config = Blood.getValue<any>(BC.system.config, {});
    return Number(config?.terminal?.fontSize) || 13;
  });

  // Mirror Blood tabs into local state for rendering
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [appDir, setAppDir] = useState<string>('');

  const xtermWrapperRef = useRef<HTMLDivElement>(null);
  const appDirRef = useRef<string>('');
  const activeTabIdRef = useRef<string>('');
  activeTabIdRef.current = activeTabId;
  appDirRef.current = appDir;

  const prevProjectPathRef = useRef<string>('');

  // ─── Helpers to write to Blood + local state atomically ────────────────────

  const applyTabs = useCallback((newTabs: TerminalTab[]) => {
    Blood.updateKey(BLOOD_TABS, newTabs);
    setTabs(newTabs);
  }, []);

  const applyActiveTabId = useCallback((id: string) => {
    Blood.updateKey(BLOOD_ACTIVE_TAB, id);
    setActiveTabId(id);
  }, []);

  const tryLaunchAgy = useCallback((tabId: string, notesProject: string, reason: 'spawn' | 'focus') => {
    const config = Blood.getValue<any>(BC.system.config, {});
    if (!getAutoStartAgy(config)) return;
    if (antigravityDetectedTabIds.has(tabId)) return;

    const lastAttempt = agyLaunchAttempts.get(tabId) || 0;
    if (reason === 'focus' && lastAttempt && Date.now() - lastAttempt < getAgyLaunchThrottleMs()) {
      return;
    }

    const agentDirs = getAgentWorkspaceDirs(notesProject);
    agyLaunchAttempts.set(tabId, Date.now());
    startedTabIds.add(tabId);

    setTimeout(() => {
      if (antigravityDetectedTabIds.has(tabId)) return;
      if (agentDirs.length > 0) {
        const addDirArgs = agentDirs.map((dir) => `--add-dir ${shellQuote(dir)}`).join(' ');
        window.electronAPI.writeTerminal(tabId, `agy ${addDirArgs}\r`);
      } else {
        window.electronAPI.writeTerminal(tabId, 'agy\r');
      }
    }, reason === 'spawn' ? 600 : 180);
  }, []);

  // ─── Create a brand-new xterm + PTY tab ──────────────────────────────────

  const spawnTab = useCallback((tabId: string, tabName: string, notesProject: string, skipBloodUpdate = false) => {
    const wrapper = xtermWrapperRef.current;
    if (!wrapper) return;

    // If instance already exists (component remounted), just re-attach container
    if (xtermInstances.has(tabId)) {
      const inst = xtermInstances.get(tabId)!;
      if (!wrapper.contains(inst.container)) {
        wrapper.appendChild(inst.container);
      }
      return;
    }

    // ── Create permanent DOM container ──
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;inset:0;overflow:hidden;display:none;';
    wrapper.appendChild(container);

    // ── Create xterm instance ──
    const term = new XTerm({
      fontFamily: '"JetBrains Mono","Cascadia Code",Menlo,monospace',
      fontSize: terminalFontSize,
      lineHeight: 1.4,
      theme: {
        background: '#141414', foreground: '#cccccc',
        cursor: '#cccccc', selectionBackground: 'rgba(255,255,255,0.15)',
        black: '#141414',    brightBlack: '#555',
        red: '#f44747',      brightRed: '#f44747',
        green: '#4ec9b0',    brightGreen: '#4ec9b0',
        yellow: '#dcdcaa',   brightYellow: '#dcdcaa',
        blue: '#569cd6',     brightBlue: '#9cdcfe',
        magenta: '#c586c0',  brightMagenta: '#c586c0',
        cyan: '#4fc1ff',     brightCyan: '#4fc1ff',
        white: '#cccccc',    brightWhite: '#ffffff',
      },
      cursorBlink: true,
      scrollback: 8000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    setTimeout(() => { fit.fit(); term.focus(); }, 30);

    // ── PTY output → xterm ──
    const unsubOutput = window.electronAPI.onTerminalOutput(tabId, (data: string) => {
      if (data && data.toLowerCase().includes('antigravity')) {
        antigravityDetectedTabIds.add(tabId);
      }
      term.write(data);
    });
    const unsubExit = window.electronAPI.onTerminalExit(tabId, () => {
      term.write('\r\n\x1b[33m[进程已退出]\x1b[0m\r\n');
    });

    // ── xterm input → PTY ──
    term.onData((data) => {
      window.electronAPI.writeTerminal(tabId, data);
    });

    xtermInstances.set(tabId, { term, fit, container, unsubOutput, unsubExit });

    // ── Spawn PTY in the writable notebook workspace; appDir is only a fallback.
    const dir = notesProject || appDirRef.current;
    window.electronAPI
      .spawnTerminal(tabId, dir, term.cols || 80, term.rows || 24)
      .then(() => {
        tryLaunchAgy(tabId, notesProject, 'spawn');
      })
      .catch((err: any) => {
        term.write(`\r\n\x1b[31m[错误] PTY 启动失败: ${err.message}\x1b[0m\r\n`);
      });

    if (!skipBloodUpdate) {
      // Update tabs state
      const currentTabs = Blood.getValue<TerminalTab[]>(BLOOD_TABS, []);
      const newTab: TerminalTab = { id: tabId, name: tabName, projectPath: notesProject };
      const newTabs = [...currentTabs, newTab];
      applyTabs(newTabs);
      applyActiveTabId(tabId);
    }
  }, [applyTabs, applyActiveTabId, tryLaunchAgy, terminalFontSize]);

  useEffect(() => {
    for (const inst of xtermInstances.values()) {
      inst.term.options.fontSize = terminalFontSize;
      setTimeout(() => inst.fit.fit(), 0);
    }
  }, [terminalFontSize]);

  // ─── On appDir ready: restore from Blood or bootstrap ────────────────────

  useEffect(() => {
    if (!appDir) return;

    const savedTabs   = Blood.getValue<TerminalTab[]>(BLOOD_TABS, []);
    const savedActive = Blood.getValue<string>(BLOOD_ACTIVE_TAB, '');
    const wrapper     = xtermWrapperRef.current;
    if (!wrapper) return;

    if (savedTabs.length > 0) {
      // ── Restore: re-attach orphaned containers to new wrapper DOM ──
      for (const tab of savedTabs) {
        const inst = xtermInstances.get(tab.id);
        if (inst) {
          if (!wrapper.contains(inst.container)) {
            wrapper.appendChild(inst.container);
          }
        } else {
          // Re-create the lost instance
          spawnTab(tab.id, tab.name, tab.projectPath, true);
        }
      }
      setTabs(savedTabs);
      const activeId = savedActive && savedTabs.find(t => t.id === savedActive)
        ? savedActive
        : savedTabs[0].id;
      setActiveTabId(activeId);
      prevProjectPathRef.current = savedTabs[0]?.projectPath || '';
    } else {
      // ── First bootstrap: create initial tab ──
      const project = Blood.getValue<string>(BC.system.projectPath, '');
      prevProjectPathRef.current = project;
      const tabId = `pty-${areaId}-0`;
      spawnTab(tabId, '终端 1', project);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appDir]);

  // ─── Fetch app root dir once on mount ────────────────────────────────────

  useEffect(() => {
    window.electronAPI.getAppPath().then((dir: string) => {
      setAppDir(dir);
    });
  }, []);

  // ─── Show/hide containers when active tab changes ─────────────────────────

  useEffect(() => {
    for (const [id, inst] of xtermInstances.entries()) {
      inst.container.style.display = id === activeTabId ? 'block' : 'none';
    }
    const inst = xtermInstances.get(activeTabId);
    if (inst) {
      requestAnimationFrame(() => {
        inst.fit.fit();
        window.electronAPI
          .resizeTerminal(activeTabId, inst.term.cols, inst.term.rows)
          .catch(() => {});
        inst.term.focus();
      });
    }
  }, [activeTabId]);

  // ─── Resize observer for wrapper ─────────────────────────────────────────

  useEffect(() => {
    const wrapper = xtermWrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => {
      const id = activeTabIdRef.current;
      const inst = xtermInstances.get(id);
      if (!inst) return;
      inst.fit.fit();
      window.electronAPI.resizeTerminal(id, inst.term.cols, inst.term.rows).catch(() => {});
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // ─── New tab on notes project switch ─────────────────────────────────────

  useEffect(() => {
    if (!appDir || !projectPath) return;
    if (projectPath === prevProjectPathRef.current) return;
    // Don't fire until initial bootstrap has run
    if (Blood.getValue<TerminalTab[]>(BLOOD_TABS, []).length === 0) return;

    prevProjectPathRef.current = projectPath;

    // If a tab for this project already exists, switch to it
    const existing = Blood.getValue<TerminalTab[]>(BLOOD_TABS, [])
      .find(t => t.projectPath === projectPath);
    if (existing && xtermInstances.has(existing.id)) {
      applyActiveTabId(existing.id);
      return;
    }

    // Create new tab for new project
    const tabId = `pty-${areaId}-${Date.now()}`;
    const shortName = projectPath.split('/').pop() || `终端`;
    spawnTab(tabId, shortName, projectPath);
  }, [projectPath, appDir, areaId, spawnTab, applyActiveTabId]);

  // ─── When user focuses the terminal area, give AGY a second chance ───────
  useEffect(() => {
    if (focusedAreaId !== areaId) return;
    if (!activeTabId) return;
    const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
    if (!activeTab) return;

    // If the first attempt happened before the shell was ready, allow a retry on focus.
    if (!antigravityDetectedTabIds.has(activeTab.id)) {
      tryLaunchAgy(activeTab.id, activeTab.projectPath, 'focus');
    }
  }, [focusedAreaId, areaId, activeTabId, tabs, tryLaunchAgy]);

  // ─── Toolbar actions ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'terminal.clear') {
      const inst = xtermInstances.get(activeTabId);
      if (inst) {
        inst.term.clear();
        window.electronAPI.writeTerminal(activeTabId, 'clear\r');
      }
    }
  }, [lastAction, activeTabId]);

  // ─── Close tab ────────────────────────────────────────────────────────────

  const closeTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentTabs = Blood.getValue<TerminalTab[]>(BLOOD_TABS, []);
    if (currentTabs.length === 1) return;

    window.electronAPI.killTerminal(tabId);
    startedTabIds.delete(tabId);
    agyLaunchAttempts.delete(tabId);
    antigravityDetectedTabIds.delete(tabId);

    const inst = xtermInstances.get(tabId);
    if (inst) {
      inst.unsubOutput();
      inst.unsubExit();
      inst.term.dispose();
      inst.container.remove();
      xtermInstances.delete(tabId);
    }

    const idx = currentTabs.findIndex(t => t.id === tabId);
    const newTabs = currentTabs.filter(t => t.id !== tabId);
    applyTabs(newTabs);
    if (activeTabId === tabId) {
      applyActiveTabId(newTabs[Math.max(0, idx - 1)].id);
    }
  }, [activeTabId, applyTabs, applyActiveTabId]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#141414' }}>
      {/* Tab bar */}
      <div className="terminal-tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab-item ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => applyActiveTabId(tab.id)}
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
        <button
          className="terminal-tab-add"
          onClick={() => {
            const tabId = `pty-${areaId}-${Date.now()}`;
            const proj = Blood.getValue<string>(BC.system.projectPath, '');
            const num = Blood.getValue<TerminalTab[]>(BLOOD_TABS, []).length + 1;
            spawnTab(tabId, `终端 ${num}`, proj);
          }}
          title="新建终端"
        >
          +
        </button>
      </div>

      {/* xterm wrapper — all containers mounted here */}
      <div
        ref={xtermWrapperRef}
        style={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}
        onClick={() => xtermInstances.get(activeTabId)?.term.focus()}
      />
    </div>
  );
}
