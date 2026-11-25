'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),G6=require('./model.js');
const rgb=(s,...values)=>[...G6.process(new Uint8ClampedArray([...values,255]),1,1,s)].slice(0,3);
test('disabled stages preserve pixels and alpha',()=>{
  const input=new Uint8ClampedArray([7,31,254,19,0,99,32,0]);
  assert.deepEqual(G6.process(input,2,1,G6.defaults()),input);
});
test('RGB swap and signed boundary match controlled hardware direction',()=>{
  const s=G6.defaults();s.enabled.matrix=true;s.matrix=[0,0,256,0,256,0,256,0,0];
  assert.deepEqual(rgb(s,200,40,10),[10,40,200]);
  s.matrix=[511,0,0,0,256,0,0,0,256];assert.deepEqual(rgb(s,100,60,30),[200,60,30]);
  s.matrix[0]=512;assert.deepEqual(rgb(s,100,60,30),[0,60,30]);
  s.matrix[0]=1023;assert.deepEqual(rgb(s,100,60,30),[0,60,30]);
});
test('zero saturation removes color; uniform unity preserves input',()=>{
  const s=G6.defaults();s.enabled.saturation=true;s.saturation.fill(0);
  assert.deepEqual(rgb(s,255,0,0),[76,76,76]);
  s.saturation.fill(16);assert.deepEqual(rgb(s,170,35,80),[170,35,80]);
});
test('posterization boundaries have exactly four source levels',()=>{
  const s=G6.defaults();s.enabled.lut=true;s.lut=s.lut.map(a=>a.map(v=>85*Math.floor(v/64)));
  for(const [v,expected] of [[0,0],[63,0],[64,85],[127,85],[128,170],[191,170],[192,255],[255,255]])
    assert.deepEqual(rgb(s,v,v,v),Array(3).fill(expected));
});
test('unknown words and offsets remain unmodeled by default',()=>{
  const s=G6.defaults();s.enabled.color=true;s.color[1]=0;s.color[3]=255;s.color[8]=250;
  assert.deepEqual(rgb(s,90,120,180),[90,120,180]);
  s.enabled.matrix=true;s.offsets=[64,64,64];assert.deepEqual(rgb(s,90,120,180),[90,120,180]);
});
test('explicit preview hypotheses can be enabled without changing raw values',()=>{
  const s=G6.defaults();s.enabled.matrix=true;s.offsets=[64,0,0];s.preview.offsets='signed';
  assert.deepEqual(rgb(s,90,120,180),[26,120,180]);
  s.enabled.matrix=false;s.enabled.color=true;s.color[3]=0;s.preview.colorUnknown=true;
  assert.notDeepEqual(rgb(s,255,0,0),[255,0,0]);assert.equal(s.color[3],0);
});
test('generic center kernel preserves colors and alpha',()=>{
  const s=G6.defaults();s.enabled.edge=true;s.kernels[0][12]=1;s.preview.kernelBias=0;
  assert.deepEqual(rgb(s,90,120,180),[90,120,180]);
});
test('JSON round-trip and LE records retain raw values',()=>{
  const s=G6.defaults();s.color[4]=0x12345678;s.matrix[0]=1023;
  const loaded=G6.validate(JSON.parse(JSON.stringify({...s,record_hex:G6.records(s)})));
  assert.deepEqual(loaded,s);const records=G6.records(s);
  assert.equal(records.matrix.slice(0,4),'ff03');assert.equal(records.color.slice(32,40),'78563412');
  assert.equal(records.matrix.length,48);assert.equal(records.color.length,176);assert.equal(records.tone.length,1024);
});
test('malformed imports cannot supply invalid fields or pipeline names',()=>{
  const s=G6.defaults();s.matrix[0]=NaN;assert.throws(()=>G6.validate(s),/matrix/);
  const a=G6.defaults();a.preview.order[0]='__proto__';assert.throws(()=>G6.validate(a),/Stage order/);
  const b=G6.defaults();b.saturation.pop();assert.throws(()=>G6.validate(b),/saturation/);
});
test('raw saturation high bits are preserved but not sent to five-bit fields',()=>{
  const s=G6.defaults();s.enabled.saturation=true;s.saturation.fill(16);const expected=rgb(s,170,35,80),bits=G6.registers(s);
  assert.equal(bits.B168,'0x21084210');assert.equal(bits.B170,'0x01084210');
  s.saturation.fill(48);assert.deepEqual(rgb(s,170,35,80),expected);assert.deepEqual(G6.registers(s),bits);
  assert.equal(G6.records(s).saturation,'30'.repeat(17));assert.equal(G6.validate(s).saturation[0],48);
  s.saturation.fill(32);assert.deepEqual(rgb(s,255,0,0),[76,76,76]);assert.equal(G6.registers(s).B168,'0x00000000');
});
test('compact chat config round-trips changed raw groups and assumptions',()=>{
  const s=G6.defaults();s.name='Primary bands';s.enabled.color=true;s.color[1]=64;s.preview.colorUnknown=true;
  const small=G6.compact(s);assert.equal(small.base,'editor-neutral-v1');assert(!Object.hasOwn(small.changes,'lut'));
  assert.deepEqual(G6.validate(JSON.parse(JSON.stringify(small))),s);
  small.base='factory';assert.throws(()=>G6.validate(small),/compact config/);
});
test('known register packing keeps low fields separate from full raw words',()=>{
  const s=G6.defaults();s.color[0]=0x123400FF;s.color[1]=64;s.color[2]=200;s.color[3]=0;
  assert.equal(G6.registers(s).B15C,'0xffc84000');assert.equal(G6.records(s).color.slice(0,8),'ff003412');
  assert.equal(G6.registers(s).B0E4,'0x00000100');assert.equal(G6.registers(s)['B100[15:0]'],'0x020f');
});
test('illustrative hue direction agrees with intermediate hardware color descriptions',()=>{
  const s=G6.defaults();s.enabled.color=true;s.preview.colorUnknown=true;s.color[3]=64;
  const green=rgb(s,0,255,0);assert(green[2]>green[0]&&green[2]>green[1]);
  s.color[3]=192;const red=rgb(s,255,0,0);assert(red[0]>red[1]&&red[2]>red[1]);
});
test('adaptive color uses one histogram bucket for all nine words and wraps, without clamping',()=>{
  const w=G6.defaults().color;w[21]=6;w[13]=8;w[14]=32;w[20]=16;
  const low=G6.adaptiveColor(w,5),next=G6.adaptiveColor(w,6),high=G6.adaptiveColor(w,255);
  assert.equal(low.bucket,0);assert.deepEqual(low.bytes.slice(4),Array(9).fill(32));
  assert.equal(next.bucket,1);assert.deepEqual(next.bytes.slice(4),Array(9).fill(128));assert.equal(high.bucket,7);
  assert.deepEqual(next.scaledWords.slice(0,4),w.slice(0,4));
  w[4]=255;w[13]=32;assert.equal(G6.adaptiveColor(w,0).bytes[4],254);
  w[4]=0x80000000;w[13]=16;assert.equal(G6.adaptiveColor(w,0).bytes[4],0);
  w[21]=0;assert.equal(G6.adaptiveColor(w,128).valid,false);
});
test('normal edge center, middle field and unused sixth argument differ from fixed effects',()=>{
  const kernels=[Array(25).fill(0),Array(25).fill(1)],args=[40,4,3,15,10,123],n=G6.normalEdge(kernels,args);
  assert.equal(n.center,21);assert.equal(n.middle,3);assert.equal(n.registers['B100[15:0]'],'0xa23f');
  assert.equal(G6.normalEdge(kernels,[...args.slice(0,4),20,0]).center,16);
  assert.equal(G6.normalEdge(kernels,[...args.slice(0,4),32,0]).center,31);
  assert.equal(kernels[0][12],0);assert.deepEqual(G6.normalEdge(kernels,[...args.slice(0,5),255]).registers,n.registers);
});
test('bit descriptions distinguish storage, masks, sign, destination and unmasked table copies',()=>{
  const sat=G6.fieldInfo(['saturation',6],48);assert.equal(sat.raw,'0x30');assert.equal(sat.binary,'10000');assert.equal(sat.destination,'B16C[4:0]');
  const matrix=G6.fieldInfo(['matrix',3],1023);assert.equal(matrix.signed,-1);assert.equal(matrix.destination,'B0E4[19:10]');assert.equal(matrix.destinationMask,'0x000ffc00');
  const color=G6.fieldInfo(['color',12],0xABCD1234);assert.equal(color.effective,52);assert.equal(color.destination,'B0FC[18:11]');assert.equal(color.rawBinary.length,32);
  assert.equal(G6.fieldInfo(['tone',2],65535).width,16);assert.equal(G6.fieldInfo(['lut',2,2],255).width,8);
});
test('unsigned digital EV clamp wraps underflow, while stored stock values stay in range',()=>{
  assert.equal(G6.digitalEv(128,1),96);assert.equal(G6.digitalEv(128,5),160);
  assert.equal(G6.digitalEv(0,1),255);assert.equal(G6.digitalEv(255,5),255);
});
test('legacy configs retain tone default; full u16 tone data survives both JSON formats',()=>{
  const old=G6.defaults();delete old.preview.toneDomain;assert.equal(G6.validate(old).preview.toneDomain,'rgb');
  const s=G6.defaults();s.tone[0]=65535;s.preview.toneDomain='luma';assert.deepEqual(G6.validate(G6.compact(s)),s);
  assert.equal(G6.records(s).tone.slice(0,4),'ffff');assert.throws(()=>G6.validate({...s,tone:s.tone.map(()=>65536)}),/tone/);
});
