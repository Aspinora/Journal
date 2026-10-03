// Phase 5, Step 6: every way of opening a Work must land on reader-demo.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a);
  assert.ok(a > -1 && b > a, `markers not found: ${startMarker}`);
  return src.slice(a, b);
}
function extractFn(src, name) {
  const a = src.indexOf('function ' + name + '(');
  assert.ok(a > -1, `function ${name} not found`);
  let depth = 0, i = src.indexOf('{', a);
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    if (src[k] === '}' && --depth === 0) return src.slice(a, k + 1);
  }
  throw new Error(`unterminated function ${name}`);
}
function loadHelpers(file) {
  const src = read(file);
  const code = extractFn(src, 'readerUrlFor') + '\n' + extractFn(src, 'goToReader');
  const calls = [];
  const ctx = {
    JOURNAL_CACHE: { 'id-1': { slug: 'my-post-123', author_id: 'a1' }, 'id-2': { author_id: 'a1' } },
    authorUsername: id => (id === 'a1' ? 'priya' : ''),
    window: { location: { href: '', replace: u => calls.push(['replace', u]) } },
  };
  Object.defineProperty(ctx.window.location, 'href', { set: u => calls.push(['assign', u]), get: () => '' });
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, calls };
}

for (const file of ['index.html', 'userpostlogin.html']) {
  test(`${file}: goToReader builds the reader address and picks assign vs replace`, () => {
    const { ctx, calls } = loadHelpers(file);
    assert.equal(ctx.readerUrlFor('id-1', 'my-post-123', 'priya'), '/reader-demo.html?u=priya&s=my-post-123');
    assert.equal(ctx.readerUrlFor('id-9'), '/reader-demo.html?id=id-9');
    ctx.goToReader('id-1');
    ctx.goToReader('id-1', { replace: true });
    ctx.goToReader('id-2');                      // cached but no slug -> id form
    ctx.goToReader('unknown');                   // not cached -> id form
    assert.deepEqual(calls, [
      ['assign', '/reader-demo.html?u=priya&s=my-post-123'],
      ['replace', '/reader-demo.html?u=priya&s=my-post-123'],
      ['assign', '/reader-demo.html?id=id-2'],
      ['assign', '/reader-demo.html?id=unknown'],
    ]);
  });

  test(`${file}: navigateTo('read') hands off to the reader before touching any view`, () => {
    const s = read(file);
    const i = s.indexOf('function navigateTo(');
    const head = s.slice(i, i + 1400);
    const guard = head.indexOf("view === 'read' && params.journalId");
    assert.ok(guard > -1, 'read intercept missing');
    assert.ok(head.indexOf('goToReader(', guard) > guard);
    assert.ok(head.indexOf("qsa('.view')") === -1 || head.indexOf("qsa('.view')") > guard, 'intercept must come before views change');
  });

  test(`${file}: /<username>/<slug> links redirect to the reader`, () => {
    assert.match(read(file), /window\.location\.replace\(readerUrlFor\(null, (parts\[1\]|route\.slug), (parts\[0\]|route\.username)\)\)/);
  });
}

test('signed-in visitors on index.html with a shared Work link are sent to the reader', () => {
  const s = read('index.html');
  assert.match(s, /if \(readId\) return readerUrlFor\(readId\);/);
  assert.match(s, /parts\.length === 2 && ![^)]*\.includes\(parts\[0\]\)\) return readerUrlFor\(null, parts\[1\], parts\[0\]\)/);
});

test('portfolio Work cards open the reader, using the slug when available', () => {
  const s = read('portfolio.html');
  assert.doesNotMatch(s, /'\?read='\s*\+/);
  assert.match(s, /\/reader-demo\.html\?u=/);
  assert.match(s, /select\('id,slug,title,/);
});

test('no page builds a ?read= link to the old in-page reader any more', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..')).filter(n => n.endsWith('.html'))) {
    const s = read(f);
    assert.doesNotMatch(s, /userpostlogin\.html\?read=['"]?\s*\+/, `${f}: builds a userpostlogin ?read= link`);
    assert.doesNotMatch(s, /index\.html'\)\s*\+\s*'\?read='/, `${f}: builds an index ?read= link`);
  }
});
