// Project filters with transient, checked heap LUT storage; no boot/update/tail edits.
'use strict';
const fs=require('fs'),path=require('path'),G6=require('../filter-emulator/model.js'),{cycle}=require('./patch_g6.js');
const WAV_OFFSET=0xA16CE,WAV_CAPACITY=70104;
function compile(source,directory,{files}={}){
  if(source.length!==0x100000)throw Error('Expected a full original media image.');
  const data=Buffer.from(source),ROM=0x06000000,patches=[],manifest=path.join(directory,'../project.json');
  const names=files||(fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest)).filters:fs.readdirSync(directory).filter(n=>/\.json$/i.test(n)).sort());
  if(!Array.isArray(names)||!names.length||names.length>7||new Set(names).size!==names.length||!names.every(n=>typeof n==='string'&&path.basename(n)===n&&/\.json$/i.test(n)))throw Error('Use 1..7 distinct filter filenames.');
  const filters=names.map((file,i)=>({file,id:0x20+i,state:G6.validate(JSON.parse(fs.readFileSync(path.join(directory,file),'utf8')))}));
  const patch=(offset,bytes,note)=>{const b=Buffer.from(bytes);if(offset<0x200||offset+b.length>0xF1200||patches.some(p=>offset<p.offset+p.length&&offset+b.length>p.offset))throw Error('Unsafe/overlapping project patch.');b.copy(data,offset);patches.push({offset,length:b.length,note});};
  const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
  let next=0x81614;
  const record=(bytes,note)=>{next=(next+3)&~3;if(next+bytes.length>0x81774)throw Error('Parameters exceed existing inactive slots.');const off=next;patch(off,bytes,note);next+=bytes.length;return off;};
  let bank=Buffer.alloc(0);const offsets=[];
  for(const f of filters){
    if(f.state.enabled.tone||f.state.enabled.edge)throw Error(`${f.file}: tone/edge compilation is unsupported.`);
    if(f.state.enabled.lut){offsets.push(bank.length);bank=Buffer.concat([bank,...f.state.lut.map(a=>Buffer.from(a))]);}else offsets.push(0xFFFFFFFF);
  }
  const descriptors=record(Buffer.concat(offsets.map(u32)),'per-filter LUT offsets');
  for(const f of filters){const enc=G6.records(f.state);for(const [key,table]of[['matrix',0x81404],['saturation',0x814B4],['color',0x81564]])patch(table+4*(f.id-1),u32(f.state.enabled[key]?ROM+record(Buffer.from(enc[key],'hex'),`${f.file} ${key}`):0),`${key} pointer`);patch(0x813D8+f.id-1,[0],'baseline edge');}
  // Reuse capacity beyond a shortened PCM WAV, never the trailing FF region.
  if(source.subarray(WAV_OFFSET,WAV_OFFSET+4).toString()!=='RIFF'||source.subarray(WAV_OFFSET+8,WAV_OFFSET+12).toString()!=='WAVE')throw Error('LUT storage requires the shortened project WAV.');
  const riffEnd=WAV_OFFSET+source.readUInt32LE(WAV_OFFSET+4)+8;
  let pcmEnd=0;
  for(let p=WAV_OFFSET+12;p+8<=riffEnd;){const size=source.readUInt32LE(p+4);if(p+8+size>riffEnd)throw Error('Invalid WAV chunk.');if(source.subarray(p,p+4).toString()==='data')pcmEnd=p+8+size;p+=8+size+(size&1);}
  const bankOffset=(riffEnd+63)&~63;
  if(!pcmEnd||riffEnd>WAV_OFFSET+WAV_CAPACITY||bankOffset+bank.length>WAV_OFFSET+WAV_CAPACITY)throw Error('Shortened WAV has insufficient unused capacity for all LUTs.');
  if(bank.length)patch(bankOffset,bank,'LUT source bank after declared WAV end');
  // Replace the existing LUT switch IN PLACE. Original Normal fallback remains at 5973C.
  const start=0x5962C,end=0x5973C,words=[],fixups=[],labels={};
  const emit=w=>words.push(w>>>0),imm=(op,d,a,v)=>emit((op<<26)|(d<<21)|(a<<16)|(v&65535));
  const jump=(op,target)=>{fixups.push([words.length,op,target]);emit(0);};
  const load=(r,v)=>{imm(6,r,0,v>>>16);imm(0x2A,r,r,v);};
  const alu=(d,a,b,fn)=>emit((0x38<<26)|(d<<21)|(a<<16)|(b<<11)|fn);
  const sf=(op,a,b)=>emit((0x39<<26)|(op<<21)|(a<<16)|(b<<11));
  const sw=(a,b,v)=>emit((0x35<<26)|((v&0xF800)<<10)|(a<<16)|(b<<11)|(v&0x7FF));
  load(7,0x0201089C);imm(0x27,3,24,-0x20);imm(0x2F,2,3,filters.length-1);jump(4,0x5973C);
  imm(0x2E,3,3,2);load(8,ROM+descriptors);alu(8,8,3,0);imm(0x21,3,8,0);imm(0x2F,0,3,-1);jump(4,0x5973C);
  imm(0x27,1,1,-16);sw(1,3,0);imm(0x27,3,0,bank.length);jump(1,0x26760);
  imm(0x2F,0,11,0);jump(4,'fail');sw(1,11,8);
  load(4,0x02000000);sf(4,11,4);jump(4,'release');load(4,0x02200000-bank.length);sf(2,11,4);jump(4,'release');
  load(3,bankOffset);imm(0x2A,4,11,0);imm(0x27,5,0,bank.length);jump(1,0xFC000C08);
  imm(0x21,6,1,0);imm(0x21,3,1,8);alu(3,3,6,0);imm(0x27,4,3,256);imm(0x27,5,3,512);jump(1,0x4DDC8);
  imm(0x21,3,1,8);jump(1,0x2695C);imm(0x27,1,1,16);imm(0x27,2,0,0);
  load(7,0x0201089C);imm(0x21,7,7,0);imm(0x21,6,7,0x144);load(8,0xFFFCFFFF);alu(6,6,8,3);load(8,0x10000);alu(6,6,8,4);sw(7,6,0x144);jump(0,0x59778);
  labels.release=start+words.length*4;imm(0x21,3,1,8);jump(1,0x2695C);
  labels.fail=start+words.length*4;imm(0x27,1,1,16);imm(0x27,2,0,0);load(7,0x0201089C);jump(0,0x5973C);
  for(const [i,op,target]of fixups){const address=typeof target==='string'?labels[target]:target;words[i]=((op<<26)|(((address-start-i*4)/4)&0x3FFFFFF))>>>0;}
  if(words.length*4>end-start)throw Error(`In-place dispatch exceeds existing switch (${words.length*4} > ${end-start}).`);
  if(source.readUInt32LE(start)!==0x9C78FFFE||source.readUInt32LE(end)!==0x84A70000)throw Error('Original switch differs.');
  const code=Buffer.alloc(end-start);for(let i=0;i<code.length;i+=4)code.writeUInt32LE(0x15000000,i);words.forEach((w,i)=>code.writeUInt32LE(w,i*4));patch(start,code,'in-place checked allocation/LUT upload/free');
  for(const p of cycle(source,filters.map(f=>f.id)))patch(p.offset,p.data,p.note);
  if(!data.subarray(0x200,0xA600).equals(source.subarray(0x200,0xA600))||!data.subarray(0xF1200).equals(source.subarray(0xF1200)))throw Error('Boot/update or trailing region changed.');
  return {data,filters:filters.map(f=>({file:f.file,id:f.id,name:f.state.name,enabled:f.state.enabled})),storage:{strategy:'transient-heap',bankOffset,bankBytes:bank.length,channelTables:bank.length/256,recordsStart:0x81614,recordsEnd:next,codeStart:start,codeEnd:end,codeBytes:words.length*4,wavOffset:WAV_OFFSET,wavRiffEnd:riffEnd,wavPcmEnd:pcmEnd,wavCapacityEnd:WAV_OFFSET+WAV_CAPACITY},patches};
}
if(require.main===module){const [input,directory,output]=process.argv.slice(2);const result=compile(fs.readFileSync(input),directory);fs.writeFileSync(output,result.data);console.log(JSON.stringify({filters:result.filters,storage:result.storage,patches:result.patches}));}
module.exports={compile};
