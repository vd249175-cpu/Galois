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
export function updateYamlFrontmatterTags(content: string, newTags: string[]): string {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(yamlRegex);
  
  const cleanTags = Array.from(new Set(newTags.map((t) => t.trim()).filter(Boolean))).sort();
  const tagsYamlLines = ['tags:'];
  cleanTags.forEach((t) => {
    tagsYamlLines.push(`  - ${t}`);
  });

  if (match) {
    const yamlText = match[1];
    const bodyText = match[2];
    
    const lines = yamlText.split('\n');
    let tagsStartIndex = -1;
    let tagsEndIndex = -1;
    let inTagsList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const trimLine = lines[i].trim();
      if (trimLine.startsWith('tags:')) {
        tagsStartIndex = i;
        const inlineValue = trimLine.substring(5).trim();
        if (inlineValue && inlineValue !== '-') {
          tagsEndIndex = i;
        } else {
          inTagsList = true;
        }
      } else if (inTagsList) {
        if (trimLine.startsWith('-')) {
          tagsEndIndex = i;
        } else if (trimLine === '') {
          // ignore
        } else if (lines[i].includes(':')) {
          inTagsList = false;
        }
      }
    }
    
    let newYamlText = '';
    if (tagsStartIndex !== -1) {
      const beforeTags = lines.slice(0, tagsStartIndex);
      const afterTags = lines.slice(tagsEndIndex + 1);
      newYamlText = [...beforeTags, ...tagsYamlLines, ...afterTags].join('\n');
    } else {
      newYamlText = yamlText + '\n' + tagsYamlLines.join('\n');
    }
    
    return `---\n${newYamlText.trim()}\n---\n${bodyText}`;
  } else {
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
  const parts = expr.trim().split('|');
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
