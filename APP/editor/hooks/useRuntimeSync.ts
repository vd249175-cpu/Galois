/**
 * useRuntimeSync — 将编辑器运行时坐标写入 .dnote_runtime.json
 *
 * 从 CORE/App.tsx 迁移至此处（AGENTS.md §3 合规修复）。
 * 原先 CORE 订阅了 editor 专属的 system.editorCursor.* 频道并写文件，
 * 导致 CORE 对 APP/editor 插件产生隐式依赖。现在此逻辑在 editor 内部闭环。
 *
 * 使用方式：在 EditorView 组件中调用 useRuntimeSync(areaId)。
 */

import { useEffect } from 'react';
import { Blood } from '../../CORE/Blood';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';

export function useRuntimeSync(areaId: string) {
  useEffect(() => {
    let writeTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = Blood.subscribe((changedKeys) => {
      const isRelevant = Array.from(changedKeys).some(
        (key) =>
          key === BC.system.projectPath ||
          key === BC.system.lastFocusedEditorId ||
          key.startsWith(BC_PREFIX.editorCursorAll) ||
          key.startsWith(BC_PREFIX.openFileAll)
      );

      if (!isRelevant) return;

      if (writeTimeout) clearTimeout(writeTimeout);
      writeTimeout = setTimeout(async () => {
        const projectPath = Blood.getValue<string>(BC.system.projectPath, '');
        if (!projectPath) return;

        const lastFocusedEditorId = Blood.getValue<string | null>(
          BC.system.lastFocusedEditorId,
          null
        );
        const cursorKey = lastFocusedEditorId
          ? BC.system.editorCursor(lastFocusedEditorId)
          : null;
        const cursor = cursorKey ? Blood.getValue<any>(cursorKey, null) : null;

        const runtimeState = {
          projectPath,
          activeEditorId: lastFocusedEditorId,
          activeFile: cursor?.filePath || null,
          cursor: cursor
            ? {
                line: cursor.line,
                column: cursor.column,
                selectedText: cursor.selectedText,
              }
            : null,
          timestamp: Date.now(),
        };

        const filePath = `${projectPath}/.dnote_runtime.json`;
        try {
          await (window as any).electronAPI.writeFile(
            filePath,
            JSON.stringify(runtimeState, null, 2)
          );
        } catch (err) {
          // Non-fatal: runtime file is best-effort for AI context
          console.warn('[useRuntimeSync] Failed to write .dnote_runtime.json:', err);
        }
      }, 150);
    });

    return () => {
      if (writeTimeout) clearTimeout(writeTimeout);
      unsubscribe();
    };
  // Only attach once per area mount — areaId stabilises the subscription identity
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);
}
