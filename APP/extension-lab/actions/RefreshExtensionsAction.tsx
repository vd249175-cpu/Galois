import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const refreshExtensionsAction: OrganAction = {
  id: 'extensionLab.refresh',
  label: '刷新侧载扩展',
  defaultShortcut: 'meta+shift+x',
  isToolbar: true,
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 6a5 5 0 0 0-8.6-2.8L3 4.5" />
      <path d="M3 2v2.5h2.5" />
      <path d="M3 10a5 5 0 0 0 8.6 2.8L13 11.5" />
      <path d="M13 14v-2.5h-2.5" />
    </svg>
  ),
};
