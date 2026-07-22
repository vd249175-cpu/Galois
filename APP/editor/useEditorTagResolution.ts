import { useEffect } from 'react';
import { extractBodyHashtags, parseMarkdownBody } from '../utils';
import { BC } from '../../CORE/BloodChannels';

export function useEditorTagResolution(props: any) {
  const { content, currentFile, projectPath, setActiveTags, setRuleMatches, state, tags } = props;
// ── Tag resolver ───────────────────────────────────────────────────────
useEffect(() => {
  if (!currentFile || !projectPath) return;
  const staticTags = Array.from(new Set([
      ...tags.filter((t: string) => !t.startsWith('re:') && !t.startsWith('run:')),
    ...extractBodyHashtags(content),
  ]));
  const bodyText = parseMarkdownBody(content);
  const matchesMap: Record<string, string[]> = {};
  const allRegexMatches: string[] = [];

  for (const tag of tags) {
    if (tag.startsWith('re:')) {
      const patternStr = tag.substring(3).trim();
      const ruleMatchesList: string[] = [];
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
          if (val && isNaN(Number(val)) && !ruleMatchesList.includes(val)) {
            ruleMatchesList.push(val);
            allRegexMatches.push(val);
          }
        }
      } catch (e) {
        console.error('[Editor] Invalid regex:', patternStr, e);
      }
      matchesMap[tag] = ruleMatchesList.sort();
    }
  }

  const globalResolved = state[BC.system.resolvedTags]?.[currentFile] || [];
  const scriptDerived = globalResolved.filter((t: string) => !staticTags.includes(t));
  const runScripts = tags.filter((t: string) => t.startsWith('run:'));
  if (runScripts.length > 0) {
    const pureScriptTags = scriptDerived.filter((t: string) => !allRegexMatches.includes(t));
    runScripts.forEach((scriptTag: string) => { matchesMap[scriptTag] = pureScriptTags.sort(); });
  }

  const combinedDerived = Array.from(new Set([...allRegexMatches, ...scriptDerived])).sort();
  const combinedActive = Array.from(new Set([...staticTags, ...combinedDerived])).sort();
  setRuleMatches(matchesMap);
  setActiveTags(combinedActive);
}, [tags, content, currentFile, projectPath, state[BC.system.resolvedTags]]);

}
