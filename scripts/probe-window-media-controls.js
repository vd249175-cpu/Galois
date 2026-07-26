const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const appSource = read('CORE', 'App.tsx');
const poppedTypeSource = read('CORE', 'usePoppedAreaType.ts');
const liveWidgetsSource = read('APP', 'editor', 'livePreviewWidgets.ts');
const readingSurfaceSource = read('APP', 'editor', 'MarkdownPreviewSurface.tsx');

assert.match(appSource, /usePoppedAreaType\([\s\S]*?poppedComponentType/);
assert.match(appSource, /AreaShell areaId=\{poppedAreaId\} componentType=\{poppedComponentType\}/);
assert.match(appSource, /if \(isPopped\)[\s\S]*?<LeftActivityBar \/>[\s\S]*?AreaShell areaId=\{poppedAreaId\}/);
assert.match(poppedTypeSource, /BC\.layout\.changeAreaType\(areaId\)/);
assert.match(poppedTypeSource, /Blood\.subscribe\([\s\S]*?changedKeys\.has\(changeChannel\)/);
assert.match(poppedTypeSource, /BC\.layout\.poppedAreas\(areaId\), requestedType/);

const mediaWidget = liveWidgetsSource.match(/class MediaWidget[\s\S]*?class VideoClipWidget/)?.[0] || '';
assert.match(mediaWidget, /removeButton\.onpointerdown = \(event\)[\s\S]*?removeMediaReference\(event\)/);
assert.match(mediaWidget, /removeMediaReference[\s\S]*?view\.dispatch/);
assert.match(mediaWidget, /wrapper\.onpointerdown/);
assert.match(mediaWidget, /selection: \{ anchor: this\.from \}/);
assert.match(mediaWidget, /removeButton\.onmousedown = preserveMediaWidget/);
assert.match(mediaWidget, /ignoreEvent\(\)\s*\{[\s\S]*?return true/);

const readingDeleteButton = readingSurfaceSource.match(/<button\s+type="button"[\s\S]*?className="media-delete-btn"[\s\S]*?<\/button>/)?.[0] || '';
assert.match(readingDeleteButton, /draggable=\{false\}/);
assert.match(readingDeleteButton, /onPointerDown=\{\(e\)[\s\S]*?e\.button === 0\) handleDeleteBlock\(block\)/);
assert.match(readingDeleteButton, /onContextMenu=\{\(e\)[\s\S]*?e\.preventDefault\(\)/);

console.log('window and media controls validated: popped type switching + direct media deletion');
