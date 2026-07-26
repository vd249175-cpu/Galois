export function removeMarkdownMediaToken(
  source: string,
  markdown: string,
  occurrence = 0
): string {
  if (!markdown) return source;
  let start = -1;
  let searchFrom = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    start = source.indexOf(markdown, searchFrom);
    if (start < 0) return source;
    searchFrom = start + markdown.length;
  }
  return `${source.slice(0, start)}${source.slice(start + markdown.length)}`
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
