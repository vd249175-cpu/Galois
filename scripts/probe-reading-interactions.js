const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const interactions = require(path.join(root, 'APP/editor/readingInteraction.ts'));

assert.equal(interactions.mapRenderedOffsetToMarkdown('# 标题', '标题', 0), 2);
assert.equal(interactions.mapRenderedOffsetToMarkdown('**粗体**', '粗体', 1), 3);
assert.deepEqual(interactions.getVerticalNavigationTarget('第一行', 2, 2, 'ArrowUp'), { direction: -1, column: 2 });
assert.deepEqual(interactions.getVerticalNavigationTarget('第一行', 2, 2, 'ArrowDown'), { direction: 1, column: 2 });
assert.equal(interactions.getVerticalNavigationTarget('上\n下', 1, 1, 'ArrowDown'), null);

const row = '![左](media/left.png) ![中](media/middle.jpg) ![右](media/right.webp)';
assert.deepEqual(interactions.getMarkdownImageTokens(row).map((token) => token.index), [0, 1, 2]);
assert.equal(
  interactions.removeMarkdownImageToken(row, 1),
  '![左](media/left.png) ![右](media/right.webp)'
);
assert.equal(
  interactions.insertMarkdownImageToken(
    '![左](media/left.png) ![右](media/right.webp)',
    '![中](media/middle.jpg)',
    0,
    true
  ),
  row
);
assert.deepEqual(
  interactions.moveMarkdownImageToken(
    [row], 0, 1, 0, 0, false
  ),
  ['![中](media/middle.jpg) ![左](media/left.png) ![右](media/right.webp)']
);
assert.deepEqual(
  interactions.moveMarkdownImageToken(
    ['![左](media/left.png)', '正文', '![右](media/right.webp)'], 0, 0, 2, 0, false
  ),
  ['正文', '![左](media/left.png) ![右](media/right.webp)']
);
assert.deepEqual(
  interactions.mergeMarkdownImageLines(
    ['![左](media/left.png)', '![右](media/right.webp)'], 1, 0, true
  ),
  ['![左](media/left.png) ![右](media/right.webp)']
);

const blocks = [
  { startLine: 0, endLine: 0 },
  { startLine: 1, endLine: 1 },
  { startLine: 2, endLine: 4 },
];
assert.equal(
  interactions.markdownForBlockRange('一\n二\n```\n三\n```', blocks, { anchorLine: 4, focusLine: 1 }),
  '二\n```\n三\n```'
);

const surface = read('APP', 'editor', 'MarkdownPreviewSurface.tsx');
const inlineRenderer = read('APP', 'editor', 'markdownInlineRenderer.tsx');
const mediaDrop = read('APP', 'editor', 'hooks', 'useMediaDrop.ts');
const readingHook = read('APP', 'editor', 'useReadingInteractions.ts');
const editorHook = read('APP', 'editor', 'useMarkdownPreviewEditing.tsx');
const readingStyles = read('APP', 'editor', 'readingPreviewStyles.ts');
const liveEditor = read('APP', 'editor', 'LiveMarkdownEditor.tsx');
const mediaDropSource = read('APP', 'editor', 'hooks', 'useMediaDrop.ts');
const readingPasteReveal = read('APP', 'editor', 'useReadingPasteReveal.ts');

assert.match(surface, /onPointerDownCapture=\{readingInteractions\.onPointerDownCapture\}/);
assert.match(surface, /onCopy=\{readingInteractions\.onCopy\}/);
assert.match(surface, /onCut=\{readingInteractions\.onCut\}/);
assert.match(surface, /onPaste=\{readingInteractions\.onPaste\}/);
assert.match(surface, /data-dnote-block-selected/);
assert.match(inlineRenderer, /data-dnote-media-token-index=\{idx\}/);
assert.match(inlineRenderer, /onMediaDragStart\?\.\(event, lineIndex, idx, match\[0\]\)/);
assert.match(inlineRenderer, /if \(hasActiveTextSelection\(\)\) return/);
assert.match(mediaDrop, /text\/x-dnote-media-token/);
assert.match(mediaDrop, /setStatusMessage\('图片排布已保存'\)/);
assert.match(readingHook, /selection && !selection\.isCollapsed/);
assert.match(readingHook, /gestureRef\.current\.moved/);
assert.match(readingHook, /setPointerCapture\(event\.pointerId\)/);
assert.match(readingHook, /blockLineFromPoint\(event\.currentTarget, event\.clientY\)/);
assert.doesNotMatch(readingHook, /else if \(!target\.closest\('\[data-dnote-media-token\]'\)\)/);
assert.match(readingHook, /event\.currentTarget\.contains\(selection\.anchorNode\)/);
assert.match(readingHook, /getMarkdownSourceRangeFromSelection/);
assert.match(readingHook, /replaceNativeSelection/);
assert.match(readingHook, /content\.slice\(range\.start, range\.end\)/);
assert.match(readingHook, /gesture\.moved && gesture\.blockCandidate/);
assert.match(readingHook, /setBaseAndExtent/);
assert.match(readingHook, /getDomCaretPointFromCoordinates/);
assert.match(readingHook, /editingOrigin/);
assert.match(readingHook, /finishEditingForSelection\?\.\(\)/);
const readingInteractionSource = read('APP', 'editor', 'readingInteraction.ts');
assert.match(readingInteractionSource, /selectedMediaSourceRange/);
assert.match(readingInteractionSource, /intersectsNode\(media\)/);
assert.match(readingStyles, /\.markdown-preview-container \[data-dnote-block-content\] \*/);
assert.match(readingStyles, /-webkit-user-select: text/);
assert.doesNotMatch(readingStyles, /\.preview-block-wrapper:active \{ cursor: grabbing; \}/);

const preview = read('APP', 'editor', 'MarkdownPreview.tsx');
assert.match(preview, /onContentChange=\{onContentChange\}/);
assert.match(editorHook, /getVerticalNavigationTarget/);
assert.match(editorHook, /pendingEditorFocusRef\.current = \{[\s\S]*?Math\.min\(preferredColumn, targetValue\.length\)/);
assert.match(editorHook, /editor\.setSelectionRange\(target, target\)/);
assert.match(editorHook, /editor\.scrollIntoView\(\{ block: 'nearest' \}\)/);
assert.match(editorHook, /background: 'transparent'/);
assert.match(editorHook, /border: 0/);
assert.match(liveEditor, /EditorView\.scrollIntoView\(head, \{ y: 'nearest' \}\)/);
assert.match(mediaDropSource, /caretIndex/);
assert.match(readingPasteReveal, /isMediaMarkdownPaste/);
assert.match(readingPasteReveal, /setEditingLineIdx\(null\)/);
assert.match(readingPasteReveal, /image\.addEventListener\('load', reveal/);

console.log('reading interaction probe: ok');
