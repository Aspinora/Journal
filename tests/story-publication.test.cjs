const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),{PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
const AUTHOR='11111111-1111-4111-8111-111111111111',READER='22222222-2222-4222-8222-222222222222',OTHER='33333333-3333-4333-8333-333333333333',WORK='44444444-4444-4444-8444-444444444444',VOL='55555555-5555-4555-8555-555555555555',VOL2='66666666-6666-4666-8666-666666666666',C1='77777777-7777-4777-8777-777777777777',C2='88888888-8888-4888-8888-888888888888';
async function fixture(){
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.exec("create table profiles(id uuid primary key);create table journals(id uuid primary key);create table story_works(id uuid primary key,author_id uuid references profiles,kind text default 'story',title text,description text,genre text,tags text[] default '{}',status text default 'draft',visibility text default 'public',allow_impressions boolean default true,copyright text,cover_url text,published_at timestamptz,updated_at timestamptz default now(),moderation_status text default 'active',word_count int,last_chapter_id uuid);create table story_volumes(id uuid primary key,story_id uuid references story_works,number int,title text,description text,status text,cover_url text,is_implicit boolean);create table story_parts(id uuid primary key,volume_id uuid references story_volumes,number int,title text,description text,status text,cover_url text,published_at timestamptz);create table story_chapters(id uuid primary key,story_id uuid references story_works,volume_id uuid references story_volumes,part_id uuid references story_parts,number int,title text,status text,html text,published_html text,published_at timestamptz,word_count int,char_count int,updated_at timestamptz);create table notifications(id uuid default gen_random_uuid() primary key,recipient_id uuid references profiles,actor_id uuid references profiles,type text,message text,read_at timestamptz,created_at timestamptz default now());create function public._restriction_block(uuid,text[],text) returns void language plpgsql as $$begin if current_setting('test.blocked',true)='yes' then raise exception 'Publishing paused';end if;end$$;");
 await db.exec(read('supabase/migrations/20261006104706_story_publication_and_discovery.sql'));
 await db.exec(read('supabase/migrations/20261006104936_story_subscription_privileges.sql'));
 await db.exec("grant select,insert,update,delete on story_works,story_volumes,story_parts,story_chapters to authenticated;alter table story_works enable row level security;create policy owner on story_works for all to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());create policy readable on story_works for select to authenticated using(visibility='public' and status<>'draft');alter table story_volumes enable row level security;create policy owner on story_volumes for all to authenticated using(exists(select 1 from story_works where id=story_id and author_id=auth.uid())) with check(exists(select 1 from story_works where id=story_id and author_id=auth.uid()));alter table story_parts enable row level security;create policy owner on story_parts for all to authenticated using(exists(select 1 from story_volumes v join story_works w on w.id=v.story_id where v.id=volume_id and w.author_id=auth.uid())) with check(exists(select 1 from story_volumes v join story_works w on w.id=v.story_id where v.id=volume_id and w.author_id=auth.uid()));alter table story_chapters enable row level security;create policy owner on story_chapters for all to authenticated using(exists(select 1 from story_works where id=story_id and author_id=auth.uid())) with check(exists(select 1 from story_works where id=story_id and author_id=auth.uid()));");
 await db.query('insert into profiles values($1),($2),($3)',[AUTHOR,READER,OTHER]);
 await db.query("insert into story_works(id,author_id,title,status) values($1,$2,'Original','published')",[WORK,AUTHOR]);
 await db.query('insert into story_subscriptions(story_id,user_id) values($1,$2),($1,$3)',[WORK,READER,OTHER]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[AUTHOR]);
 return db;
}
function payload(){return {work:{title:'A complete story',description:'Kept',genres:[{genre:'Fantasy',subgenres:['High Fantasy','Romantic Fantasy']}],tags:['hope'],visibility:'public',allow_impressions:true,copyright:'exclusive',cover_url:'https://example.test/cover.jpg',series_status:'completed',reader_metadata:{language:'English'}},volumes:[{id:VOL,number:1,title:'One',is_implicit:false},{id:VOL2,number:2,title:'Two',is_implicit:false}],parts:[],chapters:[{id:C1,volume_id:VOL,part_id:null,number:1,title:'First'},{id:C2,volume_id:VOL2,part_id:null,number:2,title:'Second'}],releases:[{id:C1,html:'<p data-pid="paragraph_001">First chapter</p>',word_count:2,char_count:13},{id:C2,html:'<p data-pid="paragraph_002">Second chapter</p>',word_count:2,char_count:14}]};}
async function publish(db,p=payload()){return db.query('select publish_story_batch($1,$2,$3,$4,$5,$6) result',[WORK,p.work,p.volumes,p.parts,p.chapters,p.releases]);}
test('bulk release is atomic, dates survive re-publication, and batches notify once per subscriber',async()=>{
 const db=await fixture();try{
  const result=(await publish(db)).rows[0].result;assert.equal(result.work.series_status,'completed');assert.ok(result.work.completed_at);assert.equal(result.chapters.length,2);
  await db.exec('reset role');let n=(await db.query('select * from notifications')).rows;assert.equal(n.length,2);assert.match(n[0].message,/2 new chapters/);assert.equal(n[0].chapter_id,null);
  const before=(await db.query('select id,published_at from story_chapters order by number')).rows;assert.ok(before[0].published_at);assert.equal((await db.query('select count(*)::int n from story_volumes where published_at is not null')).rows[0].n,2);
  await db.exec('set role authenticated');await publish(db);
  await db.exec('reset role');assert.deepEqual((await db.query('select id,published_at from story_chapters order by number')).rows,before);assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,2);
 }finally{await db.close();}
});
test('an invalid or empty chapter rolls back every chapter, metadata, and notification',async()=>{
 const db=await fixture();try{
  const p=payload();p.releases[1].html='<p> </p>';await assert.rejects(publish(db,p),/empty chapter/);await db.exec('reset role');assert.equal((await db.query('select title from story_works')).rows[0].title,'Original');assert.equal((await db.query('select count(*)::int n from story_chapters')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,0);
 }finally{await db.close();}
});
test('publication enforces ownership, taxonomy, and publishing restrictions',async()=>{
 const db=await fixture();try{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[OTHER]);await assert.rejects(publish(db),/does not belong/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[AUTHOR]);
  const p=payload();p.work.genres[0].subgenres=['Cyberpunk'];await assert.rejects(publish(db,p),/valid subgenres/);
  await db.exec("set test.blocked='yes'");await assert.rejects(publish(db),/Publishing paused/);
 }finally{await db.close();}
});
test('reader subscription RLS prevents impersonation; mute suppresses future releases',async()=>{
 const db=await fixture();try{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[READER]);assert.equal((await db.query('select * from story_subscriptions')).rows.length,1);await assert.rejects(db.query('insert into story_subscriptions(story_id,user_id) values($1,$2)',[WORK,AUTHOR]),/row-level security/);
  await db.query('update story_subscriptions set muted=true where user_id=$1',[READER]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[AUTHOR]);await publish(db);await db.exec('reset role');assert.equal((await db.query('select recipient_id from notifications')).rows.length,1);assert.equal((await db.query('select recipient_id from notifications')).rows[0].recipient_id,OTHER);
 }finally{await db.close();}
});
test('genre picker filters by parent, supports multiple choices and removable additional groups',()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.structuredClone=structuredClone;w.eval(read('assets/story-discovery.js'));const core=w.JournalStoryDiscovery,p=core.picker();w.document.body.append(p.el);
 const select=p.el.querySelector('select');select.value='Fantasy';select.dispatchEvent(new w.Event('change'));
 const search=p.el.querySelector('[type=search]');search.value='romantic';search.dispatchEvent(new w.Event('input'));assert.equal(p.el.querySelectorAll('[type=checkbox]').length,1);
 const c=p.el.querySelector('[type=checkbox]');c.checked=true;c.dispatchEvent(new w.Event('change'));assert.equal(core.valid(p.value),true);
 [...p.el.querySelectorAll('button')].find(x=>x.textContent==='+ Add genre').click();assert.equal(p.el.querySelectorAll('fieldset').length,2);
 [...p.el.querySelectorAll('button')].find(x=>x.textContent==='Remove genre').click();assert.equal(p.el.querySelectorAll('fieldset').length,1);
 assert.match(core.detailsHTML({series_status:'completed',completed_at:'2026-10-20T12:00:00Z',reader_metadata:{language:'<script>'}},x=>x.replaceAll('<','&lt;')),/Completed 20 October 2026/);dom.window.close();
});
function studio(){
 const dom=new JSDOM(read('writer-studio.html'),{url:'https://journal.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}disconnect(){}};w.matchMedia=()=>({matches:false,addEventListener(){}});w.Element.prototype.scrollIntoView=()=>{};w.JOURNAL_CONFIG={SUPABASE_URL:'https://mock.test',SUPABASE_ANON_KEY:'mock'};
 for(const f of ['assets/elements.js','assets/elements-editor.js','assets/design-view.js','assets/writer-drafts.js','assets/story-discovery.js'])w.eval(read(f));
 let s=[...read('writer-studio.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(x=>x.includes('const Ed ='));s=s.slice(0,s.indexOf('(async function boot()'))+'window.studio={App,UI,Model,Store,Ed,Save};})();';w.eval(s);return {dom,w,...w.studio};
}
test('draft creation has story-only genres and tags, with status deferred until publication',async()=>{
 for(const kind of ['story','journal','poetry','article']){
  const {dom,w,Model,UI}=studio();try{
   const story=Model.newStory();story.kind=kind;let saved=false;await UI.entityDialog({kind:'story',entity:story,isNew:true,ctx:{owner:{storyId:story.id},attach(){},detach(){},persist:async()=>{},after:async()=>{saved=true;}}});
   const labels=[...w.document.querySelectorAll('label')].map(x=>x.textContent);assert.equal(labels.some(x=>x==='Genres and subgenres'),kind==='story');assert.ok(labels.includes('Tags'));assert.ok(!labels.includes('Work status'));assert.ok(!labels.includes('Category'));
   if(kind==='story'){
    w.document.querySelector('select[aria-label="Primary genre"]').value='Fantasy';w.document.querySelector('select[aria-label="Primary genre"]').dispatchEvent(new w.Event('change'));
    const c=w.document.querySelector('fieldset input[type=checkbox]');c.checked=true;c.dispatchEvent(new w.Event('change'));
   }
   const title=w.document.querySelector('input[placeholder^="The title"]');title.value='Draft title';const copyright=w.document.querySelector('#crSel');copyright.value='exclusive';
   [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Create').click();for(let i=0;i<10&&!saved;i++)await new Promise(r=>setTimeout(r,5));assert.ok(saved,kind+' can save a draft: '+[...w.document.querySelectorAll('.banner.err')].map(x=>x.textContent).join('; '));assert.equal(story.seriesStatus,null);assert.equal(story.status,'draft');
  }finally{dom.window.close();}
 }
});
test('the publish dialog offers chapter and whole-work releases, and defers series choice to this step',async()=>{
 const {dom,w,App,UI,Model,Ed,Save}=studio();try{
  App.story=Model.newStory();App.story.volumes=[Model.newVolume(App.story)];const chapter=Model.newChapter(App.story);App.story.volumes[0].chapters.push(chapter);Ed.chapterId=chapter.id;Save.flush=async()=>true;App.validate=()=>[];UI.mode='write';
  await UI.publishDialog();assert.ok([...w.document.querySelectorAll('option')].some(x=>/Whole work/.test(x.textContent)));assert.ok([...w.document.querySelectorAll('label')].some(x=>x.textContent==='Work status'));assert.ok(![...w.document.querySelectorAll('option')].some(x=>x.value==='hiatus'));
 }finally{dom.window.close();}
});
test('the draft store keeps every draft after an atomic publication failure and preserves newer edits on success',async()=>{
 const context={window:{},structuredClone,crypto:require('node:crypto').webcrypto};require('node:vm').runInNewContext(read('assets/writer-drafts.js'),context);
 const story={id:WORK,status:'draft',volumes:[{chapters:[{id:C1,status:'draft'},{id:C2,status:'draft'}]}]},entries=new Map([['stories:'+WORK,{value:story,revision:'story-rev'}],['chapters:'+C1,{value:{id:C1,html:'One'},revision:'one'}],['chapters:'+C2,{value:{id:C2,html:'Two'},revision:'two'}]]);
 let fail=true;const calls=[];
 const remote={async put(){throw Error('Sequential publication must not run');},async publishTree(s,recs){calls.push(recs.map(r=>r.id));if(fail)throw Error('Server rejected chapter');entries.set('chapters:'+C2,{value:{id:C2,html:'Newer edit'},revision:'new'});}};
 const api=context.window.JournalWriterDrafts.create({remote,owner:()=>AUTHOR,story:()=>story,isSingle:()=>false,chapters:s=>s.volumes.flatMap(v=>v.chapters),preparePublication:async()=>{}});
 api.drafts.get=async(k,id)=>entries.get(k+':'+id);api.drafts.remove=async(k,id,rev)=>{if(entries.get(k+':'+id)?.revision===rev)entries.delete(k+':'+id);};
 await assert.rejects(api.publish(story,[C1,C2]),/Server rejected/);assert.equal(entries.size,3);assert.equal(story.status,'draft');assert.ok(story.volumes[0].chapters.every(c=>c.status==='draft'));
 fail=false;await api.publish(story,[C1,C2]);assert.equal(entries.size,1);assert.equal(entries.get('chapters:'+C2).value.html,'Newer edit');assert.equal(calls.length,2);
});
