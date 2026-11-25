// Project filter backend for replace_g6.py; standard-library Node only.
'use strict';
const fs=require('fs'),G6=require('../filter-emulator/model.js'),{cycle}=require('./patch_g6.js');
function compile(source,directory){
  const data=Buffer.from(source),start=0xF1200,ROM=0x06000000;let next=start;
  const allocate=bytes=>{next=(next+3)&~3;const offset=next;next+=bytes.length;if(next>0xFFFFF)throw Error('Custom filter storage exceeds image.');if(!source.subarray(offset,next).every(v=>v===255))throw Error('Custom filter storage is occupied.');bytes.copy(data,offset);return offset;};
  const names=fs.readdirSync(directory).filter(n=>/\.json$/i.test(n)).sort();
  if(!names.length||names.length>7)throw Error('Use 1..7 filter JSON files in this project.');
  const filters=names.map((name,i)=>({name,id:0x20+i,state:G6.validate(JSON.parse(fs.readFileSync(require('path').join(directory,name),'utf8')))}));
  const stub=allocate(Buffer.alloc(256)),descriptors=allocate(Buffer.alloc(filters.length*16));
  const record=(values,size)=>{const b=Buffer.alloc(values.length*size);values.forEach((v,i)=>b.writeUIntLE(v,i*size,size));return ROM+allocate(b);};
  for(const [i,f]of filters.entries()){
    const s=f.state;if(s.enabled.tone||s.enabled.edge)throw Error(`${f.name}: custom tone/edge compilation is not supported yet.`);
    const enc=G6.records(s);
    for(const [key,table]of[['matrix',0x81404],['saturation',0x814B4],['color',0x81564]])data.writeUInt32LE(s.enabled[key]?ROM+allocate(Buffer.from(enc[key],'hex')):0,table+4*(f.id-1));
    data[0x813D8+f.id-1]=0;
    if(s.enabled.lut)s.lut.forEach((a,c)=>data.writeUInt32LE(record(a,1),descriptors+i*16+c*4));
  }
  // Hook only LUT dispatch. Normal and non-project IDs return to the original branch.
  const words=[],labels={},fixups=[];
  const emit=w=>words.push(w>>>0),imm=(op,d,a,v)=>emit((op<<26)|(d<<21)|(a<<16)|(v&65535));
  const jump=(op,target)=>{fixups.push([words.length,op,target]);emit(0);};
  const load=(r,value)=>{imm(6,r,0,value>>>16);imm(0x2A,r,r,value);};
  const alu=(d,a,b,fn)=>emit((0x38<<26)|(d<<21)|(a<<16)|(b<<11)|fn);
  imm(0x27,3,24,-0x20);imm(0x2F,2,3,filters.length-1);jump(4,'fallback');
  imm(0x2E,3,3,4);load(8,ROM+descriptors);alu(8,8,3,0);
  imm(0x21,3,8,0);imm(0x2F,0,3,0);jump(4,'fallback');imm(0x21,4,8,4);imm(0x21,5,8,8);
  load(7,0x0201089C);imm(0x21,7,7,0);imm(0x21,6,7,0x144);load(8,0xFFFCFFFF);alu(6,6,8,3);load(8,0x10000);alu(6,6,8,4);
  emit((0x35<<26)|(7<<16)|(6<<11)|0x144);jump(1,0x4DDC8);jump(0,0x59778);
  labels.fallback=stub+words.length*4;imm(0x27,3,24,-2);jump(0,0x59630);
  for(const [i,op,target]of fixups){const address=typeof target==='string'?labels[target]:target;words[i]=((op<<26)|(((address-stub-i*4)/4)&0x3FFFFFF))>>>0;}
  if(words.length*4>256)throw Error('Dispatch stub exceeds reserved space.');words.forEach((w,i)=>data.writeUInt32LE(w,stub+i*4));
  if(source.readUInt32LE(0x5962C)!==0x9C78FFFE)throw Error('Original LUT dispatch differs.');
  data.writeUInt32LE(((stub-0x5962C)/4)&0x3FFFFFF,0x5962C);
  for(const p of cycle(source,filters.map(f=>f.id)))p.data.copy(data,p.offset);
  return {data,filters:filters.map(({name,id,state})=>({file:name,id,name:state.name,enabled:state.enabled})),storage:{start,end:next,stub,descriptors}};
}
if(require.main===module){const [input,directory,output]=process.argv.slice(2);const result=compile(fs.readFileSync(input),directory);fs.writeFileSync(output,result.data);console.log(JSON.stringify({filters:result.filters,storage:result.storage}));}
module.exports={compile};
