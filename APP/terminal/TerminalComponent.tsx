import { BC } from '../../CORE/BloodChannels';
import { terminalActions } from './actions';
import { TerminalView } from './Terminal';

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
    description: '原生 PTY 终端（xterm.js + node-pty），并提供系统 Terminal AGY 启动入口',
    reads: [BC.system.projectPath, BC.system.agentWorkspace, BC.system.config],
    writes: [BC.system.terminalTabs, BC.system.terminalActiveTabId],
    dependsOn: [],
  },
};
