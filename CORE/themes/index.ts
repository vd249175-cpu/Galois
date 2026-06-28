import defaultLight from './default-light.css?inline';
import defaultDark from './default-dark.css?inline';
import lavender from './lavender.css?inline';
import yuebai from './yuebai.css?inline';
import blackgoldUrl from './blackgold.css?url';

type ThemeEntry = {
  name: string;
  css?: string;
  url?: string;
};

const themeCssCache = new Map<string, string>();

export const themes: Record<string, ThemeEntry> = {
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
  'black-gold': {
    name: '玄金耀屑 (Black Gold)',
    url: blackgoldUrl,
  },
};

async function resolveThemeCss(themeId: string, theme: ThemeEntry): Promise<string> {
  if (theme.css) return theme.css;
  if (!theme.url) return defaultLight;
  const cached = themeCssCache.get(themeId);
  if (cached) return cached;
  const response = await fetch(theme.url);
  if (!response.ok) {
    throw new Error(`Failed to load theme: ${themeId}`);
  }
  const css = await response.text();
  themeCssCache.set(themeId, css);
  return css;
}

export async function applyTheme(themeId: string) {
  const theme = themes[themeId] || themes['default-light'];
  let styleEl = document.getElementById('dnote-theme-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dnote-theme-style';
    document.head.appendChild(styleEl);
  }
  document.documentElement.setAttribute('data-theme', themeId);
  try {
    styleEl.textContent = await resolveThemeCss(themeId, theme);
  } catch (err) {
    console.error('[themes] Failed to apply theme:', err);
    styleEl.textContent = defaultLight;
    document.documentElement.setAttribute('data-theme', 'default-light');
  }
}
