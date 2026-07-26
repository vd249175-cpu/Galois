export function MarkdownTableBlock(props: any) {
  const {
    activeCell, block, focusTableCell, handleAddTableColumn, handleAddTableRow,
    handleDeleteBlock, handleDeleteTableColumn, handleDeleteTableRow,
    handleTableCellEdit, handleTableCellKeyDown, idx, renderInline,
    setActiveCell, wrapBlock,
  } = props;
      const headerCells: string[] = block.tableHeaders || [];
      const alignments: string[] = block.tableAlignments || [];
      const dataRows: string[][] = block.tableRows || [];
      const maxCellOrder = Math.max((dataRows.length + 1) * Math.max(headerCells.length, 1) - 1, 0);
      
      const tableEl = (
        <div
          key={`table_${idx}`}
          className="reading-table-shell"
          onClick={(e) => e.stopPropagation()}
          style={{ overflowX: 'auto', margin: '14px 0', width: '100%', position: 'relative' }}
        >
          <div
            className="reading-table-toolbar"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '6px',
              marginBottom: '6px',
              opacity: 0,
              transition: 'opacity 0.14s ease',
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteBlock(block);
              }}
              style={{
                border: '1px solid rgba(255, 59, 48, 0.25)',
                background: 'rgba(255, 59, 48, 0.08)',
                color: '#ff3b30',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              删除表格
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddTableRow(block);
              }}
              style={{
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input, rgba(255,255,255,0.08))',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + 行
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddTableColumn(block);
              }}
              style={{
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input, rgba(255,255,255,0.08))',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + 列
            </button>
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              border: '1.2px solid var(--border-color)',
              borderRadius: '6px'
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.015)' }}>
                {headerCells.map((cell: string, colIdx: number) => {
                  const isCellActive = activeCell?.lineIdx === block.startLine && activeCell?.colIdx === colIdx;
                  const cellOrder = colIdx;
                  return (
                    <th
                      key={`th_${colIdx}`}
                      data-dnote-table-key={block.key}
                      data-dnote-cell-order={cellOrder}
                      contentEditable={isCellActive}
                      suppressContentEditableWarning
                      onClick={(e) => {
                        e.stopPropagation();
                        const target = e.target as HTMLElement;
                        if (target.closest('a, audio, video, button, input, select')) return;
                        const selection = window.getSelection();
                        if (selection && !selection.isCollapsed && selection.toString()) return;
                        if (!isCellActive) {
                          setActiveCell({ lineIdx: block.startLine, colIdx });
                          focusTableCell(block.key, cellOrder);
                        }
                      }}
                      onBlur={(e) => {
                        if (!isCellActive) return;
                        const newCellVal = e.currentTarget.textContent || '';
                        handleTableCellEdit(block.startLine, colIdx, newCellVal);
                        setActiveCell(null);
                      }}
                      onKeyDown={(e) => {
                        handleTableCellKeyDown(e, block.key, cellOrder, maxCellOrder);
                      }}
                      style={{
                        padding: '8px 12px',
                        fontWeight: '600',
                        textAlign: (alignments[colIdx] || 'left') as any,
                        color: 'var(--text-main)',
                        borderBottom: '2px solid var(--border-color)',
                        outline: 'none',
                        backgroundColor: isCellActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                      }}
                    >
                      <span>{isCellActive ? cell : renderInline(cell, block.startLine)}</span>
                      {headerCells.length > 1 && (
                        <button
                          type="button"
                          contentEditable={false}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteTableColumn(block, colIdx);
                          }}
                          title="删除此列"
                          style={{
                            marginLeft: '6px',
                            border: '0',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '10px',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </th>
                  );
                })}
                <th style={{ width: '28px', padding: '0', borderBottom: '2px solid var(--border-color)' }} />
              </tr>
            </thead>
            <tbody>
              {dataRows.map((rowCells: string[], rowIdx: number) => (
                <tr
                  key={`tr_${rowIdx}`}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: rowIdx % 2 === 1 ? 'rgba(0,0,0,0.005)' : 'transparent'
                  }}
                >
                  {headerCells.map((_: string, colIdx: number) => {
                    const cellVal = rowCells[colIdx] || '';
                    const cellLineIndex = block.startLine + 2 + rowIdx;
                    const isCellActive = activeCell?.lineIdx === cellLineIndex && activeCell?.colIdx === colIdx;
                    const cellOrder = (rowIdx + 1) * headerCells.length + colIdx;
                    return (
                      <td
                        key={`td_${rowIdx}_${colIdx}`}
                        data-dnote-table-key={block.key}
                        data-dnote-cell-order={cellOrder}
                        contentEditable={isCellActive}
                        suppressContentEditableWarning
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = e.target as HTMLElement;
                          if (target.closest('a, audio, video, button, input, select')) return;
                          const selection = window.getSelection();
                          if (selection && !selection.isCollapsed && selection.toString()) return;
                          if (!isCellActive) {
                            setActiveCell({ lineIdx: cellLineIndex, colIdx });
                            focusTableCell(block.key, cellOrder);
                          }
                        }}
                        onBlur={(e) => {
                          if (!isCellActive) return;
                          const newCellVal = e.currentTarget.textContent || '';
                          handleTableCellEdit(cellLineIndex, colIdx, newCellVal);
                          setActiveCell(null);
                        }}
                        onKeyDown={(e) => {
                          handleTableCellKeyDown(e, block.key, cellOrder, maxCellOrder);
                        }}
                        style={{
                          padding: '8px 12px',
                          textAlign: (alignments[colIdx] || 'left') as any,
                          color: 'var(--text-main)',
                          outline: 'none',
                          backgroundColor: isCellActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                        }}
                      >
                        {isCellActive ? cellVal : renderInline(
                          cellVal,
                          cellLineIndex,
                          (matchIndex: number, currentlyChecked: boolean) => {
                            let currentIndex = 0;
                            const nextCellVal = cellVal.replace(/\[( |x|X)\](?!\()/g, (marker: string) => {
                              if (currentIndex++ !== matchIndex) return marker;
                              return currentlyChecked ? '[ ]' : '[x]';
                            });
                            handleTableCellEdit(cellLineIndex, colIdx, nextCellVal);
                          }
                        )}
                      </td>
                    );
                  })}
                  <td
                    contentEditable={false}
                    style={{
                      width: '28px',
                      padding: '0 4px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteTableRow(block, block.startLine + 2 + rowIdx);
                      }}
                      title="删除此行"
                      style={{
                        border: '0',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      
  return wrapBlock(tableEl, block);
}
