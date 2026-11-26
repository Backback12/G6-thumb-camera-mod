'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {compile}=require('./compile_filters'),{run}=require('./verify_isp'),G6=require('../filter-emulator/model');
const original=fs.readFileSync(path.join(__dirname,'../original/backup1.bin'));
function fixture(work){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g6-compile-')),states=[],source=Buffer.from(original);
  source.writeUInt32LE(164,0xA16CE+4);source.writeUInt32LE(128,0xA16CE+40); // 44-byte PCM header + 128 sample bytes
  try{for(let i=0;i<7;i++){const s=G6.defaults();s.name=`Filter ${i}`;s.enabled.matrix=i%2===0;s.enabled.saturation=i===2;s.enabled.color=i===3;s.enabled.lut=i!==5;s.color[4]=i;s.saturation.fill(16+i);s.lut=s.lut.map((a,c)=>a.map(v=>(v+i*37+c*13)&255));states.push(s);fs.writeFileSync(path.join(dir,`${i}.json`),JSON.stringify(s));}return work({dir,source,states,...compile(source,dir)});}finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
}
function machine(image,{freeSize=0x20000,freeChunks=1,block=0x02040000,otherAddress=0x02030000}={}){
  const memory=new Map(),registers=new Map(),base=0x02007BFC,used=0x02020000,free=used+32,spare=used+0x400;
  const store=(a,v,n=4)=>{for(let i=0;i<n;i++)memory.set(a+i,v>>>(i*8)&255);};
  const word=a=>((memory.get(a)||0)|((memory.get(a+1)||0)<<8)|((memory.get(a+2)||0)<<16)|((memory.get(a+3)||0)<<24))>>>0;
  store(0x0200A380,used);store(0x0200A384,free);store(0x0200A37C,spare);
  store(0x1238,1,1);store(0x123A,255,1);
  store(used,1);store(used+4,otherAddress);store(used+8,4096);
  for(let i=0;i<freeChunks;i++){const n=free+i*32;store(n+4,block+i*0x4000);store(n+8,freeSize);store(n+12,i?n-32:0);store(n+16,i+1<freeChunks?n+32:0);}
  for(let i=0;i<4096;i++)store(otherAddress+i,0xA5,1);
  let loads=0;
  const hookRead=({r,store:put})=>{if(r[5]===4608){loads++;assert.equal(word(word(0x0200A380)),1);assert.equal(word(word(0x0200A380)+4),r[4]);assert(word(word(0x0200A380)+8)>=r[5]);}
    for(let i=0;i<r[5];i++)put(r[4]+i,image[r[3]+i],1);for(let i=3;i<=8;i++)r[i]=0xDEADBEEF;r[11]=0xBADF00D;
  };
  // Original boot LUT initializer; no custom startup hooks or fixed-bank expansion.
  run(0x168BC,()=>{},{image,memory,registers,hooks:{[0xFC000C08]:hookRead}});
  const hooks={ [0xFA000A7C]:({r})=>r[11]=0,[0xFA000AB4]:()=>{},[0xFC000C08]:hookRead,[0xFA000EC8]:({r,rb,store:put})=>{for(let i=0;i<r[5];i++)put(r[3]+i,rb(r[4]+i),1);} };
  const apply=id=>run(0x59478,({r,store:put,spr})=>{r[3]=id;put(0x0201089C,base);spr.set(0xB008,0);},{image,memory,registers,hooks});
  const checkHeap=()=>{assert.equal(word(0x0200A380),used);assert.equal(word(used),1);assert.equal(word(used+4),otherAddress);assert.equal(word(used+8),4096);for(let i=0;i<4096;i++)assert.equal(memory.get(otherAddress+i),0xA5);const blocks=[];for(let n=word(0x0200A384);n;n=word(n+16)){assert(blocks.length<freeChunks);blocks.push([word(n+4),word(n+8)]);}assert.deepEqual(blocks.sort((a,b)=>a[0]-b[0]),Array.from({length:freeChunks},(_,i)=>[block+i*0x4000,freeSize]));};
  return {apply,checkHeap,get loads(){return loads;},word};
}
test('all 18 LUTs: actual malloc/free, full ISP writers, persistent heap and unrelated allocation',()=>fixture(({data:image,states,filters,storage})=>{
  assert.equal(storage.channelTables,18);assert.equal(storage.bankBytes,4608);assert(storage.codeBytes<=272);
  const m=machine(image);let expectedLoads=0;
  for(let round=0;round<5;round++)for(const i of [-1,0,1,2,3,4,5,6,5,4,3,2,1,0,-1]){
    const result=m.apply(i<0?0:filters[i].id);if(i>=0&&states[i].enabled.lut)expectedLoads++;
    for(let c=0;c<3;c++)assert.deepEqual(Array.from({length:256},(_,n)=>result.rb(0x84600+c*512+n)),i>=0&&states[i].enabled.lut?states[i].lut[c]:Array.from({length:256},(_,n)=>n));
    m.checkHeap();
  }
  assert.equal(m.loads,expectedLoads); // no leaked bank or persistent pointer needing reset
  for(let i=-1;i<7;i++)for(const direction of [0,1,2]){let selected;const expected=direction===0?-1:direction===1?(i===6?-1:i+1):(i===-1?6:i-1);const result=run(0x398E4,({r,store})=>{r[3]=direction;store(0x02012508,i);},{image,hooks:{[0xA9D8]:({r})=>selected=r[5]}});assert.equal(result.rw(0x02012508)|0,expected);assert.equal(selected,expected<0?0:filters[expected].id);}
}));
test('Normal, matrix-only and cached selections skip heap LUT loading',()=>fixture(({data:image,filters})=>{
  const m=machine(image);m.apply(0);m.apply(filters[5].id);assert.equal(m.loads,0);m.apply(filters[0].id);assert.equal(m.loads,1);for(let i=0;i<4;i++)m.apply(filters[0].id);assert.equal(m.loads,1);m.checkHeap();
}));
test('insufficient/fragmented heap returns to stock LUT without overwriting other memory',()=>fixture(({data:image,filters})=>{
  const m=machine(image,{freeSize:1024,freeChunks:8}),result=m.apply(filters[0].id);assert.equal(m.loads,0);m.checkHeap();
  for(let c=0;c<3;c++)assert.deepEqual(Array.from({length:256},(_,n)=>result.rb(0x84600+c*512+n)),Array.from({length:256},(_,n)=>n));
}));
test('rejects an allocation outside configured main RAM before copying',()=>fixture(({data:image,filters})=>{
  const m=machine(image,{block:0x02300000});m.apply(filters[0].id);assert.equal(m.loads,0);m.checkHeap();
}));
test('in-place change allowlist, unchanged boot/updater/library/tail, bounded existing WAV capacity',()=>fixture(({data:image,source,storage,patches})=>{
  assert(image.subarray(0,0xA600).equals(source.subarray(0,0xA600)));
  assert(image.subarray(0xF1200).equals(source.subarray(0xF1200)));
  assert(image.subarray(0x8DD20,0x8E620).equals(source.subarray(0x8DD20,0x8E620)));
  assert(image.subarray(storage.wavOffset,storage.wavRiffEnd).equals(source.subarray(storage.wavOffset,storage.wavRiffEnd)));
  assert(storage.bankOffset>=storage.wavRiffEnd&&storage.bankOffset+storage.bankBytes<=storage.wavCapacityEnd);
  const allowed=[[0x5962C,0x5973C],[0x39940,0x39944],[0x39968,0x3996C],[0x7C504,0x7C51E],[0x813D8,0x81774],[storage.bankOffset,storage.bankOffset+4608]];
  for(let i=0;i<image.length;i++)if(image[i]!==source[i])assert(allowed.some(([lo,hi])=>i>=lo&&i<hi),`Unexpected patch ${i.toString(16)}`);
  assert(patches.every(p=>p.offset>=0xA600&&p.offset+p.length<=0xF1200));
}));
test('rejects original-length WAV instead of allocating source tables in trailing FF',()=>fixture(({dir})=>assert.throws(()=>compile(original,dir),/insufficient unused capacity/)));
test('v0.1 executable appendage is rejected by the instruction-region policy',()=>{
  const image=Buffer.from(original);image.writeUInt32LE(((0xF1200-0x5962C)/4)&0x3FFFFFF,0x5962C);
  assert.throws(()=>run(0x5962C,()=>{},{image}),/outside original application region/);
});
