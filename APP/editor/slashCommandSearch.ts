export interface SlashCommandLike {
  id: string;
  label: string;
  desc?: string;
  category?: string;
  content?: string;
  [key: string]: any;
}

const CATEGORY_BY_ID_PREFIX: Array<[string, string]> = [
  ['project.', '项目'],
  ['custom.', '自定义'],
];

const CATEGORY_BY_ID: Record<string, string> = {
  bold: '格式',
  italic: '格式',
  strike: '格式',
  highlight: '格式',
  'code-inline': '格式',
  link: '链接',
  'wiki-link': '链接',
  h1: '基础块',
  h2: '基础块',
  h3: '基础块',
  todo: '列表',
  bullet: '列表',
  number: '列表',
  quote: '基础块',
  callout: '基础块',
  table: '表格',
  hr: '基础块',
  'code-block': '代码',
};

const DEFAULT_COMMAND_ORDER = [
  'h1',
  'h2',
  'h3',
  'bold',
  'italic',
  'strike',
  'highlight',
  'code-inline',
  'link',
  'wiki-link',
  'bullet',
  'number',
  'todo',
  'table',
  'quote',
  'callout',
  'code-block',
  'hr',
];

const DEFAULT_ORDER_WEIGHT = new Map(DEFAULT_COMMAND_ORDER.map((id, index) => [id, index]));

function commandOrder(command: SlashCommandLike) {
  if (DEFAULT_ORDER_WEIGHT.has(command.id)) {
    return DEFAULT_ORDER_WEIGHT.get(command.id)!;
  }
  if (command.id.startsWith('project.')) return 200;
  if (command.id.startsWith('custom.')) return 300;
  return 250;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function fuzzyScore(text: string, query: string) {
  const haystack = normalize(text);
  const needle = normalize(query);
  if (!needle) return 1;
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle);

  let score = 0;
  let cursor = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return 0;
    score += Math.max(1, 12 - (found - cursor));
    cursor = found + 1;
  }
  return score;
}

export function getSlashCommandCategory(command: SlashCommandLike) {
  if (command.category) return command.category;
  const prefixMatch = CATEGORY_BY_ID_PREFIX.find(([prefix]) => command.id.startsWith(prefix));
  if (prefixMatch) return prefixMatch[1];
  return CATEGORY_BY_ID[command.id] || '其他';
}

export function filterAndRankSlashCommands(
  commands: SlashCommandLike[],
  query: string,
  recentIds: string[] = []
) {
  const recentWeight = new Map(recentIds.map((id, index) => [id, recentIds.length - index]));
  return commands
    .map((command) => {
      const category = getSlashCommandCategory(command);
      const target = `${command.label} ${command.id} ${command.desc || ''} ${category}`;
      const score = fuzzyScore(target, query);
      return {
        ...command,
        category,
        order: commandOrder(command),
        score: score + (recentWeight.get(command.id) || 0) * 8,
      };
    })
    .filter((command) => !query || command.score > 0)
    .sort((a, b) => {
      if (!query) return a.order - b.order || a.label.localeCompare(b.label);
      return b.score - a.score || a.order - b.order || a.label.localeCompare(b.label);
    });
}

export function rememberSlashCommand(recentIds: string[], commandId: string, limit = 8) {
  return [commandId, ...recentIds.filter((id) => id !== commandId)].slice(0, limit);
}
