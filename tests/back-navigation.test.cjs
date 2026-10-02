// Phase 5, Step 7: the back button, sign-in return paths and cross-page exits.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function extractFn(src, name) {
  const a = src.indexOf('function ' + name + '(');
  assert.ok(a > -1, `function ${name} not found`);
  let depth = 0;
  for (let k = src.indexOf('{', a); k < src.length; k++) {
    if (src[k] === '{') depth++;
    if (src[k] === '}' && --depth === 0) return src.slice(a, k + 1);
  }
  throw new Error('unterminated ' + name);
}

/* A tiny fake browser: history with state, location, referrer. */
function readerEnv({ referrer = '', me = null, state = null } = {}) {
  const log = [];
  const ctx = {
    S: { me }, firstUrlSync: true,
    document: { referrer },
    location: { origin: 'https://site.test', pathname: '/reader-demo.html', set href(u) { log.push(['href', u]); } },
    history: {
      state,
      replaceState(s) { this.state = s; log.push(['replace', s]); },
      pushState(s) { this.state = s; log.push(['push', s]); },
      go(n) { log.push(['go', n]); },
    },
    URL,
    window: { location: { set href(u) { log.push(['href', u]); } } },
  };
  vm.createContext(ctx);
  const src = read('reader-demo.html');
  vm.runInContext(['cameFromApp', 'leaveReader', 'syncUrl'].map(n => extractFn(src, n)).join('\n'), ctx);
  return { ctx, log };
}
const post = { id: 'p1', username: 'priya', slug: 'my-post-123' };

test('reader: arriving from a site page, Back rewinds past every page turn', () => {
  const { ctx, log } = readerEnv({ referrer: 'https://site.test/userpostlogin.html', me: { id: 'm' } });
  ctx.syncUrl(post); ctx.firstUrlSync = false;          // first load
  ctx.syncUrl(post); ctx.syncUrl(post); ctx.syncUrl(post); // three page turns
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.history.state)), { id: 'p1', depth: 3, inApp: true });
  log.length = 0; ctx.leaveReader();
  assert.deepEqual(log, [['go', -4]]);
});

test('reader: arriving directly (no referrer) leaves for the front door or the app', () => {
  let e = readerEnv({ referrer: '', me: null });
  e.ctx.syncUrl(post); e.log.length = 0; e.ctx.leaveReader();
  assert.deepEqual(e.log, [['href', '/index.html']]);
  e = readerEnv({ referrer: 'https://elsewhere.test/x', me: { id: 'm' } });
  e.ctx.syncUrl(post); e.log.length = 0; e.ctx.leaveReader();
  assert.deepEqual(e.log, [['href', '/userpostlogin.html']]);
});

test('reader: another reader page as referrer does not count as "came from the app"', () => {
  const { ctx } = readerEnv({ referrer: 'https://site.test/reader-demo.html?u=a&s=b' });
  assert.equal(ctx.cameFromApp(), false);
});

test('reader: a reload keeps the depth already recorded for that entry', () => {
  const { ctx } = readerEnv({ referrer: 'https://site.test/portfolio.html', state: { id: 'p1', depth: 2, inApp: true } });
  ctx.syncUrl(post);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.history.state)), { id: 'p1', depth: 2, inApp: true });
});

test('guests who need to sign in are sent back to the same Work afterwards', () => {
  assert.match(read('reader-demo.html'), /\/index\.html\?next=' \+ encodeURIComponent\(location\.pathname \+ location\.search\)/);
});

test('index.html honours ?next= for our own pages only', () => {
  const src = read('index.html');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('const SAFE_NEXT_PAGES'), src.indexOf('function memberDestinationUrl(')), ctx);
  const ok = ctx.safeNextUrl;
  assert.equal(ok('/writer-studio.html?open=abc'), '/writer-studio.html?open=abc');
  assert.equal(ok('/reader-demo.html?u=a&s=b'), '/reader-demo.html?u=a&s=b');
  for (const bad of ['//evil.test/x', 'https://evil.test', '/\\evil.test', '/admin_dashboard.html', '/other.html', 'javascript:alert(1)', '', null, undefined])
    assert.equal(ok(bad), '', `must reject ${bad}`);
  const i = src.indexOf('function memberDestinationUrl(');
  assert.match(src.slice(i, i + 400), /safeNextUrl\(q\.get\('next'\)\)[\s\S]*return next;/);
});

test('reader-studio Back goes to the Work page in the reader, not a placeholder', () => {
  const s = read('reader-studio.html');
  assert.doesNotMatch(s, /In the full site this returns/);
  assert.match(s, /case'exit':\{[^}]*\/reader-demo\.html\?u=/);
});

test('writer-studio has a way back to the app, and signing in returns to it', () => {
  const s = read('writer-studio.html');
  assert.match(s, /id="libBack"[^>]*href="\/userpostlogin\.html"/);
  assert.match(s, /\/index\.html\?next=' \+ encodeURIComponent\(location\.pathname \+ location\.search\)/);
});

test('reader: a slower, older load can never overwrite a newer one', () => {
  const s = read('reader-demo.html');
  const body = extractFn(s, 'openPost').replace(/^async /, '');
  assert.match(s, /let openToken = 0;/);
  assert.equal((body.match(/myToken !== openToken/g) || []).length, 2, 'both awaits must be followed by a staleness check');
  assert.ok(body.indexOf('myToken !== openToken') < body.indexOf('showLoadError'), 'check precedes rendering errors');
});
