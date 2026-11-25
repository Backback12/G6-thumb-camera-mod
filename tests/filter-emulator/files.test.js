'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Files=require('./files.js'),G6=require('./model.js');
const file=text=>({size:Buffer.byteLength(text),text:async()=>text});
test('folder scan lists only top-level JSON files, sorted naturally',async()=>{
  const directory={async *values(){yield {kind:'file',name:'filter10.json'};yield {kind:'directory',name:'nested'};yield {kind:'file',name:'filter2.JSON'};yield {kind:'file',name:'image.png'};}};
  assert.deepEqual((await Files.scan(directory)).map(e=>e.name),['filter2.JSON','filter10.json']);
});
test('both filter formats load without losing raw bits; malformed or oversized files fail',async()=>{
  const s=G6.defaults();s.color[4]=0xFEDCBA98;s.saturation.fill(48);
  for(const config of [s,G6.compact(s)])assert.deepEqual((await Files.read(file(JSON.stringify(config)))).state,s);
  await assert.rejects(()=>Files.read(file('{broken')),SyntaxError);
  await assert.rejects(()=>Files.read(file('{"schema":"other"}')),/g6-filter-v1/);
  await assert.rejects(()=>Files.read(file(' '.repeat(100001))),/100 KB/);
});
test('filenames cannot redirect folder writes',()=>{
  assert.equal(Files.filename(' Warm 1 '),'Warm 1.json');assert.equal(Files.filename('warm.JSON'),'warm.JSON');
  for(const s of ['','../warm.json','C:\\filters\\warm.json','sub/filter.json','warm?','.'])assert.throws(()=>Files.filename(s),/filename/);
});
test('save validates before writing and refuses external changes',async()=>{
  let content='original',opened=0;const handle={getFile:async()=>file(content),createWritable:async()=>{opened++;let pending;return {write:async t=>pending=t,close:async()=>content=pending,abort:async()=>{}};}};
  const s=G6.defaults();s.color[4]=0xFEDCBA98;s.tone[0]=65535;
  const saved=await Files.write(handle,s,'original');assert.equal(content,saved);assert.deepEqual(G6.validate(JSON.parse(content)),s);
  content='external edit';await assert.rejects(()=>Files.write(handle,s,saved),/changed on disk/);assert.equal(content,'external edit');assert.equal(opened,1);
  await assert.rejects(()=>Files.write(handle,{schema:'bad'}),/g6-filter-v1/);assert.equal(opened,1);
});
test('failed writes abort without claiming a successful commit',async()=>{
  let aborted=false;const handle={createWritable:async()=>({write:async()=>{throw Error('disk full');},abort:async()=>aborted=true})};
  await assert.rejects(()=>Files.write(handle,G6.defaults()),/disk full/);assert(aborted);
});
