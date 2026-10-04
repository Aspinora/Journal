// Offline Chromium regression suite. Install Playwright and run: node tests/writer-elements.browser.cjs
const {chromium}=require('playwright');
const fs=require('fs');const assert=require('assert');const path=require('path');const root=path.join(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const context=await browser.newContext({viewport:{width:1200,height:900}});const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
let html=fs.readFileSync(path.join(root,'writer-studio.html'),'utf8');const boot=html.indexOf('(async function boot()');html=html.slice(0,boot)+"window.__studio={RemoteStore,CONFIG,Sim,Ed,App,UI,Store,Save,Model,Sanitize,Images,Elements,Tools,Dock,Panel,Gutter,Fonts,FONTS,journalToStory};\n})();\n</script></body></html>";
await page.route('**/*',async route=>{let url=new URL(route.request().url());if(url.pathname==='/writer-studio.html')return route.fulfill({contentType:'text/html',body:html});if(url.pathname==='/config.js')return route.fulfill({body:"window.JOURNAL_CONFIG={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'test'};"});if(url.pathname.includes('supabase'))return route.fulfill({body:'window.supabase={createClient:()=>({})};'});let f={'/assets/elements.js':'elements.js','/assets/elements-editor.js':'elements-editor.js','/assets/elements.css':'elements.css','/assets/writer-drafts.js':'writer-drafts.js','/assets/design-view.js':'design-view.js'}[url.pathname];if(f)return route.fulfill({contentType:f.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,'assets',f),'utf8')});if(url.pathname.endsWith('.svg'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="green"/></svg>'});return route.abort();});
await page.goto('https://studio.test/writer-studio.html');await page.waitForFunction(()=>window.__studio);
await page.evaluate(async()=>{
 const {App,Model,Ed,UI,Save,Gutter}=__studio;Save.dirty=()=>{};Save.flush=async()=>true;UI.syncToolbar=()=>{};Gutter.reset=()=>{};Gutter.update=()=>{};
 const s=Model.newStory();s.kind='poetry';s.title='Test';s.copyright='exclusive';const v=Model.newVolume(s),c=Model.newChapter(s);c.title='Text';v.chapters=[c];s.volumes=[v];App.story=s;UI.mode='write';
 document.querySelector('#viewLibrary').classList.remove('on');document.querySelector('#viewStudio').classList.add('on');document.querySelector('#writeArea').hidden=false;
 await Ed.load({id:c.id,storyId:s.id,html:'<p>First text.</p><p>Second text.</p>'});
});
for(const width of [1200,820,390]){
 await page.setViewportSize({width,height:900});
 const result=await page.evaluate(()=>{
  const {Ed,App,Fonts,FONTS}=__studio;const p=Ed.el.querySelector('p');Ed.el.focus();const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);Ed.saveSel();
  Ed.cmd('bold');Ed.cmd('font',FONTS[1]);Ed.cmd('size',22);Ed.cmd('align','center');Ed.cmd('color','#1F4E9E');
  return {html:Ed.el.innerHTML,validation:App.validate()};
 });assert(result.html.includes('22px'));assert(result.html.includes('rgb(31, 78, 158)'),'selection lost after changing size');assert(!result.validation.some(x=>x.level==='fail'));console.log(width+': chained formatting and publish validation passed');
}

await page.evaluate(async()=>{
 const {Ed,App,Elements,journalToStory,UI,Store}=__studio;
 const load=async(html='<p>Format these words</p><p>Keep this text</p>')=>Ed.load({id:Ed.chapterId,storyId:App.story.id,html});
 const select=()=>{Ed.el.focus();const r=document.createRange();r.selectNodeContents(Ed.el.querySelector('p,li'));getSelection().removeAllRanges();getSelection().addRange(r);Ed.saveSel();};
 await load();select();Ed.cmd('italic');select();Ed.cmd('underline');select();Ed.cmd('strike');select();Ed.cmd('highlight','#FFF3A8');
 const text=Ed.el.querySelector('p').textContent;if(text!=='Format these words')throw Error('text corrupted');
 select();Ed.cmd('link','https://example.com');if(!Ed.el.querySelector('a[href="https://example.com"]'))throw Error('link failed');
 select();Ed.cmd('unlink');if(Ed.el.querySelector('a'))throw Error('unlink failed');
 select();Ed.cmd('lineHeight','2');Ed.cmd('paraSpace','1.4em');if(Ed.el.querySelector('p').style.lineHeight!=='2')throw Error('line spacing failed');
 select();Ed.cmd('list','ul');if(!Ed.el.querySelector('ul li'))throw Error('list failed');
 select();Ed.cmd('list','ul');select();Ed.cmd('block','h2');if(!Ed.el.querySelector('h2'))throw Error('heading failed');
 await load();select();Ed.cmd('divider');if(!Ed.el.querySelector('hr'))throw Error('scene break failed');
 await load('<p><br></p>');Ed.placeCaret(Ed.el.firstChild,true);Ed.el.focus();Ed.onPaste({preventDefault(){},clipboardData:{getData:type=>type==='text/plain'?'Line one\n\nLine two':''}});
 if(!Array.from(Ed.el.querySelectorAll('p')).some(p=>!p.textContent))throw Error('blank paragraph lost on paste');
 await load();Ed.el.querySelector('p').style.fontFamily='Unknown Imported Font';
 if(App.validate().some(x=>x.label==='Formatting'&&x.level==='fail'))throw Error('font blocks publishing');
 if(!Ed.serialize().includes('Source Serif 4'))throw Error('font fallback not serialized');
 if(Ed.serialize().includes('Unknown Imported Font'))throw Error('unknown font leaked');
 if(journalToStory({id:'license-test',category_id:3,copyright:'by-nc-sa'}).copyright!=='by-nc-sa')throw Error('copyright lost on reopening');
 await load();Elements.insert({src:'/assets/elements/mock-leaf.svg',x:0,y:0,w:35,ratio:1});Elements.writeText();
 if(document.querySelector('.je-hit')||document.querySelector('.je-selection'))throw Error('element hit layer blocks writing');
 const clean=Ed.serialize();await load(clean);if(Elements.arranging||document.querySelector('.je-hit'))throw Error('reload starts in arrange mode');
 App.story.volumes[0].chapters[0].status='published';App.story._hasPublishedCopy=true;Store.all=async()=>[App.story];UI.kind='poetry';await UI.renderLibrary();if(!document.querySelector('.card__published'))throw Error('published badge missing');
});
console.log('Links, lists, spacing, headings, scene breaks, paste, font fallback, copyright, text mode and published badge passed');
await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
