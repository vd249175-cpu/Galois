export function GeneralSettingsPanel(props: any) {
  const {
    availableThemes, editorAutosaveDelay, editorFontFamily, editorFontFamilyOptions,
    editorFontSize, editorLineHeight, fileTreeTagSize, fileTreeTitleSize,
    graphControlFontSize, graphDrawerFontSize, graphNodeFontSize, handleThemeChange,
    hasKnownEditorFontFamily, panelTitleSize, renderNumberSetting, saveConfig,
    setEditorAutosaveDelay, setEditorFontFamily, setEditorFontSize, setEditorLineHeight,
    setFileTreeTagSize, setFileTreeTitleSize, setGraphControlFontSize, setGraphDrawerFontSize,
    setGraphNodeFontSize, setPanelTitleSize, setSidebarIconSize, setSidebarLabelSize,
    setSlashMenuDescriptionSize, setSlashMenuTitleSize, setTerminalFontSize,
    setTimelineFontSize, setUiFontSize, sidebarIconSize, sidebarLabelSize,
    slashMenuDescriptionSize, slashMenuTitleSize, terminalFontSize, theme, timelineFontSize,
    uiFontSize,
  } = props;
  return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Theme Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'calc(var(--panel-title-size, 11px) + 2px)', fontWeight: 'bold' }}>界面主题</label>
                <select
                  value={theme}
                  onChange={(e) => handleThemeChange(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-main)',
                    fontSize: 'var(--ui-font-size, 12px)',
                    outline: 'none'
                  }}
                >
                  {availableThemes.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 'calc(var(--ui-font-size, 12px) - 1px)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  主题 CSS 位于 ~/Documents/Galois/config/themes/，可直接复制或修改。
                </div>
              </div>

              {/* Appearance Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span style={{ fontSize: 'calc(var(--panel-title-size, 11px) + 2px)', fontWeight: 'bold' }}>界面外观设置</span>

                {renderNumberSetting('界面基础文字 (px)', uiFontSize, setUiFontSize, 'appearance', 'uiFontSize', 12, 10, 18)}
                {renderNumberSetting('面板标题文字 (px)', panelTitleSize, setPanelTitleSize, 'appearance', 'panelTitleSize', 11, 9, 18)}
                {renderNumberSetting('侧栏文字大小 (px)', sidebarLabelSize, setSidebarLabelSize, 'appearance', 'sidebarLabelSize', 11, 9, 18)}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>侧栏图标大小 (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="28"
                    value={sidebarIconSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 14;
                      setSidebarIconSize(val);
                      saveConfig({ appearance: { sidebarIconSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>文件卡片标题大小 (px)</label>
                  <input
                    type="number"
                    min="9"
                    max="18"
                    value={fileTreeTitleSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 11;
                      setFileTreeTitleSize(val);
                      saveConfig({ appearance: { fileTreeTitleSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>文件卡片标签大小 (px)</label>
                  <input
                    type="number"
                    min="7"
                    max="14"
                    step="0.5"
                    value={fileTreeTagSize}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 8.5;
                      setFileTreeTagSize(val);
                      saveConfig({ appearance: { fileTreeTagSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                {renderNumberSetting('Slash 命令标题 (px)', slashMenuTitleSize, setSlashMenuTitleSize, 'appearance', 'slashMenuTitleSize', 11, 9, 18)}
                {renderNumberSetting('Slash 命令说明 (px)', slashMenuDescriptionSize, setSlashMenuDescriptionSize, 'appearance', 'slashMenuDescriptionSize', 9, 8, 16)}
                {renderNumberSetting('视频时间轴文字 (px)', timelineFontSize, setTimelineFontSize, 'appearance', 'timelineFontSize', 11, 9, 18)}
              </div>

              {/* Editor Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span style={{ fontSize: 'calc(var(--panel-title-size, 11px) + 2px)', fontWeight: 'bold' }}>编辑器设置</span>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>字体大小 (px)</label>
                  <input
                    type="number"
                    value={editorFontSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 14;
                      setEditorFontSize(val);
                      saveConfig({ editor: { fontSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>字体族 (Family)</label>
                  <select
                    value={editorFontFamily}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditorFontFamily(val);
                      saveConfig({ editor: { fontFamily: val } });
                    }}
                    style={{
                      width: '170px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                    }}
                  >
                    {!hasKnownEditorFontFamily && editorFontFamily && (
                      <option value={editorFontFamily}>{editorFontFamily}</option>
                    )}
                    {editorFontFamilyOptions.map((option: any) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>行高 (Line Height)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editorLineHeight}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1.6;
                      setEditorLineHeight(val);
                      saveConfig({ editor: { lineHeight: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>自动保存延迟 (ms)</label>
                  <input
                    type="number"
                    value={editorAutosaveDelay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 500;
                      setEditorAutosaveDelay(val);
                      saveConfig({ editor: { autosaveDelay: val } });
                    }}
                    style={{
                      width: '70px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>
              </div>

              {/* Graph Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span style={{ fontSize: 'calc(var(--panel-title-size, 11px) + 2px)', fontWeight: 'bold' }}>图谱文字设置</span>
                {renderNumberSetting('节点标签文字 (px)', graphNodeFontSize, setGraphNodeFontSize, 'graph', 'nodeFontSize', 9, 7, 18, 0.5)}
                {renderNumberSetting('控制面板文字 (px)', graphControlFontSize, setGraphControlFontSize, 'graph', 'controlFontSize', 11, 9, 18)}
                {renderNumberSetting('详情抽屉文字 (px)', graphDrawerFontSize, setGraphDrawerFontSize, 'graph', 'drawerFontSize', 12, 9, 18)}
              </div>

              {/* Terminal Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span style={{ fontSize: 'calc(var(--panel-title-size, 11px) + 2px)', fontWeight: 'bold' }}>终端设置</span>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>字体大小 (px)</label>
                  <input
                    type="number"
                    value={terminalFontSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 13;
                      setTerminalFontSize(val);
                      saveConfig({ terminal: { fontSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  AGY 助手通过终端面板的按钮在系统 Terminal 中启动，不再注入内嵌终端，避免刷新或热更新打断助手会话。
                </p>
              </div>

            </div>
  );
}
