import defaultLight from './default-light.css?inline';
import defaultDark from './default-dark.css?inline';
import lavender from './lavender.css?inline';
import yuebai from './yuebai.css?inline';

export const themes: Record<string, { name: string; css: string }> = {
  'default-light': {
    name: '温暖米色 (Light)',
    css: defaultLight,
  },
  'default-dark': {
    name: '深空极夜 (Dark)',
    css: defaultDark,
  },
  'lavender': {
    name: '雪青紫罗 (Lavender)',
    css: lavender,
  },
  'yuebai': {
    name: '月白缥青 (Azure)',
    css: yuebai,
  },
};

export function applyTheme(themeId: string) {
  const theme = themes[themeId] || themes['default-light'];
  let styleEl = document.getElementById('dnote-theme-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dnote-theme-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = theme.css;
  document.documentElement.setAttribute('data-theme', themeId);
}
