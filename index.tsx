import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './CORE/App';
import { ComponentRegistry } from './CORE/ComponentRegistry';
import { Blood } from './CORE/Blood';
import { BC } from './CORE/BloodChannels';

// Global error logger to diagnose blank page / renderer crashes
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const errorMsg = {
      type: 'error',
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error ? event.error.stack : null,
      timestamp: new Date().toISOString()
    };
    if (window.electronAPI?.logRendererError) {
      window.electronAPI.logRendererError(errorMsg).catch(console.error);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const errorMsg = {
      type: 'unhandledrejection',
      message: event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled rejection',
      error: event.reason ? event.reason.stack : null,
      timestamp: new Date().toISOString()
    };
    if (window.electronAPI?.logRendererError) {
      window.electronAPI.logRendererError(errorMsg).catch(console.error);
    }
  });
}

declare global {
  interface Window {
    __galoisRoot?: Root;
    __galoisDevPluginEntries?: Map<string, number>;
  }
}

function registerAppModules(modules: Record<string, unknown>) {
  for (const path in modules) {
    if (path.includes('/APP/agent/')) continue;
    if (path.includes('/APP/link-graph/')) continue;
    const mod = modules[path] as any;
    for (const key in mod) {
      const exportVal = mod[key];
      if (exportVal && typeof exportVal === 'object' && exportVal.typeId && exportVal.component) {
        ComponentRegistry.register(exportVal);
      }
    }
  }
}

// Auto-register plugins from APP/ folder into ComponentRegistry before rendering App.
// HMR re-runs this module and replaces registry entries in place; do not reload
// the window because the in-app terminal/AGY assistant must keep running.
const modules = import.meta.glob('./APP/*/index.ts', { eager: true });
registerAppModules(modules);

async function scanDevAppPluginEntries() {
  if (!import.meta.env.DEV || !window.electronAPI?.listAppPluginEntries) return;
  window.__galoisDevPluginEntries ||= new Map<string, number>();
  try {
    const entries = await window.electronAPI.listAppPluginEntries();
    for (const entry of entries) {
      if (!entry?.modulePath) continue;
      if (entry.modulePath.includes('/APP/agent/')) continue;
      if (entry.modulePath.includes('/APP/link-graph/')) continue;
      const previousMtime = window.__galoisDevPluginEntries.get(entry.modulePath);
      if (previousMtime === entry.mtimeMs) continue;

      try {
        const mod = await import(/* @vite-ignore */ `${entry.modulePath}?t=${Math.floor(entry.mtimeMs)}`);
        registerAppModules({ [entry.modulePath]: mod });
        window.__galoisDevPluginEntries.set(entry.modulePath, entry.mtimeMs);
        Blood.updateKey(BC.system.devHotUpdateStatus, {
          kind: 'plugin',
          label: entry.folder,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn(`[Galois HMR] Waiting for APP/${entry.folder} to become importable:`, err);
        Blood.updateKey(BC.system.devHotUpdateStatus, {
          kind: 'plugin-pending',
          label: entry.folder,
          timestamp: Date.now(),
        });
      }
    }
  } catch (err) {
    console.warn('[Galois HMR] Failed to scan APP plugin entries:', err);
  }
}

if (import.meta.env.DEV) {
  window.setTimeout(scanDevAppPluginEntries, 400);
  window.setInterval(scanDevAppPluginEntries, 1500);
}

const container = document.getElementById('root');
if (container) {
  const root = window.__galoisRoot || createRoot(container);
  window.__galoisRoot = root;
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      console.debug('[Galois HMR] Renderer accepted update without window reload.');
      Blood.updateKey(BC.system.devHotUpdateStatus, {
        kind: 'hmr',
        label: 'renderer',
        timestamp: Date.now(),
      });
    }
  });
}
