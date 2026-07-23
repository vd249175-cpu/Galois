const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.join(
  __dirname,
  '..',
  'APP',
  'file-tree',
  'fileTreeSearchSync.ts',
);
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;

const loadedModule = { exports: {} };
new Function('exports', 'module', 'require', compiled)(
  loadedModule.exports,
  loadedModule,
  require,
);
const { decideFileTreeSearchSync } = loadedModule.exports;

const externalRealTag = decideFileTreeSearchSync('', '#真实标签', '');
assert.deepEqual(externalRealTag, {
  nextLinkedQuery: '#真实标签',
  adoptLinkedQuery: '#真实标签',
  publishLocalQuery: null,
});

const settledRealTag = decideFileTreeSearchSync(
  externalRealTag.nextLinkedQuery,
  '#真实标签',
  externalRealTag.adoptLinkedQuery,
);
assert.equal(settledRealTag.publishLocalQuery, null);

const externalVirtualTag = decideFileTreeSearchSync(
  '#真实标签',
  '#概念A #概念B',
  '#真实标签',
);
assert.equal(externalVirtualTag.adoptLinkedQuery, '#概念A #概念B');
assert.equal(externalVirtualTag.publishLocalQuery, null);

const localTyping = decideFileTreeSearchSync(
  '#概念A #概念B',
  '#概念A #概念B',
  '#用户输入',
);
assert.equal(localTyping.adoptLinkedQuery, null);
assert.equal(localTyping.publishLocalQuery, '#用户输入');

console.log('file search sync validated: real tag + virtual tag + local typing');
