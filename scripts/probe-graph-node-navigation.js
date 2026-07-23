const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const graphCanvasPath = path.join(__dirname, '..', 'APP', 'graph-view', 'GraphViewCanvas.tsx');
const graphRegistrationPath = path.join(__dirname, '..', 'APP', 'graph-view', 'GraphView.tsx');
const graphCanvas = fs.readFileSync(graphCanvasPath, 'utf8');
const graphRegistration = fs.readFileSync(graphRegistrationPath, 'utf8');

assert.doesNotMatch(
  graphCanvas,
  /updateBloodKey\(BC\.system\.fileSearchQuery/,
  'graph nodes must not mutate the file browser search query',
);
assert.match(
  graphCanvas,
  /if \(!node \|\| node\.isVirtual\) return;/,
  'virtual concepts must not be opened as invented Markdown files',
);
assert.match(
  graphCanvas,
  /updateBloodKey\(BC\.events\.openFile\(targetEditorId\), node\.id\)/,
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

console.log('graph navigation validated: editor target + virtual safety + blank defocus');
