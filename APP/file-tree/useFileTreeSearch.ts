import { useEffect, useMemo, useRef, useState } from 'react';
import { BC } from '../../CORE/BloodChannels';
import { decideFileTreeSearchSync } from './fileTreeSearchSync';

interface FileTreeSearchOptions {
  resolvedTags: Record<string, unknown>;
  staticTags: Record<string, unknown>;
  linkedSearchQuery: string;
  updateBloodKey: (key: string, value: unknown) => void;
}

export function useFileTreeSearch({
  resolvedTags,
  staticTags,
  linkedSearchQuery,
  updateBloodKey,
}: FileTreeSearchOptions) {
  const [searchQuery, setSearchQuery] = useState(() => linkedSearchQuery);
  const previousLinkedQueryRef = useRef(linkedSearchQuery);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const allProjectTags = useMemo(() => {
    const tags = new Set<string>();
    const collect = (source: Record<string, unknown>) => {
      Object.values(source).forEach((fileTags) => {
        if (!Array.isArray(fileTags)) return;
        fileTags.forEach((tag) => {
          if (typeof tag !== 'string') return;
          if (!tag.startsWith('re:') && !tag.startsWith('run:') && tag.includes('#')) {
            tag.split('#').filter(Boolean).forEach((part) => tags.add(part));
          } else {
            tags.add(tag);
          }
        });
      });
    };
    collect(resolvedTags);
    collect(staticTags);
    return Array.from(tags).sort();
  }, [resolvedTags, staticTags]);
  const filteredSuggestions = useMemo(() => {
    const match = searchQuery.match(/#([^\s#()]*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    return allProjectTags.filter((tag) => {
      const display = tag.startsWith('re:') ? tag.slice(3) : tag.startsWith('run:') ? tag.slice(4) : tag;
      return display.toLowerCase().includes(query) || tag.toLowerCase().includes(query);
    });
  }, [allProjectTags, searchQuery]);
  const handleSelectSuggestion = (suggestion: string) => {
    const match = searchQuery.match(/(.*)#([^\s#()]*)$/);
    if (!match) return;
    setSearchQuery(`${match[1]}#${suggestion} `);
    setShowAutocomplete(false);
  };
  useEffect(() => {
    const decision = decideFileTreeSearchSync(
      previousLinkedQueryRef.current,
      linkedSearchQuery,
      searchQuery,
    );
    previousLinkedQueryRef.current = decision.nextLinkedQuery;

    // Graph nodes and other organs can replace the shared query. Adopt that
    // value without publishing the stale local query back during the same
    // effect cycle; otherwise the two values oscillate and the file list jumps.
    if (decision.adoptLinkedQuery !== null) {
      setSearchQuery(decision.adoptLinkedQuery);
      setAutocompleteIndex(0);
      return;
    }

    if (decision.publishLocalQuery !== null) {
      updateBloodKey(BC.system.fileSearchQuery, decision.publishLocalQuery);
    }
  }, [linkedSearchQuery, searchQuery, updateBloodKey]);
  return {
    autocompleteIndex, filteredSuggestions, handleSelectSuggestion, searchQuery,
    setAutocompleteIndex, setSearchQuery, setShowAutocomplete, showAutocomplete,
  };
}
