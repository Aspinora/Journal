const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),path=require('path');
const names=['userpostlogin.html','reader-demo.html','reader-studio.html'];
const source=Object.fromEntries(names.map(n=>[n,fs.readFileSync(path.join(__dirname,'..',n),'utf8')]));
for(const html of Object.values(source))for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!m[1].includes('src='))new vm.Script(m[2]);
function ctx(code,extra={}){const c=vm.createContext(extra);vm.runInContext(code,c);return c;}
const demo=source['reader-demo.html'];
const d=ctx(demo.slice(demo.indexOf('async function normalizePost('),demo.indexOf('async function fetchAdjacentRef(')),{
  categoryById:id=>({name:({1:'Journals',2:'Stories',6:'Articles'})[id]||'Poetry',color:'#aaa'}),
  avatarColor:()=>'',formatDateShort:()=>'',wordCount:()=>1,readingTimeMinutes:()=>1,S:{me:null},fetchCommentsTree:async()=>[]
});
const studio=source['reader-studio.html'];
const model=studio.slice(studio.indexOf('let STORY=null,FLAT=[]'),studio.indexOf('/* ---------- Reader-side state'));
const c=ctx(model+studio.slice(studio.indexOf('function statusIcon('),studio.indexOf('function heroHTML('))+studio.slice(studio.indexOf('function readerHeader('),studio.indexOf('function stateHTML(')),{
  api:{getImage:x=>x,getAuthor:()=>({name:'Author'})},ME:{id:null},
  roman:n=>String(n),esc:x=>String(x),ic:()=>'',fmtMins:n=>n+' min',completedOn:()=>'',chPct:()=>0,chStatus:()=> 'todo',
  data:{bookmarks:[],progress:{}},root:{dataset:{}},storyProgress:()=>({done:0,total:2,pct:0}),brand:()=>'',aaBtn:()=>'',themeBtn:()=>'',coverHTML:()=>''
});
function modelWork(kind,structure='structured'){
 return{id:'w',kind,structure,category:kind==='journal'?'Journal':kind==='article'?'Article':'Story',title:'Work',status:'published',visibility:'public',volumes:[{id:'v',number:1,implicit:kind==='journal',chapters:[{id:'c1',number:1,status:'published',title:'First'},{id:'c2',number:2,status:'published',title:'Second'},{id:'c3',number:3,status:'draft',title:'Secret'}],parts:[]}]};
}
const f=source['userpostlogin.html'];
const calls=[];
const home=ctx(f.slice(f.indexOf('async function fetchLatestJournals('),f.indexOf('async function fetchLatestJournals(')+f.slice(f.indexOf('async function fetchLatestJournals(')).indexOf('\nasync function ',1)),{
  DEMO_MODE:false,supabaseClient:{rpc:async(name,p)=>{calls.push({name,p});return{data:[{total_count:1,id:'w'}]};},from:t=>{calls.push({table:t});throw Error('standalone-path');}},
  normalizeMergedFeedRow:x=>x
});
(async()=>{
 for(const count of [1,2,8]){
  const p=await d.normalizePost({id:'w',kind:'journal',category_id:1,is_multipart:true,chapter_count:count,excerpt:'Description',body_markdown:'Must not show'});
  a.equal(p.isTeaser,true);a.equal(p.readWholeLabel,'Read whole Journal');a.equal(p.teaserExcerpt,'Description');a.equal(p.bodyMd,undefined);
 }
 a.equal((await d.normalizePost({kind:'journal',category_id:1,body_markdown:'Single entry'})).isTeaser,undefined);
 a.equal((await d.normalizePost({kind:'story',category_id:2,chapter_count:7})).readWholeLabel,'Read whole Story');
 a.equal((await d.normalizePost({kind:'story',category_id:6,chapter_count:2})).readWholeLabel,'Read whole Article');
 a.equal((await d.normalizePost({kind:'story',category_id:2,chapter_count:1,body_markdown:'Story text'})).bodyMd,'Story text');
 for(const [kind,structure] of [['journal','multiple'],['story','structured'],['article','structured']]){
  c.work=modelWork(kind,structure);vm.runInContext('loadWork(work)',c);
  a.equal(vm.runInContext('STORY.single',c),false);a.equal(vm.runInContext('FLAT.length',c),2);
  a.equal(vm.runInContext('STORY.category',c),kind==='journal'?'Journal':kind==='article'?'Article':'Story');
  const html=vm.runInContext('volumeHTML(STORY.volumes[0],null)+readerHeader(FLAT[0])+openerHTML(FLAT[0])+endHTML(FLAT[0])+pagerHTML(FLAT[0])',c);
  a(!html.includes('Secret'));a(html.includes(kind==='journal'?'Entry 1':'Chapter 1'));
  a(html.includes(kind==='journal'?'Next Entry':'Next Chapter'));
  if(kind==='journal')a(!html.includes('Volume 1'));
 }
 c.work=modelWork('poetry',null);vm.runInContext('loadWork(work)',c);a.equal(vm.runInContext('STORY.single',c),true);
 for(const category of [undefined,'all','journals','stories','articles']){
  await home.fetchLatestJournals({category,page:2,pageSize:6,search:'pages',sort:'discussed'});
  const p=calls.at(-1).p;a.equal(p.p_category,category||'all');a.equal(p.p_offset,6);a.equal(p.p_search,'pages');a.equal(p.p_sort,'discussed');
 }
 for(const category of ['poetry','shayari','thoughts'])await a.rejects(home.fetchLatestJournals({category}),/standalone-path/);
 console.log('PASS: script syntax; preview handoff at 1/2/8 entries; story/article/single-entry behavior; journal contents, labels, navigation, hidden drafts; feed filters and pagination.');
})().catch(e=>{console.error(e);process.exit(1)});
