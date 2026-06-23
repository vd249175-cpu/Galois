// APP/utils.ts

// Helper to parse YAML frontmatter tags from markdown content
export function parseFrontmatterTags(content: string): string[] {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  if (!match) return [];
  
  const yamlText = match[1];
  const tags: string[] = [];
  
  // Try inline array format first: tags: [t1, t2]
  const tagsInline = yamlText.match(/tags:\s*\[([^\]]*)\]/);
  if (tagsInline) {
    tagsInline[1].split(',').forEach((t) => {
      const clean = t.trim().replace(/['"]/g, '');
      if (clean) tags.push(clean);
    });
    return tags;
  }
  
  // Parse multiline format
  const lines = yamlText.split('\n');
  let inTagsList = false;
  for (const line of lines) {
    const trimLine = line.trim();
    if (trimLine.startsWith('tags:')) {
      const inlineValue = trimLine.substring(5).trim();
      if (inlineValue && inlineValue !== '-') {
        tags.push(inlineValue);
      } else {
        inTagsList = true;
      }
    } else if (inTagsList && trimLine.startsWith('-')) {
      const val = trimLine.substring(1).trim().replace(/['"]/g, '');
      if (val) tags.push(val);
    } else if (trimLine === '') {
      // ignore empty lines
    } else if (line.includes(':')) {
      inTagsList = false;
    }
  }
  return tags;
}
