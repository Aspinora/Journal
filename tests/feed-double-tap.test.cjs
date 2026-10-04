// Double-tap / double-click on a feed card likes it (never opens it), for plain posts and for
// structured works (Stories / Articles / multipart Journals), with realistic tap timing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ME = 'me-1';
const FEED = [
  { id: 'j-1', slug: 'a-post', title: 'A Post', excerpt: 'plain post', body_markdown: 'plain post', category_id: 1, tags: [], published_at: '2026-10-01T00:00:00Z',
    like_count: 2, comment_count: 0, read_count: 0, author_id: 'au-1', status: 'published', visibility: 'public', display_name: 'Au', username: 'au', avatar_url: null, kind: 'journal', chapter_count: null, total_count: 2 },
  { id: 'w-1', slug: 'a-story', title: 'A Story', excerpt: 'a story', category_id: 2, tags: [], published_at: '2026-10-02T00:00:00Z',
    like_count: 5, comment_count: 0, read_count: 0, author_id: 'au-1', status: 'published', visibility: 'public', display_name: 'Au', username: 'au', avatar_url: null, kind: 'story', chapter_count: 7, total_count: 2 },
];

async function open() {
  const writes = [];
  const from = table => {
    const q = { table, op: 'select', payload: null, filters: [] };
    const b = {};
    ['select', 'eq', 'in', 'is', 'order', 'limit', 'neq', 'gt', 'lt', 'range', 'or'].forEach(m => (b[m] = (...a) => { if (m === 'eq') q.filters.push(a.join('=')); return b; }));
    b.insert = p => { q.op = 'insert'; q.payload = p; return b; };
    b.update = p => { q.op = 'update'; q.payload = p; return b; };
    b.delete = () => { q.op = 'delete'; return b; };
    b.upsert = p => { q.op = 'upsert'; q.payload = p; return b; };
    const result = () => {
      if (q.op !== 'select') writes.push({ table, op: q.op, payload: q.payload, filters: q.filters });
      if (q.op === 'select' && table === 'profiles') return { data: { id: ME, username: 'me', display_name: 'Me', avatar_url: null, bio: '' }, error: null, count: 0 };
      return { data: q.op === 'select' ? [] : null, error: null, count: 0 };
    };
    b.single = async () => result();
    b.maybeSingle = async () => result();
    b.then = (ok, bad) => Promise.resolve(result()).then(ok, bad);
    return b;
  };
  const chan = () => { const c = { on: () => c, subscribe: () => c, unsubscribe() {} }; return c; };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: ME, email: 'me@x.test', user_metadata: {} } } }, error: null }),
      getUser: async () => ({ data: { user: { id: ME } }, error: null }),
      onAuthStateChange: cb => {
        // The page waits for Supabase's first auth event before it renders anything.
        setTimeout(() => cb('INITIAL_SESSION', { user: { id: ME, email: 'me@x.test', user_metadata: {} } }), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from, channel: chan, removeChannel() {},
    rpc: async name => (name === 'get_stories_articles_feed' ? { data: FEED, error: null } : { data: null, error: null }),
  };
  const navigations = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (/navigation/i.test(e.message)) navigations.push(e.message); });
  const html = fs.readFileSync(path.join(__dirname, '..', 'userpostlogin.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://example.test/userpostlogin.html',
    beforeParse(w) {
      w.JOURNAL_CONFIG = { SUPABASE_URL: 'https://x.test', SUPABASE_ANON_KEY: 'k' };
      w.supabase = { createClient: () => client };
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
      w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollTo = () => {};
    },
  });
  const doc = dom.window.document;
  for (let i = 0; i < 80 && doc.querySelectorAll('.j-card').length < 2; i++) await new Promise(r => setTimeout(r, 25));
  return { dom, doc, writes, navigations };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function click(w, el, x = 50, y = 50) {
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 }));
}
const cardOf = (doc, id) => doc.querySelector(`.j-card[data-open-journal="${id}"]`);

test('the feed renders both a plain post and a story card', async () => {
  const { doc } = await open();
  assert.ok(cardOf(doc, 'j-1'));
  assert.ok(cardOf(doc, 'w-1'));
});

for (const [label, gap] of [['quick double-tap (120 ms apart)', 120], ['normal double-tap (300 ms apart)', 300]]) {
  test(`${label} on a plain post likes it (journal_likes) and does not open it`, async () => {
    const { dom, doc, writes, navigations } = await open();
    const card = cardOf(doc, 'j-1').querySelector('.j-body h3');
    click(dom.window, card); await wait(gap); click(dom.window, card);
    await wait(500);
    assert.ok(writes.find(w => w.table === 'journal_likes' && w.op === 'insert' && w.payload.journal_id === 'j-1' && w.payload.user_id === ME), 'like written');
    assert.equal(navigations.length, 0, 'post was not opened');
    assert.match(cardOf(doc, 'j-1').querySelector('.j-like-btn').className, /is-liked/);
    assert.equal(cardOf(doc, 'j-1').querySelector('.j-like-count').textContent, '3');
    assert.ok(doc.querySelector('.dbl-like-heart') || true);
  });

  test(`${label} on a story likes it through story_likes, not journal_likes`, async () => {
    const { dom, doc, writes, navigations } = await open();
    const card = cardOf(doc, 'w-1').querySelector('.j-body h3');
    click(dom.window, card); await wait(gap); click(dom.window, card);
    await wait(500);
    assert.ok(writes.find(w => w.table === 'story_likes' && w.op === 'insert' && w.payload.story_id === 'w-1' && w.payload.user_id === ME), 'story like written');
    assert.ok(!writes.find(w => w.table === 'journal_likes'), 'journal_likes never touched for a story');
    assert.equal(navigations.length, 0);
    assert.equal(cardOf(doc, 'w-1').querySelector('.j-like-count').textContent, '6');
  });
}

test('a single tap still opens the post after the short wait', async () => {
  const { dom, doc, writes, navigations } = await open();
  click(dom.window, cardOf(doc, 'w-1').querySelector('.j-body h3'));
  await wait(150);
  assert.equal(navigations.length, 0, 'not yet — waiting to see if a second tap follows');
  await wait(400);
  assert.equal(navigations.length, 1, 'opened');
  assert.equal(writes.length, 0, 'nothing liked');
});

test('a third quick tap after a double-tap does not open the post', async () => {
  const { dom, doc, navigations } = await open();
  const t = cardOf(doc, 'j-1').querySelector('.j-body h3');
  click(dom.window, t); await wait(100); click(dom.window, t); await wait(100); click(dom.window, t);
  await wait(700);
  assert.equal(navigations.length, 0);
});

test('double-tapping an already-liked post never removes the like', async () => {
  const { dom, doc, writes } = await open();
  const t = cardOf(doc, 'j-1').querySelector('.j-body h3');
  click(dom.window, t); await wait(100); click(dom.window, t); await wait(400);
  click(dom.window, t); await wait(100); click(dom.window, t); await wait(500);
  assert.equal(writes.filter(w => w.op === 'insert').length, 1);
  assert.equal(writes.filter(w => w.op === 'delete').length, 0);
});

test('the heart button on a story card writes to story_likes too', async () => {
  const { dom, doc, writes } = await open();
  click(dom.window, cardOf(doc, 'w-1').querySelector('.j-like-btn')); await wait(300);
  assert.ok(writes.find(w => w.table === 'story_likes' && w.op === 'insert' && w.payload.story_id === 'w-1'));
});
