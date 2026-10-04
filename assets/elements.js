/* Mock catalog. Replace catalog records with approved R2 URLs in a later integration. */
(function (global) {
  'use strict';
  const catalog = [
    ['leaf','Leaf sprig',['botanical','plant','green','vine','nature']],
    ['heart','Soft heart',['love','romantic','pink','poem']],
    ['stars','Golden stars',['celestial','night','magic','gold']],
    ['flower','Book flower',['botanical','floral','pink','romantic']],
    ['divider','Vintage divider',['ornament','line','separator','vintage']],
    ['butterfly','Butterfly',['nature','wings','purple','spring']]
  ].map(([id,name,tags]) => Object.freeze({id,name,tags:Object.freeze(tags),url:'/assets/elements/mock-'+id+'.svg'}));
  const safeSrc = value => catalog.some(e => e.url === value);
  const search = query => { const words = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean); return catalog.filter(e => words.every(w => [e.name,...e.tags].join(' ').toLowerCase().includes(w))); };

  const modes = ['inline','block','wrap','behind','front'];
  const papers = Object.freeze({A4:[210,297],Letter:[216,279],A5:[148,210]});
  const limit = (value, min, max, fallback) => { const n=Number(value); return Number.isFinite(n) ? Math.round(Math.max(min,Math.min(max,n))*100)/100 : fallback; };
  const ident = value => typeof value==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : '';
  const parse = value => { try { const o=JSON.parse(value||'{}'); return o && typeof o==='object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
  function normalize(value, fallbackSrc) {
    const v=value||{}, src=safeSrc(v.src) ? v.src : fallbackSrc;
    if (!safeSrc(src)) return null;
    return {
      id:ident(v.id),src,mode:modes.includes(v.mode)?v.mode:'block',
      align:['left','center','right'].includes(v.align)?v.align:'center',
      wrapSide:['left','right','both'].includes(v.wrapSide)?v.wrapSide:'both',
      wrapShape:v.wrapShape==='tight'?'tight':'square',
      w:limit(v.w,5,100,30),ratio:limit(v.ratio,.15,6,1),aspect:v.aspect!==false,
      x:limit(v.x,0,95,35),y:limit(v.y,-300,3000,0),rotation:limit(v.rotation,-180,180,0),
      opacity:limit(v.opacity,5,100,100),flipX:!!v.flipX,flipY:!!v.flipY,
      gap:limit(v.gap,0,64,16),wrapEnd:limit(v.wrapEnd,0,50,0),border:limit(v.border,0,8,0),
      borderColor:typeof v.borderColor==='string' && /^#[a-f0-9]{6}$/i.test(v.borderColor)?v.borderColor:'#8a7963',
      shadow:['none','soft','deep'].includes(v.shadow)?v.shadow:'none',locked:!!v.locked,
      anchor:v.anchor==='page'?'page':'paragraph',anchorId:ident(v.anchorId),page:limit(v.page,1,100,1),
      group:ident(v.group),z:limit(v.z,0,200,20),
      placed:!!v.placed,offsetX:limit(v.offsetX,-100,100,0),offsetY:limit(v.offsetY,-300,3000,0)
    };
  }
  function model(node) {
    const img=node && node.querySelector('img'); if (!img) return null;
    const data=img.getAttribute('data-element')||node.getAttribute('data-element');
    if (data) return normalize(parse(data),img.getAttribute('src'));
    const align=['left','right','center'].find(x=>node.classList.contains('element-'+x))||'center';
    return normalize({src:img.getAttribute('src'),align,w:parseFloat(node.style.width)||30,
      mode:node.classList.contains('element-wrap')?'wrap':'block',x:align==='left'?0:align==='right'?70:35},img.getAttribute('src'));
  }
  function layout(value) {
    const v=value||{};
    return {mode:v.mode==='page'?'page':'flow',paper:papers[v.paper]?v.paper:'A4',orientation:v.orientation==='landscape'?'landscape':'portrait',
      margin:limit(v.margin,5,40,20),grid:!!v.grid,snap:v.snap!==false};
  }
  function classes(m) {
    const align=m.mode==='wrap' ? (m.wrapSide==='left'?'right':m.wrapSide==='right'?'left':m.x>50?'right':'left') : m.align;
    return 'journal-element element-'+align+' je-'+m.mode+(m.mode==='wrap'?' element-wrap':'')+(m.locked?' je-locked':'')+(m.anchor==='page' && ['front','behind'].includes(m.mode)?' je-fixed':'');
  }
  function paint(node,m) {
    node.className=classes(m);
    const overlay=['behind','front'].includes(m.mode);
    node.style.cssText='width:'+(overlay?100:m.w)+'%;'+
      '--je-w:'+m.w+';--je-ratio:'+m.ratio+';--je-x:'+m.x+';--je-y:'+m.y+';--je-page:'+(m.page-1)+';'+
      '--je-rotate:'+m.rotation+'deg;--je-opacity:'+(m.opacity/100)+';--je-flip-x:'+(m.flipX?-1:1)+';--je-flip-y:'+(m.flipY?-1:1)+';'+
      '--je-gap:'+(m.gap/19)+'em;--je-border:'+m.border+'px;--je-border-color:'+m.borderColor+';'+
      '--je-shadow:'+(m.shadow==='deep'?'0 8px 18px #0005':m.shadow==='soft'?'0 3px 8px #0003':'none')+';--je-z:'+m.z+';'+
      '--je-offset-x:'+m.offsetX+';--je-offset-y:'+m.offsetY+';'+
      (m.placed&&m.mode==='block'?'margin-left:'+m.x+'%!important;margin-right:0!important;':'')+
      (m.placed&&m.mode==='wrap'?(m.wrapSide==='left'?'margin-right:'+Math.max(0,100-m.w-m.x)+'%!important;':'margin-left:'+m.x+'%!important;'):'')+
      (m.placed&&['block','wrap'].includes(m.mode)?'margin-top:calc('+m.offsetY+' * var(--je-unit,1cqw))!important;':'')+
      'shape-outside:'+(m.wrapShape==='tight'?'ellipse(50% 50%)':'inset(0)')+';';
  }
  function make(doc,value,pid) {
    const m=normalize(value); if (!m) return null;
    const el=doc.createElement(m.mode==='inline'?'span':'figure'); paint(el,m); el.setAttribute('data-element',JSON.stringify(m));
    if (ident(pid)) el.setAttribute('data-pid',pid);
    el.setAttribute('contenteditable','false');
    const img=doc.createElement('img'); img.setAttribute('src',m.src);img.alt=catalog.find(e=>e.url===m.src).name;
    img.setAttribute('draggable','false');el.append(img);return el;
  }
  function makeLayout(doc,value) {
    const el=doc.createElement('figure');el.className='journal-page-settings';el.setAttribute('data-layout',JSON.stringify(layout(value)));el.setAttribute('contenteditable','false');return el;
  }
  function clean(node) {
    if (!node || !['FIGURE','SPAN'].includes(node.tagName)) return null;
    if(node.classList.contains('journal-page-settings')) return makeLayout(node.ownerDocument,parse(node.getAttribute('data-layout')));
    if(!node.classList.contains('journal-element')) return null;
    const m=model(node); return m ? make(node.ownerDocument,m,node.getAttribute('data-pid')) : null;
  }
  function settings(root) {
    const marker=Array.from(root.children).find(n=>n.classList.contains('journal-page-settings'));
    return layout(marker?parse(marker.getAttribute('data-layout')):{});
  }
  function hydrate(root) {
    if(!root)return;
    if(!root.querySelector('.journal-element,figure.journal-page-settings')){root.classList.remove('je-document','je-grid');delete root.dataset.jeLayout;root.style.minHeight='';return;}
    root.classList.add('je-document');
    root.querySelectorAll('[data-je-clear]').forEach(n=>n.removeAttribute('data-je-clear'));
    const textBlocks=Array.from(root.children).filter(n=>/^(P|H1|H2|BLOCKQUOTE|UL|OL)$/.test(n.tagName)||n.classList.contains('blk'));
    root.querySelectorAll('.journal-element').forEach(f=>{const m=model(f);if(m){paint(f,m);f.setAttribute('contenteditable','false');}if(m?.mode==='wrap' && m.wrapEnd>0){const start=textBlocks.findIndex(n=>n.getAttribute('data-pid')===m.anchorId);const end=textBlocks[start+Math.round(m.wrapEnd)];if(start>=0&&end)end.setAttribute('data-je-clear','true');}});
    const l=settings(root),p=papers[l.paper],wide=l.orientation==='landscape'?p[1]:p[0],high=l.orientation==='landscape'?p[0]:p[1];
    root.dataset.jeLayout=l.mode;root.classList.toggle('je-grid',l.grid && root.id==='editor');
    root.style.setProperty('--je-paper-width',(wide*96/25.4)+'px');
    root.style.setProperty('--je-paper-ratio',high/wide);
    root.style.setProperty('--je-margin',(l.margin/wide*100)+'%');
    const width=root.getBoundingClientRect().width || wide*96/25.4;
    const pageHeight=width*high/wide;
    root.style.setProperty('--je-page-height',pageHeight+'px');root.style.setProperty('--je-page-inset',l.mode==='page'?(width*l.margin/wide)+'px':'0px');
    if(l.mode==='page') {
      root.style.minHeight=pageHeight+'px';
      root.querySelectorAll('hr.journal-page-break').forEach(br=>{
        br.style.height='0px';
        const pos=br.getBoundingClientRect().top-root.getBoundingClientRect().top;
        const next=Math.floor((pos+1)/pageHeight)+1;
        br.style.height=Math.max(30,next*pageHeight-pos+(l.margin/wide*width))+'px';
      });
    } else {
      root.style.minHeight='';root.querySelectorAll('hr.journal-page-break').forEach(br=>br.style.height='');
    }
    const cs=global.getComputedStyle(root),contentWidth=Math.max(1,root.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0));
    root.style.setProperty('--je-unit',contentWidth/100+'px');
    let extent=l.mode==='page'?pageHeight:0;
    const rootTop=root.getBoundingClientRect().top;
    root.querySelectorAll('figure.journal-element.je-front,figure.journal-element.je-behind').forEach(f=>{const img=f.querySelector('img');if(img)extent=Math.max(extent,img.getBoundingClientRect().bottom-rootTop);});
    if(extent>0)root.style.minHeight=Math.ceil(extent)+'px';
  }
  let pending=false;
  function refresh() {
    if(pending)return;pending=true;
    (global.requestAnimationFrame || (fn=>global.setTimeout(fn,0)))(()=>{
      pending=false;const roots=new Set(global.document.querySelectorAll('.je-document'));
      global.document.querySelectorAll('.journal-element,figure.journal-page-settings').forEach(f=>roots.add(f.closest('#editor,#chBody,.article') || f.closest('.je-document') || f.parentElement));
      roots.forEach(hydrate);
    });
  }
  if(global.document) {
    global.addEventListener('resize',refresh);
    global.addEventListener('beforeprint',()=>{const root=Array.from(global.document.querySelectorAll('.je-document[data-je-layout=page]')).find(r=>r.getClientRects().length);if(!root)return;const l=settings(root),style=global.document.createElement('style');style.id='journal-demo-print';style.textContent='@page{size:'+l.paper+' '+l.orientation+';margin:0}';global.document.getElementById(style.id)?.remove();global.document.head.append(style);});
    global.addEventListener('afterprint',()=>global.document.getElementById('journal-demo-print')?.remove());
    global.document.addEventListener('DOMContentLoaded',()=>{
      new MutationObserver(changes=>{if(changes.some(c=>c.type==='childList'&&(c.target.closest?.('#editor,#chBody,.article,.je-document')||Array.from(c.addedNodes).some(n=>n.nodeType===1&&(n.matches('.journal-element,figure.journal-page-settings,.je-document')||n.querySelector('.journal-element,figure.journal-page-settings,.je-document'))))))refresh();}).observe(global.document.body,{childList:true,subtree:true});refresh();
      if(global.document.fonts)global.document.fonts.ready.then(refresh);
    });
    global.document.addEventListener('load',e=>{if(e.target.tagName==='IMG'&&e.target.closest('.journal-element'))refresh();},true);
  }
  global.JournalElements=Object.freeze({catalog:Object.freeze(catalog),safeSrc,search,clean,model,normalize,make,paint,layout,makeLayout,settings,hydrate,refresh,papers,limit});
})(window);

