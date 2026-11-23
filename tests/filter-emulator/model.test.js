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
