import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync('sample.pdf')), useSystemFonts: true }).promise;
const page = await doc.getPage(5);
const ol = await page.getOperatorList();
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
let ctm=[1,0,0,1,0,0];const stack=[];const H=[];
for(let i=0;i<ol.fnArray.length;i++){const fn=ol.fnArray[i],a=ol.argsArray[i];
 if(fn===OPS.save)stack.push(ctm.slice());else if(fn===OPS.restore)ctm=stack.pop()||ctm;else if(fn===OPS.transform)ctm=mul(ctm,a);
 else if(fn===OPS.constructPath){const ops=a[0],args=a[1];let k=0,px=0,py=0;
  for(const op of ops){if(op===OPS.moveTo){px=args[k++];py=args[k++]}
   else if(op===OPS.lineTo){const x=args[k++],y=args[k++];const p1=ap(ctm,px,py),p2=ap(ctm,x,y);
    if(Math.abs(p1[1]-p2[1])<1.5&&Math.abs(p1[0]-p2[0])>15)H.push({y:Math.round((p1[1]+p2[1])/2),x0:Math.round(Math.min(p1[0],p2[0])),x1:Math.round(Math.max(p1[0],p2[0]))});
    px=x;py=y}else if(op===OPS.curveTo)k+=6;else if(op===OPS.rectangle)k+=4}}}
// y로 묶어 x범위 합치기
const by={};H.forEach(h=>{const key=Math.round(h.y/4)*4;if(!by[key])by[key]={y:h.y,x0:h.x0,x1:h.x1};else{by[key].x0=Math.min(by[key].x0,h.x0);by[key].x1=Math.max(by[key].x1,h.x1)}});
Object.values(by).sort((a,b)=>b.y-a.y).forEach(h=>console.log(`y${h.y}  x:${h.x0}~${h.x1}  ${h.x0<50?'◀학기열도달':''}`));
