import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

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
    if ((window as any).electronAPI?.writeFile) {
      (window as any).electronAPI.writeFile(
        '/Users/apexwave/Desktop/DNOTE/renderer_error.log',
        JSON.stringify(errorMsg, null, 2)
      ).catch(console.error);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const errorMsg = {
      type: 'unhandledrejection',
      message: event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled rejection',
      error: event.reason ? event.reason.stack : null,
      timestamp: new Date().toISOString()
    };
    if ((window as any).electronAPI?.writeFile) {
      (window as any).electronAPI.writeFile(
        '/Users/apexwave/Desktop/DNOTE/renderer_error.log',
        JSON.stringify(errorMsg, null, 2)
      ).catch(console.error);
    }
  });
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
