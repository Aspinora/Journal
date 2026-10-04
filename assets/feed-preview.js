/* Safe, bounded previews of the author's original text, without decoration metadata. */
(function(global){
  'use strict';
  function render(work, markdown, limit=220){
    const short=['Poetry','Shayari','Thoughts'].includes(work.category);
    const value=short&&work.body ? work.body : (work.excerpt||work.body||'');
    const box=document.createElement('div');
    box.innerHTML=global.JournalContent.render(value,markdown);
    box.querySelectorAll('figure,img').forEach(n=>n.remove());
    // Walk text nodes rather than slicing HTML: tags and author line breaks remain valid.
    const walk=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);let node,used=0,done=false;
    while((node=walk.nextNode())){
      if(done){node.textContent='';continue;}
      const chars=Array.from(node.textContent),remaining=limit-used;
      if(chars.length>remaining){node.textContent=chars.slice(0,remaining).join('')+'…';done=true;}
      else used+=chars.length;
    }
    if(done){
      // Remove trailing empty blocks left by truncation, keeping intentional earlier blanks.
      while(box.lastElementChild&&!box.lastElementChild.textContent.trim())box.lastElementChild.remove();
    }
    return box.innerHTML;
  }
  global.JournalFeedPreview=Object.freeze({render});
})(window);
