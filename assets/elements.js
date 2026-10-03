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
  function clean(node) {
    if (!node || node.tagName !== 'FIGURE' || !node.classList.contains('journal-element')) return null;
    const image = node.querySelector('img');
    if (!image || !safeSrc(image.getAttribute('src'))) return null;
    const item = catalog.find(e => e.url === image.getAttribute('src'));
    const el = node.ownerDocument.createElement('figure');
    const align = ['left','right','center'].find(x => node.classList.contains('element-'+x)) || 'center';
    el.className = 'journal-element element-'+align + (align !== 'center' && node.classList.contains('element-wrap') ? ' element-wrap' : '');
    const w = node.style.width;
    el.style.width = /^\d+(?:\.\d+)?%$/.test(w) ? Math.max(10,Math.min(60,parseFloat(w)))+'%' : '30%';
    const pid = node.getAttribute('data-pid');
    if (pid && /^[a-zA-Z0-9_-]{1,100}$/.test(pid)) el.setAttribute('data-pid',pid);
    el.setAttribute('contenteditable','false');
    const img = node.ownerDocument.createElement('img'); img.src = item.url; img.alt = item.name; img.setAttribute('draggable','false');
    el.append(img); return el;
  }
  global.JournalElements = Object.freeze({catalog:Object.freeze(catalog),safeSrc,search,clean});
})(window);
