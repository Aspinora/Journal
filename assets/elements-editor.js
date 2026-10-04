/* Decorations live outside contenteditable. One history transaction covers each object operation. */
(function(global){
  'use strict';
  function create(ctx){
    const {Ed,App,UI,Model,Save,Pop,h,selectEl,toast,noFocusSteal}=ctx;
    const core=global.JournalElements,doc=global.document,model=core.model,num=core.limit;
    const uid=()=>global.crypto.randomUUID(),q=(s,r=doc)=>r?.querySelector(s),wrapAngle=a=>((a+180)%360+360)%360-180;
    const api={selected:new Set(),clipboard:[],items:new Map(),nodes:new Map(),layout:core.layout({}),gesture:null,panel:null,frame:null,tab:'position',units:'%',snap:true,grid:false,arranging:true,history:[],historyIndex:-1,restoring:false,ready:false,
      allowed(){return ['poetry','shayari','thought'].includes(App.story?.kind);},
      ensureCanvas(){if(this.allowed()&&!this.layout.canvas){const st=getComputedStyle(Ed.el);this.layout=core.layout({...this.layout,canvas:{width:640,align:st.textAlign,font:st.fontFamily,size:parseFloat(st.fontSize)||19,line:(parseFloat(st.lineHeight)||33.25)/(parseFloat(st.fontSize)||19),gap:0}});}},
      writable(){const f=App.story&&Ed.chapterId&&Model.find(App.story,Ed.chapterId);return !!(Ed.el&&f&&UI.mode!=='preview'&&!App.locked(f.chapter));},
      figures(root){return root&&root!==Ed.el?Array.from(root.querySelectorAll('.journal-element')):Array.from(this.nodes.values());},
      chosen(){return this.figures().filter(f=>this.selected.has(model(f)?.id));},
      textBlocks(){return Array.from(Ed.el.children).filter(n=>/^(P|H1|H2|BLOCKQUOTE|UL|OL)$/.test(n.tagName));},
      bounds(){const b=Ed.el.getBoundingClientRect(),s=global.getComputedStyle(Ed.el),l=(parseFloat(s.paddingLeft)||0)+(parseFloat(s.borderLeftWidth)||0),r=(parseFloat(s.paddingRight)||0)+(parseFloat(s.borderRightWidth)||0),t=(parseFloat(s.paddingTop)||0)+(parseFloat(s.borderTopWidth)||0);return {left:b.left+l,top:b.top+t,width:Math.max(1,b.width-l-r),height:b.height};},
      base(m,b=this.bounds()){
        if(m.anchor==='paragraph'){const p=this.textBlocks().find(p=>p.getAttribute('data-pid')===m.anchorId);if(p)return p.getBoundingClientRect().top;}
        return b.top+(m.page-1)*(parseFloat(Ed.el.style.getPropertyValue('--je-page-height'))||b.width*1.414);
      },
      position(m,b=this.bounds()){return {left:b.left+m.x*b.width/100,top:this.base(m,b)+m.y*b.width/100};},
      atPosition(m,left,top,b=this.bounds()){
        const next={...m,x:(left-b.left)/b.width*100};
        if(m.anchor==='page'){const height=parseFloat(Ed.el.style.getPropertyValue('--je-page-height'))||b.width*1.414;next.page=Math.max(1,Math.floor(Math.max(0,top-b.top)/height)+1);}
        next.y=(top-this.base(next,b))/b.width*100;return core.normalize(next);
      },
      ensureIds(){},
      importPasted(){for(const f of Array.from(Ed.el.querySelectorAll('.journal-element'))){const m=model(f);if(m&&this.allowed()){const next=core.normalize({...m,id:uid(),group:'',floating:true,mode:'behind',anchor:'page',page:1});this.items.set(next.id,next);}f.remove();}Ed.el.querySelectorAll('figure.journal-page-settings').forEach(n=>n.remove());},
      bind(el){
        this.dispose();this.items=new Map();this.nodes=new Map();this.history=[];this.historyIndex=-1;this.ready=false;
        this.host=el.parentElement;this.host.classList.add('je-editor-host');
        this.back=h('div',{class:'je-canvas je-canvas-back','aria-hidden':'true'});this.front=h('div',{class:'je-canvas je-canvas-front','aria-hidden':'true'});this.hits=h('div',{class:'je-hit-layer'});this.host.append(this.back,this.front,this.hits);
        this.onResize=()=>{if(this.gesture)this.cancelGesture();this.render();};global.addEventListener('resize',this.onResize);global.visualViewport?.addEventListener('resize',this.onResize);
        this.onScroll=()=>{this.draw();};global.addEventListener('scroll',this.onScroll,true);
        this.resizeObserver=new ResizeObserver(()=>{if(this.ready&&!this.gesture)this.render();});this.resizeObserver.observe(el);
        el.addEventListener('pointerdown',()=>{this.clear();this.syncHits();});
        el.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();this[e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo']();}else this.key(e);},true);
        el.addEventListener('beforeinput',e=>{this.checkpoint('before');if(/^history(Undo|Redo)$/.test(e.inputType)){e.preventDefault();this[e.inputType==='historyUndo'?'undo':'redo']();}},true);
        el.addEventListener('copy',e=>{if(this.chosen().length){e.preventDefault();this.copy();e.clipboardData?.setData('application/x-journals-elements',JSON.stringify(this.clipboard));}});
        this.hits.addEventListener('pointerdown',e=>{const hit=e.target.closest('[data-je-id]');if(!hit||!this.writable())return;e.preventDefault();e.stopPropagation();const f=this.nodes.get(hit.dataset.jeId);this.select(f,e.shiftKey||e.ctrlKey||e.metaKey,false);if(this.selected.has(hit.dataset.jeId))this.begin(e,'move');});
      },
      load(){
        const legacy=Array.from(Ed.el.querySelectorAll('.journal-element')),b=this.bounds();this.layout=core.settings(Ed.el);Ed.el.classList.remove('je-design');
        legacy.forEach(f=>{let m=model(f);if(!m)return;if(!m.floating){if(['front','behind'].includes(m.mode))m={...m,x:m.x+m.offsetX,y:m.y+m.offsetY};else {const blocks=this.textBlocks(),anchor=blocks.find(p=>p.getAttribute('data-pid')===m.anchorId)||blocks.filter(p=>p.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING).at(-1)||blocks[0];m={...m,mode:'behind',anchor:'paragraph',anchorId:anchor?.getAttribute('data-pid')||'',y:0};}}if(!m.id||this.items.has(m.id))m.id=uid();m=core.normalize({...m,floating:true,placed:false,offsetX:0,offsetY:0});this.items.set(m.id,m);});
        legacy.forEach(f=>f.remove());Ed.el.querySelectorAll('figure.journal-page-settings,[data-je-transaction]').forEach(n=>{if(n.hasAttribute('data-je-transaction')&&(n.textContent||n.querySelector('img')))n.removeAttribute('data-je-transaction');else n.remove();});
        Ed.normalizeAll();const newCanvas=this.allowed()&&!this.layout.canvas;this.ensureCanvas();if(this.layout.canvas&&!this.layout.canvas.align)this.layout.canvas.align=getComputedStyle(Ed.el).textAlign;this.ready=true;this.arranging=true;this.render();this.checkpoint('load');if(newCanvas){Ed.dirtyFlag=true;Save.dirty();}
      },
      dispose(){
        this.clear();this.ready=false;this.resizeObserver?.disconnect();if(this.onResize){global.removeEventListener('resize',this.onResize);global.visualViewport?.removeEventListener('resize',this.onResize);}if(this.onScroll)global.removeEventListener('scroll',this.onScroll,true);
        this.back?.remove();this.front?.remove();this.hits?.remove();Ed.el?.classList.remove('je-design');doc.body.classList.remove('design-editing');this.host?.classList.remove('je-editor-host');if(this.host)this.host.style.minHeight='';this.nodes.clear();this.items.clear();
      },
      clear(){this.cancelGesture();this.selected.clear();this.frame?.remove();this.frame=null;this.quick?.remove();this.quick=null;this.panel?.remove();this.panel=null;},
      bookmark(){const s=Ed.sel();if(!s)return null;const r=s.getRangeAt(0),p=Ed.topBlock(Ed.blockOf(r.startContainer));if(!p)return null;const prefix=doc.createRange();prefix.selectNodeContents(p);try{prefix.setEnd(r.startContainer,r.startOffset);}catch{return null;}return {pid:p.getAttribute('data-pid'),offset:prefix.toString().length};},
      restoreBookmark(mark){if(!mark)return;const p=this.textBlocks().find(p=>p.getAttribute('data-pid')===mark.pid);if(!p)return;const walk=doc.createTreeWalker(p,NodeFilter.SHOW_TEXT);let node,offset=mark.offset;while((node=walk.nextNode())){if(offset<=node.length){const r=doc.createRange();r.setStart(node,offset);r.collapse(true);const s=global.getSelection();s.removeAllRanges();s.addRange(r);Ed.saved=r.cloneRange();return;}offset-=node.length;}Ed.placeCaret(p,false);},
      snapshot(){return {html:Ed.el.innerHTML,items:Array.from(this.items.values()).map(m=>({...m})),layout:{...this.layout},bookmark:this.bookmark(),selected:Array.from(this.selected)};},
      signature(s){return JSON.stringify([s.html,s.items,s.layout]);},
      checkpoint(kind='text'){
        if(!this.ready||this.restoring||Ed.composing)return;const state=this.snapshot(),previous=this.history[this.historyIndex];if(previous&&this.signature(previous)===this.signature(state)){previous.bookmark=state.bookmark;previous.selected=state.selected;return;}
        const now=Date.now(),typing=/^(insertText|deleteContentBackward|deleteContentForward)$/.test(kind);
        this.history.splice(this.historyIndex+1);
        if(typing&&previous&&previous.kind===kind&&now-previous.at<700&&this.historyIndex>0&&previous.bookmark?.pid===state.bookmark?.pid)this.history[this.historyIndex]={...state,kind,at:now};
        else {this.history.push({...state,kind,at:now});this.historyIndex++;}
        while(this.history.length>100){this.history.shift();this.historyIndex--;}
      },
      transaction(run,kind='element'){
        if(!this.writable())return false;this.checkpoint('before');const before=this.snapshot();
        try{run();this.render();this.checkpoint(kind);this.dirty();return true;}catch(e){this.restore(before);toast('Could not apply this element change.');return false;}
      },
      dirty(){Ed.dirtyFlag=true;Save.dirty();UI.syncToolbar();},
      restore(state){
        const sc=q('#scroller'),scroll=sc?.scrollTop,textChanged=Ed.el.innerHTML!==state.html;this.restoring=true;
        try{if(textChanged){Ed.el.innerHTML=state.html;Ed.normalizeAll();}this.items=new Map(state.items.map(m=>[m.id,{...m}]));this.layout={...state.layout};this.selected=new Set(state.selected.filter(id=>this.items.has(id)));this.render();if(textChanged)this.restoreBookmark(state.bookmark);}
        finally{this.restoring=false;if(sc)sc.scrollTop=scroll;}
      },
      undo(){if(!this.writable()||this.historyIndex<=0)return false;this.cancelGesture();this.restore(this.history[--this.historyIndex]);this.dirty();Ed.updateCounts();return true;},
      redo(){if(!this.writable()||this.historyIndex>=this.history.length-1)return false;this.cancelGesture();this.restore(this.history[++this.historyIndex]);this.dirty();Ed.updateCounts();return true;},
      exportTo(copy){copy.querySelectorAll('.journal-element,figure.journal-page-settings,[data-je-transaction]').forEach(n=>n.remove());if(this.items.size||JSON.stringify(this.layout)!==JSON.stringify(core.layout({})))copy.prepend(core.makeLayout(doc,this.layout));const decorations=doc.createDocumentFragment();for(const m of this.items.values())decorations.append(core.make(doc,m));copy.prepend(decorations);},
      render(preview){
        if(!this.ready||!Ed.el)return;this.syncLayout();core.hydrate(Ed.el,this.layout);doc.body.classList.toggle('design-editing',!!this.layout.canvas);
        const b=this.bounds(),host=this.host.getBoundingClientRect(),seen=new Set();let extent=Ed.el.offsetHeight;
        for(const original of this.items.values()){
          const m=preview?.get(original.id)||original;seen.add(m.id);let f=this.nodes.get(m.id);
          if(!f){f=core.make(doc,m);this.nodes.set(m.id,f);f.querySelector('img').addEventListener('load',()=>this.draw());}
          f.setAttribute('data-element',JSON.stringify(m));core.paint(f,m);f.style.setProperty('--je-object-width',(m.w*b.width/100)+'px');f.style.setProperty('--je-object-height',(m.w*m.ratio*b.width/100)+'px');(m.mode==='front'?this.front:this.back).append(f);
          const p=this.position(m,b);Object.assign(f.style,{position:'absolute',left:(p.left-host.left)+'px',top:(p.top-host.top)+'px',width:(m.w*b.width/100)+'px',height:(m.w*m.ratio*b.width/100)+'px',margin:'0',zIndex:String(m.z+1)});
          extent=Math.max(extent,p.top-b.top+m.w*m.ratio*b.width/100);
        }
        for(const [id,f] of this.nodes)if(!seen.has(id)){f.remove();this.nodes.delete(id);}
        // Extend the scrollable surface without altering the editable paper or paragraph geometry.
        this.back.style.height=this.front.style.height=Math.max(0,extent)+'px';this.host.style.minHeight=Math.ceil(extent)+'px';
        this.syncHits();this.draw();
      },
      syncHits(){
        if(!this.hits)return;const host=this.host.getBoundingClientRect();if(this.gesture)return;this.hits.replaceChildren();
        if(!this.allowed()||!this.arranging||!this.writable())return;
        for(const f of this.figures()){
          const m=model(f),r=f.querySelector('img').getBoundingClientRect();const hit=h('button',{type:'button',class:'je-hit','data-je-id':m.id,'aria-label':'Select '+f.querySelector('img').alt,style:{left:(r.left-host.left)+'px',top:(r.top-host.top)+'px',width:r.width+'px',height:r.height+'px',zIndex:String((m.mode==='front'?10000:0)+m.z)}});hit.addEventListener('keydown',e=>this.key(e));this.hits.append(hit);
        }
      },
      select(f,add=false,show=false){if(!this.writable()||!f)return;const m=model(f);if(!m)return;this.arranging=true;if(!add&&!this.selected.has(m.id))this.selected.clear();const members=m.group?this.figures().filter(f=>model(f).group===m.group):[f];const remove=add&&this.selected.has(m.id);for(const n of members){const id=model(n).id;if(remove)this.selected.delete(id);else this.selected.add(id);}this.syncHits();this.draw();if(show)this.showPanel();},
      edit(f){this.select(f,false,false);},
      button(label,run,props={}){return h('button',{class:'je-button',type:'button',onclick:run,...props},label);},
      imageBox(f){const m=model(f),p=this.position(m),w=m.w*this.bounds().width/100,height=w*m.ratio;return {left:p.left,top:p.top,width:w,height,right:p.left+w,bottom:p.top+height};},
      draw(){
        if(!this.allowed()||!this.writable()||!this.chosen().length){this.frame?.remove();this.frame=null;this.quick?.remove();this.quick=null;return;}
        const figs=this.chosen(),rects=figs.map(f=>figs.length===1?this.imageBox(f):f.querySelector('img').getBoundingClientRect());
        const left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top)),right=Math.max(...rects.map(r=>r.right)),bottom=Math.max(...rects.map(r=>r.bottom));
        if(!this.frame){this.frame=h('div',{class:'je-selection',tabindex:'0','aria-label':'Selected element. Drag to reposition.'});doc.body.append(this.frame);this.frame.addEventListener('pointerdown',e=>{if(e.target.closest('.je-settings-handle'))return;e.preventDefault();e.stopPropagation();this.begin(e,e.target.closest('[data-je-handle]')?.dataset.jeHandle||'move');});this.frame.addEventListener('keydown',e=>this.key(e));}
        Object.assign(this.frame.style,{left:left+'px',top:top+'px',width:Math.max(1,right-left)+'px',height:Math.max(1,bottom-top)+'px',transform:figs.length===1?'rotate('+model(figs[0]).rotation+'deg)':''});
        if(this.gesture)return;
        this.frame.replaceChildren(this.button('Settings',()=>this.showPanel(),{class:'je-settings-handle'}));const locked=figs.some(f=>model(f).locked);
        if(!locked){for(const side of ['nw','ne','sw','se'])this.frame.append(h('button',{class:'je-handle je-'+side,type:'button','data-je-handle':side,'aria-label':'Resize '+side},h('span')));this.frame.append(h('button',{class:'je-rotate-handle',type:'button','data-je-handle':'rotate','aria-label':'Drag to rotate'},'↻'));}else this.frame.append(h('span',{class:'je-lock-badge'},'Locked'));
        if(!this.quick){this.quick=h('div',{class:'je-quick',role:'toolbar','aria-label':'Element actions'});this.quick.addEventListener('pointerdown',noFocusSteal);doc.body.append(this.quick);}
        this.quick.replaceChildren(this.button('Settings',()=>this.showPanel()),this.button('Write text',()=>{this.arranging=false;this.clear();this.syncHits();}),this.button('Duplicate',()=>this.duplicate()),this.button(locked?'Unlock':'Lock',()=>this.update({locked:!locked},{includeLocked:true})),this.button('Delete',()=>this.remove()));this.quick.style.left=Math.max(8,Math.min(left,global.innerWidth-320))+'px';this.quick.style.top=Math.max(8,top-76)+'px';
      },
      update(patch,{includeLocked=false}={}){return this.transaction(()=>{for(const id of this.selected){const m=this.items.get(id);if(!m||m.locked&&!includeLocked)continue;this.items.set(id,core.normalize({...m,...(typeof patch==='function'?patch(m,this.nodes.get(id),Ed.el):patch),floating:true}));}},'properties');},
      insert(value){if(!this.allowed())return false;return this.transaction(()=>{const b=this.bounds(),sc=q('#scroller')?.getBoundingClientRect(),visibleY=Math.max(b.top,sc?.top||b.top),m=core.normalize({...value,id:uid(),floating:true,mode:'behind',anchor:'page',page:1,y:(visibleY-b.top)/b.width*100,x:value?.x??35,group:''});this.items.set(m.id,m);this.selected=new Set([m.id]);this.arranging=true;},'insert');},
      commit(html,f){const t=doc.createElement('template');t.innerHTML=html;const m=model(t.content.querySelector('.journal-element'));if(!m)return false;return f?this.update(m):this.insert(m);},
      remove(){if(this.chosen().some(f=>model(f).locked)){toast('Unlock the element before deleting it.');return false;}return this.transaction(()=>{for(const id of this.selected)this.items.delete(id);this.selected.clear();},'delete');},
      copy(){this.clipboard=this.chosen().map(f=>({...this.items.get(model(f).id)}));toast(this.clipboard.length+' element(s) copied');},
      paste(values=this.clipboard){if(!this.allowed())return false;if(!Array.isArray(values)||values.length>50)return false;const entries=values.map(v=>core.normalize(v)).filter(Boolean);if(!entries.length)return false;return this.transaction(()=>{const groups=new Map(),b=this.bounds();this.selected.clear();for(const old of entries){const p=this.position(old,b),group=old.group?(groups.get(old.group)||((groups.set(old.group,uid())),groups.get(old.group))):'',m=this.atPosition({...old,id:uid(),group,locked:false,floating:true},p.left+12,p.top+12,b);this.items.set(m.id,m);this.selected.add(m.id);}this.arranging=true;},'duplicate');},
      duplicate(){return this.paste(this.chosen().map(f=>this.items.get(model(f).id)));},
      handlePaste(e){const data=e.clipboardData?.getData('application/x-journals-elements');if(!data)return false;e.preventDefault();try{this.paste(JSON.parse(data));}catch{}return true;},
      group(){if(this.chosen().length<2){toast('Select two elements first.');return;}this.update({group:uid()});this.showPanel();},
      ungroup(){this.update({group:''});this.showPanel();},
      order(direction){return this.transaction(()=>{const all=Array.from(this.items.values()).sort((a,b)=>a.z-b.z),picked=all.filter(m=>this.selected.has(m.id)&&!m.locked),rest=all.filter(m=>!picked.includes(m));let ordered=all;if(direction==='top'||direction==='bottom'){ordered=direction==='top'?[...rest,...picked]:[...picked,...rest];for(const m of picked)this.items.set(m.id,{...m,mode:direction==='top'?'front':'behind'});}else {for(const m of direction==='up'?[...picked].reverse():picked){const i=ordered.indexOf(m),j=Math.max(0,Math.min(ordered.length-1,i+(direction==='up'?1:-1)));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}}ordered.forEach((m,i)=>{const current=this.items.get(m.id);this.items.set(m.id,{...current,z:i+1});});},'order');},
      changeAnchor(anchor){const b=this.bounds();this.update(m=>{const p=this.position(m,b),block=this.textBlocks().find(n=>n.getBoundingClientRect().bottom>=p.top)||this.textBlocks().at(-1),next={...m,anchor,anchorId:block?.getAttribute('data-pid')||'',page:1};return this.atPosition(next,p.left,p.top,b);});this.showPanel();},
      begin(e,kind){
        if(this.gesture||!this.writable()||!this.chosen().length||this.chosen().some(f=>model(f).locked))return;
        this.checkpoint('before');const originals=this.chosen().map(f=>({m:{...this.items.get(model(f).id)},rect:this.imageBox(f)})),rects=originals.map(o=>o.rect),left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top)),right=Math.max(...rects.map(r=>r.right)),bottom=Math.max(...rects.map(r=>r.bottom));
        const b=this.bounds(),g=this.gesture={kind,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,bounds:b,originals,box:{left,top,right,bottom,width:right-left,height:bottom-top},moved:false,chapter:Ed.chapterId};
        g.capture=e.target||this.frame;try{g.capture?.setPointerCapture(e.pointerId);}catch{}
        g.onMove=ev=>this.movePointer(ev);g.onUp=ev=>this.endPointer(ev);g.onCancel=()=>this.cancelGesture();doc.addEventListener('pointermove',g.onMove,{passive:false});doc.addEventListener('pointerup',g.onUp);doc.addEventListener('pointercancel',g.onCancel);global.addEventListener('blur',g.onCancel);
      },
      snapValue(x,width,b){if(!this.snap)return x;const target=[0,(100-width)/2,100-width].find(t=>Math.abs(t-x)*b.width/100<8);return target??(this.grid?Math.round(x/4)*4:x);},
      movePointer(e){
        const g=this.gesture;if(!g||e.pointerId!==g.pointer)return;e.preventDefault();const b=this.bounds();let dx=e.clientX-g.startX,dy=e.clientY-g.startY;if(g.kind==='move'){dx=Math.max(Math.max(...g.originals.map(o=>(-100-o.m.x)*b.width/100)),Math.min(Math.min(...g.originals.map(o=>(100-o.m.x)*b.width/100)),dx));}if(!g.moved&&Math.hypot(dx,dy)<4)return;g.moved=true;
        const shiftX=b.left-g.bounds.left,shiftY=b.top-g.bounds.top,box={...g.box,left:g.box.left+shiftX,top:g.box.top+shiftY},proposed=new Map();let sx=1,sy=1,angle=0;
        if(['nw','ne','sw','se'].includes(g.kind)){
          const rad=g.originals.length===1?g.originals[0].m.rotation*Math.PI/180:0,lx=dx*Math.cos(rad)+dy*Math.sin(rad),ly=-dx*Math.sin(rad)+dy*Math.cos(rad);
          sx=Math.max(.01,(box.width+lx*(g.kind.includes('w')?-1:1))/Math.max(1,box.width));sy=Math.max(.01,(box.height+ly*(g.kind.includes('n')?-1:1))/Math.max(1,box.height));
          if(g.originals.length>1||g.originals[0].m.aspect){sx=sy=(box.width*box.width*sx+box.height*box.height*sy)/(box.width*box.width+box.height*box.height);}
          sx=Math.max(Math.max(...g.originals.map(o=>1/o.m.w)),Math.min(Math.min(...g.originals.map(o=>100/o.m.w)),sx));if(g.originals.length>1||g.originals[0].m.aspect)sy=sx;
          else sy=Math.max(sx*.01/g.originals[0].m.ratio,Math.min(sx*100/g.originals[0].m.ratio,sy));
        }
        if(g.kind==='rotate'){const cx=box.left+box.width/2,cy=box.top+box.height/2;angle=(Math.atan2(e.clientY-cy,e.clientX-cx)-Math.atan2(g.startY-cy,g.startX-cx))*180/Math.PI;if(this.snap||e.shiftKey)angle=Math.round(angle/15)*15;}
        for(const o of g.originals){let m={...o.m},left=o.rect.left+shiftX,top=o.rect.top+shiftY;
          if(g.kind==='move'){left+=dx;top+=dy;if(this.snap&&g.originals.length===1)left=b.left+this.snapValue((left-b.left)/b.width*100,m.w,b)*b.width/100;if(this.snap&&this.grid)top=b.top+Math.round((top-b.top)/(b.width*.04))*b.width*.04;}
          else if(g.kind==='rotate'){m.rotation=wrapAngle(m.rotation+angle);if(g.originals.length>1){const rad=angle*Math.PI/180,cx=box.left+box.width/2,cy=box.top+box.height/2,rx=left+o.rect.width/2-cx,ry=top+o.rect.height/2-cy;left=cx+rx*Math.cos(rad)-ry*Math.sin(rad)-o.rect.width/2;top=cy+rx*Math.sin(rad)+ry*Math.cos(rad)-o.rect.height/2;}}
          else {m.w=o.m.w*sx;m.ratio=o.m.ratio*sy/sx;if(g.originals.length===1){const rad=o.m.rotation*Math.PI/180,ax=(g.kind.includes('w')?-1:1)*o.rect.width*(sx-1)/2,ay=(g.kind.includes('n')?-1:1)*o.rect.height*(sy-1)/2;left+=ax*Math.cos(rad)-ay*Math.sin(rad)-o.rect.width*(sx-1)/2;top+=ax*Math.sin(rad)+ay*Math.cos(rad)-o.rect.height*(sy-1)/2;}else {left=box.left+(g.kind.includes('w')?box.width*(1-sx):0)+(left-box.left)*sx;top=box.top+(g.kind.includes('n')?box.height*(1-sy):0)+(top-box.top)*sy;}}
          proposed.set(m.id,this.atPosition(m,left,top,b));
        }
        g.proposed=proposed;this.render(proposed);
      },
      endPointer(e){const g=this.gesture;if(!g||e.pointerId!==g.pointer)return;if(!g.moved||g.chapter!==Ed.chapterId){this.cancelGesture();return;}const values=g.proposed;this.releaseGesture();this.transaction(()=>{for(const [id,m] of values)this.items.set(id,m);},'gesture');},
      releaseGesture(){const g=this.gesture;if(!g)return;doc.removeEventListener('pointermove',g.onMove);doc.removeEventListener('pointerup',g.onUp);doc.removeEventListener('pointercancel',g.onCancel);global.removeEventListener('blur',g.onCancel);try{if(g.capture?.hasPointerCapture(g.pointer))g.capture.releasePointerCapture(g.pointer);}catch{}this.gesture=null;},
      cancelGesture(){if(!this.gesture)return;this.releaseGesture();this.render();},
      key(e){if(e.target.closest('input,textarea,select')||!this.chosen().length||!this.writable())return;const mod=e.ctrlKey||e.metaKey;if(mod&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();this[e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo']();return;}if(e.key==='Escape'){e.preventDefault();this.clear();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const step=(e.shiftKey?10:1)/this.bounds().width*100;this.update(m=>({x:m.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:m.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}));}else if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopPropagation();this.remove();}else if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();this.duplicate();}else if(!mod&&e.key.length===1)this.clear();},
      open(anchor){if(!this.allowed()||!this.writable())return;this.arranging=true;this.syncHits();const grid=h('div',{class:'elements-grid'}),search=h('input',{class:'inp',type:'search',placeholder:'Search elements or tags…','aria-label':'Search elements'}),chapter=Ed.chapterId;
        const render=()=>{const items=core.search(search.value);grid.replaceChildren(...items.map(item=>h('button',{class:'element-card',type:'button',onclick:()=>{if(Ed.chapterId!==chapter){Pop.close();return;}Pop.close();this.insert({src:item.url,w:30,ratio:1,aspect:true,x:35,y:0,opacity:100});}},h('img',{src:item.url,alt:'',loading:'lazy',draggable:false}),item.name)));if(!items.length)grid.append(h('p',{role:'status'},'No matching elements.'));};search.addEventListener('input',render);render();Pop.open(anchor,h('div',{class:'elements-picker'},h('div',{class:'menu-h'},'Elements · demo'),h('p',{class:'small muted'},'Decorations sit behind text. Drag an element directly; use Settings for options.'),h('div',{class:'je-row'},this.button('Layers',()=>{Pop.close();this.tab='layers';this.showPanel();}),this.button('Page setup',()=>{Pop.close();this.tab='page';this.showPanel();}),this.button('Write text',()=>{Pop.close();this.arranging=false;this.clear();this.syncHits();}),this.button('Paste',()=>{Pop.close();this.paste();},{disabled:!this.clipboard.length})),search,grid),{role:'dialog',align:'end'});
      },
      field(label,input) {return h('label',{class:'je-field'},h('span',null,label),input);},
      number(label,value,min,max,step,run) {const el=h('input',{type:'number',value,min,max,step,'aria-label':label});el.addEventListener('change',()=>{if(el.value!=='')run(num(el.value,min,max,value));});return this.field(label,el);},
      choose(label,options,value,run) {const el=selectEl(options,value);el.setAttribute('aria-label',label);el.addEventListener('change',()=>run(el.value));return this.field(label,el);},
      check(label,checked,run) {const el=h('input',{type:'checkbox',checked,'aria-label':label});el.addEventListener('change',()=>run(el.checked));return h('label',{class:'je-check'},el,label);},
      showPanel() {
        if(!this.writable())return;
        if(!this.panel){this.panel=h('section',{class:'je-panel',role:'dialog','aria-label':'Element customization'});this.panel.addEventListener('pointerdown',noFocusSteal);this.panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();this.clear();}});doc.body.append(this.panel);}
        const count=this.chosen().length,m=count?model(this.chosen()[0]):null;
        const tabs=h('div',{class:'je-tabs',role:'tablist'});for(const [id,label] of [['position','Position'],['style','Style'],['layers','Layers'],['page','Page']])tabs.append(this.button(label,()=>{this.tab=id;this.showPanel();},{role:'tab','aria-selected':String(this.tab===id),'aria-controls':'je-controls'}));
        const body=h('div',{class:'je-panel-body',id:'je-controls',role:'tabpanel'});
        this.panel.replaceChildren(h('div',{class:'je-panel-head'},h('strong',null,count?(count===1?'Element settings':count+' elements selected'):'Page elements'),this.button('Close',()=>{this.panel?.remove();this.panel=null;},{'aria-label':'Close element controls'})),tabs,body);
        if(this.tab==='layers'){this.layers(body);return;}if(this.tab==='page'){this.pageControls(body);return;}
        if(!m){body.append(h('p',null,'Select an element in the Layers tab.'));return;}
        const apply=patch=>{this.update(patch);this.showPanel();};
        if(m.locked)body.append(h('p',{class:'je-hint'},'Position is locked. Unlock to resize or move.'),this.button('Unlock',()=>{this.update({locked:false},{includeLocked:true});this.showPanel();}));
        if(this.tab==='position'){
          const widthPx=this.bounds().width,layout=this.layout,paper=core.papers[layout.paper],paperMm=layout.orientation==='landscape'?paper[1]:paper[0],mmWidth=layout.mode==='page'?paperMm-2*layout.margin:widthPx*25.4/96;
          const toUnit=v=>Math.round((this.units==='px'?v/100*widthPx:this.units==='mm'?v/100*mmWidth:v)*100)/100;
          const fromUnit=v=>this.units==='px'?v/widthPx*100:this.units==='mm'?v/mmWidth*100:v;
          body.append(this.choose('Layer',[['behind','Behind text'],['front','In front of text']],m.mode,v=>apply({mode:v})),
            this.choose('Alignment',[['left','Left'],['center','Center'],['right','Right']],m.align,v=>apply({align:v,x:v==='left'?0:v==='right'?100-m.w:(100-m.w)/2})),
            this.choose('Size units',[['%','Percent'],['px','Pixels'],['mm','Millimeters']],this.units,v=>{this.units=v;this.showPanel();}),
            h('div',{class:'je-columns'},this.number('Width ('+this.units+')',toUnit(m.w),toUnit(1),toUnit(100),this.units==='%'?1:.1,v=>apply({w:fromUnit(v)})),this.number('Height ('+this.units+')',toUnit(m.w*m.ratio),toUnit(1),toUnit(10000),this.units==='%'?1:.1,v=>apply(m.aspect?{w:fromUnit(v)/m.ratio}:{ratio:fromUnit(v)/m.w}))),
            this.check('Lock aspect ratio',m.aspect,v=>apply({aspect:v})),
            h('div',{class:'je-columns'},this.number('Horizontal (%)',m.x,-100,100,1,v=>apply({x:v})),this.number('Vertical (%)',m.y,-10000,100000,1,v=>apply({y:v}))),
            this.choose('Anchor',[['paragraph','Move with paragraph'],['page','Fixed on page']],m.anchor,v=>this.changeAnchor(v)),
            this.number('Page number',m.page,1,1000,1,v=>apply({page:v,anchor:'page',mode:m.mode})),
            this.check('Snap to guides',this.snap,v=>{this.setLayout({snap:v});}),this.check('Show grid / snap to grid',this.grid,v=>{this.setLayout({grid:v});}),
            h('div',{class:'je-row'},this.button('Move up paragraph',()=>this.moveAnchor(-1)),this.button('Move down paragraph',()=>this.moveAnchor(1))),
            h('p',{class:'je-hint'},'Drag the element itself. Arrow keys nudge; Shift + arrows move 10 px. Decorations never move text.'));
        }else{
          const color=h('input',{type:'color',value:m.borderColor,'aria-label':'Border color'});color.addEventListener('change',()=>apply({borderColor:color.value}));
          body.append(this.number('Rotation (degrees)',m.rotation,-180,180,1,v=>apply({rotation:v})),this.number('Opacity (%)',m.opacity,5,100,1,v=>apply({opacity:v})),
            this.check('Flip horizontally',m.flipX,v=>apply({flipX:v})),this.check('Flip vertically',m.flipY,v=>apply({flipY:v})),
            this.number('Border width (px)',m.border,0,8,1,v=>apply({border:v})),this.field('Border color',color),this.choose('Shadow',[['none','None'],['soft','Soft'],['deep','Deep']],m.shadow,v=>apply({shadow:v})),
            this.button('Reset appearance',()=>apply({rotation:0,opacity:100,flipX:false,flipY:false,border:0,shadow:'none',ratio:1,aspect:true})),
            this.button('Reset size and position',()=>apply({mode:'behind',w:30,ratio:1,x:35,y:0,offsetX:0,offsetY:0,placed:false,align:'center',anchor:'paragraph',page:1})));
        }
        body.append(h('div',{class:'je-row'},this.button('Undo',()=>{this.undo();this.showPanel();}),this.button('Redo',()=>{this.redo();this.showPanel();})),h('div',{class:'je-row'},this.button('Copy',()=>this.copy()),this.button('Duplicate',()=>this.duplicate()),this.button(m.locked?'Unlock':'Lock',()=>{this.update({locked:!m.locked},{includeLocked:true});this.showPanel();}),this.button('Delete',()=>this.remove())));
      },
      moveAnchor(direction) {
        const blocks=this.textBlocks();this.update(m=>{const at=blocks.findIndex(p=>p.getAttribute('data-pid')===m.anchorId),p=blocks[Math.max(0,Math.min(blocks.length-1,(at<0?0:at)+direction))];return p?{anchor:'paragraph',anchorId:p.getAttribute('data-pid')}:{};});this.showPanel();
      },
      layers(body) {
        this.ensureIds();const all=this.figures().slice().sort((a,b)=>model(b).z-model(a).z);
        body.append(h('p',{class:'je-hint'},'Select hidden elements here. Check several to group or move together.'));
        if(!all.length)body.append(h('p',null,'No elements inserted yet.'));
        for(const f of all){const m=model(f),item=core.catalog.find(e=>e.url===m.src);const checkbox=h('input',{type:'checkbox',checked:this.selected.has(m.id),'aria-label':'Select '+item.name});checkbox.addEventListener('change',()=>{if(checkbox.checked)this.selected.add(m.id);else this.selected.delete(m.id);this.draw();this.showPanel();});body.append(h('div',{class:'je-layer-row'},checkbox,h('img',{src:m.src,alt:''}),this.button(item.name+(m.locked?' · locked':'')+(m.group?' · grouped':''),()=>{this.select(f,false,false);this.tab='position';this.showPanel();}),h('span',{class:'je-hint'},m.mode)));}
        body.append(h('div',{class:'je-row'},this.button('Bring forward',()=>this.order('up')),this.button('Send backward',()=>this.order('down')),this.button('Bring to front',()=>this.order('top')),this.button('Send to back',()=>this.order('bottom'))),h('div',{class:'je-row'},this.button('Group',()=>this.group()),this.button('Ungroup',()=>this.ungroup()),this.button('Paste',()=>this.paste(),{disabled:!this.clipboard.length})));
      },
      syncLayout() {this.snap=this.layout.snap;this.grid=this.layout.grid;},
      setLayout(patch) {return this.transaction(()=>{this.layout=core.layout({...this.layout,...patch});},'layout');},
      pageControls(body) {
        const l=this.layout,apply=patch=>{this.setLayout(patch);this.showPanel();};
        body.append(h('p',{class:'je-hint'},'Demo page layout. Paper proportions adapt to the screen; explicit page breaks are preserved. '),
          this.choose('Document layout',[['flow','Responsive writing'],['page','Page layout']],l.mode,v=>apply({mode:v})),this.choose('Paper size',[['A4','A4'],['Letter','Letter'],['A5','A5']],l.paper,v=>apply({paper:v})),
          this.choose('Orientation',[['portrait','Portrait'],['landscape','Landscape']],l.orientation,v=>apply({orientation:v})),this.number('Margins (mm)',l.margin,5,40,1,v=>apply({margin:v})),
          this.check('Grid',l.grid,v=>{this.grid=v;apply({grid:v});}),this.check('Snap',l.snap,v=>{this.snap=v;apply({snap:v});}),
          h('div',{class:'je-row'},this.button('Insert page break',()=>this.pageBreak()),this.button('Remove page breaks',()=>{this.transaction(()=>{Ed.el.querySelectorAll('hr.journal-page-break').forEach(n=>n.remove());this.render();},'page break');})),
          h('div',{class:'je-row'},this.button('Undo',()=>{this.undo();this.showPanel();}),this.button('Redo',()=>{this.redo();this.showPanel();})));
      },
      pageBreak() {const p=Ed.topBlock(Ed.currentBlock())||this.textBlocks().at(-1);this.transaction(()=>{const br=h('hr',{class:'journal-page-break'});if(p)p.before(br);else Ed.el.append(br);Ed.normalizeAll();this.render();},'page break');}
    };
    return api;
  }
  global.JournalElementEditor=Object.freeze({create});
})(window);
