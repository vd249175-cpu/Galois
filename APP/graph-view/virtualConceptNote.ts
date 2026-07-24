import type { Node } from './types';

export const TEMPORARY_CONCEPT_MARKER = '<!-- galois:temporary-concept -->';

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeNamePart(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || '未命名';
}

export function buildVirtualConceptNote(
  projectPath: string,
  concept: Node,
  supportingNotes: Node[],
): { filePath: string; content: string } {
  const sortedTags = [...concept.tags].sort((a, b) => a.localeCompare(b));
  const slug = sortedTags.map(safeNamePart).join('-').slice(0, 72) || '未命名';
  const identity = stableHash(sortedTags.join('\u0000'));
  const filePath = `${projectPath}/概念-${slug}-${identity}.md`;
  const yamlTags = sortedTags.map((tag) => `  - ${JSON.stringify(tag)}`).join('\n');
  const titleTags = sortedTags.join(' · ');
  const links = supportingNotes
    .filter((note) => !note.isVirtual)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((note) => `- [[${note.label.replaceAll(']', '\\]')}]]`)
    .join('\n');

  const content = [
    '---',
    'tags:',
    yamlTags,
    '---',
    TEMPORARY_CONCEPT_MARKER,
    `# 概念：${titleTags || concept.label}`,
    '',
    '> 此笔记由标签拓扑图临时创建。修改并保存后会永久保留；未修改则自动删除。',
    '',
    '## 关联笔记',
    '',
    links || '- 暂无关联笔记',
    '',
  ].join('\n');

  return { filePath, content };
}

export function promoteTemporaryConceptContent(content: string): string {
  return content
    .replace(`${TEMPORARY_CONCEPT_MARKER}\n`, '')
    .replace(TEMPORARY_CONCEPT_MARKER, '');
}
