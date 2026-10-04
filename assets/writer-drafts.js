/* Published work edits are private device drafts. Only explicit publication writes them remotely. */
(function(global){
  'use strict';
  const signature=value=>JSON.stringify(value,(k,v)=>k.startsWith('_')||['updatedAt','lastChapterId'].includes(k)?undefined:v);
  const clone=value=>structuredClone(value),publicStatus=s=>['published','ongoing','completed','hiatus'].includes(s);
  function create({remote,owner,story,isSingle,chapters,preparePublication}){
    let opening;const cached=new Map();
    const key=(kind,id)=>{const user=owner();if(!user)throw Error('Please sign in before saving a device draft.');return user+':'+kind+':'+id;};
    const database=()=>opening||(opening=new Promise((resolve,reject)=>{const request=indexedDB.open('journals-writer-device-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'key'});request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};request.onerror=()=>{opening=null;reject(Error('Device draft storage is unavailable. Your public copy was not changed.'));};}));
    async function access(mode,run){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');let result;try{run(store,value=>result=value);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('Could not save the device draft. Check available browser storage; your public copy was not changed.'));});}
    const drafts={
      async get(kind,id){const k=key(kind,id);return access('readonly',(s,done)=>{const r=s.get(k);r.onsuccess=()=>done(r.result);});},
      async put(kind,id,value){const entry={key:key(kind,id),value:clone(value),revision:crypto.randomUUID(),at:Date.now()};await access('readwrite',s=>s.put(entry));return entry;},
      async remove(kind,id,revision){const k=key(kind,id);return access('readwrite',s=>{const r=s.get(k);r.onsuccess=()=>{if(r.result&&(!revision||r.result.revision===revision))s.delete(k);};});}
    };
    const localMode=s=>!!(s&&(s._hasPublishedCopy||s._deviceDraft));
    const mark=s=>{if(s)s._hasPublishedCopy=publicStatus(s.status)||chapters(s).some(c=>publicStatus(c.status));return s;};
    const api={...remote,drafts,localMode,
      async get(kind,id){
        if(!['stories','chapters'].includes(kind))return remote.get(kind,id);
        const local=await drafts.get(kind,id).catch(()=>null);let saved;try{saved=await remote.get(kind,id);if(saved)cached.set(key(kind,id),clone(saved));else saved=cached.get(key(kind,id));}catch(e){saved=cached.get(key(kind,id));if(!local&&!saved)throw e;}
        if(kind==='stories'){mark(saved);if(local){const value=clone(local.value);value._deviceDraft=true;value._hasPublishedCopy=!!(saved?._hasPublishedCopy||value._hasPublishedCopy);return value;}return saved;}
        if(local){const value=clone(local.value);if(saved)value.published=saved.published;value._deviceDraft=true;return value;}return saved;
      },
      async all(kind){const rows=await remote.all(kind);if(kind!=='stories')return rows;return Promise.all(rows.map(async s=>{mark(s);cached.set(key(kind,s.id),clone(s));const local=await drafts.get(kind,s.id).catch(()=>null);return local?{...clone(local.value),_deviceDraft:true,_hasPublishedCopy:s._hasPublishedCopy||local.value._hasPublishedCopy}:s;}));},
      async put(kind,value){
        const s=kind==='stories'?value:story();
        if(['stories','chapters'].includes(kind)&&localMode(s)){if(kind==='stories'&&cached.has(key(kind,value.id))&&signature(value)===signature(cached.get(key(kind,value.id))))return value;value._deviceDraft=true;await drafts.put(kind,value.id,value);return value;}
        return remote.put(kind,value);
      },
      async del(kind,id){await remote.del(kind,id);if(['stories','chapters'].includes(kind))await drafts.remove(kind,id);},
      async publish(s,ids){
        // Capture before awaiting; edits made during the network request remain device drafts.
        const snapshot=clone(s),storyEntry=await drafts.get('stories',s.id),records=[];
        for(const c of chapters(snapshot)){
          if(!ids.includes(c.id))continue;
          const entry=await drafts.get('chapters',c.id),rec=entry?clone(entry.value):await remote.get('chapters',c.id);
          if(!rec)throw Error('The selected chapter draft is not saved yet.');
          if(ids.includes(c.id)){rec.published={html:rec.html,at:Date.now(),title:c.title};c.status='published';c.publishedAt=rec.published.at;}
          records.push({rec,entry});
        }
        if(chapters(snapshot).some(c=>c.status==='published'))snapshot.status=publicStatus(snapshot.status)?snapshot.status:'published';
        await preparePublication(snapshot);
        if(isSingle(snapshot)){
          const rec=records.find(x=>x.rec.id===ids[0])?.rec;if(!rec?.published)throw Error('The draft is not saved yet.');await remote.publishSingle(snapshot,rec);
        }else{
          await remote.put('stories',snapshot);
          for(const {rec} of records)await remote.put('chapters',rec);
        }
        for(const {rec,entry} of records)if(entry)await drafts.remove('chapters',rec.id,entry.revision);
        if(storyEntry)await drafts.remove('stories',s.id,storyEntry.revision);
        snapshot._hasPublishedCopy=true;delete snapshot._deviceDraft;cached.set(key('stories',s.id),clone(snapshot));
        const remaining=await drafts.get('stories',s.id);return remaining?{...clone(remaining.value),_hasPublishedCopy:true,_deviceDraft:true}:snapshot;
      },
      async unpublish(s,id){
        const published=await remote.get('chapters',id);if(!published)throw Error('Published work not found.');published.published=null;await remote.put('chapters',published);
        const publicStory=await remote.get('stories',s.id);if(publicStory){const c=chapters(publicStory).find(c=>c.id===id);if(c){c.status='draft';c.publishedAt=null;}if(!chapters(publicStory).some(c=>c.status==='published'))publicStory.status='draft';await remote.put('stories',publicStory);}
        const local=await drafts.get('chapters',id);if(local){local.value.published=null;await drafts.put('chapters',id,local.value);}
      }
    };
    return api;
  }
  global.JournalWriterDrafts=Object.freeze({create});
})(window);

