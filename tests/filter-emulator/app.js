'use strict';
const $=id=>document.getElementById(id),video=$('video'),editor=document.querySelector('.editor');
const slots=Object.fromEntries(['camera','bars','image'].map(name=>{
  const input=$(name+'-input'),output=$(name+'-output');
  return [name,{input,output,ctx:input.getContext('2d',{willReadFrequently:true}),out:output.getContext('2d'),ready:false}];
}));
let state=G6.defaults(),presets=[],stream=null,cameraVersion=0,imageVersion=0,frame=0,lastFrame=0,assumedMean=128,library=null;
let references=[{key:'editor',label:'Editor neutral (approximate)',note:"Editor identity/default values; not the camera's adaptive Normal.",values:G6.defaults()}],comparisons=[],tableIndices=new Map(),openSections=new Map();
function status(message){$('status').textContent=message;}
function resize(slot,width,height){
  const scale=Math.min(1,480/Math.max(width,height));
  slot.input.width=slot.output.width=Math.max(1,Math.round(width*scale));slot.input.height=slot.output.height=Math.max(1,Math.round(height*scale));
}
function placeholder(slot,text){
  resize(slot,480,320);slot.ready=false;slot.ctx.fillStyle='#eee';slot.ctx.fillRect(0,0,480,320);slot.ctx.fillStyle='#555';slot.ctx.font='18px sans-serif';slot.ctx.textAlign='center';slot.ctx.fillText(text,240,160);renderSlot(slot);
}
function renderSlot(slot){
  if(!slot.ready){slot.out.drawImage(slot.input,0,0);return;}
  const pixels=slot.ctx.getImageData(0,0,slot.input.width,slot.input.height);
  pixels.data.set(G6.process(pixels.data,slot.input.width,slot.input.height,state));slot.out.putImageData(pixels,0,0);
}
function refValue(path){
  const ref=references.find(r=>r.key===$('reference').value)||references[0];
  const value=path?.reduce((v,key)=>v?.[key],ref.values);return typeof value==='number'?value:null;
}
function compare(parent,path,get){
  const el=document.createElement('output');el.className='compare';parent.append(el);
  comparisons.push(()=>{const keys=typeof path==='function'?path():path,reference=refValue(keys),value=keys?keys.reduce((v,k)=>v?.[k],state):get(),delta=value-reference;el.textContent=reference===null?'?':`${reference} (${delta>=0?'+':''}${delta})`;el.classList.toggle('different',reference!==null&&delta!==0);el.title=keys?.join('.')||'Reference unknown';});
}
function bitInfo(parent,path){
  const el=document.createElement('output');el.className='bits';parent.append(el);
  comparisons.push(()=>{
    const keys=typeof path==='function'?path():path,value=keys?.reduce((v,k)=>v?.[k],state),info=G6.fieldInfo(keys,value);
    if(!info){el.textContent='';return;}
    const binary=info.binary.replace(/(.)(?=(.{4})+$)/g,'$1 ');
    el.textContent=`u${info.storage} ${info.raw} → ${info.width}b ${binary} = ${info.effective}${info.signed===null?'':` (signed ${info.signed})`} → ${info.destination}`;
    el.title=`Raw bits ${info.rawBinary}; source mask ${info.mask}${info.destinationMask?`; destination mask ${info.destinationMask}`:''}. ${info.note}`;
  });
}
function adaptiveResult(){
  const box=$('adaptive-result');if(!box)return;
  const result=G6.adaptiveColor(state.color,assumedMean);
  box.textContent=!result.valid?result.error:`bucket min(7, floor(${assumedMean}/${result.divisor})) = ${result.bucket}; gain word ${13+result.bucket} = ${result.gain}/16\nWords 4..12 hardware bytes: ${result.bytes.slice(4).join(', ')}\nCPU: low32(word × gain) >>> 4, then low byte. No clamp.`;
  const ref=references.find(r=>r.key===$('reference').value),edge=$('normal-edge-note');
  if(edge)edge.textContent=ref?.normalEdge?`Stored Normal edge API: args [${ref.normalEdge.args.join(', ')}], first center ${ref.normalEdge.center}, B100[6:4] = ${ref.normalEdge.middle}. Sixth argument unused by writer. This is reference metadata, not the fixed-filter preview.`:'Normal edge API replaces its first kernel center with unsigned clamp(31 − strength, 16, 31); it also writes B100[6:4]. Fixed filters copy the stored center and clear those bits. ASIC response remains unresolved.';
}
function refreshComparisons(){
  $('reference-note').textContent=(references.find(r=>r.key===$('reference').value)||references[0]).note;
  comparisons.forEach(fn=>fn());adaptiveResult();
}
function changed(){
  $('name').value=state.name;$('json').value=JSON.stringify({...state,record_hex:G6.records(state),register_bits:G6.registers(state),adaptive_color:{assumed_histogram_mean:assumedMean,...G6.adaptiveColor(state.color,assumedMean)}},null,2);
  refreshComparisons();Object.values(slots).forEach(renderSlot);library?.update();
}
function control(parent,label,min,max,value,set,path=null,unknown=false){
  const row=document.createElement('label');row.className='control';
  const text=document.createElement('span');text.textContent=label;if(unknown)text.className='unknown';
  const range=document.createElement('input');range.type='range';const number=document.createElement('input');number.type='number';
  for(const el of [range,number]){el.min=min;el.max=max;el.step=1;el.value=value;el.setAttribute('aria-label',label+(el===range?' slider':' value'));}
  const update=el=>{const n=Number(el.value);if(el.value===''||!Number.isInteger(n)||n<min||n>max){el.setCustomValidity(`Use ${min}..${max}`);return;}el.setCustomValidity('');range.value=number.value=n;set(n);changed();};
  range.oninput=()=>update(range);number.oninput=()=>update(number);row.append(text,range,number);parent.append(row);compare(row,path,()=>Number(number.value));
  if(path)bitInfo(row,path);
}
function section(stage,title,note){
  const details=document.createElement('details');details.dataset.stage=stage;details.open=openSections.get(stage)||false;
  const summary=document.createElement('summary');summary.textContent=title;
  const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=state.enabled[stage];check.setAttribute('aria-label',`Enable ${stage}`);check.onchange=()=>{state.enabled[stage]=check.checked;changed();};
  label.append(check,` Enable ${stage}`);const p=document.createElement('p');p.className='note';p.textContent=note;
  const head=document.createElement('div');head.className='control heading';for(const t of ['Parameter','','Value','Ref / delta']){const span=document.createElement('span');span.textContent=t;head.append(span);}
  details.append(summary,label,p,head);$('controls').append(details);return details;
}
function tableEditor(parent,label,path,get,set,length,max,make,unknown=false,displayMax=max){
  const key=path.join('.'),row=document.createElement('p'),index=document.createElement('input'),value=document.createElement('input');
  index.type=value.type='number';index.min=0;index.max=length-1;index.value=Math.max(0,Math.min(length-1,tableIndices.get(key)||0));index.dataset.table=key;value.min=0;value.max=max;
  index.setAttribute('aria-label',`${label} index`);value.setAttribute('aria-label',`${label} value`);
  const title=document.createElement('span');title.textContent=label+' index ';if(unknown)title.className='unknown';row.append(title,index,' value ',value);compare(row,()=>[...path,Number(index.value)],()=>Number(value.value));
  const bits=document.createElement('div');row.append(bits);bitInfo(bits,()=>[...path,Number(index.value)]);
  const raw=document.createElement('textarea');raw.value=get().join(',');raw.setAttribute('aria-label',`${label} all values`);
  let curve=null,curveCtx=null,previous=null;const scaleMax=()=>Math.max(displayMax,...get());
  function draw(){
    if(!curve)return;const c=curveCtx,a=get(),selected=Number(index.value),ceiling=scaleMax(),x=i=>24+i*288/255,y=v=>120-v*110/ceiling;
    c.clearRect(0,0,320,140);c.strokeStyle='#ccc';c.beginPath();c.moveTo(24,10);c.lineTo(24,120);c.lineTo(312,120);c.stroke();c.fillStyle='#555';c.font='10px sans-serif';c.fillText(String(ceiling),0,12);c.fillText('0',14,133);c.fillText('255 input',267,133);
    function line(values,color,dashed){c.strokeStyle=color;c.setLineDash(dashed?[3,3]:[]);c.beginPath();values.forEach((v,i)=>i?c.lineTo(x(i),y(v)):c.moveTo(x(i),y(v)));c.stroke();c.setLineDash([]);}
    const reference=Array.from({length},(_,i)=>refValue([...path,i]));if(reference.every(v=>v!==null))line(reference,'#888',true);
    line(a,path[0]==='lut'?['#b00','#080','#00b'][path[1]]:'#222',false);c.fillStyle='#111';c.beginPath();c.arc(x(selected),y(a[selected]),3,0,Math.PI*2);c.fill();
  }
  function sync(){value.value=get()[Number(index.value)]??0;if(indexSlider)indexSlider.value=index.value;if(valueSlider){valueSlider.max=scaleMax();valueSlider.value=value.value;}}
  function apply(a){set(a);raw.value=get().join(',');sync();changed();}
  let indexSlider=null,valueSlider=null;
  if(length===256){
    curve=document.createElement('canvas');curve.width=320;curve.height=140;curve.className='curve';curve.setAttribute('aria-label',`${label} curve; input horizontally, output vertically`);curveCtx=curve.getContext('2d');parent.append(curve);
    const sliders=document.createElement('div');sliders.className='control';
    const caption=document.createElement('span');caption.textContent='Index / output';if(unknown)caption.className='unknown';
    indexSlider=document.createElement('input');indexSlider.type='range';indexSlider.min=0;indexSlider.max=255;indexSlider.setAttribute('aria-label',`${label} index slider`);
    valueSlider=document.createElement('input');valueSlider.type='range';valueSlider.min=0;valueSlider.max=max;valueSlider.setAttribute('aria-label',`${label} output slider`);
    sliders.append(caption,indexSlider,valueSlider);parent.append(sliders);
    indexSlider.oninput=()=>{index.value=indexSlider.value;sync();refreshComparisons();};
    valueSlider.oninput=()=>{const a=get().slice();a[Number(index.value)]=Number(valueSlider.value);apply(a);};
    function edit(e){
      const r=curve.getBoundingClientRect(),xx=(e.clientX-r.left)*320/r.width,yy=(e.clientY-r.top)*140/r.height;
      const point={i:Math.max(0,Math.min(255,Math.round((xx-24)*255/288))),v:Math.max(0,Math.min(max,Math.round((120-yy)*scaleMax()/110)))};
      const a=get().slice();if(previous&&previous.i!==point.i){for(let i=Math.min(previous.i,point.i);i<=Math.max(previous.i,point.i);i++)a[i]=Math.round(previous.v+(point.v-previous.v)*(i-previous.i)/(point.i-previous.i));}else a[point.i]=point.v;
      previous=point;index.value=point.i;apply(a);
    }
    curve.onpointerdown=e=>{e.preventDefault();curve.setPointerCapture(e.pointerId);previous=null;edit(e);};
    curve.onpointermove=e=>{if(previous)edit(e);};curve.onpointerup=curve.onpointercancel=()=>{previous=null;};comparisons.push(draw);
  }
  index.oninput=()=>{const i=Number(index.value);if(Number.isInteger(i)&&i>=0&&i<length){sync();refreshComparisons();}};
  value.oninput=()=>{const i=Number(index.value),v=Number(value.value);if(!Number.isInteger(i)||i<0||i>=length||value.value===''||!Number.isInteger(v)||v<0||v>max)return;const a=get().slice();a[i]=v;apply(a);};
  for(const [name,fn] of make){const b=document.createElement('button');b.textContent=name;b.onclick=()=>apply(fn());row.append(b);}
  const button=document.createElement('button');button.textContent=`Apply ${label} values`;button.onclick=()=>{const a=raw.value.trim().split(/[\s,]+/).map(Number);if(a.length!==length||!a.every(n=>Number.isInteger(n)&&n>=0&&n<=max))return status(`${label}: enter ${length} integers in 0..${max}.`);apply(a);status(`${label} updated.`);};
  parent.append(row,raw,button);sync();draw();
}
function buildControls(){
  const scroll=editor.scrollTop;openSections=new Map([...$('controls').querySelectorAll('details[data-stage]')].map(d=>[d.dataset.stage,d.open]));tableIndices=new Map([...$('controls').querySelectorAll('[data-table]')].map(el=>[el.dataset.table,Number(el.value)]));
  comparisons=[];$('controls').replaceChildren();
  let box=section('matrix','RGB matrix + offsets','10-bit signed Q8 interpretation has strong code/hardware support: factory negatives are sign-extended and row sums are 255/256. Exact ASIC clipping/rounding and offset units remain unresolved.');
  for(let i=0;i<9;i++)control(box,`${'RGB'[Math.floor(i/3)]} out / ${'RGB'[i%3]} in`,0,1023,state.matrix[i],v=>state.matrix[i]=v,['matrix',i]);
  for(let i=0;i<3;i++)control(box,`Offset ${i}`,0,127,state.offsets[i],v=>state.offsets[i]=v,['offsets',i],true);
  box=section('saturation','Saturation: raw bytes / 5-bit fields','Raw 16 and 48 send field 16; raw 32 sends 0. Upper 3 bits are discarded. Baseline uses the same histogram-selected Q4 gain mechanism (factory gains all 16). Brightness axis/interpolation remain approximate.');
  const satBox=box;control(box,'Set all bytes',0,255,state.saturation[0],v=>{state.saturation.fill(v);satBox.querySelectorAll('.control input').forEach(el=>el.value=v);},null,true);
  state.saturation.forEach((v,i)=>control(box,`p[${i}]${i===0?' bright?':i===16?' dark?':''}`,0,255,v,n=>state.saturation[i]=n,['saturation',i],true));
  box=section('color','88-byte color record','Words 0/2: contrast/brightness; 1/3: unresolved equations. Build 08 identifies words 4..12 as color-strength bands ordered dark to bright: 0 removes color, 255 boosts it. Exact axis/knots/unity remain unknown; these bands are not simulated. Shadow words 4/5 can provoke blue noise. Fixed filters ignore the adaptive gains/divisor.');
  state.color.forEach((v,i)=>control(box,`Word ${i}${i<4?[' contrast',' primary/luma?',' brightness',' color/hue?'][i]:i<13?` band ${i-4} saturation${i===4?' (dark)':i===12?' (bright)':''}`:i<21?` gain ${i-13} /16`:' bucket divisor'}`,0,i<13?255:0xFFFFFFFF,i<13?v&255:v,n=>state.color[i]=i<13?((state.color[i]&0xFFFFFF00)|n)>>>0:n,['color',i],i===1||i===3));
  const adaptation=document.createElement('details'),summary=document.createElement('summary');adaptation.dataset.stage='adaptive';adaptation.open=openSections.get('adaptive')||false;summary.textContent='Baseline adaptive calculation (exact CPU math)';
  const note=document.createElement('p');note.className='note';note.textContent='Uses a weighted/smoothed histogram brightness mean, not ISO. This manual input only changes the calculation below. Fixed custom filters ignore this path; the nine outputs control dark-to-bright color strength, with unknown exact knot positions.';
  const meanLabel=document.createElement('label');meanLabel.textContent='Assumed mean ';const mean=document.createElement('input');mean.type='number';mean.min=0;mean.max=255;mean.value=assumedMean;mean.setAttribute('aria-label','Assumed histogram mean');mean.oninput=()=>{const n=Number(mean.value);if(mean.value!==''&&Number.isInteger(n)&&n>=0&&n<=255){assumedMean=n;changed();}};meanLabel.append(mean);
  const result=document.createElement('pre');result.id='adaptive-result';adaptation.append(summary,note,meanLabel,result);box.append(adaptation);
  box=section('lut','Channel LUT curves','Input index horizontally, output value vertically. Drag to edit or use sliders. Dashed gray = reference where known. Lines connect discrete samples; lookup still uses the exact entries.');
  for(let c=0;c<3;c++)tableEditor(box,`${'RGB'[c]} LUT`,['lut',c],()=>state.lut[c],v=>state.lut[c]=v,256,255,[['Identity',()=>Array.from({length:256},(_,i)=>i)],['Invert',()=>Array.from({length:256},(_,i)=>255-i)],['Four levels',()=>Array.from({length:256},(_,i)=>85*Math.floor(i/64))],['Lift shadows',()=>Array.from({length:256},(_,i)=>Math.round(Math.sqrt(256*i)))]]);
  box=section('tone','Tone table: u16 copy, observed range 0..1023','Firmware copies all 16 bits; a hardware 10-bit mask is not proved. Curve scale starts at 1023 and expands for larger raw values. RGB/luma domain and interpolation remain unresolved; choose the illustrative domain under Preview assumptions.');
  tableEditor(box,'Tone',['tone'],()=>state.tone,v=>state.tone=v,256,65535,[['Linear 4*x',()=>Array.from({length:256},(_,i)=>4*i)]],true,1023);
  box=section('edge','5x5 kernels / edge controls','Fixed-effect writer copies both kernels (low 6 bits) and clears B100[6:4]. Generic summed signed convolution is only an illustration; the two-bank ASIC response/normalization is unknown.');
  const edgeNote=document.createElement('p');edgeNote.id='normal-edge-note';edgeNote.className='note';box.append(edgeNote);
  for(let c=0;c<2;c++)tableEditor(box,`Kernel ${c}`,['kernels',c],()=>state.kernels[c],v=>state.kernels[c]=v,25,63,[['Zero',()=>Array(25).fill(0)],['Factory perimeter',()=>Array.from({length:25},(_,i)=>i===12?47:i<5||i>=20||i%5===0||i%5===4?1:0)]],true);
  state.edgeControl.forEach((v,i)=>control(box,`Edge control ${i}`,0,[63,7,15][i],v,n=>state.edgeControl[i]=n,['edgeControl',i],true));
  $('assumptions').replaceChildren();for(const [key,title,min,max] of [['saturationUnity','Saturation unity',1,31],['contrastPivot','Contrast pivot',0,255],['hueSpan','Hue span (degrees)',0,360],['kernelDivisor','Kernel divisor',1,1024],['kernelBias','Kernel bias',-255,255]])control($('assumptions'),title,min,max,state.preview[key],v=>state.preview[key]=v,['preview',key],true);
  $('offset-model').value=state.preview.offsets;$('unknown-model').checked=state.preview.colorUnknown;$('tone-model').value=state.preview.toneDomain;$('order').value=state.preview.order.join(',');editor.scrollTop=scroll;
}
function load(s){state=G6.validate(s);buildControls();changed();}
function stopCamera(){
  cameraVersion++;cancelAnimationFrame(frame);frame=0;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;$('stop').disabled=true;$('camera').disabled=false;
}
function bars(){
  const slot=slots.bars;resize(slot,480,320);const colors=[[255,255,255],[255,255,0],[0,255,255],[0,255,0],[255,0,255],[255,0,0],[0,0,255],[0,0,0]],data=slot.ctx.createImageData(480,320);
  for(let y=0;y<320;y++)for(let x=0;x<480;x++){let rgb;if(y<120)rgb=colors[Math.floor(x/60)];else if(y<240)rgb=colors[Math.floor(x/60)].map(v=>v*(1-(y-120)/119));else{const v=x*255/479;rgb=y<260?[v,v,v]:y<280?[v,0,0]:y<300?[0,v,0]:[0,0,v];}data.data.set([...rgb,255],(y*480+x)*4);}
  slot.ctx.putImageData(data,0,0);slot.ready=true;renderSlot(slot);
}
async function cameras(){
  if(!navigator.mediaDevices?.enumerateDevices)return;const current=$('device').value,devices=await navigator.mediaDevices.enumerateDevices();$('device').replaceChildren(new Option('Default camera',''));devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>$('device').add(new Option(d.label||`Camera ${i+1}`,d.deviceId)));$('device').value=current;
}
$('camera').onclick=async()=>{
  stopCamera();const token=cameraVersion;$('camera').disabled=true;$('stop').disabled=false;$('camera-status').textContent='Requesting permission…';let requested;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera requires getUserMedia on localhost.');const deviceId=$('device').value;
    requested=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:480},height:{ideal:360},frameRate:{ideal:15},...(deviceId?{deviceId:{exact:deviceId}}:{})}});
    if(token!==cameraVersion){requested.getTracks().forEach(t=>t.stop());return;}stream=requested;video.srcObject=stream;await video.play();if(token!==cameraVersion)return;
    resize(slots.camera,video.videoWidth,video.videoHeight);await cameras().catch(()=>{});$('camera-status').textContent='Live; local preview';
    function tick(now){if(token!==cameraVersion||!stream)return;if(now-lastFrame>=1000/15&&video.readyState>=2){const s=slots.camera;s.ctx.drawImage(video,0,0,s.input.width,s.input.height);s.ready=true;renderSlot(s);lastFrame=now;}frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);
  }catch(e){if(token===cameraVersion){stopCamera();$('camera-status').textContent=e.message;}else requested?.getTracks().forEach(t=>t.stop());}
};
$('stop').onclick=()=>{stopCamera();$('camera-status').textContent='Stopped; last frame retained';};$('bars').onclick=bars;
$('clear-image').onclick=()=>{imageVersion++;placeholder(slots.image,'Choose an image');$('image-status').textContent='Choose an image';};
$('image').onchange=async()=>{
  const file=$('image').files[0];if(!file)return;const token=++imageVersion,url=URL.createObjectURL(file);
  try{const picture=new Image();picture.src=url;await picture.decode();if(token!==imageVersion)return;const s=slots.image;resize(s,picture.naturalWidth,picture.naturalHeight);s.ctx.drawImage(picture,0,0,s.input.width,s.input.height);s.ready=true;renderSlot(s);$('image-status').textContent=file.name;}
  catch(e){if(token===imageVersion)$('image-status').textContent=e.message;}finally{URL.revokeObjectURL(url);$('image').value='';}
};
$('preset').onchange=()=>{if(library&&!library.detach()){$('preset').value='';return;}const preset=presets.find(p=>p.key===$('preset').value);load(preset?preset.state:G6.defaults());status(`${state.name}: approximate preview; unresolved effects are not guaranteed to match hardware.`);};
$('reset').onclick=()=>{if(library&&!library.detach())return;$('preset').value='';load(G6.defaults());};$('name').oninput=()=>{state.name=$('name').value.slice(0,200);changed();};
$('reference').onchange=refreshComparisons;$('offset-model').onchange=()=>{state.preview.offsets=$('offset-model').value;changed();};$('unknown-model').onchange=()=>{state.preview.colorUnknown=$('unknown-model').checked;changed();};
$('tone-model').onchange=()=>{state.preview.toneDomain=$('tone-model').value;changed();};$('show-bits').onchange=()=>editor.classList.toggle('bits-off',!$('show-bits').checked);
$('apply-order').onclick=()=>{try{load({...state,preview:{...state.preview,order:$('order').value.split(',').map(v=>v.trim())}});status('Preview order updated.');}catch(e){status(e.message);}};
$('save').onclick=()=>{const url=URL.createObjectURL(new Blob([$('json').value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=(state.name.replace(/[^a-z0-9_-]/gi,'_')||'filter')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('copy').onclick=async()=>{const text=JSON.stringify(G6.compact(state));try{await navigator.clipboard.writeText(text);$('copy-fallback').hidden=true;status('Compact config copied; it contains changes from editor-neutral-v1 and can be loaded as JSON.');}catch{$('copy-fallback').hidden=false;$('copy-fallback').value=text;$('copy-fallback').focus();$('copy-fallback').select();status('Clipboard unavailable; config selected above. Press Ctrl+C (or Copy).');}};
$('load').onchange=async()=>{try{const f=$('load').files[0];if(!f)return;const parsed=await G6Files.read(f);if(library&&!library.detach())return;load(parsed.state);$('preset').value='';status('Config loaded.');}catch(e){status(`JSON: ${e.message}`);}finally{$('load').value='';}};
window.addEventListener('pagehide',stopCamera);buildControls();placeholder(slots.camera,'Camera off');placeholder(slots.image,'Choose an image');bars();changed();
library=G6Files.mount({getConfig:()=>JSON.parse($('json').value),applyConfig:s=>{load(s);$('preset').value='';},status});
fetch('/presets.json').then(r=>{if(!r.ok)throw Error('Preset request failed');return r.json();}).then(list=>{presets=list;for(const p of list)$('preset').add(new Option(`${p.bookmark?'★ ':''}${p.state.name}`,p.key));}).catch(e=>status(e.message));
fetch('/references.json').then(r=>{if(!r.ok)throw Error('Reference request failed; restart the Node server.');return r.json();}).then(list=>{references=[references[0],...list];for(const ref of list)$('reference').add(new Option(ref.label,ref.key));refreshComparisons();}).catch(e=>status(e.message));
