// Wiring checks: the readers must actually use the shared sanitizer, and every
// page must take its Supabase config from config.js (no inline copies).
// Behaviour of the sanitizer itself is covered in content-rendering.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const SANITIZER_PAGES = ['reader-demo.html'];
const SUPABASE_PAGES = ['admin_dashboard.html', 'index.html', 'portfolio.html', 'reader-demo.html',
  'reader-studio.html', 'thewall.html', 'usermessages.html', 'userpostlogin.html', 'writer-studio.html'];

for (const file of SANITIZER_PAGES) {
  test(`${file}: loads the sanitizer before the page script and renders bodies through it`, () => {
    const s = read(file);
    const purify = s.indexOf('/assets/vendor/dompurify-');
    const content = s.indexOf('/assets/work-content.js');
    const firstInline = s.search(/<script>(?!\s*<\/script>)/);
    assert.ok(purify > -1 && content > purify, `${file}: sanitizer scripts missing or out of order`);
    assert.ok(firstInline === -1 || content < firstInline || /<script src="\/assets\/work-content\.js">/.test(s),
      `${file}: sanitizer must load before page code`);
    assert.match(s, /JournalContent\.render\(/, `${file}: never calls JournalContent.render`);
  });
}

test('readers never feed a post body straight to markdownToHtml', () => {
  for (const file of ['reader-demo.html']) {
    const s = read(file);
    assert.doesNotMatch(s, /innerHTML\s*=\s*markdownToHtml\(/, `${file}: raw markdownToHtml into innerHTML`);
    assert.doesNotMatch(s, /['"]\s*\+\s*markdownToHtml\(/, `${file}: raw markdownToHtml in a template`);
  }
});

for (const file of SUPABASE_PAGES) {
  test(`${file}: gets Supabase settings from config.js, with no inline copy`, () => {
    const s = read(file);
    const sb = s.search(/supabase-js/);
    const cfg = s.indexOf('<script src="/config.js"></script>');
    const use = s.indexOf('window.JOURNAL_CONFIG');
    assert.ok(sb > -1 && cfg > sb && use > cfg, `${file}: config.js must load after supabase-js and before use`);
    // Boolean checks only, so a failure never prints a key value.
    assert.equal(/sb_publishable_[A-Za-z0-9_-]{10,}/.test(s), false, `${file}: inline publishable key`);
    assert.equal(/['"]eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(s), false, `${file}: inline JWT key`);
    assert.equal(/https:\/\/[a-z0-9]{20}\.supabase\.co/.test(s), false, `${file}: inline Supabase URL`);
  });
}

test('config.js is the only place holding the URL, and holds no secret keys', () => {
  const s = read('config.js');
  assert.match(s, /SUPABASE_URL/);
  assert.match(s, /SUPABASE_ANON_KEY/);
  assert.equal(/service_role|secret/i.test(s.replace(/\/\*[\s\S]*?\*\//, '')), false, 'config.js must not hold secrets');
});

test('index.html has no in-page reader any more (guests read in reader-demo)', () => {
  const s = read('index.html');
  for (const gone of ['renderReadView', 'view-read', 'wireCommentEvents', 'markdownToHtml'])
    assert.equal(s.includes(gone), false, `index.html still contains ${gone}`);
});

test('userpostlogin.html has no in-page reader or writing view any more', () => {
  const s = read('userpostlogin.html');
  for (const gone of ['renderReadView', 'renderWriteView', 'view-write', 'view-read', 'publish-modal', 'persistDraft',
    'publishJournal', 'wireCommentEvents', 'markdownToHtml', 'JournalContent', 'is-reading'])
    assert.equal(s.includes(gone), false, `userpostlogin.html still contains ${gone}`);
});
