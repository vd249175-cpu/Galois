import React from 'react';

interface TagToolbarProps {
  currentFile: string;
  bodyTags: string[];
  tags: string[];
  handleRemoveTag: (tag: string) => void;
  ruleMatches: Record<string, string[]>;
  expandedRule: string | null;
  setExpandedRule: (rule: string | null) => void;
  handleAddTag: (e: React.FormEvent) => void;
  newTagInput: string;
  setNewTagInput: (val: string) => void;
  maxIterations: number;
  updateBloodKey: (key: string, value: any) => void;
  allProjectTags: string[];
  handleUpdateTags: (nextTags: string[]) => void;
}

export function TagToolbar({
  currentFile,
  bodyTags,
  tags,
  handleRemoveTag,
  ruleMatches,
  expandedRule,
  setExpandedRule,
  handleAddTag,
  newTagInput,
  setNewTagInput,
  maxIterations,
  updateBloodKey,
  allProjectTags,
  handleUpdateTags,
}: TagToolbarProps) {
  const [showAutocomplete, setShowAutocomplete] = React.useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = React.useState(0);

  const getSuggestionDisplay = (suggestion: string) => {
    if (suggestion.startsWith('re:')) {
      return suggestion.substring(3);
    }
    if (suggestion.startsWith('run:')) {
      return suggestion.substring(4);
    }
    return suggestion;
  };

  const filteredSuggestions = React.useMemo(() => {
    const query = newTagInput.trim().toLowerCase();
    if (!query) return [];
    return allProjectTags.filter((t) => {
      if (tags.includes(t)) return false;
      const display = getSuggestionDisplay(t).toLowerCase();
      return display.includes(query) || t.toLowerCase().includes(query);
    });
  }, [newTagInput, allProjectTags, tags]);
  if (!currentFile) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.005)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>
        笔记标签 (YAML):
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
        {/* Static Tags (Deletable) */}
        {tags.filter(t => !t.startsWith('re:') && !t.startsWith('run:')).map((t) => (
          <span
            key={t}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'var(--highlight-color)',
              color: 'var(--accent-color)',
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1.2px solid var(--accent-color)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            #{t}
            <button
              onClick={() => handleRemoveTag(t)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-color)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 800,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="移除标签"
            >
              &times;
            </button>
          </span>
        ))}

        {/* Body hashtags are derived from Markdown and intentionally not
            removable here. Editing YAML must never rewrite note prose. */}
        {bodyTags.map((tag) => (
          <span
            key={`body_tag_${tag}`}
            title={`正文派生标签：请在正文中修改或删除 #${tag}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1px dashed var(--border-color)',
            }}
          >
            #{tag}
            <span style={{ fontSize: '9px', opacity: 0.72 }}>正文</span>
          </span>
        ))}

        {/* Dynamic Rules Pills (Click to expand matched tags) */}
        {tags.filter(t => t.startsWith('re:') || t.startsWith('run:')).map((rule) => {
          const matches = ruleMatches[rule] || [];
          const count = matches.length;
          const isExpanded = expandedRule === rule;

          // Strip protocol prefixes for clean display
          const displayRule = rule.startsWith('re:') ? rule.substring(3) : rule.startsWith('run:') ? rule.substring(4) : rule;

          return (
            <span
              key={`rule_pill_${rule}`}
              onClick={() => setExpandedRule(isExpanded ? null : rule)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4.5px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: isExpanded ? 'var(--highlight-color)' : 'rgba(255, 255, 255, 0.04)',
                color: 'var(--accent-color)',
                padding: '2px 8px',
                borderRadius: '12px',
                border: `1.2px ${isExpanded ? 'solid' : 'dashed'} var(--accent-color)`,
                opacity: 0.9,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.15s ease',
              }}
              title={`点击${isExpanded ? '折叠' : '展开'}此规则匹配的标签`}
            >
              ⚡️ {displayRule}
              <span style={{
                fontSize: '9.5px',
                backgroundColor: isExpanded ? 'var(--accent-color)' : 'rgba(255, 59, 48, 0.15)',
                color: isExpanded ? '#fff' : 'var(--accent-color)',
                padding: '1px 5px',
                borderRadius: '8px',
                fontWeight: 700,
                marginLeft: '2px'
              }}>
                {count}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent toggling expansion drawer
                  handleRemoveTag(rule);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: 0,
                  marginLeft: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="移除此规则"
              >
                &times;
              </button>
            </span>
          );
        })}
        
        {/* Add Tag Form with Autocomplete */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (showAutocomplete && filteredSuggestions.length > 0) {
                const selected = filteredSuggestions[autocompleteIndex];
                if (selected) {
                  handleUpdateTags([...tags, selected]);
                  setNewTagInput('');
                  setShowAutocomplete(false);
                  return;
                }
              }
              handleAddTag(e);
            }}
            style={{ display: 'inline-block' }}
          >
            <input
              type="text"
              placeholder="+ 添加标签..."
              value={newTagInput}
              onChange={(e) => {
                setNewTagInput(e.target.value);
                setAutocompleteIndex(0);
                setShowAutocomplete(true);
              }}
              onFocus={() => setShowAutocomplete(true)}
              onBlur={() => {
                setTimeout(() => setShowAutocomplete(false), 200);
              }}
              onKeyDown={(e) => {
                if (showAutocomplete && filteredSuggestions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setAutocompleteIndex((prev) => (prev + 1) % filteredSuggestions.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setAutocompleteIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowAutocomplete(false);
                  }
                }
              }}
              style={{
                border: '1px dashed var(--border-color)',
                backgroundColor: 'transparent',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '10px',
                outline: 'none',
                color: 'var(--text-main)',
                width: '100px',
                transition: 'border-color 0.15s',
              }}
            />
          </form>

          {/* Autocomplete Dropdown List */}
          {showAutocomplete && filteredSuggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '22px',
              left: 0,
              zIndex: 1000,
              width: '180px',
              maxHeight: '160px',
              overflowY: 'auto',
              backgroundColor: 'var(--bg-main)',
              border: '1.2px solid rgba(0, 0, 0, 0.12)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              padding: '2px',
            }}>
              {filteredSuggestions.map((suggestion, index) => {
                const isSelected = index === autocompleteIndex;
                const isRegex = suggestion.startsWith('re:');
                const isScript = suggestion.startsWith('run:');
                const display = getSuggestionDisplay(suggestion);
                return (
                  <div
                    key={suggestion}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUpdateTags([...tags, suggestion]);
                      setNewTagInput('');
                      setShowAutocomplete(false);
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'var(--highlight-color)' : 'transparent',
                      color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>
                      {isRegex ? '⚡ 正则' : isScript ? '⚡ 脚本' : '#'}
                    </span>
                    <span style={{ fontWeight: isSelected ? 700 : 500 }}>{display}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
        <span>迭代上限:</span>
        <select
          value={maxIterations}
          onChange={(e) => updateBloodKey('system.maxIterations', Number(e.target.value))}
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            borderRadius: '4px',
            padding: '1px 4px',
            fontSize: '10px',
            outline: 'none',
            cursor: 'pointer'
          }}
          title="设置动态标签传播的最大迭代深度"
        >
          <option value={1}>1 (不进行传递)</option>
          <option value={2}>2</option>
          <option value={3}>3 (默认)</option>
          <option value={4}>4</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
        </select>
      </div>

      {expandedRule && ruleMatches[expandedRule] && (
        <div style={{
          width: '100%',
          marginTop: '8px',
          padding: '10px 12px',
          backgroundColor: 'var(--bg-input)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          maxHeight: '110px',
          overflowY: 'auto',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <div style={{ width: '100%', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>⚡️ 被规则 "{expandedRule}" 匹配的标签 ({ruleMatches[expandedRule].length})</span>
            <span onClick={() => setExpandedRule(null)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>折叠 ×</span>
          </div>
          {ruleMatches[expandedRule].length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
              当前文档中未找到符合该规则的匹配。
            </div>
          ) : (
            ruleMatches[expandedRule].map((t) => (
              <span
                key={`expanded_match_${t}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: 'var(--accent-color)',
                  padding: '1.5px 6px',
                  borderRadius: '10px',
                  border: '1px dashed var(--accent-color)',
                }}
              >
                ⚡️ #{t}
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}
