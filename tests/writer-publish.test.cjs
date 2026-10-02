// Regression checks for writer-studio's save/publish path (Phase 5, Step 5).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'writer-studio.html'), 'utf8');

test('database errors are turned into readable messages', () => {
  const start = src.indexOf('function friendlyDbError(');
  const end = src.indexOf('function throwDb(', start);
  assert.ok(start > -1 && end > start, 'friendlyDbError not found');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(start, end), ctx);
  const f = ctx.friendlyDbError;
  assert.match(f({ code: '42501', message: 'new row violates row-level security policy' }), /permission|sign in/i);
  assert.match(f({ code: '23505', message: 'duplicate key value violates unique constraint' }), /link name/i);
  assert.match(f({ message: 'JWT expired' }), /session/i);
  assert.match(f({ message: 'Failed to fetch' }), /reach the server/i);
  assert.equal(f({ message: 'Publishing is temporarily paused. Please try again later.' }), 'Publishing is temporarily paused. Please try again later.');
  assert.equal(f(null), 'The database did not accept that.');
});

test('a single entry keeps its published status when the story record is saved', () => {
  const i = src.indexOf('if (singleEntry) {');
  const block = src.slice(i, src.indexOf('} else {', i));
  const derive = block.indexOf("o.status = ch0.status === 'published' ? 'published' : 'draft'");
  const upsert = block.indexOf("sb.from('journals').upsert(row)");
  assert.ok(derive > -1, 'status must come from the chapter');
  assert.ok(upsert > derive, 'status must be derived before the upsert');
  assert.match(block, /excerpt:\s*\(o\.description \|\| ''\)\.trim\(\) \|\| null/, 'description must be saved as the excerpt');
});

test('publishing offers a View link that opens the reader', () => {
  assert.match(src, /async function readerLinkFor\(/);
  assert.match(src, /'reader-demo\.html\?u='/);
  assert.match(src, /await App\.publishChapter\(\);[^}]*readerLinkFor\(App\.story\.id\)[^}]*label: 'View'/);
});
