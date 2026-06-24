import { parseFrontmatterTags, resolveTagsSync, parseFrontmatterIcon } from '../utils';

/**
 * calculateAllResolvedTags — 计算所有笔记文件的已解析标签
 *
 * WRITES: system.resolvedTags (通过调用者 FileTree 写入 Blood)
 * READS:  electronAPI.readFile, electronAPI.execCommand
 *
 * @param onError 脚本执行错误回调，供调用者广播 events.scriptError
 */
export async function calculateAllResolvedTags(
  projectPath: string,
  mdFiles: { name: string; path: string }[],
  maxIterations: number,
  onError?: (message: string) => void
): Promise<{
  resolved: Record<string, string[]>;
  staticTags: Record<string, string[]>;
  icons: Record<string, string>;
}> {
  const initialTagsMap: Record<string, string[]> = {};
  const fileRawTags: Record<string, string[]> = {};
  const staticTagsMap: Record<string, string[]> = {};
  const fileIconsMap: Record<string, string> = {};

  for (const file of mdFiles) {
    try {
      const rawContent = await (window as any).electronAPI.readFile(file.path);
      const rawTags = parseFrontmatterTags(rawContent);
      const tags = resolveTagsSync(rawTags, rawContent);
      initialTagsMap[file.path] = tags;
      fileRawTags[file.path] = rawTags;
      staticTagsMap[file.path] = rawTags;
      const icon = parseFrontmatterIcon(rawContent);
      fileIconsMap[file.path] = icon;
    } catch (e) {
      console.error('[tagResolver] Failed to read/parse:', file.path, e);
      initialTagsMap[file.path] = [];
      fileRawTags[file.path] = [];
      staticTagsMap[file.path] = [];
      fileIconsMap[file.path] = '';
    }
  }

  let resolvedTagsMap = { ...initialTagsMap };

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const nextTagsMap = { ...resolvedTagsMap };
    let hasChanges = false;

    const runTasks = mdFiles.map(async (file) => {
      const rawTags = fileRawTags[file.path] || [];
      const scriptTags = rawTags.filter(t => t.startsWith('run:'));
      if (scriptTags.length === 0) return;

      const currentFileResolved = [...(initialTagsMap[file.path] || [])];
      const scriptDir = `${projectPath}/script`;

      for (const tag of scriptTags) {
        const scriptName = tag.substring(4).trim();
        try {
          const envResolvedTags = JSON.stringify(resolvedTagsMap).replace(/'/g, "'\\''");
          const cmd = `DNOTE_NOTE_PATH="${file.path}" DNOTE_RESOLVED_TAGS='${envResolvedTags}' uv run ${scriptName}`;
          const result = await (window as any).electronAPI.execCommand(cmd, scriptDir);

          if (result && result.stdout) {
            const parsed = JSON.parse(result.stdout.trim());
            const scriptCalculated = Array.isArray(parsed) ? parsed : (parsed.tags || []);
            scriptCalculated.forEach((t: any) => {
              const val = String(t).trim();
              if (val && !currentFileResolved.includes(val)) currentFileResolved.push(val);
            });
          }

          if (result && result.stderr && result.stderr.trim()) {
            const msg = `Script "${scriptName}" (${file.name}): ${result.stderr.trim()}`;
            console.warn('[tagResolver]', msg);
            onError?.(msg);
          }
        } catch (err: any) {
          const msg = `Script "${scriptName}" failed for "${file.name}": ${err.message || err}`;
          console.error('[tagResolver]', msg);
          onError?.(msg);
        }
      }

      currentFileResolved.sort();
      const prevTags = resolvedTagsMap[file.path] || [];
      const isDifferent =
        prevTags.length !== currentFileResolved.length ||
        prevTags.some((t, idx) => t !== currentFileResolved[idx]);

      if (isDifferent) {
        nextTagsMap[file.path] = currentFileResolved;
        hasChanges = true;
      }
    });

    await Promise.all(runTasks);
    if (!hasChanges) break;
    resolvedTagsMap = nextTagsMap;
  }

  return {
    resolved: resolvedTagsMap,
    staticTags: staticTagsMap,
    icons: fileIconsMap,
  };
}
