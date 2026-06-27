// APP/utils.ts

// Helper to separate frontmatter block from body content
export function parseMarkdownBody(content: string): string {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  if (match) {
    return match[2];
  }
  return content;
}

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

// Helper to resolve regex tags dynamically from the document body content
export function resolveTagsSync(rawTags: string[], content: string): string[] {
  const resolved = new Set<string>();
  const bodyText = parseMarkdownBody(content);

  // Extract body hashtags (e.g. #tag, #中文标签)
  const hashtagRegex = /(?:^|[^a-zA-Z0-9_\u4e00-\u9fa5#])#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
  const hashMatches = bodyText.matchAll(hashtagRegex);
  for (const m of hashMatches) {
    const val = m[1].trim();
    if (val && isNaN(Number(val))) {
      resolved.add(val);
    }
  }

  for (const tag of rawTags) {
    if (tag.startsWith('re:')) {
      const patternStr = tag.substring(3).trim();
      try {
        let regex: RegExp;
        const slashMatch = patternStr.match(/^\/(.+)\/([a-z]*)$/);
        if (slashMatch) {
          regex = new RegExp(slashMatch[1], slashMatch[2].includes('g') ? slashMatch[2] : slashMatch[2] + 'g');
        } else {
          regex = new RegExp(patternStr, 'g');
        }
        
        const matches = bodyText.matchAll(regex);
        for (const m of matches) {
          const val = m[1] !== undefined ? m[1].trim() : m[0].trim();
          if (val && isNaN(Number(val))) {
            resolved.add(val);
          }
        }
      } catch (e) {
        console.error('[resolveTagsSync] Invalid regex:', patternStr, e);
      }
    } else if (tag.startsWith('run:')) {
      // Skip async script execution in sync resolver
    } else {
      resolved.add(tag);
    }
  }

  return Array.from(resolved);
}

// Helper to parse YAML frontmatter icon from markdown content
export function parseFrontmatterIcon(content: string): string {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  if (!match) return '';
  
  const yamlText = match[1];
  const lines = yamlText.split('\n');
  for (const line of lines) {
    const trimLine = line.trim();
    if (trimLine.startsWith('icon:')) {
      return trimLine.substring(5).trim().replace(/['"]/g, '');
    }
  }
  return '';
}

// Helper to add/update/remove YAML frontmatter icon in markdown content
export function updateYamlFrontmatterIcon(content: string, nextIcon: string): string {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  
  if (!match) {
    // No frontmatter. Create one!
    if (nextIcon) {
      return `---\nicon: ${nextIcon}\n---\n${content}`;
    }
    return content;
  }
  
  const yamlText = match[1];
  const bodyText = match[2];
  
  const lines = yamlText.split('\n');
  const newYamlLines: string[] = [];
  let iconUpdated = false;
  
  for (const line of lines) {
    const trimLine = line.trim();
    if (trimLine.startsWith('icon:')) {
      if (nextIcon) {
        // Keep spacing/indentation
        const indent = line.substring(0, line.indexOf('icon:'));
        newYamlLines.push(`${indent}icon: ${nextIcon}`);
      }
      iconUpdated = true;
    } else {
      newYamlLines.push(line);
    }
  }
  
  if (!iconUpdated && nextIcon) {
    newYamlLines.push(`icon: ${nextIcon}`);
  }
  
  // Reassemble content
  const cleanYaml = newYamlLines.join('\n');
  return `---\n${cleanYaml}\n---\n${bodyText}`;
}

/**
 * formatTimestamp — 将秒数转换为可读时间字符串
 *
 * 移动自 video-timeline/VideoAssetManager.ts，对所有插件共享。
 *
 * @example
 *   formatTimestamp(3661)  // => '1:01:01'
 *   formatTimestamp(90.5)  // => '01:30.50'
 */
export function formatTimestamp(seconds: number): string {
  if (isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
