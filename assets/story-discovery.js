/* Shared story taxonomy and publication labels. Tags remain independent. */
(function(global){
  'use strict';
  const taxonomy = {
    'Fantasy':['General','High Fantasy','Low Fantasy','Urban Fantasy','Dark Fantasy','Romantic Fantasy','Mythological Fantasy','Historical Fantasy'],
    'Romance':['General','Contemporary Romance','Historical Romance','Paranormal Romance','Romantic Comedy','Slow Burn','Second Chance'],
    'Mystery & Thriller':['General','Detective Mystery','Cozy Mystery','Crime Thriller','Psychological Thriller','Suspense','Political Thriller'],
    'Science Fiction':['General','Space Opera','Cyberpunk','Dystopian','Time Travel','Hard Science Fiction','Post-apocalyptic'],
    'Literary Fiction':['General','Coming of Age','Family Saga','Contemporary Fiction','Experimental Fiction'],
    'Historical':['General','Historical Fiction','Historical Adventure','Alternate History','Historical Mystery'],
    'Horror':['General','Supernatural Horror','Gothic Horror','Psychological Horror','Cosmic Horror','Folk Horror'],
    'Adventure':['General','Action Adventure','Survival','Exploration','Sea Adventure'],
    'Drama':['General','Family Drama','Social Drama','Tragedy','Slice of Life'],
    'Poetry':['General','Narrative Poetry','Epic Poetry','Verse Novel'],
    'Non-fiction':['General','Memoir','Biography','True Crime','Personal Narrative'],
    'Other':['General']
  };
  const statuses={ongoing:'Ongoing',hiatus:'On hiatus',completed:'Completed'};
  const date=value=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'';};
  function label(row){return statuses[row.series_status||row.seriesStatus]||statuses[row.status]||(['published'].includes(row.status)?'Ongoing':'');}
  function dateLabel(row){const complete=(row.series_status||row.seriesStatus||row.status)==='completed';const d=date(complete?(row.completed_at||row.completedAt):(row.last_release_at||row.lastReleaseAt||row.published_at||row.publishedAt));return d?(complete?'Completed ':'Last published ')+d:'';}
  function valid(groups){return Array.isArray(groups)&&groups.length>0&&new Set(groups.map(x=>x.genre)).size===groups.length&&groups.every(g=>taxonomy[g.genre]&&Array.isArray(g.subgenres)&&g.subgenres.length>0&&new Set(g.subgenres).size===g.subgenres.length&&g.subgenres.every(s=>taxonomy[g.genre].includes(s)));}
  function picker(initial=[]){
    const el=document.createElement('div'),groups=structuredClone(initial);if(!groups.length)groups.push({genre:'',subgenres:[]});
    const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
    function render(){
      el.replaceChildren();
      groups.forEach((g,index)=>{
        const box=make('fieldset'),legend=make('legend',index===0?'Primary genre *':'Additional genre '+index),select=make('select');select.className='inp';select.setAttribute('aria-label',index===0?'Primary genre':'Additional genre '+index);
        for(const value of ['',...Object.keys(taxonomy)]){if(value&&value!==g.genre&&groups.some(x=>x.genre===value))continue;const opt=make('option',value||'Choose a genre');opt.value=value;select.append(opt);}select.value=g.genre;
        box.style.cssText='border:1px solid var(--line);border-radius:8px;padding:12px;margin:8px 0;min-width:0';
        const search=make('input');search.className='inp';search.type='search';search.placeholder='Search subgenres';search.setAttribute('aria-label','Search subgenres for '+(g.genre||'this genre'));search.disabled=!g.genre;
        const chips=make('div'),choices=make('div');choices.style.cssText='max-height:150px;overflow:auto;display:flex;flex-direction:column;gap:6px;margin-top:8px';choices.setAttribute('role','group');choices.setAttribute('aria-label','Subgenres');
        function options(){
          chips.replaceChildren();for(const sub of g.subgenres){const b=make('button',sub+' ×');b.type='button';b.className='btn';b.setAttribute('aria-label','Remove '+sub);b.onclick=()=>{g.subgenres=g.subgenres.filter(x=>x!==sub);options();};chips.append(b);}
          choices.replaceChildren();const found=(taxonomy[g.genre]||[]).filter(s=>s.toLowerCase().includes(search.value.trim().toLowerCase()));
          for(const sub of found){const lab=make('label'),input=make('input');input.type='checkbox';input.checked=g.subgenres.includes(sub);input.onchange=()=>{g.subgenres=input.checked?[...new Set([...g.subgenres,sub])]:g.subgenres.filter(x=>x!==sub);options();};lab.append(input,document.createTextNode(' '+sub));choices.append(lab);}if(!found.length&&g.genre)choices.append(make('span','No matching subgenres. Try another search.'));
        }
        select.onchange=()=>{g.genre=select.value;g.subgenres=[];render();};search.oninput=options;
        box.append(legend,select,make('p','Subgenres'+(index===0?' *':'')+' — choose one or more'),chips,search,choices);options();
        if(index){const remove=make('button','Remove genre');remove.type='button';remove.className='btn';remove.onclick=()=>{groups.splice(index,1);render();};box.append(remove);}el.append(box);
      });
      if(groups.length<Object.keys(taxonomy).length){const add=make('button','+ Add genre');add.type='button';add.className='btn';add.onclick=()=>{groups.push({genre:'',subgenres:[]});render();};el.append(add);}
    }
    render();return {el,get value(){return structuredClone(groups.filter(g=>g.genre||g.subgenres.length));}};
  }
  const warnings=['Violence','Strong language','Sexual content','Self-harm','Abuse','Substance use','Death or grief'];
  function detailsHTML(row,escape){
    if(!row)return '';
    const meta=row.reader_metadata||row.readerMetadata||{},facts=[];
    if(row.series_status||row.seriesStatus){facts.push(label(row));const d=dateLabel(row);if(d)facts.push(d);}
    if(meta.language)facts.push(meta.language);
    if(meta.audience)facts.push(({general:'General audience',teen:'Teen audience',mature:'Mature audience'})[meta.audience]||'');
    if(meta.schedule)facts.push('Updates: '+meta.schedule);
    const genres=(Array.isArray(row.genres)?row.genres:[]).filter(g=>g&&typeof g.genre==='string').map(g=>g.genre+' → '+(Array.isArray(g.subgenres)?g.subgenres:[]).join(', '));
    if(genres.length)facts.push(genres.join(' · '));
    if(Array.isArray(meta.warnings)&&meta.warnings.length)facts.push('Content warnings: '+meta.warnings.join(', '));
    return facts.length?'<div class="story-publication-info" style="font-size:13px;line-height:1.6;margin:8px 0">'+facts.filter(Boolean).map(f=>'<div>'+escape(f)+'</div>').join('')+'</div>':'';
  }
  function cardHTML(row,escape){
    if(!row||!(row.series_status||row.seriesStatus))return '';
    return '<div class="story-publication-info" style="font-size:12px;line-height:1.5;margin:6px 0">'+escape(label(row))+(dateLabel(row)?'<br>'+escape(dateLabel(row)):'')+'</div>';
  }
  async function hydrate(client,rows){
    const ids=rows.filter(r=>r.chapter_count!==null&&r.chapter_count!==undefined).map(r=>r.id);
    if(!ids.length)return rows;
    const {data,error}=await client.from('story_works').select('id,genres,series_status,completed_at,last_release_at,reader_metadata').in('id',ids);
    if(error){console.warn('Story details unavailable',error);return rows;}
    const map=new Map((data||[]).map(r=>[r.id,r]));for(const row of rows)row.storyMeta=map.get(row.id)||null;return rows;
  }
  global.JournalStoryDiscovery=Object.freeze({taxonomy,statuses,date,label,dateLabel,valid,picker,warnings,detailsHTML,cardHTML,hydrate});
})(window);
