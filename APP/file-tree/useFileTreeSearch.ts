import { useEffect, useMemo, useState } from 'react';
import { BC } from '../../CORE/BloodChannels';

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
  const [searchQuery, setSearchQuery] = useState('');
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
    if (linkedSearchQuery !== searchQuery) {
      setSearchQuery(linkedSearchQuery);
      setAutocompleteIndex(0);
    }
  }, [linkedSearchQuery]);
  useEffect(() => {
    if (searchQuery !== linkedSearchQuery) updateBloodKey(BC.system.fileSearchQuery, searchQuery);
  }, [linkedSearchQuery, searchQuery, updateBloodKey]);
  return {
    autocompleteIndex, filteredSuggestions, handleSelectSuggestion, searchQuery,
    setAutocompleteIndex, setSearchQuery, setShowAutocomplete, showAutocomplete,
  };
}
