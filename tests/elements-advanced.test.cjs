const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');const read=p=>fs.readFileSync(p,'utf8');
function setup(){
 const dom=new JSDOM(read('writer-studio.html'),{url:'https://journal.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.JOURNAL_CONFIG={SUPABASE_URL:'https://mock.test',SUPABASE_ANON_KEY:'mock'};w.matchMedia=()=>({matches:false,addEventListener(){}});
 w.eval(read('assets/elements.js'));w.eval(read('assets/elements-editor.js'));
 let s=[...read('writer-studio.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const Ed ='));
 s=s.slice(0,s.indexOf('(async function boot()'))+'window.studio={Ed,Elements,Sanitize,Tools,Pop,Dock,App,Model,UI,Save,Gutter};})();';w.eval(s);
 const st=w.studio;st.Gutter.init();st.Ed.mount();st.Ed.chapterId='c';st.UI.mode='write';st.App.story={};st.Model.find=()=>({chapter:{status:'draft'}});st.App.locked=()=>false;st.Save.dirty=()=>{};st.Save.flush=()=>{};st.Ed.afterInput=()=>{};st.UI.onEditorFocus=()=>{};
 st.Ed.el.innerHTML='<p data-pid="paragraph_001">The first verse</p><p data-pid="paragraph_002">The second verse</p>';st.Ed.placeCaret(st.Ed.el.firstChild,false);
 st.Ed.el.getBoundingClientRect=()=>({left:100,top:100,width:500,height:700,right:600,bottom:800});
 const undo=[],redo=[];w.document.execCommand=(cmd,_,html)=>{
  if(cmd==='insertHTML'){undo.push(st.Ed.el.innerHTML);redo.length=0;const range=w.getSelection().getRangeAt(0);range.deleteContents();range.insertNode(range.createContextualFragment(html));return true;}
  if(cmd==='undo'&&undo.length){redo.push(st.Ed.el.innerHTML);st.Ed.el.innerHTML=undo.pop();return true;}
  if(cmd==='redo'&&redo.length){undo.push(st.Ed.el.innerHTML);st.Ed.el.innerHTML=redo.pop();return true;}return false;
 };
 const core=w.JournalElements,fig=()=>st.Elements.chosen()[0],m=()=>core.model(fig());
 const insert=patch=>st.Elements.insert({src:core.catalog[0].url,w:30,ratio:1,opacity:100,...patch});
 return {dom,w,core,...st,fig,m,insert,close:()=>{st.Elements.clear();dom.window.close();}};
}
test('new element modules parse independently',()=>{for(const p of ['assets/elements.js','assets/elements-editor.js'])new vm.Script(read(p),{filename:p});});
test('appearance, free positioning, locking and page anchoring survive writer reload',()=>{
 const e=setup();e.insert({mode:'behind',x:18,y:24,rotation:35,opacity:42,flipX:true,flipY:true,border:2,borderColor:'#ab1234',shadow:'deep',locked:true,anchor:'page',page:3});
 const old=e.m(),html=e.Ed.serialize(),box=e.w.document.createElement('div');box.append(e.Sanitize.toFragment(html,{keepIds:true}));const saved=e.core.model(box.querySelector('.journal-element'));
 for(const key of ['id','mode','x','y','rotation','opacity','flipX','flipY','border','borderColor','shadow','locked','anchor','page'])assert.equal(saved[key],old[key],key);
 assert.equal(box.querySelectorAll('p').length,2);assert.equal(box.querySelectorAll('.je-selection,.je-panel,.je-drag-ghost').length,0);e.close();
});
test('locked elements reject drag, resize, delete and position changes but can unlock',()=>{const e=setup();e.insert({locked:true});const before=e.m();e.Elements.update({x:90});assert.equal(e.m().x,before.x);e.Elements.begin({pointerId:1,clientX:10,clientY:10},'move');assert.equal(e.Elements.gesture,null);e.Elements.remove();assert.equal(e.Elements.figures().length,1);e.Elements.update({locked:false},{includeLocked:true});e.Elements.remove();assert.equal(e.Elements.figures().length,0);e.close();});
test('pointer drag commits new position and pointer cancellation leaves saved HTML untouched',()=>{
 const e=setup();e.insert({mode:'front',x:10,y:0});const f=e.fig();f.getBoundingClientRect=()=>({top:100});f.querySelector('img').getBoundingClientRect=()=>({left:150,top:100,width:150,height:150,right:300,bottom:250});e.Elements.draw();e.Elements.snap=false;
 const base=e.Ed.serialize();e.Elements.begin({pointerId:8,clientX:150,clientY:100},'move');e.Elements.movePointer({pointerId:8,clientX:190,clientY:150,preventDefault(){}});assert.equal(e.Ed.serialize(),base);e.Elements.cancelGesture();assert.equal(e.Ed.serialize(),base);
 e.Elements.begin({pointerId:8,clientX:150,clientY:100},'move');e.Elements.movePointer({pointerId:8,clientX:200,clientY:100,preventDefault(){}});e.Elements.endPointer({pointerId:8});assert.equal(e.m().x,20);assert.equal(e.m().mode,'front');assert.equal(e.Ed.el.querySelector('p').textContent,'The first verse');e.close();
});
test('touch corner resize preserves proportions and unlocked aspect ratio permits different height',()=>{
 const e=setup();e.insert({mode:'front',aspect:true,w:30,ratio:1});const prep=()=>{const f=e.fig();f.getBoundingClientRect=()=>({top:100});f.querySelector('img').getBoundingClientRect=()=>({left:150,top:100,width:150,height:150,right:300,bottom:250});e.Elements.draw();};prep();
 e.Elements.begin({pointerId:2,pointerType:'touch',clientX:300,clientY:250},'se');e.Elements.movePointer({pointerId:2,clientX:350,clientY:300,preventDefault(){}});e.Elements.endPointer({pointerId:2});assert.equal(e.m().w,40);assert.equal(e.m().ratio,1);
 e.Elements.update({w:30,aspect:false,ratio:1});prep();e.Elements.begin({pointerId:3,clientX:300,clientY:250},'se');e.Elements.movePointer({pointerId:3,clientX:300,clientY:325,preventDefault(){}});e.Elements.endPointer({pointerId:3});assert.equal(e.m().w,30);assert.equal(e.m().ratio,1.5);e.close();
});
test('duplicate, grouping, ungrouping, layering and copy/paste keep unique IDs and paragraph IDs',()=>{
 const e=setup();e.insert();const first=e.m().id;e.Elements.duplicate();const second=e.m().id;assert.notEqual(first,second);e.Elements.selected=new Set([first,second]);e.Elements.group();const group=e.core.model(e.Elements.figures()[0]).group;assert.ok(group);assert.ok(e.Elements.figures().every(f=>e.core.model(f).group===group));
 e.Elements.copy();e.Elements.paste();assert.equal(e.Elements.figures().length,4);assert.equal(new Set(e.Elements.figures().map(f=>e.core.model(f).id)).size,4);assert.notEqual(e.m().group,group);e.Elements.ungroup();assert.ok(e.Elements.chosen().every(f=>e.core.model(f).group===''));
 e.Elements.order('top');const selectedZ=e.Elements.chosen().map(f=>e.core.model(f).z);const otherZ=e.Elements.figures().filter(f=>!e.Elements.selected.has(e.core.model(f).id)).map(f=>e.core.model(f).z);assert.ok(Math.min(...selectedZ)>Math.max(...otherZ));
 assert.deepEqual([...e.Ed.el.querySelectorAll('p')].map(p=>p.dataset.pid),['paragraph_001','paragraph_002']);e.close();
});
test('numeric dimensions support percent, pixels and millimeters and keyboard nudge is undoable',()=>{const e=setup();e.insert({mode:'front',x:10});e.Elements.showPanel();const units=e.w.document.querySelector('[aria-label="Size units"]');units.value='px';units.dispatchEvent(new e.w.Event('change'));const field=e.w.document.querySelector('[aria-label="Width (px)"]');assert.equal(Number(field.value),150);field.value='100';field.dispatchEvent(new e.w.Event('change'));assert.equal(e.m().w,20);
 e.Ed.el.focus();e.Elements.key({target:e.Ed.el,key:'ArrowRight',shiftKey:true,preventDefault(){},stopPropagation(){}});assert.equal(e.m().x,12);e.Ed.cmd('undo');assert.equal(e.core.model(e.Elements.figures()[0]).x,10);e.Ed.cmd('redo');assert.equal(e.core.model(e.Elements.figures()[0]).x,12);e.close();});
test('inline elements are true inline spans and can switch back to floating decorations',()=>{const e=setup();e.insert();e.Elements.update({mode:'inline'});assert.equal(e.fig().tagName,'SPAN');assert.equal(e.fig().parentElement.tagName,'P');const html=e.Ed.serialize(),box=e.w.document.createElement('div');box.append(e.Sanitize.toFragment(html,{keepIds:true}));assert.ok(box.querySelector('p>span.journal-element>img'));e.Elements.update({mode:'wrap',wrapEnd:1});assert.equal(e.fig().tagName,'FIGURE');assert.equal(e.fig().parentElement,e.Ed.el);e.core.hydrate(e.Ed.el);assert.ok(e.Ed.el.querySelector('[data-je-clear]'));e.close();});
test('page setup, margins, orientation and manual page breaks persist without changing verse identities',()=>{const e=setup();e.insert();e.Elements.mutate(root=>root.prepend(e.core.makeLayout(e.w.document,{mode:'page',paper:'A5',orientation:'landscape',margin:12,grid:true,snap:false})));e.Elements.pageBreak();assert.ok(e.Ed.el.querySelector('hr.journal-page-break'));const box=e.w.document.createElement('div');box.append(e.Sanitize.toFragment(e.Ed.serialize(),{keepIds:true}));const l=e.core.settings(box);assert.equal(l.paper,'A5');assert.equal(l.margin,12);assert.equal(l.orientation,'landscape');assert.equal(l.mode,'page');assert.ok(box.querySelector('hr.journal-page-break'));assert.deepEqual([...box.querySelectorAll('p')].map(p=>p.dataset.pid),['paragraph_001','paragraph_002']);e.close();});
test('both reader sanitizers preserve inline and layered elements while rejecting forged metadata',()=>{
 const e=setup();e.insert({mode:'front',rotation:12,opacity:80,x:25,y:11});e.Elements.mutate(root=>root.prepend(e.core.makeLayout(e.w.document,{mode:'page',paper:'Letter',margin:15})));let html=e.Ed.serialize();
 e.w.eval(read('assets/vendor/dompurify-3.4.16.min.js'));e.w.eval(read('assets/work-content.js'));const t=e.w.document.createElement('div');t.innerHTML=e.w.JournalContent.render(html);assert.equal(e.core.model(t.querySelector('.journal-element')).rotation,12);assert.equal(e.core.settings(t).paper,'Letter');
 e.Elements.update({mode:'inline'});t.innerHTML=e.w.JournalContent.render(e.Ed.serialize());assert.ok(t.querySelector('span.journal-element>img'));
 const raw=e.core.make(e.w.document,{src:e.core.catalog[0].url,mode:'front',x:9999,opacity:-5,rotation:10000});raw.setAttribute('onclick','evil()');raw.querySelector('img').setAttribute('onerror','evil()');raw.style.position='fixed';t.innerHTML=e.w.JournalContent.render(raw.outerHTML);assert.equal(t.querySelector('[onclick],[onerror]'),null);assert.equal(t.querySelector('.journal-element').style.position,'');assert.ok(e.core.model(t.querySelector('.journal-element')).x<=95);
 const rs=read('reader-studio.html'),start=rs.indexOf('function walk(node)'),end=rs.indexOf('/* Published HTML',start);e.w.eval('const ALLOW=new Set(["SPAN","B","A","BR"]);const applyStyle=()=>{};'+rs.slice(start,end)+'window.sanTest=san;');const inline=e.w.sanTest(e.Ed.el.querySelector('p').innerHTML);assert.match(inline,/mock-leaf.svg/);e.close();
});
test('mobile controls use large handles and a scrollable sheet; closing it leaves selection handles',()=>{const e=setup();e.insert();assert.ok(e.w.document.querySelector('.je-panel'));e.w.document.querySelector('[aria-label="Close element controls"]').click();assert.equal(e.w.document.querySelector('.je-panel'),null);assert.ok(e.w.document.querySelector('.je-selection'));const css=read('assets/elements.css');assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/width:44px;height:44px/);assert.match(css,/\.je-panel-body\{overflow:auto/);e.close();});
