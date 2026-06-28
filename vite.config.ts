import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL: Makes asset paths relative so Electron can load them from disk
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/node_modules/')) {
            if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/')) {
              return 'vendor-react';
            }
            if (normalizedId.includes('/@xterm/')) {
              return 'vendor-terminal';
            }
            if (normalizedId.includes('/@codemirror/') || normalizedId.includes('/@lezer/')) {
              return 'vendor-codemirror';
            }
            return 'vendor';
          }

          if (
            normalizedId.includes('/CORE/SettingsModal') ||
            normalizedId.includes('/CORE/EnvironmentPanel') ||
            normalizedId.includes('/CORE/FirstRunSetup')
          ) {
            return 'core-settings';
          }
          if (normalizedId.includes('/CORE/BloodDebugPanel')) {
            return 'core-debug';
          }
          if (
            normalizedId.includes('/CORE/LayoutEngine') ||
            normalizedId.includes('/CORE/AreaShell') ||
            normalizedId.includes('/CORE/ComponentWrapper') ||
            normalizedId.includes('/CORE/LeftActivityBar') ||
            normalizedId.includes('/CORE/RightSidebar') ||
            normalizedId.includes('/CORE/TitleBar')
          ) {
            return 'core-workbench';
          }
          if (
            normalizedId.includes('/CORE/services') ||
            normalizedId.includes('/CORE/platform') ||
            normalizedId.includes('/CORE/extensionHost') ||
            normalizedId.includes('/CORE/instantiation')
          ) {
            return 'core-platform';
          }

          if (normalizedId.includes('/APP/editor/LiveMarkdownEditor')) {
            return 'app-editor-live';
          }

          const appMatch = normalizedId.match(/\/APP\/([^/]+)\//);
          if (appMatch) {
            return `app-${appMatch[1]}`;
          }

          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  }
});
