#!/usr/bin/env node
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {presets,patchImage,SHA256}=require('../tools/patch_g6.js'),G6=require('./model.js');
const original=fs.readFileSync(path.join(__dirname,'../original/backup1.bin'));
if (crypto.createHash('sha256').update(original).digest('hex') !== SHA256) throw Error('Original backup hash differs.');
const bookmarks = {
  '02/2':'Strong red', '02/4':'Blue-only noise', '02/5':'Red/blue swap', '03/1':'Posterization',
  '03/4':'Bright clipping', '04/6':'Blue-shadow noise', '05/4':'Sparse primary bands',
  '05/6':'Color remap A', '05/7':'Color remap B', '06/3':'Purple channel noise',
  '06/5':'Blue-shadow noise (confirmed repeat)', '06/11':'Primary-color palette (bookmark)'
};
const list=[];
for (const build of [1,2,3,4].flatMap(round=>presets(original,round))) {
  const b=patchImage(original,build.patches,original.readUInt32LE(0x14)+1), number=build.folder.slice(8,10);
  build.filters.slice(1).forEach((f,i)=>{
    const s=G6.defaults(),key=`${number}/${i+1}`;
    s.name=`${key} ${bookmarks[key] || f.label}`;
    function record(table,count,size){
      const ptr=b.readUInt32LE(table+4*(f.id-1));if(!ptr)return null;
      const offset=ptr>=0x06000000?ptr-0x06000000:ptr-0x02000000+0x2E00;
      if(offset<0||offset+count*size>b.length)throw Error('Record pointer outside source.');
      return Array.from({length:count},(_,j)=>b.readUIntLE(offset+j*size,size));
    }
    const matrix=record(0x81404,12,2),sat=record(0x814B4,17,1),color=record(0x81564,22,4);
    if(matrix){s.enabled.matrix=true;s.matrix=matrix.slice(0,9).map(v=>v&1023);s.offsets=matrix.slice(9).map(v=>v&127);}
    if(sat){s.enabled.saturation=true;s.saturation=sat;}
    if(color){s.enabled.color=true;s.color=color;}
    const lutIds={3:[0,0,2],6:[1,1,1],7:[1,1,1],8:[1,1,2],9:[1,1,3],10:[1,1,4],11:[2,2,4],12:[2,2,1]}[f.id];
    if(lutIds){s.enabled.lut=true;s.lut=lutIds.map(index=>{const offset=[0x8E320,0x8E520,0x8E420,0x8E220,0x8E120][index];return [...b.subarray(offset,offset+256)];});}
    list.push({key,bookmark:!!bookmarks[key],state:G6.validate(s)});
  });
}
const references=[['h63p','H63P',0x9224C,0x9231C],['h63s','H63S',0x9298C,0x92A5C]].map(([key,label,color,sat])=>({
  key,label:`Factory ${label} (known fields)`,note:`Original ${label} stored color/saturation defaults; runtime adaptation and other fields are not decoded here. ? means unknown, not zero.`,
  values:{color:Array.from({length:22},(_,i)=>original.readUInt32LE(color+i*4)),saturation:[...original.subarray(sat,sat+17)]}
}));
const routes={'/':'index.html','/app.js':'app.js','/model.js':'model.js'};
const port=Number(process.argv[2]||8787);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Use a port in 1..65535.');
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const route=new URL(req.url,'http://127.0.0.1').pathname;
  if(route==='/favicon.ico'){res.writeHead(204);return res.end();}
  const filename=routes[route];
  const json=route==='/presets.json'?list:route==='/references.json'?references:null;
  if(!filename&&!json){res.writeHead(404);return res.end('Not found');}
  const type=json?'application/json':filename.endsWith('.js')?'text/javascript':'text/html';
  const data=json?JSON.stringify(json):fs.readFileSync(path.join(__dirname,filename));
  res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:data);
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy; pass another port.`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`G6 filter editor: http://127.0.0.1:${port} (Ctrl+C to stop)`));
