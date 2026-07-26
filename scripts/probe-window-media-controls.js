const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const appSource = read('CORE', 'App.tsx');
const poppedTypeSource = read('CORE', 'usePoppedAreaType.ts');
const liveWidgetsSource = read('APP', 'editor', 'livePreviewWidgets.ts');
const readingSurfaceSource = read('APP', 'editor', 'MarkdownPreviewSurface.tsx');
const readingMediaDeleteSource = read('APP', 'editor', 'ReadingMediaDeleteButton.tsx');
const markdownMediaTokenSource = read('APP', 'editor', 'markdownMediaToken.ts');

assert.match(appSource, /usePoppedAreaType\([\s\S]*?poppedComponentType/);
assert.match(appSource, /AreaShell areaId=\{poppedAreaId\} componentType=\{poppedComponentType\}/);
assert.match(appSource, /if \(isPopped\)[\s\S]*?<LeftActivityBar \/>[\s\S]*?AreaShell areaId=\{poppedAreaId\}/);
assert.match(poppedTypeSource, /BC\.layout\.changeAreaType\(areaId\)/);
assert.match(poppedTypeSource, /Blood\.subscribe\([\s\S]*?changedKeys\.has\(changeChannel\)/);
assert.match(poppedTypeSource, /BC\.layout\.poppedAreas\(areaId\), requestedType/);

const mediaWidget = liveWidgetsSource.match(/class MediaWidget[\s\S]*?class VideoClipWidget/)?.[0] || '';
assert.match(liveWidgetsSource, /range\.from <= to && range\.to >= from/);
assert.match(mediaWidget, /removeButton\.onpointerdown = \(event\)[\s\S]*?removeMediaReference\(event\)/);
assert.match(mediaWidget, /removeMediaReference[\s\S]*?view\.dispatch/);
assert.match(mediaWidget, /wrapper\.onpointerdown/);
assert.match(mediaWidget, /selection: \{ anchor: this\.from \}/);
assert.match(mediaWidget, /removeButton\.onmousedown = preserveMediaWidget/);
assert.match(mediaWidget, /ignoreEvent\(\)\s*\{[\s\S]*?return true/);

assert.match(readingMediaDeleteSource, /className="media-token-delete-btn"/);
assert.match(readingMediaDeleteSource, /onPointerDown=\{removeToken\}/);
assert.match(readingMediaDeleteSource, /onDelete\(lineIndex, markdown, occurrence\)/);
assert.match(markdownMediaTokenSource, /source\.slice\(start \+ markdown\.length\)/);
assert.match(readingSurfaceSource, /const isDeletable = block\.type === 'code'/);

console.log('window and media controls validated: popped type switching + direct media deletion');
