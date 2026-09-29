/* Shared compatibility reader for legacy Markdown and Writer Studio HTML.
 * DOMPurify 3.4.16 is vendored next to this module; no CDN is required.
 */
(function (global) {
  'use strict';
  const purifier = global.DOMPurify;
  const tags = ['p','div','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','hr','br','strong','b','em','i','u','s','del','span','mark','a','figure','figcaption','img','pre','code','sub','sup'];
  const config = {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: ['href','src','alt','title','style','dir','data-pid','loading','decoding','class','target','rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['script','style','iframe','object','embed','svg','math','form','input','button','template'],
    SANITIZE_DOM: true
  };
  function escape(text) {
    return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function cleanStyle(style) {
    const out = [];
    const color = /^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|transparent|inherit)$/i;
    for (const declaration of style.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const key = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      let allowed = false;
      if (key === 'color' || key === 'background-color') allowed = color.test(value);
      if (key === 'text-align') allowed = /^(left|right|center|justify|start|end)$/.test(value);
      if (key === 'font-family') allowed = value.length <= 160 && /^[a-zA-Z0-9\s,'"-]+$/.test(value);
      if (key === 'font-size') allowed = /^(?:\d+(?:\.\d+)?)(px|pt)$/.test(value) && parseFloat(value) >= 8 && parseFloat(value) <= 96;
      if (key === 'font-weight') allowed = /^(normal|bold|[1-9]00)$/.test(value);
      if (key === 'font-style') allowed = /^(normal|italic|oblique)$/.test(value);
      if (key === 'text-decoration' || key === 'text-decoration-line') allowed = /^(?:none|underline|line-through|overline)(?: (?:underline|line-through|overline))*$/.test(value);
      if (key === 'line-height') allowed = /^\d+(?:\.\d+)?$/.test(value) && +value >= 1 && +value <= 3;
      if (key === 'margin-bottom') allowed = /^\d+(?:\.\d+)?(?:px|em)$/.test(value) && parseFloat(value) <= (value.endsWith('em') ? 4 : 80);
      if (allowed) out.push(key + ':' + value);
    }
    return out.join(';');
  }
  if (purifier && purifier.isSupported) {
    purifier.addHook('uponSanitizeAttribute', function (node, data) {
      if (data.attrName === 'style') {
        data.attrValue = cleanStyle(data.attrValue);
        if (!data.attrValue) data.keepAttr = false;
      }
      if (data.attrName === 'class') {
        data.keepAttr = node.tagName === 'FIGURE' && data.attrValue === 'body-img-16x9';
      }
      if (data.attrName === 'dir') data.keepAttr = /^(auto|ltr|rtl)$/.test(data.attrValue);
      if (data.attrName === 'data-pid') data.keepAttr = /^[a-zA-Z0-9_-]{1,100}$/.test(data.attrValue);
      if (data.attrName === 'href') data.keepAttr = /^(https?:\/\/|mailto:)/i.test(data.attrValue.trim());
      if (data.attrName === 'src') data.keepAttr = node.tagName === 'IMG' && /^https?:\/\//i.test(data.attrValue.trim());
    });
    purifier.addHook('afterSanitizeAttributes', function (node) {
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
      if (node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
        node.setAttribute('style', 'max-width:100%;height:auto');
      }
    });
  }
  function isHtml(value) {
    // Do not decode entities: text intentionally displaying &lt;p&gt; stays text.
    return /^\s*<(?:p|div|h[1-6]|blockquote|ul|ol|li|figure|pre|br|hr|span)(?:\s|\/?>)/i.test(value);
  }
  function render(value, markdownRenderer, format) {
    const text = value == null ? '' : String(value);
    if (!text) return '';
    if (!purifier || !purifier.isSupported) return '<p>' + escape(text).replace(/\r?\n/g, '<br>') + '</p>';
    const html = format === 'html' || (format !== 'markdown' && isHtml(text));
    const markup = html ? text : (typeof markdownRenderer === 'function' ? markdownRenderer(text) : escape(text).replace(/\r?\n/g, '<br>'));
    return purifier.sanitize(markup, config);
  }
  global.JournalContent = Object.freeze({render, isHtml});
})(window);
