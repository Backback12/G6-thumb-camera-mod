// Browser-picked folders only; no server filesystem endpoints or dependencies.
'use strict';
(function(root){
  const model=typeof module!=='undefined'&&module.exports?require('./model.js'):root.G6;
  async function read(file){
    if(file.size>100000)throw Error('Filter exceeds 100 KB.');
    const text=await file.text();return {state:model.validate(JSON.parse(text)),text};
  }
  async function scan(directory){
    const entries=[];
    for await(const handle of directory.values())if(handle.kind==='file'&&/\.json$/i.test(handle.name))entries.push({name:handle.name,handle});
    return entries.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  }
  function filename(name){
    const value=name.trim();
    if(!value||value.length>200||/[<>:"/\\|?*\x00-\x1F]/.test(value)||/[. ]$/.test(value))throw Error('Use a plain filename, without folders or special characters.');
    return /\.json$/i.test(value)?value:value+'.json';
  }
  async function write(handle,config,expected){
    model.validate(config);const text=JSON.stringify(config,null,2)+'\n';
    if(expected!==undefined&&await(await handle.getFile()).text()!==expected)throw Error('File changed on disk. Reload it or use Save As.');
    const writer=await handle.createWritable();
    try{await writer.write(text);await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}
    return text;
  }
  function mount({getConfig,applyConfig,status}){
    const $=id=>document.getElementById(id),list=$('filter-files');
    let directory=null,entries=[],active=null,snapshot='',saved='',version=0,busy=false,suggested='';
    const fingerprint=config=>JSON.stringify(model.compact(model.validate(config)));
    const dirty=()=>!!active&&fingerprint(getConfig())!==saved;
    const suggest=()=>((getConfig().name||'filter').replace(/[^a-z0-9_-]/gi,'_')||'filter')+'.json';
    const propose=(value=suggest())=>{$('filter-filename').value=suggested=value;};
    function update(){
      if(!active&&$('filter-filename').value===suggested)propose();
      $('folder-save').disabled=busy||!active?.handle||!dirty();$('folder-save-as').disabled=busy||!directory;
      $('folder-open').disabled=$('folder-refresh').disabled=list.disabled=busy;
      $('folder-refresh').disabled=busy||(!directory&&!entries.length);
      $('filter-file-status').textContent=active?`${active.name}${dirty()?' — unsaved changes':''}`:'No folder file selected';
    }
    function render(){
      const query=$('filter-search').value.toLowerCase();list.replaceChildren();
      for(const entry of entries)if(entry.name.toLowerCase().includes(query))list.add(new Option(entry.name,entry.name));
      if(directory)$('folder-status').textContent=`${directory.name||'Selected folder'} · ${entries.length} JSON files (this folder only)`;
      list.value=active?.name||'';update();
    }
    function detach(){
      if(dirty()&&!confirm('Discard unsaved changes to this filter?'))return false;
      version++;active=null;saved='';list.value='';propose();update();return true;
    }
    async function refresh(){
      if(!directory)return $('folder-fallback').click();
      const found=await scan(directory);entries=found;render();
    }
    $('folder-open').onclick=async()=>{
      if(!window.showDirectoryPicker)return $('folder-fallback').click();
      try{const chosen=await window.showDirectoryPicker({mode:'readwrite'});version++;directory=chosen;active=null;saved='';$('filter-search').value='';propose();await refresh();}
      catch(e){if(e.name!=='AbortError')status(`Folder: ${e.message}`);}
    };
    $('folder-refresh').onclick=()=>refresh().catch(e=>status(`Folder: ${e.message}`));
    $('folder-fallback').onchange=()=>{
      const files=[...$('folder-fallback').files];if(!files.length)return;
      version++;directory=null;active=null;saved='';
      entries=files.filter(f=>/\.json$/i.test(f.name)&&f.webkitRelativePath.split('/').length===2).map(file=>({name:file.name,file})).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
      $('filter-search').value='';propose();$('folder-status').textContent=`${files[0].webkitRelativePath.split('/')[0]} · ${entries.length} JSON files · read only; use Save JSON to download`;
      render();$('folder-fallback').value='';
    };
    list.onchange=async()=>{
      const entry=entries.find(e=>e.name===list.value);if(!entry)return;
      if(dirty()&&!confirm('Discard unsaved changes to this filter?')){list.value=active.name;return;}
      const token=++version;
      try{const parsed=await read(entry.handle?await entry.handle.getFile():entry.file);if(token!==version)return;
        active=entry;snapshot=parsed.text;saved=fingerprint(parsed.state);applyConfig(parsed.state);
        propose(entry.name.replace(/\.json$/i,'')+'-copy.json');update();status(`${entry.name} loaded.`);
      }catch(e){if(token===version){list.value=active?.name||'';status(`${entry.name}: ${e.message}`);}}
    };
    $('filter-search').oninput=render;
    async function save(asNew){
      let target=active;const config=getConfig(),mark=fingerprint(config);version++;busy=true;update();
      try{
        if(asNew){
          const name=filename($('filter-filename').value);
          if(entries.some(e=>e.name.toLowerCase()===name.toLowerCase()))throw Error('That filename exists. Choose a new name, or select it and use Save.');
          let exists=false;try{await directory.getFileHandle(name);exists=true;}catch(e){if(e.name!=='NotFoundError')throw e;}
          if(exists)throw Error('That filename exists. Choose a new name.');
          target={name,handle:await directory.getFileHandle(name,{create:true})};
        }
        if(!target?.handle)throw Error('Select a writable folder file first.');
        const text=await write(target.handle,config,asNew?undefined:snapshot);
        active=target;snapshot=text;saved=mark;
        if(asNew){entries.push(target);propose(target.name.replace(/\.json$/i,'')+'-copy.json');}entries.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
        render();status(`${target.name} saved.`);
      }catch(e){status(`Save: ${e.message}`);}finally{busy=false;update();}
    }
    $('folder-save').onclick=()=>save(false);$('folder-save-as').onclick=()=>save(true);
    window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
    propose();update();return {update,detach};
  }
  const api={read,scan,filename,write,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.G6Files=api;
})(globalThis);
