// APP/editor/editorUtils.ts

// Helper to serialize tags list and body text into Markdown frontmatter format
export function serializeFrontmatter(tags: string[], body: string): string {
  let yaml = '---\n';
  yaml += 'tags:\n';
  tags.forEach((t) => {
    yaml += `  - ${t}\n`;
  });
  yaml += '---\n';
  return yaml + body;
}

// Helper to count the number of lines taken by the YAML frontmatter block
export function getFrontmatterLineCount(content: string): number {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  if (match) {
    const lines = content.split('\n');
    if (lines[0].trim() === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
          return i + 1; // Number of lines including the second ---
        }
      }
    }
  }
  return 0;
}

// Helper to replace or insert tags list in the YAML frontmatter of full content
export function normalizeManualTags(tags: string[]): string[] {
  return Array.from(new Set(tags
    .map((tag) => tag.trim().replace(/^#+/, '').trim())
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

export function updateYamlFrontmatterTags(content: string, newTags: string[]): string {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);

  const cleanTags = normalizeManualTags(newTags);
  const tagsYamlLines = ['tags:'];
  cleanTags.forEach((t) => {
    tagsYamlLines.push(`  - ${t}`);
  });

  if (match) {
    const yamlText = match[1];
    const bodyText = match[2];
    
    const lines = yamlText.split(/\r?\n/);
    let tagsStartIndex = -1;
    let tagsEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*tags\s*:/.test(lines[i])) continue;
      tagsStartIndex = i;
      tagsEndIndex = i;
      const fieldIndent = lines[i].match(/^\s*/)?.[0].length || 0;
      const inlineValue = lines[i].replace(/^\s*tags\s*:/, '').trim();
      if (inlineValue) break;
      for (let j = i + 1; j < lines.length; j++) {
        const trimmed = lines[j].trim();
        if (!trimmed) {
          tagsEndIndex = j;
          continue;
        }
        const indent = lines[j].match(/^\s*/)?.[0].length || 0;
        if (indent > fieldIndent && trimmed.startsWith('-')) {
          tagsEndIndex = j;
          continue;
        }
        break;
      }
      break;
    }

    let newYamlText = '';
    if (tagsStartIndex !== -1) {
      const beforeTags = lines.slice(0, tagsStartIndex);
      const afterTags = lines.slice(tagsEndIndex + 1);
      newYamlText = [...beforeTags, ...(cleanTags.length ? tagsYamlLines : []), ...afterTags].join('\n');
    } else if (cleanTags.length > 0) {
      newYamlText = [...lines, ...tagsYamlLines].join('\n');
    } else {
      return content;
    }

    const cleanYaml = newYamlText.trim();
    return cleanYaml ? `---\n${cleanYaml}\n---\n${bodyText}` : bodyText;
  } else {
    if (cleanTags.length === 0) return content;
    let yaml = '---\n';
    yaml += 'tags:\n';
    cleanTags.forEach((t) => {
      yaml += `  - ${t}\n`;
    });
    yaml += '---\n';
    return yaml + content;
  }
}

// Helper to parse key-value expression options
export function parseExpression(expr: string) {
  let normalized = expr.trim();
  const qIndex = normalized.indexOf('?');
  const pipeIndex = normalized.indexOf('|');
  if (qIndex !== -1 && (pipeIndex === -1 || qIndex < pipeIndex)) {
    normalized = normalized.substring(0, qIndex) + '|' + normalized.substring(qIndex + 1);
  }

  const parts = normalized.split('|');
  const pathAndKey = parts[0].trim();
  
  const colonIndex = pathAndKey.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }
  const jsonPath = pathAndKey.substring(0, colonIndex).trim();
  const keyPath = pathAndKey.substring(colonIndex + 1).trim();

  const options: Record<string, string> = {};
  if (parts[1]) {
    const params = parts[1].trim().split('&');
    for (const param of params) {
      const eqIndex = param.indexOf('=');
      if (eqIndex !== -1) {
        const key = param.substring(0, eqIndex).trim();
        let value = param.substring(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        options[key] = value;
      }
    }
  }

  return {
    jsonPath,
    keyPath,
    run: options.run || null,
    interval: options.interval ? parseInt(options.interval, 10) : null,
    isolate: options.isolate || null,
  };
}

// Helper to extract nested values like foo.bar from an object
export function getNestedValue(obj: any, keyPath: string): any {
  if (!obj || !keyPath) return undefined;
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

export function setNestedValue(obj: any, keyPath: string, value: any): any {
  const clone = obj && typeof obj === 'object' ? structuredClone(obj) : {};
  const parts = keyPath.split('.').filter(Boolean);
  if (parts.length === 0) return clone;
  let current = clone;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
  return clone;
}
