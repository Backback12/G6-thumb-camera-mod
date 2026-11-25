// Browser/Node shared model. Only record encoding is exact; ISP equations are approximations.
'use strict';
(function (root) {
  const identity = () => Array.from({ length: 256 }, (_, i) => i);
  const signed = (v, bits) => v >= 2 ** (bits - 1) ? v - 2 ** bits : v;
  const clamp = v => Math.max(0, Math.min(255, v));
  function defaults() {
    return { schema: 'g6-filter-v1', name: 'Untitled',
      enabled: { matrix: false, saturation: false, color: false, lut: false, tone: false, edge: false },
      matrix: [256,0,0, 0,256,0, 0,0,256], offsets: [0,0,0], saturation: Array(17).fill(16),
      color: [128,128,128,128, ...Array(9).fill(64), 10,10,16,16,16,16,16,16,6],
      lut: [identity(), identity(), identity()], tone: identity().map(v => v * 4),
      kernels: [Array(25).fill(0), Array(25).fill(0)], edgeControl: [0,4,15],
      preview: { offsets: 'ignore', colorUnknown: false, toneDomain: 'rgb', saturationUnity: 16, hueSpan: 120,
        contrastPivot: 128, kernelDivisor: 1, kernelBias: 128,
        order: ['matrix','color','saturation','lut','tone','edge'] } };
  }
  function validate(input) {
    if (input?.schema === 'g6-filter-delta-v1') {
      if (input.base !== 'editor-neutral-v1' || !input.changes || typeof input.changes !== 'object') throw Error('Invalid compact config.');
      const expanded=defaults();expanded.name=input.name;
      for(const key of Object.keys(input.changes)) {
        if(!Object.hasOwn(expanded,key) || ['schema','name'].includes(key)) throw Error(`Unknown config group: ${key}`);
        if(['enabled','preview'].includes(key)) {
          const v=input.changes[key];if(!v || typeof v !== 'object')throw Error(`Invalid ${key}`);
          for(const field of Object.keys(v)){if(!Object.hasOwn(expanded[key],field))throw Error(`Unknown ${key} field`);expanded[key][field]=v[field];}
        } else expanded[key]=input.changes[key];
      }
      return validate(expanded);
    }
    if (!input || input.schema !== 'g6-filter-v1') throw Error('Expected a g6-filter-v1 JSON file.');
    const s = defaults();
    if (typeof input.name !== 'string' || input.name.length > 200) throw Error('Invalid preset name.');
    s.name = input.name;
    const array = (v, size, max, label) => {
      if (!Array.isArray(v) || v.length !== size || !v.every(n => Number.isInteger(n) && n >= 0 && n <= max))
        throw Error(`${label}: expected ${size} integers in 0..${max}.`);
      return v.slice();
    };
    for (const k of Object.keys(s.enabled)) {
      if (typeof input.enabled?.[k] !== 'boolean') throw Error(`Missing stage: ${k}`);
      s.enabled[k] = input.enabled[k];
    }
    for (const [k, count, max] of [['matrix',9,1023],['offsets',3,127],['saturation',17,255],['color',22,0xFFFFFFFF],['tone',256,65535]])
      s[k] = array(input[k], count, max, k);
    if (!Array.isArray(input.lut) || input.lut.length !== 3 || !Array.isArray(input.kernels) || input.kernels.length !== 2)
      throw Error('Expected three LUTs and two kernels.');
    s.lut = input.lut.map(v => array(v, 256, 255, 'LUT'));
    s.kernels = input.kernels.map(v => array(v, 25, 63, 'Kernel'));
    s.edgeControl = array(input.edgeControl, 3, 255, 'Edge control');
    if (s.edgeControl[0] > 63 || s.edgeControl[1] > 7 || s.edgeControl[2] > 15) throw Error('Edge control exceeds field widths.');
    const p = input.preview;
    if (!p || !['ignore','signed','unsigned'].includes(p.offsets) || typeof p.colorUnknown !== 'boolean') throw Error('Invalid preview model.');
    s.preview.offsets = p.offsets; s.preview.colorUnknown = p.colorUnknown;
    if(p.toneDomain!==undefined){if(!['rgb','luma'].includes(p.toneDomain))throw Error('Invalid tone domain.');s.preview.toneDomain=p.toneDomain;}
    for (const [k, lo, hi] of [['saturationUnity',1,31],['hueSpan',0,360],['contrastPivot',0,255],['kernelDivisor',1,1024],['kernelBias',-255,255]]) {
      if (!Number.isFinite(p[k]) || p[k] < lo || p[k] > hi) throw Error(`Invalid preview setting: ${k}`);
      s.preview[k] = p[k];
    }
    if (!Array.isArray(p.order) || p.order.length !== 6 || new Set(p.order).size !== 6 || !p.order.every(k => Object.keys(s.enabled).includes(k)))
      throw Error('Stage order must contain each of matrix,color,saturation,lut,tone,edge once.');
    s.preview.order = p.order.slice();
    return s;
  }
  function process(source, width, height, s) {
    const out = new Uint8ClampedArray(source);
    const p = s.preview, m = s.matrix.map(v => signed(v, 10)), strengths=s.saturation.map(v=>v&31);
    const offsets = s.offsets.map(v => p.offsets === 'ignore' ? 0 : p.offsets === 'signed' ? signed(v, 7) : v);
    const w = s.color.map(v => v & 255), angle = (128 - w[3]) / 128 * p.hueSpan * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (const stage of p.order) {
      if (!s.enabled[stage]) continue;
      if (stage === 'edge') {
        const before = new Uint8ClampedArray(out), kernel = s.kernels[0].map((v, i) => signed(v,6) + signed(s.kernels[1][i],6));
        for (let y=0;y<height;y++) for (let x=0;x<width;x++) for (let c=0;c<3;c++) {
          let sum=0;
          for (let k=0;k<25;k++) {
            const yy=Math.max(0,Math.min(height-1,y+Math.floor(k/5)-2)), xx=Math.max(0,Math.min(width-1,x+k%5-2));
            sum += before[(yy*width+xx)*4+c]*kernel[k];
          }
          out[(y*width+x)*4+c] = sum/p.kernelDivisor+p.kernelBias;
        }
        continue;
      }
      for (let i=0;i<out.length;i+=4) {
        let r=out[i],g=out[i+1],b=out[i+2];
        if (stage === 'matrix') {
          [r,g,b] = [0,1,2].map(j => (m[j*3]*r+m[j*3+1]*g+m[j*3+2]*b)/256+offsets[j]);
        } else if (stage === 'saturation') {
          const y=.299*r+.587*g+.114*b, t=(255-y)*16/255, j=Math.floor(t), a=t-j;
          const gain=(strengths[j]*(1-a)+strengths[Math.min(16,j+1)]*a)/p.saturationUnity;
          r=y+(r-y)*gain;g=y+(g-y)*gain;b=y+(b-y)*gain;
        } else if (stage === 'color') {
          const y=.299*r+.587*g+.114*b, cb=(b-y)/1.772, cr=(r-y)/1.402;
          let yy=(y-p.contrastPivot)*w[0]/128+p.contrastPivot+w[2]-128, u=cb,v=cr;
          // Optional illustrative models, not register meanings established by hardware.
          if (p.colorUnknown) { yy*=w[1]/128;u=cb*cos-cr*sin;v=cb*sin+cr*cos; }
          r=yy+1.402*v;g=yy-.344136*u-.714136*v;b=yy+1.772*u;
        } else if (stage === 'lut') {
          r=s.lut[0][r];g=s.lut[1][g];b=s.lut[2][b];
        } else if (stage === 'tone') {
          // Both domains are hypotheses: the firmware copies one shared u16 table without a 10-bit mask.
          if(p.toneDomain==='luma') {
            const y=.299*r+.587*g+.114*b,delta=s.tone[Math.round(y)]*255/1023-y;
            r+=delta;g+=delta;b+=delta;
          } else {r=s.tone[r]*255/1023;g=s.tone[g]*255/1023;b=s.tone[b]*255/1023;}
        }
        out[i]=clamp(r);out[i+1]=clamp(g);out[i+2]=clamp(b);
      }
    }
    return out;
  }
  function records(s) {
    const hex = (values, size) => values.map(n => Array.from({length:size},(_,i)=>(n>>>(i*8)&255).toString(16).padStart(2,'0')).join('')).join('');
    return { matrix: hex([...s.matrix,...s.offsets],2), saturation: hex(s.saturation,1), color: hex(s.color,4),
      lut: s.lut.map(v=>hex(v,1)), tone: hex(s.tone,2), kernels: s.kernels.map(v=>hex(v,1)), edgeControl: s.edgeControl.slice() };
  }
  function compact(s) {
    const base=defaults(),changes={};
    for(const key of ['enabled','matrix','offsets','saturation','color','lut','tone','kernels','edgeControl','preview']) {
      if(['enabled','preview'].includes(key)) {
        const fields={};for(const field of new Set([...Object.keys(base[key]),...Object.keys(s[key])]))if(JSON.stringify(s[key][field])!==JSON.stringify(base[key][field]))fields[field]=s[key][field];
        if(Object.keys(fields).length)changes[key]=fields;
      } else if(JSON.stringify(s[key])!==JSON.stringify(base[key]))changes[key]=s[key];
    }
    return {schema:'g6-filter-delta-v1',base:'editor-neutral-v1',name:s.name,changes};
  }
  function registers(s) {
    const h=(n,width=8)=>`0x${(n>>>0).toString(16).padStart(width,'0')}`;
    const packed=(a,bits)=>a.reduce((n,v,i)=>n+(v&(2**bits-1))*2**(bits*i),0);
    const r={};
    for(let j=0;j<3;j++)r[['B0E4','B0E8','B0EC'][j]]=h(packed([s.matrix[j],s.matrix[j+3],s.matrix[j+6]],10));
    r.B0F0=h(s.offsets.reduce((n,v,i)=>n+(v&127)*2**(10*i),0));
    for(let j=0;j<3;j++)r[['B168','B16C','B170'][j]]=h(packed(s.saturation.slice(j*6,j===2?17:j*6+6),5));
    r.B15C=h(((s.color[0]&255)<<24)|((s.color[2]&255)<<16)|((s.color[1]&255)<<8)|(s.color[3]&255));
    r.B160=h(packed(s.color.slice(4,8),8));r.B164=h(packed(s.color.slice(8,12),8));r['B0FC[18:11]']=h(s.color[12]&255,2);
    r['B100[15:0]']=h((s.edgeControl[0]<<10)|(s.edgeControl[1]<<7)|s.edgeControl[2],4);
    for(let k=0;k<2;k++)for(let row=0;row<5;row++)r[(0xB104+k*20+row*4).toString(16).toUpperCase()]=h(packed(s.kernels[k].slice(row*5,row*5+5),6));
    return r;
  }
  function adaptiveColor(words,mean) {
    const divisor=words[21]>>>0;
    if(!divisor)return {valid:false,error:'Zero divisor: firmware unsigned division is undefined; no substitute gain is assumed.'};
    const bucket=Math.min(7,Math.floor((mean>>>0)/divisor)),gain=words[13+bucket]>>>0,scaled=words.slice();
    for(let i=4;i<=12;i++)scaled[i]=(Math.imul(words[i],gain)>>>0)>>>4;
    return {valid:true,mean:mean>>>0,bucket,gain,divisor,scaledWords:scaled,bytes:scaled.slice(0,13).map(v=>v&255)};
  }
  function normalEdge(kernels,args) {
    const effective=kernels.map(a=>a.map(v=>v&63));
    // 0x53340 compares UNSIGNED; strength >31 wraps the subtraction and selects the upper limit.
    const center=Math.min(31,Math.max(16,(31-(args[4]&255))>>>0));effective[0][12]=center;
    const state=defaults();state.kernels=effective;state.edgeControl=[args[0]&63,args[1]&7,args[3]&15];
    const packed=registers(state),bits={},middle=args[2]&7;
    for(let bank=0;bank<2;bank++)for(let row=0;row<5;row++){const name=(0xB104+bank*20+row*4).toString(16).toUpperCase();bits[name]=packed[name];}
    bits['B100[15:0]']=`0x${((state.edgeControl[0]<<10)|(state.edgeControl[1]<<7)|(middle<<4)|state.edgeControl[2]).toString(16).padStart(4,'0')}`;
    return {kernels:effective,center,middle,registers:bits,unusedArgument6:args[5]};
  }
  function digitalEv(base,choice) {
    return Math.min(255,(base+(choice-3)*16)>>>0);
  }
  function fieldInfo(path,value) {
    if(!path)return null;
    const [group,i,j]=path;let width,storage,register,lsb=0,sign=false,note='';
    if(group==='matrix'){width=10;storage=16;register=['B0E4','B0E8','B0EC'][i%3];lsb=Math.floor(i/3)*10;sign=true;}
    else if(group==='offsets'){width=7;storage=16;register='B0F0';lsb=i*10;sign=true;note='signed RGB bias supported; units/rounding unresolved';}
    else if(group==='saturation'){width=5;storage=8;register=['B168','B16C','B170'][Math.floor(i/6)];lsb=(i%6)*5;}
    else if(group==='color'){
      storage=32;
      if(i<4){width=8;register='B15C';lsb=[24,8,16,0][i];}
      else if(i<8){width=8;register='B160';lsb=(i-4)*8;}
      else if(i<12){width=8;register='B164';lsb=(i-8)*8;}
      else if(i===12){width=8;register='B0FC';lsb=11;}
      else {width=32;register='CPU only';note=i<21?'baseline shared gain /16; ignored by fixed effect writer':'baseline brightness bucket divisor; ignored by fixed effect writer';}
      if(i>=4&&i<=12)note='fixed path low byte shown; baseline multiplies the full u32 before low-byte packing';
    } else if(group==='kernels'){width=6;storage=8;register=(0xB104+i*20+Math.floor(j/5)*4).toString(16).toUpperCase();lsb=(j%5)*6;sign=true;}
    else if(group==='edgeControl'){storage=8;width=[6,3,4][i];register='B100';lsb=[10,7,0][i];note='fixed filter API; B100[6:4] is zero';}
    else if(group==='lut'){width=8;storage=8;register=`device ${(0x84600+i*0x200+j).toString(16).toUpperCase()}`;note='u8 copied unchanged, not RGB565';}
    else if(group==='tone'){width=16;storage=16;register=`device ${(0x84400+i*2).toString(16).toUpperCase()}`;note='u16 copied unchanged; 0..1023 observed, no software 10-bit mask';}
    else return null;
    const mask=width===32?0xFFFFFFFF:2**width-1,effective=width===32?value>>>0:(value&mask)>>>0;
    const hex=(n,digits)=>`0x${(n>>>0).toString(16).padStart(digits,'0')}`;
    return {storage,width,mask:hex(mask,Math.ceil(width/4)),raw:hex(value,storage/4),effective,
      binary:effective.toString(2).padStart(width,'0'),rawBinary:(value>>>0).toString(2).padStart(storage,'0'),signed:sign?signed(effective,width):null,
      destinationMask:register.startsWith('B')?hex(mask*2**lsb,8):null,
      destination:register.startsWith('B')?`${register}[${lsb+width-1}:${lsb}]`:register,note};
  }
  const api={defaults,validate,process,records,compact,registers,signed,adaptiveColor,normalEdge,digitalEv,fieldInfo};
  if (typeof module !== 'undefined' && module.exports) module.exports=api; else root.G6=api;
})(globalThis);
