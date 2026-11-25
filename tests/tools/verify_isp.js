#!/usr/bin/env node
// Focused no-delay OpenRISC execution checks, not an ISP/image emulator. No files written.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const G6=require('../filter-emulator/model.js'),{SHA256}=require('./patch_g6.js');
const rom=fs.readFileSync(path.join(__dirname,'../original/backup1.bin'));
assert.equal(crypto.createHash('sha256').update(rom).digest('hex'),SHA256);
function run(start,setup,{image=rom,hooks={}}={}){
  const r=new Uint32Array(32),mem=new Map(),spr=new Map();let pc=start,flag=false;
  const rb=a=>a>=0x06000000&&a<0x06000000+image.length?image[a-0x06000000]:(mem.get(a>>>0)||0);
  const rw=a=>(rb(a)|(rb(a+1)<<8)|(rb(a+2)<<16)|(rb(a+3)<<24))>>>0;
  const store=(a,v,size=4)=>{for(let i=0;i<size;i++)mem.set((a+i)>>>0,(v>>>(i*8))&255);};
  const compare=(op,a,b)=>{
    switch(op){case 0:return a===b;case 1:return a!==b;case 2:return a>b;case 3:return a>=b;case 4:return a<b;case 5:return a<=b;
      case 10:return (a|0)>(b|0);case 11:return (a|0)>=(b|0);case 12:return (a|0)<(b|0);case 13:return (a|0)<=(b|0);default:throw Error(`Compare ${op}`);}
  };
  r[1]=0x02100000;r[9]=0xFFFFFFFC;setup({r,mem,spr,store});
  for(let n=0;n<25000;n++){
    assert(pc>=0x200&&pc<0x6C000,`PC ${pc.toString(16)}`);
    const w=image.readUInt32LE(pc),op=w>>>26,d=w>>>21&31,a=w>>>16&31,b=w>>>11&31,imm=w<<16>>16,offset=(w<<6>>6)*4;
    const split=((w>>>10)&0xF800)|(w&0x7FF);let next=pc+4;
    switch(op){
      case 0:next=pc+offset;break;
      case 1:{const target=(pc+offset)>>>0;r[9]=pc+4;if(hooks[target])hooks[target]({r,mem,spr,store});else if(target!==0xFA0010B8)next=target;break;} // delay/barrier only
      case 3:if(!flag)next=pc+offset;break;case 4:if(flag)next=pc+offset;break;case 5:break;
      case 6:r[d]=(w&65535)<<16;break;
      case 0x11:if(r[b]===0xFFFFFFFC)return {r,mem,spr,rw,rb,steps:n+1};next=r[b];break;
      case 0x21:r[d]=rw((r[a]+imm)>>>0);break;case 0x23:r[d]=rb((r[a]+imm)>>>0);break;
      case 0x24:r[d]=rb((r[a]+imm)>>>0)<<24>>24;break;
      case 0x25:r[d]=rw((r[a]+imm)>>>0)&65535;break;case 0x26:r[d]=rw((r[a]+imm)>>>0)<<16>>16;break;
      case 0x27:r[d]=r[a]+imm;break;case 0x29:r[d]=r[a]&(w&65535);break;case 0x2A:r[d]=r[a]|(w&65535);break;
      case 0x2B:r[d]=r[a]^(imm>>>0);break;
      case 0x2D:r[d]=spr.get((r[a]|(w&65535))>>>0)||0;break;
      case 0x2E:{const type=w>>>6&3,shift=w&31;assert(type<3);r[d]=type===0?r[a]<<shift:type===1?r[a]>>>shift:r[a]>>shift;break;}
      case 0x2F:flag=compare(d,r[a],imm>>>0);break;
      case 0x30:spr.set((r[a]|split)>>>0,r[b]);break;
      case 0x35:case 0x36:case 0x37:store((r[a]+(split<<16>>16))>>>0,r[b],op===0x35?4:op===0x36?1:2);break;
      case 0x38:{const fn=w&0x7FF;switch(fn){
        case 0:r[d]=r[a]+r[b];break;case 2:r[d]=r[a]-r[b];break;case 3:r[d]=r[a]&r[b];break;case 4:r[d]=r[a]|r[b];break;
        case 5:r[d]=r[a]^r[b];break;case 0x306:r[d]=Math.imul(r[a],r[b]);break;
        case 0x30A:if(!r[b])throw Error('Unsigned division by zero');r[d]=Math.floor(r[a]/r[b]);break;
        default:throw Error(`ALU ${fn.toString(16)}`);}break;}
      case 0x39:flag=compare(d,r[a],r[b]);break;
      default:throw Error(`Opcode ${op.toString(16)} at ${pc.toString(16)}`);
    }r[0]=0;pc=next>>>0;
  }throw Error('Instruction limit');
}
function assertColor(result,words){
  const state=G6.defaults();state.color=words;const bits=G6.registers(state);
  for(const [reg,key] of [[0xB15C,'B15C'],[0xB160,'B160'],[0xB164,'B164']])assert.equal(result.spr.get(reg),Number(bits[key]));
  assert.equal(result.spr.get(0xB0FC)&0x7F800,(words[12]&255)<<11);
  assert.equal((result.spr.get(0xB0FC)&~0x7F800)>>>0,(0xA5A5A5A5&~0x7F800)>>>0);
}
function verify(){
  const base=0x02040000,global=0x0201089C,words=G6.defaults().color.slice();let cases=0;
  words[4]=0x12345678;words[7]=0x89ABCDEF;words[12]=0xFEDCBA98;
  const fixed=run(0x4E1D0,({r,store,spr})=>{r[3]=base;r[4]=base+16;words.forEach((v,i)=>store(base+4*i,v));spr.set(0xB0FC,0xA5A5A5A5);});
  assertColor(fixed,words);cases++;
  for(const mean of [0,5,6,11,12,41,42,128,255]){
    const fixture=words.slice();fixture[13]=0xFFFFFFFF;
    const result=run(0x58184,({store,spr})=>{store(global,base);store(global+32,mean);store(base+0x144,2<<20);fixture.forEach((v,i)=>store(base+0x6B4+4*i,v));spr.set(0xB0FC,0xA5A5A5A5);});
    assertColor(result,G6.adaptiveColor(fixture,mean).scaledWords);cases++;
  }
  const zero=words.slice();zero[21]=0;assert(!G6.adaptiveColor(zero,32).valid);
  assert.throws(()=>run(0x58184,({store})=>{store(global,base);store(base+0x144,2<<20);store(base+0x708,0);}),/division by zero/);cases++;
  for(const raw of [0,16,31,32,48,127,128,255]){
    const s=G6.defaults();s.saturation.fill(raw);
    const result=run(0x4EB74,({r,store})=>{r[3]=base;s.saturation.forEach((v,i)=>store(base+i,v,1));}),bits=G6.registers(s);
    for(const reg of [0xB168,0xB16C,0xB170])assert.equal(result.spr.get(reg),Number(bits[reg.toString(16).toUpperCase()]));cases++;
  }
  for(const [matrix,color,sat] of [[0x91F34,0x9224C,0x9231C],[0x92674,0x9298C,0x92A5C]]){
    const s=G6.defaults(),raw=Array.from({length:12},(_,i)=>rom.readUInt16LE(matrix+2*i));s.matrix=raw.slice(0,9).map(v=>v&1023);s.offsets=raw.slice(9).map(v=>v&127);
    const result=run(0x4D874,({r})=>r[3]=0x06000000+matrix),bits=G6.registers(s);
    for(const reg of [0xB0E4,0xB0E8,0xB0EC,0xB0F0])assert.equal(result.spr.get(reg),Number(bits[reg.toString(16).toUpperCase()]));
    for(let row=0;row<3;row++)assert([255,256].includes(s.matrix.slice(row*3,row*3+3).map(v=>G6.signed(v,10)).reduce((n,v)=>n+v,0)));
    assert.equal(color-0x6B4,sat-0x784);cases++;
  }
  const kernels=[0x7F6A4,0x7F688].map(off=>[...rom.subarray(off,off+25)].map(v=>v&63));
  for(const strength of [0,5,10,20,31,32,255]){
    const args=[40,4,3,15,strength,123],result=run(0x4E2E0,({r,spr})=>{args.forEach((v,i)=>r[3+i]=v);spr.set(0xB100,0xA55AFEDC);}),expected=G6.normalEdge(kernels,args);
    for(const [key,value] of Object.entries(expected.registers)){const reg=key.startsWith('B100')?0xB100:parseInt(key,16);assert.equal(result.spr.get(reg)&(reg===0xB100?65535:0xFFFFFFFF),Number(value));}
    assert.equal(result.spr.get(0xB100)>>>16,0xA55A);
    const changed=run(0x4E2E0,({r,spr})=>{args.forEach((v,i)=>r[3+i]=i===5?255:v);spr.set(0xB100,0xA55AFEDC);});assert.deepEqual(changed.spr,result.spr);cases+=2;
  }
  for(const mode of [1,2])for(const [value,choice] of [[128,1],[128,5],[0,1],[255,5]]){
    const result=run(0x59260,({r,store,spr})=>{r[3]=choice;r[4]=5;r[5]=16;store(global,base);store(0x020075D4,0xFFFFFFFF);store(base+0x3FC,1);store(base+0x6BC,value);store(base+0x144,mode<<20);spr.set(0xB15C,0x80808080);});
    assert.equal(result.rw(base+0x6BC),G6.digitalEv(value,choice));assert.equal(result.spr.get(0xB15C),mode===2?0x80808080:(0x80008080|(G6.digitalEv(value,choice)<<16))>>>0);cases++;
  }
  const tone=run(0x4DD54,({r,store})=>{r[3]=base;for(let i=0;i<256;i++)store(base+i*2,(i*257)&65535,2);});
  for(let i=0;i<256;i++)assert.equal(tone.rw(0x84400+i*2)&65535,(i*257)&65535);cases++;
  console.log(`${cases} original-instruction ISP checks passed: color adaptation, saturation bits, matrix, normal edge, EV and unmasked u16 tone copy.`);
}
if(require.main===module)verify();
module.exports={run,verify};
