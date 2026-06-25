import React from 'react';
import { FileInfo } from './types';

interface FileCardProps {
  file: FileInfo;
  isSelected: boolean;
  onFileClick: (file: FileInfo) => void;
  onRenameFile: (e: React.MouseEvent, file: FileInfo) => void;
  onDeleteFile: (e: React.MouseEvent, file: FileInfo) => void;
  onIconClick: (e: React.MouseEvent, file: FileInfo) => void;
}

export function FileCard({
  file,
  isSelected,
  onFileClick,
  onRenameFile,
  onDeleteFile,
  onIconClick,
}: FileCardProps) {
  const displayName = file.name.substring(0, file.name.lastIndexOf('.md'));

  return (
    <div
      onClick={() => onFileClick(file)}
      className={`file-card-item ${isSelected ? 'selected' : ''}`}
    >
      {/* 右上角悬浮操作按钮 */}
      <div className="file-card-actions" style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '4px', zIndex: 10 }}>
        <button
          className="file-rename-btn"
          onClick={(e) => onRenameFile(e, file)}
          title="重命名笔记"
          style={{
            background: 'rgba(0,0,0,0.05)',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            borderRadius: '50%',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" fill="currentColor"/>
          </svg>
        </button>
        <button
          className="file-delete-btn"
          onClick={(e) => onDeleteFile(e, file)}
          title="删除笔记"
          style={{
            background: 'rgba(0,0,0,0.05)',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            borderRadius: '50%',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4h12M4 4v10a1 1 0 001 1h6a1 1 0 001-1V4M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011-1V4M6.5 7.5v4.5M9.5 7.5v4.5" />
          </svg>
        </button>
      </div>

      {/* 文件头：图标 + 文件名 */}
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: '4.5px', position: 'relative' }}>
        {/* Notion-style Icon Button */}
        <div
          onClick={(e) => onIconClick(e, file)}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backgroundColor: isSelected ? 'rgba(255,59,48,0.1)' : 'rgba(0,0,0,0.03)',
            marginRight: '6px',
            fontSize: '11px',
            transition: 'background-color 0.12s, transform 0.12s',
            flexShrink: 0
          }}
          className="note-icon-btn"
          title="修改此笔记的图标"
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {file.icon || '📄'}
        </div>

        <span className="file-card-title" style={{
          fontWeight: 700,
          textAlign: 'left',
          flexGrow: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginRight: '44px', // Leave space for delete and rename buttons
        }} title={displayName}>
          {displayName}
        </span>
      </div>

      {/* 标签列表 */}
      {file.tags && file.tags.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          width: '100%',
          marginTop: '2px'
        }}>
          {file.tags.map((t) => {
            const labelText = t.startsWith('re:') || t.startsWith('run:') ? `⚡️ ${t.split(':').pop()}` : `#${t}`;
            return (
              <span
                key={`${file.path}_tag_${t}`}
                className={`file-card-tag ${isSelected ? 'selected' : ''}`}
              >
                {labelText}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
