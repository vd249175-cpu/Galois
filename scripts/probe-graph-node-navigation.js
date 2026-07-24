const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const graphCanvasPath = path.join(__dirname, '..', 'APP', 'graph-view', 'GraphViewCanvas.tsx');
const graphRegistrationPath = path.join(__dirname, '..', 'APP', 'graph-view', 'GraphView.tsx');
const graphNavigationPath = path.join(__dirname, '..', 'APP', 'graph-view', 'useGraphNodeNavigation.ts');
const conceptNotePath = path.join(__dirname, '..', 'APP', 'graph-view', 'virtualConceptNote.ts');
const conceptLifecyclePath = path.join(__dirname, '..', 'APP', 'graph-view', 'temporaryConceptLifecycle.ts');
const graphHelpersPath = path.join(__dirname, '..', 'APP', 'graph-view', 'helpers.ts');
const graphCanvas = fs.readFileSync(graphCanvasPath, 'utf8');
const graphRegistration = fs.readFileSync(graphRegistrationPath, 'utf8');
const graphNavigation = fs.readFileSync(graphNavigationPath, 'utf8');

const conceptSource = fs.readFileSync(conceptNotePath, 'utf8');
const compiledConcept = ts.transpileModule(conceptSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: conceptNotePath,
}).outputText;
const conceptModule = { exports: {} };
new Function('exports', 'module', 'require', compiledConcept)(
  conceptModule.exports,
  conceptModule,
  require,
);
const {
  buildVirtualConceptNote,
  promoteTemporaryConceptContent,
  TEMPORARY_CONCEPT_MARKER,
} = conceptModule.exports;
const lifecycleSource = fs.readFileSync(conceptLifecyclePath, 'utf8');
const compiledLifecycle = ts.transpileModule(lifecycleSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: conceptLifecyclePath,
}).outputText;
const lifecycleModule = { exports: {} };
new Function('exports', 'module', 'require', compiledLifecycle)(
  lifecycleModule.exports,
  lifecycleModule,
  (request) => request === './virtualConceptNote' ? conceptModule.exports : require(request),
);
const { promoteConceptFileIfEdited, settleTemporaryConceptFile } = lifecycleModule.exports;
const helpersSource = fs.readFileSync(graphHelpersPath, 'utf8');
const compiledHelpers = ts.transpileModule(helpersSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: graphHelpersPath,
}).outputText;
const helpersModule = { exports: {} };
new Function('exports', 'module', 'require', compiledHelpers)(
  helpersModule.exports,
  helpersModule,
  require,
);
const { getDownstreamFocusPath } = helpersModule.exports;

const virtualNode = {
  id: 'virtual:研究|视频', tags: ['视频', '研究'], label: '#研究#视频',
  x: 0, y: 0, vx: 0, vy: 0, isVirtual: true,
};
const supportingNote = {
  id: '/notes/素材.md', tags: ['研究', '视频'], label: '素材',
  x: 0, y: 0, vx: 0, vy: 0,
};
const generated = buildVirtualConceptNote('/notes', virtualNode, [supportingNote]);
assert.match(generated.filePath, /^\/notes\/概念-.+\.md$/);
assert.ok(generated.content.startsWith('---\ntags:\n'));
assert.ok(generated.content.includes(TEMPORARY_CONCEPT_MARKER));
assert.ok(generated.content.includes('  - "研究"'));
assert.ok(generated.content.includes('- [[素材]]'));
assert.ok(!promoteTemporaryConceptContent(generated.content).includes(TEMPORARY_CONCEPT_MARKER));

const focusPath = getDownstreamFocusPath('middle', [
  { source: 'parent', target: 'middle' },
  { source: 'middle', target: 'child' },
  { source: 'child', target: 'bottom' },
  { source: 'unrelated', target: 'other' },
]);
assert.deepEqual(
  [...focusPath.visibleNodeIds].sort(),
  ['bottom', 'child', 'middle', 'parent'],
);
assert.equal(focusPath.highlightedLinkIds.has('middle\u0000child'), true);
assert.equal(focusPath.highlightedLinkIds.has('child\u0000bottom'), true);
assert.equal(focusPath.visibleNodeIds.has('unrelated'), false);

assert.doesNotMatch(
  graphCanvas,
  /updateBloodKey\(BC\.system\.fileSearchQuery/,
  'graph nodes must not mutate the file browser search query',
);
assert.match(
  graphNavigation,
  /writeFile\(generated\.filePath, generated\.content\)/,
  'virtual concepts must create a real Markdown file',
);
assert.match(
  graphNavigation,
  /BC\.events\.openFile\(editorId\), node\.id/,
  'real note nodes must open their backing file in the editor',
);
assert.match(
  graphCanvas,
  /const clearGraphFocus = \(\) => \{[\s\S]*setSelectedNodeId\(null\);[\s\S]*setHoveredNode\(null\);/,
  'blank-canvas activation must clear graph focus',
);
assert.doesNotMatch(
  graphRegistration.match(/writes: \[[\s\S]*?\n    \]/)?.[0] || '',
  /BC\.system\.fileSearchQuery/,
  'graph manifest must not declare file-search writes',
);

async function validateLifecycle() {
  let diskContent = generated.content;
  let deleted = false;
  const api = {
    readFile: async () => {
      if (deleted) throw new Error('missing');
      return diskContent;
    },
    writeFile: async (_filePath, content) => { diskContent = content; },
    deleteFile: async () => { deleted = true; },
  };

  const unchanged = await promoteConceptFileIfEdited(api, {
    filePath: generated.filePath,
    initialContent: generated.content,
  });
  assert.equal(unchanged.status, 'unchanged');

  const removed = await settleTemporaryConceptFile(api, {
    filePath: generated.filePath,
    initialContent: generated.content,
  });
  assert.equal(removed.status, 'deleted');
  assert.equal(deleted, true);

  deleted = false;
  diskContent = `${generated.content}\n用户编辑`;
  const promoted = await promoteConceptFileIfEdited(api, {
    filePath: generated.filePath,
    initialContent: generated.content,
  });
  assert.equal(promoted.status, 'promoted');
  assert.equal(promoted.wrotePromotedContent, true);
  assert.ok(!diskContent.includes(TEMPORARY_CONCEPT_MARKER));
  assert.equal(deleted, false);

  console.log('graph navigation validated: temporary Markdown + promotion + cleanup + deep focus path');
}

validateLifecycle().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
