/* Shared fixed-canvas reader and Writer Studio preview. It never changes the saved document. */
(function(global){
 'use strict';const instances=new WeakMap(),active=new Set();
 function refresh(host){instances.get(host)?.refresh();}
 function mount(host,options={}){
  if(!host||instances.has(host))return instances.get(host);const core=global.JournalElements,layout=core.settings(host),legacy=!layout.canvas;if(legacy)layout.canvas=core.canvas({width:640,font:'"Source Serif 4", serif',size:19,line:1.85,gap:0});
  if(!layout.canvas.align)layout.canvas.align=options.defaultAlign||'start';
  const source=host.innerHTML,doc=host.ownerDocument,controls=doc.createElement('div'),viewport=doc.createElement('div'),stage=doc.createElement('div'),original=doc.createElement('div'),reading=doc.createElement('div');
  controls.className='je-design-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Reading layout');viewport.className='je-design-viewport';stage.className='je-design-stage';original.className='je-design-output';original.innerHTML=source;if(legacy)original.prepend(core.makeLayout(doc,layout));reading.className='je-reading-output';reading.style.textAlign=layout.canvas.align;reading.innerHTML=source;reading.querySelectorAll('.journal-element,.journal-page-settings').forEach(n=>n.remove());reading.hidden=true;
  host.classList.add('je-design-host');host.replaceChildren(controls,viewport,reading);viewport.append(stage);stage.append(original);if(options.controlsHost){options.controlsHost.replaceChildren(controls);options.controlsHost.hidden=false;}let mode='original',pending=false;if(legacy){const note=doc.createElement('small');note.className='je-design-legacy-note';note.textContent='This older post uses a standard page. Re-publish from the updated Writer Studio to save its exact design.';host.append(note);}
  function button(label,run){const b=doc.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',run);controls.append(b);return b;}
  const originalButton=button('Original layout',()=>setMode('original')),readingButton=button('Reading view',()=>setMode('reading'));
  function update(){pending=false;if(mode!=='original'||!host.isConnected)return;core.applyCanvas(original,layout.canvas);original.style.transform='none';core.hydrate(original,layout);const width=viewport.clientWidth;if(!width)return;const scale=Math.min(1,width/layout.canvas.width),height=Math.max(original.scrollHeight,original.offsetHeight);stage.style.width=layout.canvas.width*scale+'px';stage.style.height=Math.ceil(height*scale)+'px';original.style.transform='scale('+scale+')';original.dataset.designScale=String(scale);}
  function schedule(){if(!pending){pending=true;requestAnimationFrame(update);}}
  function setMode(next){mode=next;viewport.hidden=next!=='original';reading.hidden=next!=='reading';originalButton.setAttribute('aria-pressed',String(next==='original'));readingButton.setAttribute('aria-pressed',String(next==='reading'));if(next==='original')schedule();}
  const observer=new ResizeObserver(schedule);observer.observe(host);original.addEventListener('load',schedule,true);
  const instance={refresh:schedule,dispose(){controls.remove();observer.disconnect();active.delete(instance);instances.delete(host);},host};instances.set(host,instance);active.add(instance);setMode('original');
  // Typography must use the same web fonts as the writer, including fonts on individual spans.
  const families=new Set([layout.canvas.font,...Array.from(original.querySelectorAll('[style]')).map(n=>n.style.fontFamily)]);const known=['Source Serif 4','Lora','Literata','Merriweather','Crimson Pro','EB Garamond','Libre Baskerville','Cormorant Garamond','Playfair Display','Figtree','Source Sans 3','Nunito','Work Sans','Courier Prime','Caveat','Noto Serif Devanagari','Noto Sans Devanagari','Hind','Mukta','Tiro Devanagari Hindi','Kalam','Noto Nastaliq Urdu','Amiri','Noto Naskh Arabic','Scheherazade New'];
  for(const font of known)if([...families].some(f=>f?.includes(font))&&!doc.querySelector('link[data-design-font="'+font+'"]')){const link=doc.createElement('link');link.rel='stylesheet';link.dataset.designFont=font;const axes=font==='Tiro Devanagari Hindi'?'ital@0;1':known.slice(0,14).includes(font)||font==='Amiri'?'ital,wght@0,400;0,700;1,400;1,700':'wght@400;700';link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(font).replace(/%20/g,'+')+':'+axes+'&display=swap';link.addEventListener('load',()=>doc.fonts.ready.then(schedule));doc.head.append(link);}
  doc.fonts?.ready.then(schedule);return instance;
 }
 // Removed posts/previews must not retain observers or listeners.
 new MutationObserver(()=>{for(const instance of active)if(!instance.host.isConnected)instance.dispose();}).observe(document.documentElement,{childList:true,subtree:true});
 global.JournalDesign=Object.freeze({mount,refresh});
})(window);
