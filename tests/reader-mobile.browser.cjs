/* Mobile/Safari gesture routing and uncropped landscape cover regression checks. */
const {chromium,webkit}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
(async()=>{
 const engine=process.env.READER_TEST_ENGINE==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(path.join(root,'reader-demo.html'),'utf8').replace('boot();\n\n})();','window.__reader={S,mountPage,goTo};\n\n})();');
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/reader-demo.html')return route.fulfill({contentType:'text/html',body:html});if(u.pathname==='/config.js')return route.fulfill({body:"window.JOURNAL_CONFIG={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'test'};"});if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({body:'window.supabase={createClient:()=>({})};'});const file=path.join(root,u.pathname);if(u.pathname.startsWith('/assets/')&&fs.existsSync(file))return route.fulfill({contentType:file.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file,'utf8')});return route.abort();});
 await page.goto('https://reader.test/reader-demo.html');
 await page.evaluate(()=>{const cover='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#d7c1a0"/><rect x="0" y="0" width="960" height="30" fill="#c63535"/><rect x="0" y="610" width="960" height="30" fill="#277844"/><text x="480" y="90" text-anchor="middle" font-size="44">TOP OF COVER</text><text x="480" y="585" text-anchor="middle" font-size="44">BOTTOM OF COVER</text></svg>');window.testPost={id:'test',kind:'poem',type:'Poetry',title:'A complete cover',bodyMd:Array.from({length:70},(_,i)=>'<p>Verse '+i+' — words stay on their original page.</p>').join(''),author:'Author',username:'author',tags:[],comments:[],likes:0,date:'Today',read:'1 min',avatarColorHex:'#abcdef',coverUrl:cover,isOwn:true};__reader.mountPage(document.querySelector('#pageFront'),testPost,'front');__reader.S.nextRef={id:'next',title:'Next',author:'Author',type:'Poetry'};});
 await page.waitForFunction(()=>document.querySelector('.cover-original')?.naturalWidth===960);
 async function touch(type,points){return page.evaluate(({type,points})=>{const target=document.querySelector('.page-scroll'),e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:points.map(([x,y])=>({clientX:x,clientY:y}))});return {prevented:!target.dispatchEvent(e),top:target.scrollTop};},{type,points});}
 async function gesture(type,scale){return page.evaluate(({type,scale})=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{scale,clientX:195,clientY:400});return !document.querySelector('.page-scroll').dispatchEvent(e);},{type,scale});}
 assert.equal(await page.locator('.page-scroll').evaluate(n=>getComputedStyle(n).touchAction),'pan-y','Fit Page should use native vertical scrolling without native pinch');
 await touch('touchstart',[[145,400],[245,400]]);await touch('touchmove',[[95,400],[295,400]]);await touch('touchend',[]);
 assert(await page.evaluate(()=>JournalReaderView.isZoomed()),'mobile pinch did not zoom');
 await page.locator('.page-scroll').evaluate(n=>{n.scrollLeft=100;n.scrollTop=300;});
 await touch('touchstart',[[250,600]]);await touch('touchmove',[[150,450]]);
 assert(await page.locator('.page-scroll').evaluate(n=>n.scrollLeft>=190&&n.scrollTop>=440),'mobile pan failed');
 await touch('touchcancel',[]);
 // WebViews may provide pointer dragging after their pinch gesture, without TouchEvents.
 await page.locator('.page-scroll').evaluate(n=>{n.scrollLeft=50;n.scrollTop=300;const fire=(type,x,y)=>n.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:77,clientX:x,clientY:y}));const capture=n.setPointerCapture;n.setPointerCapture=()=>{};fire('pointerdown',250,600);fire('pointermove',150,450);fire('pointerup',150,450);n.setPointerCapture=capture;});
 assert(await page.locator('.page-scroll').evaluate(n=>n.scrollLeft>=140&&n.scrollTop>=440),'touch pointer pan failed');
 await page.evaluate(()=>__reader.goTo(1));assert.equal(await page.evaluate(()=>__reader.S.state),'idle');
 await touch('touchstart',[[85,400],[305,400]]);await touch('touchmove',[[145,400],[245,400]]);await touch('touchend',[]);
 assert.equal(await page.evaluate(()=>JournalReaderView.isZoomed()),false,'mobile pinch-out did not reach Fit Page');
 assert(await gesture('gesturestart',1),'Safari gesture was not claimed');await gesture('gesturechange',2);assert(await page.evaluate(()=>JournalReaderView.isZoomed()),'Safari gesture fallback did not zoom');await gesture('gestureend',2);
 await gesture('gesturestart',1);await gesture('gesturechange',.4);await gesture('gestureend',.4);assert.equal(await page.evaluate(()=>JournalReaderView.isZoomed()),false,'Safari gesture fallback did not zoom out');
 await page.locator('.page-scroll').evaluate(n=>n.scrollTop=300);assert.equal((await touch('touchstart',[[195,600]])).prevented,false);const nativeMove=await touch('touchmove',[[195,440]]);assert.equal(nativeMove.prevented,false,'Fit Page blocked native scrolling');assert.equal(nativeMove.top,300,'Fit Page still simulates scrolling in JavaScript');await touch('touchcancel',[]);
 if(engine===chromium){
  const cdp=await context.newCDPSession(page);
  await page.locator('.page-scroll').evaluate(n=>n.scrollTop=300);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:600}]});
  for(const y of [570,530,480,420,360]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y}]});await page.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
  assert(await page.locator('.page-scroll').evaluate(n=>n.scrollTop>400),'real mobile native scroll failed');
  assert.equal(await page.evaluate(()=>__reader.S.state),'idle','vertical native scrolling turned a page');
 }
 for(const size of [{width:390,height:844},{width:1180,height:820},{width:1440,height:900}]){
  await page.setViewportSize(size);await page.locator('.page-scroll').evaluate(n=>n.scrollTop=0);await page.waitForTimeout(50);
  const cover=await page.evaluate(()=>{const c=document.querySelector('.cover'),img=c.querySelector('.cover-original'),bg=c.querySelector('.cover-backdrop'),r=c.getBoundingClientRect(),s=getComputedStyle(img);return {w:r.width,h:r.height,screen:innerWidth,height:innerHeight,fit:s.objectFit,bg:getComputedStyle(bg).display,blur:getComputedStyle(bg).filter,intrinsic:img.naturalWidth/img.naturalHeight};});
  assert(Math.abs(cover.w-cover.screen)<2,'cover is not full width');
  if(size.width>size.height){assert(Math.abs(cover.h/cover.height-.4)<.01,'landscape cover not 40% height');assert.equal(cover.fit,'contain','cover text can be cropped');assert.notEqual(cover.bg,'none');assert(cover.blur.includes('blur('));assert.equal(cover.intrinsic,1.5);}else{assert(Math.abs(cover.w/cover.h-1.5)<.01);assert.equal(cover.bg,'none');}
  await page.screenshot({path:'/tmp/reader-'+(size.width>size.height?'landscape':'portrait')+'-'+(engine===webkit?'webkit':'chromium')+'.png'});
 }
 for(const type of ['Journals','Stories','Articles']){
  await page.evaluate(type=>{const post={...testPost,type,isTeaser:true,isOwn:false,following:false,teaserExcerpt:'Description',readWholeLabel:'Read whole work',slug:'test',commentCount:0};__reader.mountPage(document.querySelector('#pageFront'),post,'front');},type);
  assert.equal(await page.locator('#pageFront [data-act="follow"]').count(),1,type+' missing follow');
 }
 assert.equal(errors.length,0,errors.join('\n'));console.log((engine===webkit?'WebKit':'Chromium')+': mobile pinch, Safari fallback, panning, fit, scrolling and uncropped landscape covers passed');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

