import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './CORE/App';
import { ComponentRegistry } from './CORE/ComponentRegistry';

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

// Auto-register plugins from APP/ folder into ComponentRegistry before rendering App
const modules = import.meta.glob('./APP/*/index.ts', { eager: true });
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

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
