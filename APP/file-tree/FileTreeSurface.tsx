import { FileCard } from './FileCard';
import { HistoryProjectsMenu } from './HistoryProjectsMenu';
import { IconPickerModal } from './IconPickerModal';
import { PromptModal } from './PromptModal';
import { TemplateModal } from './TemplateModal';

export function FileTreeSurface(props: any) {
  const {
    autocompleteIndex, demoPath, displayedHistory, filteredFiles, filteredSuggestions,
    folderName, handleCreateFile, handleDeleteFile, handleFileClick, handleOpenFolder,
    handleOpenTempleFolder, handleRenameFile, handleSaveIcon, handleSelectHistoryProject,
    handleSelectSuggestion, handleUseTemplate, iconPickerFile, projectPath, promptConfig,
    searchQuery, selectedPath, setAutocompleteIndex, setIconPickerFile, setPromptConfig, setSearchQuery,
    setShowAutocomplete, setShowHistoryMenu, setShowTemplateModal, showAutocomplete,
    showHistoryMenu, showTemplateModal, templateFiles,
  } = props;
  return (
    <div className="file-list" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 10px 8px 10px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
          <span style={{ fontSize: 'calc(var(--panel-title-size, 11px) - 2px)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px' }}>笔记本</span>
          <span style={{ fontSize: 'var(--panel-title-size, 11px)', fontWeight: 600, color: 'var(--text-main)' }} title={projectPath}>{folderName}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="area-btn" onClick={handleCreateFile} title="新建笔记">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
          </button>
          <button className="area-btn" onClick={handleOpenFolder} title="切换目录">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
              <path d="M4 10.5h8" />
            </svg>
          </button>
          <button id="history-projects-btn" className="area-btn" onClick={() => setShowHistoryMenu(!showHistoryMenu)} title="历史项目" style={{ position: 'relative' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="7" />
              <path d="M8 3v5h3" />
            </svg>
          </button>
        </div>
      </div>

      <HistoryProjectsMenu
        show={showHistoryMenu}
        displayedHistory={displayedHistory}
        projectPath={projectPath}
        demoPath={demoPath}
        onSelectHistoryProject={handleSelectHistoryProject}
      />

      <div style={{ marginBottom: '10px', position: 'relative' }}>
        <input
          type="text"
          placeholder="搜索... #标签 #正则(如 #^cal) 标题(如 ^标题) and or not"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
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
                setAutocompleteIndex((prev: number) => (prev + 1) % filteredSuggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAutocompleteIndex((prev: number) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = filteredSuggestions[autocompleteIndex];
                if (selected) {
                  handleSelectSuggestion(selected);
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowAutocomplete(false);
              }
            }
          }}
          style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '5px 8px', borderRadius: '6px', fontSize: 'var(--ui-font-size, 12px)', outline: 'none' }}
        />

        {showAutocomplete && filteredSuggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '28px',
            left: 0,
            right: 0,
            zIndex: 1000,
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
            {filteredSuggestions.map((suggestion: string, index: number) => {
              const isSelected = index === autocompleteIndex;
              const isRegex = suggestion.startsWith('re:');
              const isScript = suggestion.startsWith('run:');
              
              const getSuggestionDisplay = (s: string) => {
                if (s.startsWith('re:')) return s.substring(3);
                if (s.startsWith('run:')) return s.substring(4);
                return s;
              };
              const display = getSuggestionDisplay(suggestion);

              return (
                <div
                  key={suggestion}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectSuggestion(suggestion);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: 'calc(var(--ui-font-size, 12px) - 2px)',
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
                  <span style={{ fontSize: 'calc(var(--ui-font-size, 12px) - 3px)', opacity: 0.7 }}>
                    {isRegex ? '⚡ 正则' : isScript ? '⚡ 脚本' : '#'}
                  </span>
                  <span style={{ fontWeight: isSelected ? 700 : 500 }}>{display}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto' }}>
        {filteredFiles.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 'var(--ui-font-size, 12px)', color: 'var(--text-muted)' }}>没有找到任何笔记。</div>
        ) : (
          <div className="file-grid-container">
            {filteredFiles.map((file: any) => {
              const isSelected = selectedPath === file.path;
              return (
                <FileCard
                  key={file.path}
                  file={file}
                  isSelected={isSelected}
                  onFileClick={handleFileClick}
                  onRenameFile={handleRenameFile}
                  onDeleteFile={handleDeleteFile}
                  onIconClick={(e, f) => {
                    e.stopPropagation();
                    setIconPickerFile(f);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <TemplateModal
        show={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        templateFiles={templateFiles}
        onUseTemplate={handleUseTemplate}
        onOpenTempleFolder={handleOpenTempleFolder}
      />

      <PromptModal
        show={promptConfig.show}
        title={promptConfig.title}
        defaultValue={promptConfig.defaultValue}
        onConfirm={promptConfig.onConfirm}
        onClose={() => setPromptConfig((prev: any) => ({ ...prev, show: false }))}
      />

      <IconPickerModal
        file={iconPickerFile}
        onClose={() => setIconPickerFile(null)}
        onSaveIcon={handleSaveIcon}
      />
    </div>
  );
}
