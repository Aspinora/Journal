/* Reader-only zoom: pan the complete post without changing saved canvas geometry. */
(function(global){
 'use strict';
 const instances=new WeakMap(),active=new Set();
 const nativeZoomed=()=> (global.visualViewport?.scale||1)>1.01;
 function current(){return [...active].find(i=>i.scroll.closest('.page.front'));}
 function isZoomed(){const i=current();return nativeZoomed()||!!(i&&(i.zoom>1.01||i.pinching));}
 function mount(scroll){
  if(instances.has(scroll))return instances.get(scroll);
  const doc=scroll.ownerDocument,stage=doc.createElement('div'),content=doc.createElement('div');
  stage.className='reader-pan-stage';content.className='reader-pan-content';content.append(...scroll.childNodes);stage.append(content);scroll.append(stage);
  let zoom=1,pinch=null,pan=null,mouse=null,frame=0,momentum=0,safariGesture=null,blockedTouch=false;
  const instance={scroll,get zoom(){return zoom;},get pinching(){return !!pinch||!!safariGesture||blockedTouch;},setZoom,dispose};instances.set(scroll,instance);active.add(instance);
  function notify(){scroll.classList.toggle('reader-zoomed',zoom>1.01);scroll.classList.toggle('reader-native-zoomed',nativeZoomed());doc.dispatchEvent(new Event('readerzoomchange'));}
  function measure(){frame=0;content.style.width=scroll.clientWidth+'px';stage.style.width=scroll.clientWidth*zoom+'px';stage.style.height=Math.ceil(content.offsetHeight*zoom)+'px';content.style.transform='scale('+zoom+')';}
  function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
  function setZoom(value,x,y){
   stopMomentum();
   const r=scroll.getBoundingClientRect(),px=x==null?r.width/2:x-r.left,py=y==null?r.height/2:y-r.top;
   const ax=(scroll.scrollLeft+px)/zoom,ay=(scroll.scrollTop+py)/zoom;
   zoom=Math.max(1,Math.min(4,value));if(zoom<1.03)zoom=1;
   measure();scroll.scrollLeft=ax*zoom-px;scroll.scrollTop=ay*zoom-py;notify();if(zoom===1)scroll.scrollLeft=0;
  }
  const distance=touches=>Math.hypot(touches[1].clientX-touches[0].clientX,touches[1].clientY-touches[0].clientY);
  const midpoint=touches=>({x:(touches[0].clientX+touches[1].clientX)/2,y:(touches[0].clientY+touches[1].clientY)/2});
  function stopMomentum(){cancelAnimationFrame(momentum);momentum=0;}
  function startPan(touch){return {x:touch.clientX,y:touch.clientY,left:scroll.scrollLeft,top:scroll.scrollTop,axis:zoom>1.01?'free':null,lastX:scroll.scrollLeft,lastY:scroll.scrollTop,lastT:performance.now(),vx:0,vy:0};}
  function glide(vx,vy){
   let last=performance.now();
   function step(now){const dt=Math.min(32,now-last);last=now;const x=scroll.scrollLeft,y=scroll.scrollTop;
    scroll.scrollLeft+=vx*dt;scroll.scrollTop+=vy*dt;
    const decay=Math.pow(.9,dt/16);vx=(scroll.scrollLeft===x?0:vx*decay);vy=(scroll.scrollTop===y?0:vy*decay);
    if(Math.abs(vx)+Math.abs(vy)>.04)momentum=requestAnimationFrame(step);else momentum=0;
   }
   momentum=requestAnimationFrame(step);
  }
  function touchStart(e){
   stopMomentum();
   if(nativeZoomed()&&zoom<=1.01){if(e.touches.length>1){blockedTouch=true;notify();}return;}
   if(e.touches.length===1){pan=startPan(e.touches[0]);if(zoom>1.01)e.preventDefault();return;}
   if(e.touches.length<2)return;
   e.preventDefault();pan=null;blockedTouch=true;const p=midpoint(e.touches),r=scroll.getBoundingClientRect();
   pinch={distance:Math.max(1,distance(e.touches)),zoom,x:(scroll.scrollLeft+p.x-r.left)/zoom,y:(scroll.scrollTop+p.y-r.top)/zoom};notify();
  }
  function touchMove(e){
   if(pan&&e.touches.length===1){
    const dx=pan.x-e.touches[0].clientX,dy=pan.y-e.touches[0].clientY;
    if(!pan.axis){if(Math.abs(dy)>8&&Math.abs(dy)>=Math.abs(dx))pan.axis='vertical';else if(Math.abs(dx)>8)pan.axis='horizontal';else return;}
    if(pan.axis==='horizontal')return; // The existing horizontal page-turn gesture owns this axis at Fit Page.
    e.preventDefault();if(pan.axis==='free')scroll.scrollLeft=pan.left+dx;scroll.scrollTop=pan.top+dy;
    const now=performance.now(),dt=Math.max(1,now-pan.lastT);pan.vx=(scroll.scrollLeft-pan.lastX)/dt;pan.vy=(scroll.scrollTop-pan.lastY)/dt;pan.lastX=scroll.scrollLeft;pan.lastY=scroll.scrollTop;pan.lastT=now;return;
   }
   if(!pinch||e.touches.length<2)return;e.preventDefault();const p=midpoint(e.touches),r=scroll.getBoundingClientRect();
   zoom=Math.max(1,Math.min(4,pinch.zoom*distance(e.touches)/pinch.distance));if(zoom<1.03)zoom=1;
   measure();scroll.scrollLeft=pinch.x*zoom-(p.x-r.left);scroll.scrollTop=pinch.y*zoom-(p.y-r.top);notify();if(zoom===1)scroll.scrollLeft=0;
  }
  function touchEnd(e){
   if(e.touches.length<2)pinch=null;
   if(!e.touches.length){if(e.type!=='touchcancel'&&!blockedTouch&&pan&&['vertical','free'].includes(pan.axis))glide(pan.vx,pan.vy);blockedTouch=false;pan=null;safariGesture=null;pointers.clear();mouse=null;}
   else if(e.touches.length===1&&zoom>1.01)pan=startPan(e.touches[0]);notify();
  }
  // Safari also emits GestureEvents. Prevent browser zoom from competing with the reader,
  // and use its scale as a fallback when a WebView does not deliver two touch points.
  function gestureStart(e){if(nativeZoomed())return;e.preventDefault();stopMomentum();blockedTouch=true;safariGesture={zoom};notify();}
  function gestureChange(e){if(nativeZoomed()&&!safariGesture)return;e.preventDefault();if(!pinch&&safariGesture)setZoom(safariGesture.zoom*e.scale,e.clientX||undefined,e.clientY||undefined);}
  function gestureEnd(e){if(nativeZoomed()&&!safariGesture)return;e.preventDefault();safariGesture=null;blockedTouch=!!pinch;notify();}
  function wheel(e){stopMomentum();if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();setZoom(zoom*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.008),e.clientX,e.clientY);}
  const pointers=new Map();
  function down(e){
   if(e.pointerType==='touch')pointers.set(e.pointerId,e);
   if(pointers.size>1){mouse=null;return;}
   if((e.pointerType==='mouse'&&e.button!==0)||zoom<=1.01||e.target.closest('button,a,input,textarea'))return;
   stopMomentum();if(e.pointerType==='mouse')e.preventDefault();
   mouse={id:e.pointerId,x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};scroll.setPointerCapture(e.pointerId);
  }
  function move(e){if(pointers.size>1||pinch||!mouse||e.pointerId!==mouse.id)return;e.preventDefault();scroll.scrollLeft=mouse.left+mouse.x-e.clientX;scroll.scrollTop=mouse.top+mouse.y-e.clientY;}
  function up(e){pointers.delete(e.pointerId);if(mouse&&e.pointerId===mouse.id){mouse=null;if(scroll.hasPointerCapture(e.pointerId))scroll.releasePointerCapture(e.pointerId);}}
  const handlers={gesturestart:gestureStart,gesturechange:gestureChange,gestureend:gestureEnd,touchstart:touchStart,touchmove:touchMove,touchend:touchEnd,touchcancel:touchEnd,wheel,pointerdown:down,pointermove:move,pointerup:up,pointercancel:up};
  for(const [type,handler]of Object.entries(handlers))scroll.addEventListener(type,handler,{passive:false});
  const observer=new ResizeObserver(schedule);observer.observe(scroll);observer.observe(content);
  function dispose(){stopMomentum();observer.disconnect();cancelAnimationFrame(frame);for(const [type,handler]of Object.entries(handlers))scroll.removeEventListener(type,handler);active.delete(instance);instances.delete(scroll);}
  schedule();return instance;
 }
 new MutationObserver(()=>{for(const i of active)if(!i.scroll.isConnected)i.dispose();}).observe(document.documentElement,{childList:true,subtree:true});
 global.visualViewport?.addEventListener('resize',()=>{for(const i of active)i.scroll.classList.toggle('reader-native-zoomed',nativeZoomed());document.dispatchEvent(new Event('readerzoomchange'));});
 global.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.target.closest?.('input,textarea,[contenteditable=true]'))return;const i=current();if(!i||nativeZoomed())return;if(['+','=','-','0'].includes(e.key)){e.preventDefault();i.setZoom(e.key==='0'?1:i.zoom*(e.key==='-'?1/1.25:1.25));}});
 global.JournalReaderView=Object.freeze({mount,isZoomed,reset(){current()?.setZoom(1);}});
})(window);
