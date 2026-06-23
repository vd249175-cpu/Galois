const fs = require('fs');

function updateYamlFrontmatterTags(content, newTags) {
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

const fileContent = fs.readFileSync('template-project/狗.md', 'utf8');
const nextTags = [
  're:#(\\w+)',
  're:#([\\w\\u4e00-\\u9fa5]+)',
  'run:calculate_tags.py'
];

const updated = updateYamlFrontmatterTags(fileContent, nextTags);
console.log('--- UPDATED CONTENT ---');
console.log(updated);
