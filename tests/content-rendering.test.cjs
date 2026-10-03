const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
function setup(file) {
  const dom = new JSDOM('', {runScripts:'outside-only', url:'https://journal.example/'});
  const win = dom.window;
  win.eval(fs.readFileSync(path.join(root,'assets/vendor/dompurify-3.4.16.min.js'),'utf8'));
  win.eval(fs.readFileSync(path.join(root,'assets/work-content.js'),'utf8'));
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const start=source.indexOf('function markdownToHtml(md)');
  const end=source.indexOf('\n  return html;\n}',start)+'\n  return html;\n}'.length;
  win.eval("function escapeHtml(s){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));} var esc=escapeHtml;" );
  const inline=source.indexOf('function inlineMd(text)');
  const inlineEnd=source.indexOf('\n}',inline)+2;
  win.eval(source.slice(inline,inlineEnd));
  win.eval(source.slice(start,end));
  return {win,render:s=>win.JournalContent.render(s,win.markdownToHtml),parse:s=>new win.DOMParser().parseFromString(s,'text/html').body};
}
for(const file of ['reader-demo.html']) {
 test(`${file}: Writer HTML becomes formatted paragraphs`,()=>{
  const {render,parse}=setup(file);
  const body=parse(render('<p data-pid="paragraph_002" dir="auto" style="text-align:center"><span style="font-size:17px;color:rgb(31, 32, 33)">Hello <b>world</b></span></p><p><br></p><p dir="rtl">ایک سطر</p>'));
  assert.equal(body.querySelectorAll('p').length,3);assert.equal(body.querySelector('b').textContent,'world');
  assert.equal(body.querySelector('p').style.textAlign,'center');assert.equal(body.querySelector('span').style.fontSize,'17px');
  assert.equal(body.querySelector('p').dataset.pid,'paragraph_002');assert.equal(body.querySelector('[dir="rtl"]').textContent,'ایک سطر');
 });
 test(`${file}: legacy Markdown remains formatted`,()=>{
  const {render,parse}=setup(file);const b=parse(render('## Heading\n\n**Bold** and *italic*\n\n- One\n- Two\n\n![Alt](https://example.com/a.png)'));
  assert.equal(b.querySelector('h3').textContent,'Heading');assert.equal(b.querySelector('strong').textContent,'Bold');
  assert.equal(b.querySelectorAll('li').length,2);assert.equal(b.querySelector('img').getAttribute('src'),'https://example.com/a.png');
 });
 test(`${file}: active markup, unsafe links and CSS are removed`,()=>{
  const {render,parse}=setup(file);const b=parse(render('<p id="location" onclick="alert(1)" style="position:fixed;background-image:url(https://bad.example);text-align:center"><script>alert(1)</script><svg onload="alert(2)"></svg><iframe src="https://bad.example"></iframe><a href="javascript:alert(1)">bad</a><img src="x" onerror="alert(1)"><a href="https://example.com">good</a></p>'));
  assert.equal(b.querySelector('script,svg,iframe,[onclick],[onerror],[id]'),null);assert.equal(b.querySelector('a').hasAttribute('href'),false);
  assert.equal(b.querySelector('p').style.position,'');assert.equal(b.querySelector('p').style.backgroundImage,'');assert.equal(b.querySelector('p').style.textAlign,'center');
  assert.match(b.querySelectorAll('a')[1].getAttribute('rel'),/noopener/);
 });
 test(`${file}: escaped tags and normal prose stay text`,()=>{
  const {render,parse}=setup(file);assert.equal(parse(render('Use <p> in an example')).querySelectorAll('p').length,1);
  assert.equal(parse(render('&lt;p&gt;example&lt;/p&gt;')).querySelector('p').textContent,'&lt;p&gt;example&lt;/p&gt;');
 });
}
test('missing sanitizer fails closed',()=>{
 const d=new JSDOM('',{runScripts:'outside-only'});d.window.eval(fs.readFileSync(path.join(root,'assets/work-content.js'),'utf8'));
 assert.ok(d.window.JournalContent.render('<p onclick="evil()">text</p>').includes('&lt;p'));
});
test('all non-admin inline scripts parse after integration',()=>{
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.html')&&f!=='admin_dashboard.html'))
  for(const m of fs.readFileSync(path.join(root,f),'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
   if(!/type=["']application\//i.test(m[1]))new vm.Script(m[2],{filename:f});
});
test('structured reader loads the selected published chapter through RPC',async()=>{
 const source=fs.readFileSync(path.join(root,'reader-studio.html'),'utf8');
 const match=source.match(/async getChapter\(id\)\{([\s\S]*?)\n  \}\n\};/);assert.ok(match);
 const calls=[];const query={select(v){calls.push(['select',v]);return this},eq(k,v){calls.push(['eq',k,v]);return this},async maybeSingle(){return {data:{id:'chapter',published_html:'<p>Published</p>'},error:null}}};
 const fn=new (Object.getPrototypeOf(async function(){}).constructor)('id','CURRENT_WORK_ROW','supabaseClient',match[1]);
 const client={rpc(name,args){calls.push(['rpc',name,args]);return query}};
 assert.equal(await fn('chapter',null,client),null);
 assert.deepEqual(await fn('chapter',{id:'work'},client),{id:'chapter',published:{html:'<p>Published</p>'}});
 assert.deepEqual(calls,[['rpc','get_story_chapters_for_read',{p_story_id:'work'}],['select','id, published_html'],['eq','id','chapter']]);
});
