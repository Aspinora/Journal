/* Direct manipulation for the mock element catalog. No uploads or remote storage. */
(function (global) {
  'use strict';
  function create(ctx) {
    const {Ed,App,UI,Model,Save,Pop,h,selectEl,toast,noFocusSteal}=ctx;
    const core=global.JournalElements, doc=global.document;
    const uid=()=>global.crypto.randomUUID(), q=(s,r=doc)=>r.querySelector(s);
    const model=core.model, num=core.limit;
    const api={selected:new Set(),clipboard:[],gesture:null,panel:null,frame:null,tab:'position',units:'%',snap:true,grid:false,suppressClick:false,
      writable() {const f=App.story&&Ed.chapterId&&Model.find(App.story,Ed.chapterId);return !!(Ed.el&&f&&UI.mode!=='preview'&&!App.locked(f.chapter));},
      figures(root=Ed.el) {return root?Array.from(root.querySelectorAll('.journal-element')):[];},
      chosen(root=Ed.el) {return this.figures(root).filter(f=>this.selected.has(model(f)?.id));},
      bounds() {const b=Ed.el.getBoundingClientRect(),s=global.getComputedStyle(Ed.el),l=(parseFloat(s.paddingLeft)||0)+(parseFloat(s.borderLeftWidth)||0),r=(parseFloat(s.paddingRight)||0)+(parseFloat(s.borderRightWidth)||0);return {left:b.left+l,top:b.top+(parseFloat(s.paddingTop)||0),width:Math.max(1,b.width-l-r),height:b.height};},
      ensureIds() {const seen=new Set();this.figures().forEach(f=>{const m=model(f);if(!m)return;if(!m.id||seen.has(m.id)){m.id=uid();f.setAttribute('data-element',JSON.stringify(m));if(f.querySelector('img').hasAttribute('data-element'))f.querySelector('img').setAttribute('data-element',JSON.stringify(m));}seen.add(m.id);});},
      bind(el) {
        this.clear();
        el.addEventListener('pointerdown',e=>{const f=e.target.closest('.journal-element');if(f&&this.writable()){e.preventDefault();Ed.saveSel();this.select(f,e.shiftKey||e.ctrlKey||e.metaKey,false);if(this.selected.has(model(f).id)&&!model(f).locked)this.begin(e,'move');}},true);
        el.addEventListener('keydown',e=>this.key(e),true);
        el.addEventListener('copy',e=>{if(this.chosen().length){e.preventDefault();this.copy();e.clipboardData?.setData('application/x-journals-elements',JSON.stringify(this.clipboard));e.clipboardData?.setData('text/plain','');}});
        el.addEventListener('beforeinput',e=>{if(/^history(Undo|Redo)$/.test(e.inputType)&&this.figures().length){e.preventDefault();Ed.cmd(e.inputType==='historyUndo'?'undo':'redo');}});
        el.addEventListener('input',()=>{if(!this.gesture){core.refresh();global.requestAnimationFrame(()=>this.draw());}});
        el.addEventListener('pointerdown',e=>{if(!e.target.closest('.journal-element'))this.clear();});
      },
      mutate(run) {
        if(!this.writable())return false;
        this.ensureIds();Ed.saveSel();
        const pid=Ed.topBlock(Ed.currentBlock())?.getAttribute('data-pid');
        const copy=Ed.el.cloneNode(true);run(copy);
        const oldFigures=this.figures(),newFigures=this.figures(copy);
        // Property changes use one object's image as the native undo payload.
        // The authoritative model rides with the image so undo restores appearance as well.
        const sameStructure=oldFigures.length===newFigures.length && oldFigures.every((f,i)=>{
          const n=newFigures[i];return f.tagName===n.tagName&&model(f)?.id===model(n)?.id&&
            f.parentElement.getAttribute('data-pid')===n.parentElement.getAttribute('data-pid');
        });
        const probe=copy.cloneNode(true);
        this.figures(probe).forEach((f,i)=>f.replaceWith(oldFigures[i]?.cloneNode(true)||f));
        if(sameStructure && probe.innerHTML===Ed.el.innerHTML){
          const changes=newFigures.map((f,i)=>({figure:oldFigures[i],value:model(f)})).filter(({figure,value})=>JSON.stringify(model(figure))!==JSON.stringify(value));
          return this.applyProperties(changes);
        }
        // Structural edits remain a native transaction; typing/IME still use browser history.
        copy.querySelectorAll('.journal-element,figure.journal-page-settings').forEach(f=>{const c=core.clean(f);if(c)f.replaceWith(c);else f.remove();});
        const before=Array.from(Ed.el.childNodes),after=Array.from(copy.childNodes);let start=0,end=before.length,finish=after.length;
        while(start<end&&start<finish&&before[start].isEqualNode(after[start]))start++;
        while(end>start&&finish>start&&before[end-1].isEqualNode(after[finish-1])){end--;finish--;}
        const insertion=start===end;
        if(!insertion&&!Ed.el.querySelector('[data-je-transaction]')){const sentinel=doc.createElement('p');sentinel.setAttribute('data-je-transaction','true');sentinel.style.cssText='height:0;margin:0;padding:0;line-height:0;font-size:0';sentinel.append(doc.createElement('br'));Ed.el.prepend(sentinel);}
        Ed.restoreFocus();const range=doc.createRange();
        if(insertion){range.setStart(Ed.el,start);range.collapse(true);}else range.selectNodeContents(Ed.el);
        const payload=doc.createElement('div');if(insertion)after.slice(start,finish).forEach(n=>payload.append(n));
        const s=global.getSelection();s.removeAllRanges();s.addRange(range);
        const protectedFigures=insertion?[]:this.figures();protectedFigures.forEach(f=>f.setAttribute('contenteditable','true'));
        let ok;try {ok=doc.execCommand('insertHTML',false,insertion?payload.innerHTML:copy.innerHTML);}finally {protectedFigures.forEach(f=>f.setAttribute('contenteditable','false'));}
        
        this.figures().filter(f=>!model(f)).forEach(f=>f.remove());
        if(!ok){toast('Could not apply this element change.');return false;}
        Ed.normalizeAll();const p=(pid&&Array.from(Ed.el.children).find(n=>n.getAttribute('data-pid')===pid))||Ed.el.querySelector('p:not([data-je-transaction]),h1,h2,blockquote');
        if(p)Ed.placeCaret(p,false);Ed.dirtyFlag=true;Save.dirty();Ed.afterInput('format');core.hydrate(Ed.el);this.draw();return true;
      },
      applyProperties(changes) {
        if(!this.writable())return false;
        Ed.saveSel();const saved=Ed.saved?.cloneRange(),sc=q('#scroller'),scroll=sc?.scrollTop;
        let ok=true;
        for(const {figure,value} of changes){
          const m=core.normalize(value);if(!m)continue;
          const image=core.make(doc,m).querySelector('img');image.setAttribute('data-element',JSON.stringify(m));
          Ed.restoreFocus();figure.setAttribute('contenteditable','true');if(figure.tagName==='SPAN')figure.style.setProperty('display','block','important');
          const range=doc.createRange();range.selectNodeContents(figure);const selection=global.getSelection();selection.removeAllRanges();selection.addRange(range);
          try {if(!doc.execCommand('insertHTML',false,image.outerHTML)){ok=false;break;}}
          finally {figure.setAttribute('contenteditable','false');}
          const current=model(figure);if(current)core.paint(figure,current);
        }
        if(saved&&Ed.el.contains(saved.startContainer)&&Ed.el.contains(saved.endContainer)){
          const selection=global.getSelection();selection.removeAllRanges();selection.addRange(saved);Ed.saved=saved;
        }else Ed.saved=null;
        if(sc)sc.scrollTop=scroll;
        if(changes.length){Ed.dirtyFlag=true;Save.dirty();Ed.afterInput('format');core.hydrate(Ed.el);this.draw();}
        if(!ok)toast('Could not apply this element change.');return ok;

      },
      commit(html,figure) { // Compatibility with the first demo API.
        if(figure){const id=model(figure)?.id;return this.mutate(root=>{const target=this.figures(root).find(f=>model(f).id===id);if(!target)return;const t=doc.createElement('template');t.innerHTML=html;target.replaceWith(t.content);});}
        const t=doc.createElement('template');t.innerHTML=html;const f=t.content.querySelector('figure.journal-element');if(!f)return false;return this.insert(model(f));
      },
      insert(value) {
        if(!this.writable())return false;
        Ed.saveSel();const p=Ed.topBlock(Ed.currentBlock())||Ed.el.lastElementChild, pid=p?.getAttribute('data-pid');
        const m=core.normalize({...value,id:uid(),anchorId:pid||'',group:''});if(!m)return false;
        this.selected=new Set([m.id]);
        const ok=this.mutate(root=>{const anchor=Array.from(root.children).find(n=>n.getAttribute('data-pid')===pid)||root.lastElementChild;const f=core.make(doc,m);if(m.mode==='inline' && anchor?.matches('p,h1,h2,blockquote'))anchor.prepend(f);else if(anchor)anchor.before(f);else root.append(f);});
        if(ok)this.showPanel();return ok;
      },
      update(patch,{includeLocked=false}={}) {
        const ids=new Set(this.selected),changes=this.chosen().filter(f=>includeLocked||!model(f).locked).map(f=>{
          const old=model(f),change=typeof patch==='function'?patch(old,f,Ed.el):patch;
          return {figure:f,value:core.normalize({...old,...change})};
        }).filter(c=>c.value);
        if(changes.every(c=>(c.value.mode==='inline')===(c.figure.tagName==='SPAN')))return this.applyProperties(changes);
        return this.mutate(root=>this.figures(root).forEach(f=>{const old=model(f);if(!ids.has(old.id)||(!includeLocked&&old.locked))return;const change=typeof patch==='function'?patch(old,f,root):patch;const m=core.normalize({...old,...change});if(m){const next=core.make(doc,m,f.getAttribute('data-pid'));if(m.mode==='inline' && f.tagName==='FIGURE'){const anchor=Array.from(root.children).find(n=>n.getAttribute('data-pid')===m.anchorId && /^(P|H1|H2|BLOCKQUOTE)$/.test(n.tagName));if(anchor){f.remove();anchor.prepend(next);}else f.replaceWith(next);}else if(m.mode!=='inline'&&f.tagName==='SPAN'){const p=f.closest('p,h1,h2,blockquote');if(p){f.remove();p.before(next);}else f.replaceWith(next);}else f.replaceWith(next);}}));
      },
      select(figure,add=false,show=true) {
        if(!this.writable())return;this.ensureIds();const m=model(figure);if(!m)return;
        if(!add && !this.selected.has(m.id))this.selected.clear();
        if(add&&this.selected.has(m.id))this.selected.delete(m.id);else this.selected.add(m.id);
        if(m.group&&!add)this.figures().filter(f=>model(f).group===m.group).forEach(f=>this.selected.add(model(f).id));
        this.draw();if(show)this.showPanel();
      },
      edit(figure) {if(this.suppressClick){this.suppressClick=false;return;}this.select(figure);},
      clear() {
        this.cancelGesture();this.selected.clear();this.frame?.remove();this.frame=null;this.quick?.remove();this.quick=null;this.panel?.remove();this.panel=null;
        this.observer?.disconnect();this.observer=null;
        if(this.offScroll){global.removeEventListener('scroll',this.offScroll,true);global.removeEventListener('resize',this.offScroll);this.offScroll=null;}
      },
      draw() {
        if(!this.writable()||!this.chosen().length){this.frame?.remove();this.frame=null;this.quick?.remove();this.quick=null;if(this.offScroll){global.removeEventListener('scroll',this.offScroll,true);global.removeEventListener('resize',this.offScroll);this.offScroll=null;}return;}
        const selected=this.chosen(),rects=selected.map(f=>selected.length===1?this.imageBox(f):f.querySelector('img').getBoundingClientRect());
        const left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top)),right=Math.max(...rects.map(r=>r.right)),bottom=Math.max(...rects.map(r=>r.bottom));
        if(!this.frame){
          this.frame=h('div',{class:'je-selection', 'aria-label':'Element selection'});doc.body.append(this.frame);
          this.frame.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-je-handle]');if(handle){e.preventDefault();this.begin(e,handle.dataset.jeHandle);}});
          this.frame.addEventListener('keydown',e=>this.key(e));
          this.offScroll=()=>{if(!this.gesture)this.draw();};global.addEventListener('scroll',this.offScroll,true);global.addEventListener('resize',this.offScroll);
        }
        Object.assign(this.frame.style,{left:left+'px',top:top+'px',width:Math.max(1,right-left)+'px',height:Math.max(1,bottom-top)+'px'});
        this.frame.style.transform=selected.length===1?'rotate('+model(selected[0]).rotation+'deg)':'';
        this.frame.replaceChildren(this.button('Settings',()=>this.showPanel(),{class:'je-settings-handle','aria-label':'Element settings'}));const locked=selected.some(f=>model(f).locked);
        if(!locked){for(const side of ['nw','ne','sw','se'])this.frame.append(h('button',{class:'je-handle je-'+side,type:'button','data-je-handle':side,'aria-label':'Resize '+side},h('span')));
          this.frame.append(h('button',{class:'je-rotate-handle',type:'button','data-je-handle':'rotate','aria-label':'Drag to rotate'},'↻'));
          this.frame.append(h('button',{class:'je-move-handle',type:'button','data-je-handle':'move','aria-label':'Drag to move'},'Move'));
        } else this.frame.append(h('span',{class:'je-lock-badge'},'Locked'));
        if(!this.quick){this.quick=h('div',{class:'je-quick',role:'toolbar','aria-label':'Element actions'});this.quick.addEventListener('pointerdown',noFocusSteal);doc.body.append(this.quick);}
        this.quick.replaceChildren(this.button('Settings',()=>this.showPanel()),this.button('Duplicate',()=>this.duplicate()),this.button(locked?'Unlock':'Lock',()=>this.update({locked:!locked},{includeLocked:true})),this.button('Delete',()=>this.remove()));
        this.quick.style.left=Math.max(8,Math.min(left,global.innerWidth-320))+'px';this.quick.style.top=Math.max(8,top-76)+'px';
      },
      button(label,run,props={}) {return h('button',{class:'je-button',type:'button',onclick:run,...props},label);},
      imageBox(f) {
        const img=f.querySelector('img'),r=img.getBoundingClientRect(),w=img.offsetWidth,h=img.offsetHeight;
        // Transforms change the bounding rectangle, not the underlying object dimensions.
        return {left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,width:w,height:h,right:r.left+(r.width+w)/2,bottom:r.top+(r.height+h)/2};
      },
      begin(e,kind) {
        if(this.gesture||!this.writable())return;
        const figs=this.chosen();if(!figs.length||figs.some(f=>model(f).locked))return;
        const originals=figs.map(f=>({m:{...model(f)},pid:f.getAttribute('data-pid'),rect:this.imageBox(f),anchor:f.getBoundingClientRect().top}));
        const left=Math.min(...originals.map(o=>o.rect.left)),top=Math.min(...originals.map(o=>o.rect.top)),right=Math.max(...originals.map(o=>o.rect.right)),bottom=Math.max(...originals.map(o=>o.rect.bottom));
        const box={left,top,right,bottom,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
        const g=this.gesture={kind,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,originals,bounds:this.bounds(),box,moved:false,chapter:Ed.chapterId,ghost:null};
        g.onMove=ev=>this.movePointer(ev);g.onUp=ev=>this.endPointer(ev);g.onCancel=()=>this.cancelGesture();g.onScroll=()=>this.cancelGesture();
        global.addEventListener('scroll',g.onScroll,true);global.addEventListener('resize',g.onCancel);global.visualViewport?.addEventListener('resize',g.onCancel);
        doc.addEventListener('pointermove',g.onMove,{passive:false});doc.addEventListener('pointerup',g.onUp);doc.addEventListener('pointercancel',g.onCancel);global.addEventListener('blur',g.onCancel);
      },
      snapValue(x,width,bounds) {
        if(!this.snap)return {x,guide:null};
        const targets=[0,(100-width)/2,100-width];let best=targets.find(t=>Math.abs(t-x)*bounds.width/100<8);
        if(best!=null)return {x:best,guide:best+width/2};
        return {x:this.grid?Math.round(x/4)*4:x,guide:null};
      },
      movePointer(e) {
        const g=this.gesture;if(!g||e.pointerId!==g.pointer)return;
        e.preventDefault();g.dx=e.clientX-g.startX;g.dy=e.clientY-g.startY;if(this.snap&&this.grid&&g.kind==='move')g.dy=Math.round(g.dy/(g.bounds.width*.04))*(g.bounds.width*.04);
        if(!g.moved&&Math.hypot(g.dx,g.dy)<4)return;g.moved=true;
        if(!g.ghost){g.ghost=h('div',{class:'je-drag-ghost'});doc.body.append(g.ghost);g.originals.forEach(o=>{const img=h('img',{src:o.m.src,alt:'',style:{position:'fixed',left:o.rect.left+'px',top:o.rect.top+'px',width:o.rect.width+'px',height:o.rect.height+'px',opacity:o.m.opacity/100}});g.ghost.append(img);});}
        if(g.kind==='move'&&g.originals.length>1)g.dx=Math.max(g.bounds.left-g.box.left,Math.min(g.bounds.left+g.bounds.width-g.box.right,g.dx));
        let scaleX=1,scaleY=1,angle=0;
        if(['nw','ne','sw','se'].includes(g.kind)){
          const rad=g.originals.length===1?g.originals[0].m.rotation*Math.PI/180:0;
          const localX=g.dx*Math.cos(rad)+g.dy*Math.sin(rad),localY=-g.dx*Math.sin(rad)+g.dy*Math.cos(rad);
          scaleX=Math.max(.15,(g.box.width+localX*(g.kind.includes('w')?-1:1))/Math.max(1,g.box.width));
          scaleY=Math.max(.15,(g.box.height+localY*(g.kind.includes('n')?-1:1))/Math.max(1,g.box.height));
          if(g.originals.length>1||g.originals[0].m.aspect){const uniform=(g.box.width*g.box.width*scaleX+g.box.height*g.box.height*scaleY)/(g.box.width*g.box.width+g.box.height*g.box.height);scaleX=scaleY=Math.max(.15,uniform);}
        }
        if(g.kind==='rotate') {const cx=g.box.left+g.box.width/2,cy=g.box.top+g.box.height/2;angle=(Math.atan2(e.clientY-cy,e.clientX-cx)-Math.atan2(g.startY-cy,g.startX-cx))*180/Math.PI;if(e.shiftKey||this.snap)angle=Math.round(angle/15)*15;}
        const low=Math.max(...g.originals.map(o=>5/o.m.w)),high=Math.min(...g.originals.map(o=>100/o.m.w));
        scaleX=Math.max(low,Math.min(high,scaleX));if(g.originals.length>1||g.originals[0].m.aspect)scaleY=scaleX;
        g.scaleX=scaleX;g.scaleY=scaleY;g.angle=angle;g.placements=[];
        Array.from(g.ghost.children).forEach((img,i)=>{const o=g.originals[i];let dx=g.kind==='move'?g.dx:0,dy=g.kind==='move'?g.dy:0;
          if(g.kind==='move'&&g.originals.length===1){const start=(o.rect.left-g.bounds.left)/g.bounds.width*100;const snap=this.snapValue(start+dx/g.bounds.width*100,o.rect.width/g.bounds.width*100,g.bounds);dx=(snap.x-start)*g.bounds.width/100;g.dx=dx;this.guide(snap.guide,g.bounds);}
          let left=o.rect.left+dx,top=o.rect.top+dy;
          if(['nw','ne','sw','se'].includes(g.kind)){
            if(g.originals.length===1){
              const rad=o.m.rotation*Math.PI/180;
              const shiftX=(g.kind.includes('w')?-1:1)*o.rect.width*(scaleX-1)/2,shiftY=(g.kind.includes('n')?-1:1)*o.rect.height*(scaleY-1)/2;
              left=o.rect.left+shiftX*Math.cos(rad)-shiftY*Math.sin(rad)-o.rect.width*(scaleX-1)/2;
              top=o.rect.top+shiftX*Math.sin(rad)+shiftY*Math.cos(rad)-o.rect.height*(scaleY-1)/2;
            }else {
              left=g.box.left+(g.kind.includes('w')?g.box.width*(1-scaleX):0)+(o.rect.left-g.box.left)*scaleX;
              top=g.box.top+(g.kind.includes('n')?g.box.height*(1-scaleY):0)+(o.rect.top-g.box.top)*scaleY;
            }
          }
          if(g.kind==='move'&&g.originals.length===1&&['front','behind','block','wrap'].includes(o.m.mode))left=Math.max(g.bounds.left,Math.min(g.bounds.left+g.bounds.width-o.rect.width,left));
          g.placements.push({left,top});
          img.style.left=left+'px';img.style.top=top+'px';img.style.width=o.rect.width*scaleX+'px';img.style.height=o.rect.height*scaleY+'px';img.style.transform='rotate('+(o.m.rotation+angle)+'deg) scale('+(o.m.flipX?-1:1)+','+(o.m.flipY?-1:1)+')';

        });
      },
      guide(x,b) {this.guideEl?.remove();this.guideEl=null;if(x!=null){this.guideEl=h('div',{class:'je-snap-guide',style:{left:(b.left+x/100*b.width)+'px'}});doc.body.append(this.guideEl);}},
      endPointer(e) {
        const g=this.gesture;if(!g||e.pointerId!==g.pointer)return;
        if(!g.moved||g.chapter!==Ed.chapterId){this.cancelGesture();return;}
        g.bounds=this.bounds();this.cancelGesture();this.suppressClick=true;global.setTimeout(()=>{this.suppressClick=false;},0);
        const changes=g.originals.map((o,i)=>{
          const position=g.placements[i];
          const f=this.figures().find(n=>model(n).id===o.m.id);if(!f)return null;let m={...o.m};
          if(g.kind==='rotate')m.rotation=((m.rotation+(g.angle||0)+180)%360+360)%360-180;
          else if(g.kind==='move') {
            const flow=!['behind','front'].includes(m.mode);
            if(flow){m.placed=true;m.offsetX+=(position.left-o.rect.left)/g.bounds.width*100;m.offsetY+=(position.top-o.rect.top)/g.bounds.width*100;}
            m.x=num((position.left-g.bounds.left)/g.bounds.width*100,0,100-m.w,0);
            const desired=position.top;
            if(flow){m.y=0;}else if(m.anchor==='page'){
              const height=parseFloat(Ed.el.style.getPropertyValue('--je-page-height'))||g.bounds.width*1.414;
              const inset=parseFloat(Ed.el.style.getPropertyValue('--je-page-inset'))||0;const total=desired-Ed.el.getBoundingClientRect().top-inset;m.page=Math.max(1,Math.floor(Math.max(0,total)/height)+1);m.y=(total-(m.page-1)*height)/g.bounds.width*100;
            }else {
              // Keep the existing anchor stable: no paragraph reflow or jump at drop.
              m.y=o.m.y+(position.top-o.rect.top)/g.bounds.width*100;
              

            }
          } else {
            let sx=g.scaleX||1,sy=g.scaleY||1;
            sx=Math.max(5/o.m.w,Math.min(100/o.m.w,sx));if(m.aspect)sy=sx;
            m.w=num(m.w*sx,5,100,30);if(!m.aspect)m.ratio=num(m.ratio*sy/sx,.15,6,1);
            const moveX=(position.left-o.rect.left)/g.bounds.width*100,moveY=(position.top-o.rect.top)/g.bounds.width*100;
            m.x=num((position.left-g.bounds.left)/g.bounds.width*100,0,100-m.w,0);
            if(['front','behind'].includes(m.mode))m.y=o.m.y+moveY;
            else {m.placed=true;m.offsetX+=moveX;m.offsetY+=moveY;}

          }
          return {figure:f,value:m};
        }).filter(Boolean);
        this.applyProperties(changes);
        this.showPanel();
      },
      cancelGesture() {const g=this.gesture;if(!g)return;doc.removeEventListener('pointermove',g.onMove);doc.removeEventListener('pointerup',g.onUp);doc.removeEventListener('pointercancel',g.onCancel);global.removeEventListener('blur',g.onCancel);global.removeEventListener('scroll',g.onScroll,true);global.removeEventListener('resize',g.onCancel);global.visualViewport?.removeEventListener('resize',g.onCancel);g.ghost?.remove();this.guideEl?.remove();this.guideEl=null;this.gesture=null;},
      remove() {const chosen=this.chosen();if(chosen.some(f=>model(f).locked)){toast('Unlock the element before deleting it.');return;}const ids=new Set(this.selected);this.mutate(root=>this.figures(root).filter(f=>ids.has(model(f).id)).forEach(f=>f.remove()));this.clear();},
      copy() {this.clipboard=this.chosen().map(f=>({...model(f)}));toast(this.clipboard.length+' element(s) copied');},
      paste(values=this.clipboard) {
        if(!this.writable()||!Array.isArray(values)||values.length>50)return false;
        const entries=values.map(v=>core.normalize(v)).filter(Boolean);if(!entries.length)return false;
        const groups=new Map(),models=entries.map(v=>({...v,id:uid(),locked:false,x:Math.min(95,v.x+3),y:v.y+3,group:v.group?(groups.get(v.group)||((groups.set(v.group,uid())),groups.get(v.group))):''}));
        const anchorPid=Ed.topBlock(Ed.currentBlock())?.getAttribute('data-pid');this.selected=new Set(models.map(m=>m.id));
        const ok=this.mutate(root=>{const p=Array.from(root.children).find(n=>n.getAttribute('data-pid')===anchorPid)||root.lastElementChild;models.forEach(m=>{m.anchorId=p?.getAttribute('data-pid')||'';const f=core.make(doc,m);if(m.mode==='inline'&&p?.matches('p,h1,h2,blockquote'))p.prepend(f);else if(p)p.before(f);else root.append(f);});});if(ok)this.showPanel();return ok;
      },
      handlePaste(e) {const data=e.clipboardData?.getData('application/x-journals-elements');if(!data)return false;e.preventDefault();try{return this.paste(JSON.parse(data));}catch{return true;}},
      duplicate() {this.paste(this.chosen().map(f=>model(f)));},
      group() {if(this.chosen().length<2){toast('Select two elements in the layers list first.');return;}this.update({group:uid()});this.showPanel();},
      ungroup() {this.update({group:''});this.showPanel();},
      order(direction) {const sorted=this.figures().map(model).sort((a,b)=>a.z-b.z);const picked=sorted.filter(m=>this.selected.has(m.id)&&!m.locked),rest=sorted.filter(m=>!picked.includes(m));if(!picked.length)return;let ordered;if(direction==='top')ordered=[...rest,...picked];else if(direction==='bottom')ordered=[...picked,...rest];else {ordered=[...sorted];const seq=direction==='up'?[...picked].reverse():picked;for(const item of seq){const i=ordered.indexOf(item),j=Math.max(0,Math.min(ordered.length-1,i+(direction==='up'?1:-1)));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}}const ranks=new Map(ordered.map((m,i)=>[m.id,i+1]));this.mutate(root=>this.figures(root).forEach(f=>{const m=model(f);m.z=ranks.get(m.id);f.replaceWith(core.make(doc,m,f.getAttribute('data-pid')));}));this.showPanel();},
      key(e) {
        if(e.target.closest('input,textarea,select')||!this.chosen().length||!this.writable())return;
        const mod=e.ctrlKey||e.metaKey;
        if(mod&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();Ed.cmd(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');return;}
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.clear();Ed.restoreFocus();return;}
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const step=(e.shiftKey?10:1)/this.bounds().width*100;this.update(m=>({placed:true,offsetX:m.offsetX+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),offsetY:m.offsetY+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0),x:num(m.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),0,100-m.w,0),y:m.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}));return;}
        if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();this.remove();return;}
        if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();e.stopPropagation();this.duplicate();return;}
        if(mod&&e.key.toLowerCase()==='c'){/* handled by the copy event */return;}
        if(!mod&&e.key.length===1)this.clear();
      },
      open(anchor) {
        if(!this.writable())return;Ed.saveSel();ctx.getDock().close();this.ensureIds();
        const grid=h('div',{class:'elements-grid'}),search=h('input',{class:'inp',type:'search',placeholder:'Search elements or tags…','aria-label':'Search elements'}),chapter=Ed.chapterId;
        const render=()=>{const items=core.search(search.value);grid.replaceChildren(...items.map(item=>h('button',{class:'element-card',type:'button',onclick:()=>{if(Ed.chapterId!==chapter){Pop.close();return;}Pop.close();this.insert({src:item.url,mode:'block',w:30,ratio:1,aspect:true,x:35,y:0,opacity:100,gap:16});}},h('img',{src:item.url,alt:'',loading:'lazy',draggable:false}),item.name)));if(!items.length)grid.append(h('p',{role:'status',class:'muted'},'No matching elements.'));};search.addEventListener('input',render);render();
        Pop.open(anchor,h('div',{class:'elements-picker'},h('div',{class:'menu-h'},'Elements · demo'),h('p',{class:'small muted'},'Insert a sample, then drag it or use its corner handles.'),h('div',{class:'je-row'},this.button('On this page',()=>{Pop.close();this.tab='layers';this.showPanel();}),this.button('Page setup',()=>{Pop.close();this.tab='page';this.showPanel();}),this.button('Paste',()=>{Pop.close();this.paste();},{disabled:!this.clipboard.length})),search,grid),{role:'dialog',align:'end'});
      },
      field(label,input) {return h('label',{class:'je-field'},h('span',null,label),input);},
      number(label,value,min,max,step,run) {const el=h('input',{type:'number',value,min,max,step,'aria-label':label});el.addEventListener('change',()=>{if(el.value!=='')run(num(el.value,min,max,value));});return this.field(label,el);},
      choose(label,options,value,run) {const el=selectEl(options,value);el.setAttribute('aria-label',label);el.addEventListener('change',()=>run(el.value));return this.field(label,el);},
      check(label,checked,run) {const el=h('input',{type:'checkbox',checked,'aria-label':label});el.addEventListener('change',()=>run(el.checked));return h('label',{class:'je-check'},el,label);},
      showPanel() {
        if(!this.writable())return;
        if(!this.panel){this.panel=h('section',{class:'je-panel',role:'dialog','aria-label':'Element customization'});this.panel.addEventListener('pointerdown',noFocusSteal);this.panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();this.clear();Ed.restoreFocus();}});doc.body.append(this.panel);}
        const count=this.chosen().length,m=count?model(this.chosen()[0]):null;
        const tabs=h('div',{class:'je-tabs',role:'tablist'});for(const [id,label] of [['position','Position'],['style','Style'],['layers','Layers'],['page','Page']])tabs.append(this.button(label,()=>{this.tab=id;this.showPanel();},{role:'tab','aria-selected':String(this.tab===id),'aria-controls':'je-controls'}));
        const body=h('div',{class:'je-panel-body',id:'je-controls',role:'tabpanel'});
        this.panel.replaceChildren(h('div',{class:'je-panel-head'},h('strong',null,count?(count===1?'Element settings':count+' elements selected'):'Page elements'),this.button('Close',()=>{this.panel?.remove();this.panel=null;},{'aria-label':'Close element controls'})),tabs,body);
        if(this.tab==='layers'){this.layers(body);return;}if(this.tab==='page'){this.pageControls(body);return;}
        if(!m){body.append(h('p',null,'Select an element in the Layers tab.'));return;}
        const apply=patch=>{this.update(patch);this.showPanel();};
        if(m.locked)body.append(h('p',{class:'je-hint'},'Position is locked. Unlock to resize or move.'),this.button('Unlock',()=>{this.update({locked:false},{includeLocked:true});this.showPanel();}));
        if(this.tab==='position'){
          const widthPx=this.bounds().width,layout=core.settings(Ed.el),paper=core.papers[layout.paper],paperMm=layout.orientation==='landscape'?paper[1]:paper[0],mmWidth=layout.mode==='page'?paperMm-2*layout.margin:widthPx*25.4/96;
          const toUnit=v=>Math.round((this.units==='px'?v/100*widthPx:this.units==='mm'?v/100*mmWidth:v)*100)/100;
          const fromUnit=v=>this.units==='px'?v/widthPx*100:this.units==='mm'?v/mmWidth*100:v;
          body.append(this.choose('Text layout',[['inline','Inline'],['block','Above / below text'],['wrap','Wrap text'],['behind','Behind text'],['front','In front of text']],m.mode,v=>apply({mode:v})),
            this.choose('Alignment',[['left','Left'],['center','Center'],['right','Right']],m.align,v=>apply({align:v,x:v==='left'?0:v==='right'?100-m.w:(100-m.w)/2})),
            this.choose('Wrap sides',[['both','Both (automatic side)'],['left','Text on left'],['right','Text on right']],m.wrapSide,v=>apply({wrapSide:v})),
            this.choose('Wrap shape',[['square','Square'],['tight','Tight (rounded)']],m.wrapShape,v=>apply({wrapShape:v})),
            this.number('Text distance (px)',m.gap,0,64,1,v=>apply({gap:v})),this.number('Wrap through paragraphs (0 = unlimited)',m.wrapEnd,0,50,1,v=>apply({wrapEnd:v})),
            this.choose('Size units',[['%','Percent'],['px','Pixels'],['mm','Millimeters']],this.units,v=>{this.units=v;this.showPanel();}),
            h('div',{class:'je-columns'},this.number('Width ('+this.units+')',toUnit(m.w),toUnit(5),toUnit(100),this.units==='%'?1:.1,v=>apply({w:fromUnit(v)})),this.number('Height ('+this.units+')',toUnit(m.w*m.ratio),toUnit(1),toUnit(600),this.units==='%'?1:.1,v=>apply(m.aspect?{w:fromUnit(v)/m.ratio}:{ratio:fromUnit(v)/m.w}))),
            this.check('Lock aspect ratio',m.aspect,v=>apply({aspect:v})),
            h('div',{class:'je-columns'},this.number('Horizontal (%)',m.x,0,95,1,v=>apply({x:v,mode:['front','behind'].includes(m.mode)?m.mode:'front'})),this.number('Vertical (%)',m.y,-300,3000,1,v=>apply({y:v,mode:['front','behind'].includes(m.mode)?m.mode:'front'}))),
            this.choose('Anchor',[['paragraph','Move with paragraph'],['page','Fixed on page']],m.anchor,v=>apply({anchor:v,mode:v==='page'&&!['front','behind'].includes(m.mode)?'front':m.mode})),
            this.number('Page number',m.page,1,100,1,v=>apply({page:v,anchor:'page',mode:['front','behind'].includes(m.mode)?m.mode:'front'})),
            this.check('Snap to guides',this.snap,v=>{this.setLayout({snap:v});}),this.check('Show grid / snap to grid',this.grid,v=>{this.setLayout({grid:v});}),
            h('div',{class:'je-row'},this.button('Move up paragraph',()=>this.moveAnchor(-1)),this.button('Move down paragraph',()=>this.moveAnchor(1))),
            h('p',{class:'je-hint'},'Drag to place freely. Arrow keys nudge; Shift + arrows move 10 px. Dragging keeps the selected text layout.'));
        }else{
          const color=h('input',{type:'color',value:m.borderColor,'aria-label':'Border color'});color.addEventListener('change',()=>apply({borderColor:color.value}));
          body.append(this.number('Rotation (degrees)',m.rotation,-180,180,1,v=>apply({rotation:v})),this.number('Opacity (%)',m.opacity,5,100,1,v=>apply({opacity:v})),
            this.check('Flip horizontally',m.flipX,v=>apply({flipX:v})),this.check('Flip vertically',m.flipY,v=>apply({flipY:v})),
            this.number('Border width (px)',m.border,0,8,1,v=>apply({border:v})),this.field('Border color',color),this.choose('Shadow',[['none','None'],['soft','Soft'],['deep','Deep']],m.shadow,v=>apply({shadow:v})),
            this.button('Reset appearance',()=>apply({rotation:0,opacity:100,flipX:false,flipY:false,border:0,shadow:'none',ratio:1,aspect:true})),
            this.button('Reset size and position',()=>apply({mode:'block',w:30,ratio:1,x:35,y:0,offsetX:0,offsetY:0,placed:false,align:'center',anchor:'paragraph',page:1})));
        }
        body.append(h('div',{class:'je-row'},this.button('Undo',()=>{Ed.cmd('undo');core.hydrate(Ed.el);this.draw();this.showPanel();}),this.button('Redo',()=>{Ed.cmd('redo');core.hydrate(Ed.el);this.draw();this.showPanel();})),h('div',{class:'je-row'},this.button('Copy',()=>this.copy()),this.button('Duplicate',()=>this.duplicate()),this.button(m.locked?'Unlock':'Lock',()=>{this.update({locked:!m.locked},{includeLocked:true});this.showPanel();}),this.button('Delete',()=>this.remove())));
      },
      moveAnchor(direction) {
        const ids=new Set(this.selected);this.mutate(root=>{const blocks=Array.from(root.children).filter(n=>/^(P|H1|H2|BLOCKQUOTE|UL|OL)$/.test(n.tagName));this.figures(root).filter(f=>ids.has(model(f).id)&&!model(f).locked).forEach(f=>{const m=model(f);const at=blocks.findIndex(p=>p.getAttribute('data-pid')===m.anchorId);const p=blocks[Math.max(0,Math.min(blocks.length-1,(at<0?0:at)+direction))];if(p){m.anchorId=p.getAttribute('data-pid');f.remove();p.before(core.make(doc,m,f.getAttribute('data-pid')));}});});this.showPanel();
      },
      layers(body) {
        this.ensureIds();const all=this.figures().slice().sort((a,b)=>model(b).z-model(a).z);
        body.append(h('p',{class:'je-hint'},'Select hidden elements here. Check several to group or move together.'));
        if(!all.length)body.append(h('p',null,'No elements inserted yet.'));
        for(const f of all){const m=model(f),item=core.catalog.find(e=>e.url===m.src);const checkbox=h('input',{type:'checkbox',checked:this.selected.has(m.id),'aria-label':'Select '+item.name});checkbox.addEventListener('change',()=>{if(checkbox.checked)this.selected.add(m.id);else this.selected.delete(m.id);this.draw();this.showPanel();});body.append(h('div',{class:'je-layer-row'},checkbox,h('img',{src:m.src,alt:''}),this.button(item.name+(m.locked?' · locked':'')+(m.group?' · grouped':''),()=>{this.selected=new Set([m.id]);this.draw();this.tab='position';this.showPanel();}),h('span',{class:'je-hint'},m.mode)));}
        body.append(h('div',{class:'je-row'},this.button('Bring forward',()=>this.order('up')),this.button('Send backward',()=>this.order('down')),this.button('Bring to front',()=>this.order('top')),this.button('Send to back',()=>this.order('bottom'))),h('div',{class:'je-row'},this.button('Group',()=>this.group()),this.button('Ungroup',()=>this.ungroup()),this.button('Paste',()=>this.paste(),{disabled:!this.clipboard.length})));
      },
      syncLayout() {const l=core.settings(Ed.el);this.snap=l.snap;this.grid=l.grid;},
      setLayout(patch) {this.mutate(root=>{const l=core.settings(root),old=root.querySelector('figure.journal-page-settings'),next=core.makeLayout(doc,{...l,...patch});if(old)old.replaceWith(next);else root.prepend(next);});this.syncLayout();this.showPanel();},
      pageControls(body) {
        const l=core.settings(Ed.el),apply=patch=>{this.mutate(root=>{let marker=root.querySelector('figure.journal-page-settings');const next=core.makeLayout(doc,{...l,...patch});if(marker)marker.replaceWith(next);else root.prepend(next);});this.showPanel();};
        body.append(h('p',{class:'je-hint'},'Demo page layout. Paper proportions adapt to the screen; explicit page breaks are preserved. '),
          this.choose('Document layout',[['flow','Responsive writing'],['page','Page layout']],l.mode,v=>apply({mode:v})),this.choose('Paper size',[['A4','A4'],['Letter','Letter'],['A5','A5']],l.paper,v=>apply({paper:v})),
          this.choose('Orientation',[['portrait','Portrait'],['landscape','Landscape']],l.orientation,v=>apply({orientation:v})),this.number('Margins (mm)',l.margin,5,40,1,v=>apply({margin:v})),
          this.check('Grid',l.grid,v=>{this.grid=v;apply({grid:v});}),this.check('Snap',l.snap,v=>{this.snap=v;apply({snap:v});}),
          h('div',{class:'je-row'},this.button('Insert page break',()=>this.pageBreak()),this.button('Remove page breaks',()=>{this.mutate(root=>root.querySelectorAll('hr.journal-page-break').forEach(n=>n.remove()));})),
          h('div',{class:'je-row'},this.button('Undo',()=>{Ed.cmd('undo');core.hydrate(Ed.el);this.draw();this.showPanel();}),this.button('Redo',()=>{Ed.cmd('redo');core.hydrate(Ed.el);this.draw();this.showPanel();})));
      },
      pageBreak() {Ed.saveSel();const pid=Ed.topBlock(Ed.currentBlock())?.getAttribute('data-pid');this.mutate(root=>{const p=Array.from(root.children).find(n=>n.getAttribute('data-pid')===pid)||root.lastElementChild;const br=h('hr',{class:'journal-page-break'});if(p)p.before(br);else root.append(br);});}
    };
    return api;
  }
  global.JournalElementEditor=Object.freeze({create});
})(window);

