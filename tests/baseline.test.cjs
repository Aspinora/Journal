const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'admin_dashboard.html');

test('non-admin application scripts parse', () => {
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [index, match] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
      if (/\btype\s*=\s*["']application\//i.test(match[1])) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], {filename: `${file}:script-${index}`}), `${file} script ${index}`);
    }
  }
});

test('essential standalone route files exist', () => {
  for (const file of ['index.html','userpostlogin.html','writer-studio.html','reader-demo.html','reader-studio.html','portfolio.html','thewall.html','usermessages.html','journal-policies.html','404.html']) {
    assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
  }
});

test('literal local HTML, script and image references resolve', () => {
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    // Inspect static markup only. JavaScript templates need browser coverage.
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const match of markup.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      const value = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) continue;
      const target = value.split(/[?#]/)[0];
      if (!/\.(?:html|js|css|png|jpg|jpeg|svg|webp|ico)$/i.test(target)) continue;
      const resolved = path.resolve(root, target.replace(/^\//, ''));
      assert.ok(resolved.startsWith(root + path.sep) && fs.existsSync(resolved), `${file}: ${value}`);
    }
  }
});
