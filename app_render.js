const $=s=>document.querySelector(s);
const gradeColor={국어:'#c0603a',수학:'#3b6ea5',영어:'#7a5bb0',한국사:'#b5762a',사회:'#2f8f6f',과학:'#2f6f4f',기타:'#8a94a0'};
function esc(s){return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function nm(n){return anon||blind? (n?n[0]:'')+'○○' : n}
// 강력 블라인드: 이름·학교·대회 등 개인 특정 고유명사 마스킹(표시 단계에서만)
let blind=false;
function maskText(s){
  if(!blind||!s) return s;
  let out=s;
  const nmv=DATA[idx]&&DATA[idx].parsed&&DATA[idx].parsed.meta.name;
  if(nmv&&nmv.length>=2) out=out.split(nmv).join('○○○');
  return out
    .replace(/[가-힣]{2,6}(초등학교|중학교|고등학교)/g,'○○$1')
    .replace(/[가-힣A-Za-z0-9]{2,12}(경시대회|경진대회|올림피아드|공모전|경연대회|토론대회|대회)/g,'○○$1');
}
function T(s){return esc(maskText(s));}   // 블라인드 반영 + HTML 이스케이프
const _rx=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// 클릭한 키워드가 등장한 원문 문장들(면접·검토용) 수집
function kwSentences(p,kw){
  const out=[]; const an={autonomy:'자율활동',club:'동아리',career:'진로활동'};
  const push=(src,grade,text)=>{ if(!text)return; text.split(/(?<=[가-힣)])\.\s+/).forEach(s=>{s=s.trim(); if(s.includes(kw)&&s.length>6){let t=s.replace(/\s+/g,' '); if(t.length>150)t=t.slice(0,148)+'…'; out.push({src,grade,text:t});}}); };
  (p.details||[]).forEach(d=>push(d.subject,d.grade,d.text));
  ['autonomy','club','career'].forEach(k=>(p.creative&&p.creative[k]||[]).forEach(a=>push(an[k],a.grade,a.text)));
  (p.behavior||[]).forEach(b=>push('행동특성',b.grade,b.text));
  (p.awards||[]).forEach(a=>{ if((a.name||'').includes(kw)) out.push({src:'수상',grade:a.grade,text:a.name}); });
  return out;
}
function openKwModal(kw){
  const p=DATA[idx].parsed, list=kwSentences(p,kw);
  document.getElementById('kwmodal-t').textContent='“'+kw+'” 원문 '+list.length+'문장';
  const rx=new RegExp(_rx(kw),'g');
  document.getElementById('kwmodal-body').innerHTML = list.length
    ? list.map(s=>`<div class="km-row"><span class="cev-src">${s.grade!=null?s.grade+'학년·':''}${esc(s.src)}</span> ${esc(maskText(s.text)).replace(rx,'<mark>'+esc(kw)+'</mark>')}</div>`).join('')
    : '<div class="note">해당 키워드가 포함된 문장을 찾지 못했습니다.</div>';
  document.getElementById('kwmodal').style.display='flex';
}
function ensureModal(){
  if(!document.getElementById('kwmodal')){
    const m=document.createElement('div'); m.id='kwmodal';
    m.innerHTML='<div class="km-card"><div class="km-head"><b id="kwmodal-t"></b><button id="kwmodal-x" title="닫기">✕</button></div><div id="kwmodal-body" class="km-body"></div></div>';
    document.body.appendChild(m);
    m.onclick=e=>{ if(e.target===m||e.target.id==='kwmodal-x') m.style.display='none'; };
  }
  if(!window.__kwBound){ window.__kwBound=1;
    document.addEventListener('click',e=>{
      const add=e.target.closest('[data-addkw]'); if(add){ e.stopPropagation(); if(window.__addKw) window.__addKw(add.getAttribute('data-addkw')); return; }
      const el=e.target.closest('[data-kw]'); if(el) openKwModal(el.getAttribute('data-kw'));
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ const m=document.getElementById('kwmodal'); if(m)m.style.display='none'; } });
  }
}

// 등급 추이 라인차트(등급 낮을수록 위). 라벨은 우측에 세로 분산배치 + 연결선
function strengthSvg(strength){
  const sems=['1-1','1-2','2-1','2-2']; const W=580,H=234,padL=32,padR=76,padT=14,padB=26;
  const x=i=>padL+(W-padL-padR)*i/(sems.length-1);
  const y=g=>padT+(H-padT-padB)*(g-1)/8;
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let g=1;g<=9;g+=2){s+=`<line x1="${padL}" y1="${y(g)}" x2="${W-padR}" y2="${y(g)}" stroke="#eef1f4"/><text x="${padL-6}" y="${y(g)+4}" font-size="10" fill="#9aa4b0" text-anchor="end">${g}</text>`}
  sems.forEach((sm,i)=>s+=`<text x="${x(i)}" y="${H-8}" font-size="10" fill="#9aa4b0" text-anchor="middle">${sm}</text>`);
  const ends=[];
  strength.forEach(gr=>{
    const col=gradeColor[gr.group]||'#8a94a0';
    const pts=gr.points.map(p=>({i:sems.indexOf(p.label),r:p.rank})).filter(p=>p.i>=0);
    if(!pts.length)return;
    const d=pts.map((p,k)=>(k?'L':'M')+x(p.i)+' '+y(p.r)).join(' ');
    s+=`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" opacity="0.92"/>`;
    pts.forEach(p=>s+=`<circle cx="${x(p.i)}" cy="${y(p.r)}" r="3.2" fill="${col}"/>`);
    const last=pts[pts.length-1];
    ends.push({ex:x(last.i),ey:y(last.r),col,text:gr.group,atEnd:last.i===sems.length-1});
  });
  // 우측 끝(마지막 학기) 라벨: y 충돌 회피 후 연결선
  const right=ends.filter(e=>e.atEnd).sort((a,b)=>a.ey-b.ey);
  const GAP=15; let prev=-999;
  right.forEach(e=>{e.ly=Math.max(e.ey,prev+GAP);prev=e.ly;});
  const over=(right.length?right[right.length-1].ly:0)-(H-padB);
  if(over>0) right.forEach(e=>e.ly-=over);
  right.forEach(e=>{
    s+=`<line x1="${e.ex}" y1="${e.ey}" x2="${W-padR+2}" y2="${e.ly}" stroke="${e.col}" stroke-width="1" opacity="0.4"/>`;
    s+=`<circle cx="${W-padR+2}" cy="${e.ly}" r="2" fill="${e.col}"/>`;
    s+=`<text x="${W-padR+7}" y="${e.ly+3.5}" font-size="11" fill="${e.col}" font-weight="600">${e.text}</text>`;
  });
  // 중간에서 끝나는 라인(예: 한국사)은 끝점 위에 라벨
  ends.filter(e=>!e.atEnd).forEach(e=>s+=`<text x="${e.ex+7}" y="${e.ey-6}" font-size="11" fill="${e.col}" font-weight="600">${e.text}</text>`);
  s+='</svg>';return s;
}

let SCALE=9; // 석차등급 체계(9=구양식, 5=고교학점제 신양식) — render()에서 p.scale로 설정
const _GCOL=['#1f7a4d','#1f7a4d','#2f9c63','#6fbf73','#a9d17a','#e6c34a','#e39a3f','#dd7f3a','#cf5b40','#c0392b'];
const gcol=r=>{const idx=SCALE===5?((r-1)*2+1):Math.round(r); return _GCOL[idx]||'#9aa4b0';};
const achvCol={A:'#2f9c63',B:'#6fbf73',C:'#e6c34a',D:'#e39a3f',E:'#cf5b40'};
// 성취도 도넛
function donutSvg(counts){
  const order=['A','B','C','D','E']; const tot=order.reduce((s,k)=>s+(counts[k]||0),0)||1;
  const R=52,r=32,cx=64,cy=64; let ang=-Math.PI/2; let s=`<svg viewBox="0 0 128 128" width="128" height="128">`;
  order.forEach(k=>{const v=counts[k]||0; if(!v)return; const a2=ang+v/tot*2*Math.PI;
    const x1=cx+R*Math.cos(ang),y1=cy+R*Math.sin(ang),x2=cx+R*Math.cos(a2),y2=cy+R*Math.sin(a2);
    const xi1=cx+r*Math.cos(a2),yi1=cy+r*Math.sin(a2),xi2=cx+r*Math.cos(ang),yi2=cy+r*Math.sin(ang);
    const large=(a2-ang)>Math.PI?1:0;
    s+=`<path d="M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${xi1} ${yi1} A${r} ${r} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${achvCol[k]}"/>`;
    ang=a2;});
  s+=`<text x="64" y="60" text-anchor="middle" font-size="13" font-weight="700" fill="#1f2733">${tot}과목</text><text x="64" y="76" text-anchor="middle" font-size="10" fill="#6b7684">성취도</text></svg>`;
  return s;
}
// 등급 히트맵 그리드(과목×학기, 색+숫자)
function gradeGrid(scores){
  const rows=scores.filter(s=>s.type==='석차');
  const sems=['1-1','1-2','2-1','2-2'];
  const order=[]; const seen={};
  rows.forEach(s=>{if(!seen[s.name]){seen[s.name]=1;order.push(s.name)}});
  const cell=(name,sm)=>{
    const r=rows.find(s=>s.name===name&&`${s.grade}-${s.semester}`===sm);
    if(!r) return '<td class="e"></td>';
    const tip=`원점수 ${r.raw}/평균 ${r.avg}${r.sd!=null?'(편차 '+r.sd+')':''} · ${r.achv}(${r.takers}명)`;
    if(r.rank!=null) return `<td class="c" style="background:${gcol(r.rank)}" title="${tip}">${r.rank}</td>`;
    if(r.achv) return `<td class="c" style="background:${achvCol[r.achv]||'#9aa4b0'}" title="${tip} · 석차없음(1단위)">${r.achv}</td>`;
    return '<td class="e"></td>';
  };
  let h='<table class="grid"><tr><th></th>'+sems.map(s=>`<th>${s}</th>`).join('')+'</tr>';
  order.forEach(n=>{h+=`<tr><td class="s">${n}</td>`+sems.map(sm=>cell(n,sm)).join('')+'</tr>'});
  h+='</table>';return h;
}

// 과목별 미니 추이(스몰 멀티플) — 각 점에 학기 평균등급 값 표시
function miniSpark(semAvg,col){
  const sems=['1-1','1-2','2-1','2-2'];
  const pts=semAvg.map(p=>({i:sems.indexOf(p.sem),v:p.avg})).filter(p=>p.i>=0);
  const W=176,H=62,pl=10,pr=10,pt=17,pb=15;
  const x=i=>pl+(W-pl-pr)*i/3; const y=v=>pt+(H-pt-pb)*(v-1)/(SCALE-1);
  let s=`<svg viewBox="0 0 ${W} ${H}" class="spsvg">`;
  s+=`<line x1="${pl}" y1="${y(1)}" x2="${W-pr}" y2="${y(1)}" stroke="#f0f2f4"/><line x1="${pl}" y1="${y(SCALE)}" x2="${W-pr}" y2="${y(SCALE)}" stroke="#f0f2f4"/>`;
  const d=pts.map((p,k)=>(k?'L':'M')+x(p.i)+' '+y(p.v)).join(' ');
  s+=`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.3"/>`;
  pts.forEach((p,k)=>{
    const last=k===pts.length-1;
    s+=`<circle cx="${x(p.i)}" cy="${y(p.v)}" r="${last?3.6:2.6}" fill="${col}"/>`;
    s+=`<text x="${x(p.i)}" y="${y(p.v)-6}" font-size="10" font-weight="700" fill="${col}" text-anchor="middle">${p.v}</text>`;
    s+=`<text x="${x(p.i)}" y="${H-4}" font-size="8" fill="#aab2bd" text-anchor="middle">${sems[p.i]}</text>`;
  });
  return s+'</svg>';
}
// 학기별 전체 평균 석차등급 추이
function semTrendSvg(tr){
  if(!tr.length) return '';
  const W=430,H=98,pl=26,pr=42,pt=16,pb=24;
  const x=i=>pl+(W-pl-pr)*i/Math.max(1,tr.length-1); const y=v=>pt+(H-pt-pb)*(v-1)/(SCALE-1);
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  (SCALE===5?[1,3,5]:[1,5,9]).forEach(g=>s+=`<line x1="${pl}" y1="${y(g)}" x2="${W-pr}" y2="${y(g)}" stroke="#eef1f4"/><text x="${pl-5}" y="${y(g)+3}" font-size="9" fill="#9aa4b0" text-anchor="end">${g}</text>`);
  const d=tr.map((t,k)=>(k?'L':'M')+x(k)+' '+y(t.avgRank)).join(' ');
  s+=`<path d="${d}" fill="none" stroke="#3b6ea5" stroke-width="2.4"/>`;
  tr.forEach((t,k)=>s+=`<circle cx="${x(k)}" cy="${y(t.avgRank)}" r="3.4" fill="#3b6ea5"/><text x="${x(k)}" y="${y(t.avgRank)-8}" font-size="10" fill="#3b6ea5" font-weight="700" text-anchor="middle">${t.avgRank}</text><text x="${x(k)}" y="${H-7}" font-size="10" fill="#9aa4b0" text-anchor="middle">${t.sem}</text>`);
  return s+'</svg>';
}

// 학년별 탐구 깊이 추이(성장 궤적)
function growthSvg(rows){
  if(rows.length<2) return '';
  const W=430,H=118,pl=34,pr=18,pt=16,pb=24;
  const xs=i=>pl+(W-pl-pr)*i/(rows.length-1); const y=v=>pt+(H-pt-pb)*(1-v/5);
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  [['상',5],['중',2.5],['하',0]].forEach(([lab,v])=>s+=`<line x1="${pl}" y1="${y(v)}" x2="${W-pr}" y2="${y(v)}" stroke="#eef1f4"/><text x="${pl-6}" y="${y(v)+3}" font-size="10" fill="#9aa4b0" text-anchor="end">${lab}</text>`);
  const d=rows.map((r,k)=>(k?'L':'M')+xs(k)+' '+y(r.avgDepth)).join(' ');
  s+=`<path d="${d}" fill="none" stroke="#3b6ea5" stroke-width="2.4"/>`;
  rows.forEach((r,k)=>s+=`<circle cx="${xs(k)}" cy="${y(r.avgDepth)}" r="3.6" fill="#3b6ea5"/><text x="${xs(k)}" y="${y(r.avgDepth)-8}" font-size="10.5" fill="#3b6ea5" font-weight="700" text-anchor="middle">${r.band}</text><text x="${xs(k)}" y="${H-7}" font-size="10" fill="#9aa4b0" text-anchor="middle">${r.grade}학년</text>`);
  return s+'</svg>';
}
// 교과 융합 지도(허브-스포크): 연결=초록 실선, 빈 공간=회색 점선
function fusionSvg(fm){
  const nodes=fm.nodes,N=nodes.length; if(!N) return '';
  const W=560,H=300,cx=W/2,cy=H/2,R=108; const main=fm.main[0]||'진로';
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  const pos=nodes.map((nd,i)=>{const a=-Math.PI/2+i*2*Math.PI/N;return{nd,nx:cx+R*Math.cos(a),ny:cy+R*Math.sin(a)}});
  pos.forEach(({nd,nx,ny})=>s+=`<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${nd.present?'#2f8f5f':'#ccd0d6'}" stroke-width="${nd.present?2:1.2}"${nd.present?'':' stroke-dasharray="4 4"'}/>`);
  pos.forEach(({nd,nx,ny})=>{const col=nd.present?'#2f8f5f':'#aeb4bd',bg=nd.present?'#eaf5ef':'#f4f5f7';
    s+=`<rect x="${nx-33}" y="${ny-15}" width="66" height="30" rx="8" fill="${bg}" stroke="${col}" stroke-width="1.4"${nd.present?'':' stroke-dasharray="4 3"'}/>`;
    s+=`<text x="${nx}" y="${ny-1}" text-anchor="middle" font-size="12" font-weight="700" fill="${nd.present?'#1f2733':'#9aa4b0'}">${nd.group}</text>`;
    s+=`<text x="${nx}" y="${ny+11}" text-anchor="middle" font-size="9" fill="${nd.present?'#2f8f5f':'#aeb4bd'}">${nd.present?nd.n+'회':'빈 공간'}</text>`;});
  s+=`<circle cx="${cx}" cy="${cy}" r="31" fill="#2f6f4f"/><text x="${cx}" y="${cy-1}" text-anchor="middle" font-size="${main.length>4?10:12}" font-weight="700" fill="#fff">${esc(main)}</text><text x="${cx}" y="${cy+12}" text-anchor="middle" font-size="8" fill="#cfe6d8">진로 핵심</text>`;
  return s+'</svg>';
}
// 역량 밸런스 방사형(레이더)
function radarSvg(axes){
  const N=axes.length, W=360,H=300,cx=W/2,cy=H/2+4,R=92;
  const pt=(i,rr)=>{const a=-Math.PI/2+i*2*Math.PI/N;return [cx+rr*Math.cos(a),cy+rr*Math.sin(a)];};
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  [0.25,0.5,0.75,1].forEach(f=>s+=`<polygon points="${axes.map((_,i)=>pt(i,R*f).join(',')).join(' ')}" fill="none" stroke="#e6e9ee"/>`);
  axes.forEach((_,i)=>{const [x,y]=pt(i,R);s+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e6e9ee"/>`;});
  s+=`<polygon points="${axes.map((a,i)=>pt(i,R*a.norm).join(',')).join(' ')}" fill="rgba(47,111,79,.22)" stroke="#2f6f4f" stroke-width="2"/>`;
  axes.forEach((a,i)=>{const [x,y]=pt(i,R*a.norm);s+=`<circle cx="${x}" cy="${y}" r="3" fill="#2f6f4f"/>`;});
  axes.forEach((a,i)=>{const [x,y]=pt(i,R+15);const anch=Math.abs(x-cx)<10?'middle':(x>cx?'start':'end');s+=`<text x="${x}" y="${y}" font-size="11" font-weight="600" fill="#1f2733" text-anchor="${anch}">${esc(a.axis)}</text><text x="${x}" y="${y+12}" font-size="9" fill="#9aa4b0" text-anchor="${anch}">${a.value}</text>`;});
  return s+'</svg>';
}
// 학년×영역 활동 밀도 히트맵
function actHeatSvg(hd){
  const {grades,rows,max}=hd; if(!grades.length)return '';
  const cw=56,chh=30,lw=52,th=22,W=lw+grades.length*cw+6,H=th+rows.length*chh+4;
  const col=n=>`rgba(47,111,79,${(0.06+(n/max)*0.85).toFixed(2)})`;
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  grades.forEach((g,i)=>s+=`<text x="${lw+i*cw+cw/2}" y="${th-7}" font-size="10" fill="#6b7684" text-anchor="middle">${g}학년</text>`);
  rows.forEach((row,ri)=>{
    s+=`<text x="${lw-6}" y="${th+ri*chh+chh/2+4}" font-size="10.5" fill="#1f2733" text-anchor="end">${esc(row.area)}</text>`;
    row.cells.forEach((c,ci)=>{const x=lw+ci*cw,y=th+ri*chh;s+=`<rect x="${x+2}" y="${y+2}" width="${cw-4}" height="${chh-4}" rx="4" fill="${col(c.n)}"/><text x="${x+cw/2}" y="${y+chh/2+4}" font-size="10" font-weight="700" fill="${c.n>max*0.55?'#fff':'#9aa4b0'}" text-anchor="middle">${c.n||''}</text>`;});
  });
  return s+'</svg>';
}
// 썬버스트(계층 원형): 안=영역, 중간=과목/영역, 바깥=대표 키워드
function _arc(cx,cy,r0,r1,a0,a1){const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];const lg=(a1-a0)>Math.PI?1:0;const[x0,y0]=p(r1,a0),[x1,y1]=p(r1,a1),[x2,y2]=p(r0,a1),[x3,y3]=p(r0,a0);return `M${x0} ${y0} A${r1} ${r1} 0 ${lg} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${lg} 0 ${x3} ${y3} Z`;}
function sunburstSvg(sb){
  if(!sb.total)return '';
  const W=380,H=360,cx=W/2,cy=H/2,r0=30,r1=68,r2=104,r3=138;
  const areaCol={'세특':'#2f6f4f','창체':'#7a5bb0','행특':'#3b6ea5'};
  let s=`<svg viewBox="0 0 ${W} ${H}">`, a=-Math.PI/2;
  sb.areas.forEach(ar=>{
    const span=ar.chars/sb.total*2*Math.PI,a0=a,a1=a+span,col=areaCol[ar.name]||'#8a94a0';
    s+=`<path d="${_arc(cx,cy,r0,r1,a0,a1)}" fill="${col}"/>`;
    const mid=(a0+a1)/2;s+=`<text x="${cx+((r0+r1)/2)*Math.cos(mid)}" y="${cy+((r0+r1)/2)*Math.sin(mid)+3}" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${esc(ar.name)}</text>`;
    let ca=a0;
    ar.children.slice().sort((x,y)=>y.chars-x.chars).forEach((c,ci)=>{
      const cs=c.chars/ar.chars*span,c0=ca,c1=ca+cs,cm=(c0+c1)/2;
      s+=`<path d="${_arc(cx,cy,r1,r2,c0,c1)}" fill="${col}" fill-opacity="${(0.3+0.45*(ci%2)).toFixed(2)}" stroke="#fff" stroke-width="0.7"/>`;
      if(cs>0.26)s+=`<text x="${cx+((r1+r2)/2)*Math.cos(cm)}" y="${cy+((r1+r2)/2)*Math.sin(cm)+3}" font-size="8.5" fill="#1f2733" text-anchor="middle">${esc(c.name.length>7?c.name.slice(0,7):c.name)}</text>`;
      if(c.kw&&cs>0.2){s+=`<path d="${_arc(cx,cy,r2,r3,c0,c1)}" fill="${col}" fill-opacity="0.14" stroke="#fff" stroke-width="0.5"/><text x="${cx+((r2+r3)/2)*Math.cos(cm)}" y="${cy+((r2+r3)/2)*Math.sin(cm)+3}" font-size="8" fill="#6b7684" text-anchor="middle">${esc(c.kw)}</text>`;}
      ca=c1;
    });
    a=a1;
  });
  return s+'</svg>';
}
// 키워드 연결 네트워크(소스노드=교과·창체, 키워드노드, 여러 소스 겹치면 중앙쪽·주황)
function networkSvg(net){
  if(!net.areas.length||!net.keywords.length)return '';
  const W=560,H=400,cx=W/2,cy=H/2,R=138;
  const areaCol={'세특':'#2f6f4f','창체':'#7a5bb0'};
  const apos={}; net.areas.forEach((ar,i)=>{const a=-Math.PI/2+i*2*Math.PI/net.areas.length;apos[ar.id]={x:cx+R*Math.cos(a),y:cy+R*Math.sin(a),a};});
  const kpos=net.keywords.map(kw=>{const angs=kw.areas.map(id=>apos[id]?apos[id].a:0);const mx=angs.reduce((s,a)=>s+Math.cos(a),0)/angs.length,my=angs.reduce((s,a)=>s+Math.sin(a),0)/angs.length;const ma=Math.atan2(my,mx);const rr=kw.areas.length>1?R*0.4:R*0.72;return {kw,x:cx+rr*Math.cos(ma),y:cy+rr*Math.sin(ma)};});
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  kpos.forEach(kp=>kp.kw.areas.forEach(id=>{if(apos[id])s+=`<line x1="${apos[id].x}" y1="${apos[id].y}" x2="${kp.x}" y2="${kp.y}" stroke="${kp.kw.areas.length>1?'#c98a3a':'#dae0e6'}" stroke-width="${kp.kw.areas.length>1?1.6:1}"/>`;}));
  net.areas.forEach(ar=>{const p=apos[ar.id],col=areaCol[ar.type]||'#3b6ea5';s+=`<circle cx="${p.x}" cy="${p.y}" r="22" fill="${col}"/><text x="${p.x}" y="${p.y+3}" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${esc(ar.label)}</text>`;});
  kpos.forEach(kp=>{const m=kp.kw.areas.length>1;s+=`<circle cx="${kp.x}" cy="${kp.y}" r="${m?7:5}" fill="${m?'#c98a3a':'#9aa4b0'}"/><text x="${kp.x}" y="${kp.y-9}" font-size="9.5" font-weight="${m?700:400}" fill="#1f2733" text-anchor="middle">${esc(kp.kw.k)}</text>`;});
  return s+'</svg>';
}
function render(){
  ensureModal();
  const {parsed:p,analysis:a,set}=DATA[idx];
  SCALE=p.scale||9;
  const hope=a.hope; const hy=Object.keys(hope).sort();
  const strongTop=a.strength.slice(0,3).map(g=>g.group);
  const hm=a.heatmap;
  // 서사 한 줄(사실 기반)
  const hopeEvo = hy.length>=2 && hope[hy[0]]!==hope[hy[hy.length-1]]
    ? `${hy[0]}학년 '${hope[hy[0]]}'에서 ${hy[hy.length-1]}학년 '${hope[hy[hy.length-1]]}'(으)로 관심이 이어졌고,`
    : (hope[hy[0]]?`희망분야 '${hope[hy[0]]}'와 관련해,`:'');
  const narrative = `${hopeEvo} 진로 핵심어가 ${hm.linkedSubjects}개 교과·활동에서 총 ${hm.total}회 확인됩니다. 상대적으로 강한 교과는 ${strongTop.join('·')}입니다.`;

  let h=`<div class="hero">
    <h1>${nm(p.meta.name)} <span style="font-size:14px;color:var(--sub);font-weight:400">생기부 컨설팅 리포트</span>${DATA[idx].bench?` <span class="bench">🎓 ${esc(DATA[idx].bench)}</span>`:''}</h1>
    <div class="meta">${p.meta.years.map(y=>`${y.grade}학년 ${anon?'':y.class+'반 '+y.no+'번'}`).join(' · ')} · 진로군 태그: ${set}</div>
    <div class="hope">${hy.map((y,i)=>`${i?'<span class=arrow>→</span>':''}<span class="chip">${y}학년 ${esc(hope[y])}</span>`).join('')}</div>
    <div class="narr">${esc(narrative)}</div>
  </div>`;

  // 0) 자동 추천 키워드(빈도 기반) + 원문 문장 클릭 추적
  const auto=a.auto||[]; const hasKwBox=!!document.getElementById('kw');
  if(auto.length){
    h+=`<div class="card"><h2>🔎 자동 추천 키워드 <span style="font-size:12px;color:var(--sub);font-weight:400">— 생기부에 자주 나온 유의미 어휘</span></h2>
      <div class="desc">불용어·평가어를 제거하고 뽑은 <b>빈도 상위 어휘</b>입니다(형태소 근사). 진로 키워드를 정할 때 출발점으로 쓰세요. <b>칩을 클릭하면 그 단어가 쓰인 원문 문장</b>을 모아 보여줍니다(면접·검토용).${hasKwBox?' 오른쪽 <b>＋</b>는 위 진로 키워드 입력창에 추가합니다.':''}</div>
      <div class="akw-wrap">${auto.map(k=>`<span class="akw" data-kw="${esc(k.word)}" title="원문 문장 보기">${esc(k.word)} <b>${k.n}</b>${hasKwBox?`<button class="akw-add" data-addkw="${esc(k.word)}" title="진로 키워드에 추가">＋</button>`:''}</span>`).join('')}</div>
    </div>`;
    // 워드 클라우드(빈도 크기 시각화)
    const mx=Math.max(...auto.map(k=>k.n)), mn=Math.min(...auto.map(k=>k.n));
    const wsize=n=>(14+((n-mn)/((mx-mn)||1))*24).toFixed(1);
    const wcol=['#2f6f4f','#3b6ea5','#7a5bb0','#b5762a','#c0603a','#2f8f6f'];
    h+=`<div class="card"><h2>☁️ 키워드 클라우드</h2>
      <div class="desc">생기부에 자주 등장한 어휘를 <b>빈도 크기</b>로 표현했습니다(클수록 자주 등장). <b>단어를 클릭하면 원문 문장</b>이 뜹니다 — 상담 시 학생이 자기 생기부의 방향을 직관적으로 파악하기 좋습니다.</div>
      <div class="wcloud">${auto.map((k,i)=>`<span class="wcw" data-kw="${esc(k.word)}" style="font-size:${wsize(k.n)}px;color:${wcol[i%wcol.length]}" title="${k.n}회 · 클릭하면 원문">${T(k.word)}</span>`).join('')}</div>
    </div>`;
    // 계층형 썬버스트(생기부 텍스트 비중)
    const sb=a.sunburst;
    if(sb && sb.total){
      h+=`<div class="card"><h2>🌳 생기부 구성 썬버스트</h2>
        <div class="desc">생기부 텍스트를 <b>안쪽=영역(세특/창체/행특) → 중간=과목·활동 → 바깥=대표 키워드</b> 계층으로 쪼갰습니다. 면적(글자수)으로 <b>어떤 과목·활동이 굵직한 뼈대</b>인지 한눈에 파악합니다.</div>
        <div style="text-align:center">${sunburstSvg(sb)}</div>
      </div>`;
    }
  }

  // 1) 강점맵: 국영수사과 5개 과목별 미니 추이 + 성취도 도넛
  const achv={}; p.scores.filter(s=>s.type==='석차'&&s.achv).forEach(s=>achv[s.achv]=(achv[s.achv]||0)+1);
  const CORE5=['국어','수학','영어','사회','과학'];
  const s5=CORE5.map(g=>a.strength.find(x=>x.group===g)).filter(Boolean);
  const sems4=['1-1','1-2','2-1','2-2'];
  h+=`<div class="card"><h2>📈 성적 강점맵</h2><div class="desc">국·영·수·사·과 5개 교과군의 학기별 석차등급 추이(과목별 미니 그래프, 위로 갈수록 상위 등급) + 성취도 분포. 실측입니다.</div>
    <div class="sparks">${s5.map(g=>{
      const arrow=g.trend>0?'↑':g.trend<0?'↓':'→'; const acol=g.trend>0?'#2f8f5f':g.trend<0?'#c0603a':'#8a94a0';
      return `<div class="spark"><div class="sp-top"><span class="sp-name">${g.group}</span><span class="sp-grade" style="background:${gcol(Math.round(g.latest))}">${g.latest}등급</span></div>${miniSpark(g.semAvg,gradeColor[g.group])}<div class="sp-tr" style="color:${acol}">${arrow} ${g.first}→${g.latest}등급 ${g.trend>0?'(향상)':g.trend<0?'(하락)':'(유지)'}</div></div>`;
    }).join('')}</div>
    <div class="donutwrap">${donutSvg(achv)}<div class="dleg">${['A','B','C','D','E'].filter(k=>achv[k]).map(k=>`<div><i style="background:${achvCol[k]}"></i>${k} ${achv[k]}과목</div>`).join('')}</div></div>
  </div>`;

  // 1.3) 사정관의 눈 — Key Highlights (동기·과정·산출이 고루 드러난 탐구 요약)
  const inq=a.inquiry||{rich:[],shallow:[],external:[]}, av=a.actions||{total:0,cats:[]};
  const topComp=(a.competency||[]).slice().sort((x,y)=>y.total-x.total)[0];
  const topTh=(a.thread&&a.thread.keywords[0])||null;
  const tagOf=i=>[i.motive&&'동기',i.process&&'과정',i.overcome&&'극복',i.external&&'자료확장',i.output&&'산출'].filter(Boolean);
  h+=`<div class="card"><h2>🌟 사정관의 눈 — Key Highlights</h2>
    <div class="desc">입학사정관이 긍정적으로 볼 만한 지점 — <b>동기·과정·산출이 고루 드러난 탐구</b>와 이 학생의 강점을 요약했습니다.</div>
    ${inq.rich.length?inq.rich.slice(0,3).map(i=>`<div class="subj-hi"><span class="subj core">${esc(i.subject)}</span> <span class="g" style="color:var(--sub);font-size:11px">${i.grade}학년</span> ${tagOf(i).map(t=>`<span class="tag">${t}</span>`).join('')}<ul class="hi-list"><li>${T(i.text)}</li></ul></div>`).join(''):'<div class="cev" style="opacity:.65">동기·과정·산출이 모두 담긴 탐구형 세특은 아직 뚜렷하지 않습니다. 아래 강점·역량 카드를 참고하세요.</div>'}
    <div class="note">가장 일관된 진로 축: ${topTh?`<b>${esc(topTh.keyword)}</b> (${topTh.docs}곳${topTh.fusion?' · 교과/영역 융합':''})`:'—'} &nbsp;·&nbsp; 가장 강한 역량: ${topComp?`<b>${esc(topComp.label)}</b> (${topComp.total}회)`:'—'} &nbsp;·&nbsp; 주도성 행위 동사 <b>${av.total}</b>회</div>
  </div>`;

  // 1.4) 학년별 역량 성장 궤적
  const gt=a.growth;
  if(gt){
    h+=`<div class="card"><h2>📈 학년별 성장 궤적</h2>
      <div class="desc">학년이 오르며 관심이 <b>넓고 얕은 호기심 → 좁고 깊은 전공 탐구</b>로 발전하는지 추적합니다. 파란 선=학년별 <b>탐구 깊이</b>를 <b>상·중·하</b>로 표기(동기·과정·산출 등 요소가 얼마나 갖춰졌는지 — 등급이 아닙니다). 아래에 학년별 진로 키워드와 <b>주도성 행위 수준</b>(수집→분석→기획·비판)을 함께 봅니다.</div>
      ${gt.multi?`<div style="text-align:center">${growthSvg(gt.rows)}</div>`:''}
      ${gt.rows.map(r=>`<div class="gt-row"><span class="gt-g">${r.grade}학년</span><div class="gt-body"><div>${r.keywords.length?r.keywords.map(k=>`<span class="tag">${esc(k.k)}×${k.n}</span>`).join(''):'<span class="g" style="color:var(--sub)">진로 핵심어 미검출</span>'}</div><div class="gt-meta">행위 수준 <b>${esc(r.tierLabel)}</b>${r.verbs.length?` <span class="g">(${r.verbs.slice(0,4).map(esc).join(', ')})</span>`:''} · 탐구 깊이 <b>${esc(r.band)}</b> · 진로 연계 교과 <b>${r.breadth}</b>개</div></div></div>`).join('')}
      <div class="note">${esc(gt.note)}</div>
    </div>`;
  }

  // 1.45) 학년×영역 활동 밀도 히트맵
  const ah=a.actHeat;
  if(ah && ah.grades.length){
    h+=`<div class="card"><h2>🌡️ 학년별 활동 밀도</h2>
      <div class="desc">자율·동아리·진로·세특 각 영역에서 <b>진로 핵심어</b>가 학년별로 얼마나 등장했는지 색 농도로 표현했습니다(짙을수록 많음). 학년이 오를수록 짙어지면 전공 심화가 '우상향'으로 이어진다는 근거입니다.</div>
      <div style="overflow-x:auto">${actHeatSvg(ah)}</div>
    </div>`;
  }

  // 2) 진로 타임라인
  // 1.5) 합격 기준 대비 (계열 기준 있을 때)
  const bench=DATA[idx].benchmark, cmp=DATA[idx].cmp;
  if(bench && cmp && cmp.length){
    const rbar=m=>{
      const lo0=Math.min(m.min,m.value), hi0=Math.max(m.max,m.value), rg=(hi0-lo0)||1, lo=lo0-rg*0.1, hi=hi0+rg*0.1;
      const pct=x=>((x-lo)/(hi-lo)*100).toFixed(1);
      const good=m.dir==='low'?m.value<=m.median:m.value>=m.median; const mc=good?'#2f8f5f':'#c98a3a';
      return `<div class="rb${m.lowDisc?' dim':''}"><span>${esc(m.label)} <span class="g">${m.dir==='low'?'↓좋음':'↑좋음'}</span></span><span class="track" title="기준 ${m.min}~${m.max} · 중앙 ${m.median} · 이 학생 ${m.value}"><span class="band" style="left:${pct(m.min)}%;width:${(pct(m.max)-pct(m.min)).toFixed(1)}%"></span><span class="med" style="left:${pct(m.median)}%"></span><span class="mark" style="left:${pct(m.value)}%;background:${mc}"></span></span><span class="val" style="color:${mc}">${m.value}</span></div>`;
    };
    const main=cmp.filter(m=>!m.lowDisc), low=cmp.filter(m=>m.lowDisc);
    h+=`<div class="card"><h2>🎯 합격 기준 대비 <span class="bench">🎓 ${esc(bench.setName)} 합격 N=${bench.n}</span></h2>
      <div class="desc">이 학생 지표를 <b>${esc(bench.setName)} 합격 사례 ${bench.n}명</b>의 범위(연한 띠)·중앙값(초록 선)과 대조합니다. 마커=이 학생. ${bench.n<5?'<b>⚠ 소표본이라 참고치입니다.</b> ':''}판정이 아니라 위치만 보여줍니다 — 생기부는 입시의 일부(성적·수능·면접 등)임을 감안하세요.</div>
      ${main.map(rbar).join('')}
      ${low.length?`<div class="desc" style="margin:10px 0 0">변별력 낮은 지표(대부분 학생이 비슷 — 참고만):</div>${low.map(rbar).join('')}`:''}
    </div>`;
  }

  h+=`<div class="card"><h2>🧭 창체 진화 타임라인</h2><div class="desc">자율·동아리·진로 활동에서 <b>긍정적으로 평가될 요소</b>를 학년 순으로 추렸습니다. 칩=드러난 강점(리더십·심화·주도 등).</div>
    <div class="tl">${a.creativeHi.map(gr=>`<div class="yr-head">${gr.grade}학년</div>${gr.areas.map(ar=>ar.items.map(it=>`<div class="ev"><span class="k ${ar.area}">${ar.area}</span> ${it.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}<div class="t">${T(it.gist||it.text)}</div></div>`).join('')).join('')}`).join('')}</div>
  </div>`;

  // 2.5) 세특 리뷰 — 정독 포인트 (원문 요약, 어디에 집중해 읽을지)
  h+=`<div class="card"><h2>📚 세특 리뷰 — 정독 포인트</h2><div class="desc">방대한 세특을 <b>과목별 핵심만 압축</b>했습니다. 선생님이 원문을 정독할 때 <b>어디에 힘 주어 읽을지</b> 짚어주는 리뷰입니다 — <b>파란 태그=평가 관점</b>(그 과목에서 드러난 강점 축), 아래는 핵심 조각 요약. <span class="subj core">초록칩</span>·<span class="dot">●N</span> = 진로 핵심어 N회.</div>
    ${a.setuk.map(gr=>`<div class="yr-head">${gr.grade}학년</div>${gr.subjects.map(s=>`<div class="rv"><div class="rv-h"><span class="subj ${s.core?'core':''}">${esc(s.subject)}</span>${s.core?` <span class="dot">●${s.core}</span>`:''} ${(s.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${s.points>2?` <span class="rv-more">+${s.points-2}개 더</span>`:''}</div><ul class="hi-list">${s.items.slice(0,2).map(it=>`<li>${T(it.gist||it.text)}</li>`).join('')}</ul></div>`).join('')}`).join('')}
  </div>`;

  // 2.7) 입학사정관 3대 역량 신호(학업·진로·공동체)
  const comp=a.competency||[];
  h+=`<div class="card"><h2>🎓 입학사정관 3대 역량 신호</h2>
    <div class="desc">대학 입학사정관 <b>공통 평가요소</b>(학업·진로·공동체 역량, 5개 대학 공동기준) 관점에서, 세특·창체·행동특성 원문에 드러난 표현을 <b>근거와 함께</b> 모았습니다. 어느 역량이 어디서 보이는지를 제시하며, 우열 판정은 하지 않습니다.</div>
    ${comp.map(g=>`<div class="cgrp"><div class="chd">${g.emoji} ${esc(g.label)} <span class="cn">${g.total}회</span></div><div class="cdesc">${esc(g.desc)}</div>
      <div class="cbadges">${g.subs.map(s=>`<span class="cbadge${s.n?'':' off'}">${s.emoji} ${esc(s.key)} <b>${s.n}</b></span>`).join('')}</div>
      ${g.top.map(e=>`<div class="cev"><span class="cev-src">${e.grade}학년·${esc(e.src)}</span> ${T(e.text)}</div>`).join('')||'<div class="cev" style="opacity:.55">이 역량에서 뚜렷한 표현은 확인되지 않았습니다.</div>'}
    </div>`).join('')}
    ${a.balance&&a.balance.alerts.length?a.balance.alerts.map(al=>`<div class="balert">⚖️ <b>균형 점검:</b> ${esc(al.text)}</div>`).join(''):(a.balance?`<div class="note" style="color:var(--accent)">⚖️ 학업 ${a.balance.academic} · 진로 ${a.balance.career} · 공동체 ${a.balance.community} — 세 역량이 비교적 고르게 나타납니다.</div>`:'')}
    <div class="note">표현 등장 여부(실측)만 집계합니다. 같은 문장이 여러 역량에 잡힐 수 있으며, 비어 있는 항목은 '해당 표현이 원문에 없다'는 뜻일 뿐 역량 부족을 의미하지 않습니다.</div>
  </div>`;

  // 2.72) 역량 밸런스 방사형(레이더)
  if(a.radar&&a.radar.length){
    h+=`<div class="card"><h2>🕸️ 역량 밸런스 (레이더)</h2>
      <div class="desc">추출된 신호를 <b>학업·전공적합성·리더십/소통·자기주도·성실/배려</b> 5개 축으로 매핑해 균형을 한눈에 봅니다. 넓게 펼쳐질수록 고른 강점, 한쪽으로 치우치면 보완 지점입니다(축별 소프트 상한 기준 정규화).</div>
      <div style="text-align:center">${radarSvg(a.radar)}</div>
    </div>`;
  }

  // 2.8) 진로 일관성·연계(career thread)
  const th=a.thread;
  if(th && th.keywords.length){
    h+=`<div class="card"><h2>🔗 진로 일관성·연계</h2>
      <div class="desc">입학사정관은 <b>한 주제가 여러 학년·교과·활동으로 이어지는 연계성</b>을 높게 봅니다. 가장 여러 곳에서 반복된 진로 핵심어와 그 등장 위치입니다(교과선택→활동→행동특성이 하나의 서사로 연결되는지 확인용).</div>
      ${th.keywords.map(k=>`<div class="thd"><div class="thd-h"><b>${esc(k.keyword)}</b> <span class="g">${k.docs}곳 · ${k.grades.length?k.grades.join('·')+'학년':'학년 미상'} · 총 ${k.total}회</span></div>
        <div class="thd-src">${k.sources.slice(0,14).map(s=>`<span class="thd-chip t-${s.type}">${s.grade!=null?s.grade+'학년 ':''}${esc(s.label)}${s.n>1?' ×'+s.n:''}</span>`).join('')}</div></div>`).join('')}
      <div class="note">여러 학년·구분(세특·창체·수상·행특)에 고루 걸칠수록 '일관된 진로 서사'로 읽힙니다. <b>서로 다른 교과·영역에 걸치면(융합)</b> 사정관이 특히 높게 봅니다. 진로군 키워드를 바꾸면 다른 축으로 다시 볼 수 있습니다.</div>
    </div>`;
  }

  // 2.85) 전공적합성 교과 융합 지도
  const fm=a.fusion;
  if(fm && fm.nodes.length){
    h+=`<div class="card"><h2>🕸️ 전공적합성 교과 융합 지도</h2>
      <div class="desc">메인 진로 키워드(<b>${esc(fm.main[0]||'—')}</b>)가 <b>서로 다른 교과</b>에서 탐구됐는지를 지도로 봅니다. <span style="color:#2f8f5f;font-weight:700">초록 실선</span>=탐구가 연결된 교과, <span style="color:#9aa4b0;font-weight:700">회색 점선</span>=아직 <b>빈 공간</b>(융합 확장 여지). 최상위권일수록 하나의 주제를 여러 교과에서 다각도로 본 '융합형'을 선호합니다.</div>
      <div style="text-align:center">${fusionSvg(fm)}</div>
      ${fm.strong.length?`<div class="note">✅ 연결된 교과: ${fm.strong.map(s=>`<b>${esc(s.group)}</b>(${s.subjects.slice(0,2).map(x=>esc(x.subject)).join(', ')} · ${s.n}회)`).join(' &nbsp;·&nbsp; ')}</div>`:''}
      ${fm.gaps.length?`<div class="note">⭕ 빈 공간(확장 여지): <b>${fm.gaps.map(g=>esc(g.group)).join(', ')}</b> — 이 교과의 수행평가에 진로 주제를 접목하면 융합 시각을 보여줄 수 있습니다(아래 '다음 학기 액션 플랜' 참고).</div>`:'<div class="note">주요 교과에 고루 연결되어 있습니다 — 융합 폭이 넓습니다.</div>'}
    </div>`;
  }

  // 2.86) 키워드 연결 네트워크(꼬리물기 — 교과·활동을 잇는 키워드)
  const net=a.network;
  if(net && net.areas.length && net.keywords.length){
    h+=`<div class="card"><h2>🌌 키워드 연결 네트워크</h2>
      <div class="desc">교과군·창체(<span style="color:#2f6f4f;font-weight:700">초록=세특</span>·<span style="color:#7a5bb0;font-weight:700">보라=창체</span>)를 노드로 두고, 진로 핵심어를 연결했습니다. <b><span style="color:#c98a3a">주황 키워드</span>=여러 교과·활동에 걸친 것</b>(중앙 배치) — 교과에서 배운 개념이 동아리·진로로 이어진 '꼬리물기·융합'을 직관적으로 보여줍니다.</div>
      <div style="text-align:center">${networkSvg(net)}</div>
    </div>`;
  }

  // 2.9) 주도성 행위 동사(Action Verb)
  h+=`<div class="card"><h2>⚡ 주도성 행위 동사</h2>
    <div class="desc">학생의 <b>능동성</b>을 드러내는 동사(질문·기획·분석·비판·대안 제시 등)가 세특·창체에 등장한 빈도입니다. 결과가 아니라 '스스로 무엇을 했는가'의 근거로, 표현 등장만 집계합니다.</div>
    <div class="cbadges">${av.cats.map(c=>`<span class="cbadge${c.n?'':' off'}">${esc(c.v)} <b>${c.n}</b></span>`).join('')}</div>
    ${av.cats.filter(c=>c.n).slice(0,3).map(c=>c.examples.map(e=>`<div class="cev"><span class="cev-src">${e.grade}학년·${esc(e.src)}</span> ${T(e.text)}</div>`).join('')).join('')||'<div class="cev" style="opacity:.65">주도성을 드러내는 행위 동사가 뚜렷하게 확인되지 않았습니다.</div>'}
  </div>`;

  // 3) 키워드 히트맵(가로막대 + 근거 칩)
  const maxN=Math.max(1,...hm.subjects.map(s=>s.n));
  h+=`<div class="card"><h2>🔬 교과·활동 × 진로 연계</h2>
    <div class="desc">각 교과 세특·창체 원문에서 <b>진로 핵심어</b>(그 진로에 특이적인 단어)가 등장한 횟수(가로 막대). 아래 <span class="evk">초록 칩=핵심어 근거</span> <span class="evk rel">회색=연관어(여러 분야 공통 일반어·참고용)</span>. <b>칩을 클릭하면 그 단어가 쓰인 원문 문장</b>이 뜹니다. 횟수만 제시하며 질 평가는 하지 않습니다.</div>
    ${hm.subjects.filter(s=>s.n>0).slice(0,10).map(s=>`<div class="bar"><span>${esc(s.subject)} <span class="g">${s.group}</span></span><span class="track"><span class="fill" style="width:${Math.round(s.n/maxN*100)}%"></span></span><span>${s.n}회</span></div><div class="ev-chips">${(s.evidence||[]).slice(0,7).map(e=>`<span class="evk" data-kw="${esc(e.k)}" title="원문 문장 보기">${esc(e.k)}×${e.n}</span>`).join('')}${s.rel>0?`<span class="evk rel">연관어 ${s.rel}회: ${(s.relEvidence||[]).slice(0,4).map(e=>esc(e.k)+'×'+e.n).join(' ')}</span>`:''}</div>`).join('')}
    <div class="legend">창체 영역별 핵심어: ${hm.areas.map(ar=>`${ar.area} ${ar.byYear.map(y=>y.grade+'학년 '+y.n+'회').join(' / ')}`).join(' &nbsp;·&nbsp; ')}</div>
  </div>`;

  // 교사용: 검토 체크리스트 + 원자료
  h+=`<div class="card teacher"><h2>🩺 검토 체크리스트</h2>
    <div class="desc">보완을 검토할 지점 — '부족' 판정이 아니라 근거와 함께 드리는 신호입니다. 판단은 선생님 몫입니다.</div>
    ${a.gaps.map(g=>`<div class="gap"><span>${g.item}</span><span class="sig">${g.signal}</span><span class="g" style="color:var(--sub)">${esc(g.detail)}</span></div>`).join('')}
    <div class="note">가장 강한 진로 연계 활동: ${hm.subjects.filter(s=>s.n>0).slice(0,3).map(s=>s.subject+'('+s.n+')').join(', ')}</div>
  </div>`;

  // 심화 탐구 신호(교사용 진단) — 제미나이 명문대 코어 기반, 등장 여부만
  const adv=a.advanced;
  h+=`<div class="card teacher"><h2>🔬 심화 탐구 신호</h2>
    <div class="desc">명문대·메디컬 학종 합격 패턴(제미나이 코어) 기반 표식의 <b>등장 여부</b>입니다. 탐구의 질·엄밀성 판정이 아니라 '이런 표식이 있나'를 근거와 함께 보여줍니다 — 일반적으로 대부분 비어있는 게 정상입니다.</div>
    ${Object.entries(adv.categories).map(([c,v])=>`<div class="rb2${v.n?'':' dim'}"><span class="cat">${v.emoji} ${c}</span>${v.n?`<span class="evk">${v.n}회</span>${v.evidence.slice(0,6).map(e=>`<span class="evk">${esc(e.k)}×${e.n}</span>`).join('')}<span class="g">@${v.where.slice(0,5).map(esc).join(', ')}</span>`:'<span class="g">— 미확인</span>'}</div>`).join('')}
    <div class="note">📚 종단탐구형 세특(개념→모델링/데이터→제언 공존): <b>${adv.jongdan.length?adv.jongdan.map(esc).join(', '):'없음'}</b></div>
    <div class="note">💯 고마진 과목(원점수−과목평균 ≥20점): <b>${adv.highMargin.length}과목</b> ${adv.highMargin.slice(0,8).map(h=>esc(h.name)+'(+'+h.margin+')').join(', ')}</div>
  </div>`;

  // 아쉬운 점 — Weak Spots (교사용)
  h+=`<div class="card teacher"><h2>⚠ 아쉬운 점 — Weak Spots</h2>
    <div class="desc">동기·과정 없이 <b>활동명·결과 위주</b>로 읽히는 세특입니다. '부족' 판정이 아니라, 학생의 구체적 역할과 탐구 과정을 더 드러낼 여지가 있는 지점입니다.</div>
    ${inq.shallow.length?inq.shallow.slice(0,7).map(i=>`<div class="gap"><span>${esc(i.subject)} <span class="g" style="color:var(--sub)">${i.grade}학년·${i.group}</span></span><span class="sig">결과·활동 위주</span><span class="g" style="color:var(--sub)">${T(i.text)}</span></div>`).join(''):'<div class="note">결과 위주로만 읽히는 세특은 두드러지지 않습니다.</div>'}
    ${inq.external.length?'':'<div class="note">🔎 수업 중 의문을 <b>논문·전공서적·다큐멘터리</b> 등 외부 자료로 확장한 기록이 확인되지 않습니다.</div>'}
  </div>`;

  // 다음 학기 액션 플랜 — Next Step (교사용)
  h+=`<div class="card teacher"><h2>🚀 다음 학기 액션 플랜 — Next Step</h2>
    <div class="desc">현재 생기부에서 <b>비어 있는 축</b>을 근거로, 다음 학기 수행평가·자율동아리에서 시도할 만한 '한 단계 더 깊은' 방향을 자동 제안합니다(규칙 기반 참고안 — 실제 지도는 선생님 판단으로).</div>
    ${(a.nextSteps||[]).map((s,i)=>`<div class="ns"><span class="ns-n">${i+1}</span><div><span class="tag">${esc(s.tag)}</span> ${esc(s.text)}</div></div>`).join('')||'<div class="note">현재 자료에서 특별히 비어 있는 축은 감지되지 않았습니다.</div>'}
  </div>`;

  // 면접·상담 예상 질문 (교사용)
  h+=`<div class="card teacher"><h2>🎤 면접·상담 예상 질문</h2>
    <div class="desc">추출된 활동·키워드·탐구 신호를 조합해 만든 <b>예상 질문</b>입니다. 모의 면접·진로 상담에 바로 활용하세요(규칙 기반 자동 생성 — 학생 맞춤으로 다듬어 쓰시면 좋습니다).</div>
    ${(a.interview||[]).map((q,i)=>`<div class="ns"><span class="ns-n" style="background:var(--accent2)">Q${i+1}</span><div><span class="tag">${esc(q.tag)}</span> ${T(q.q)}</div></div>`).join('')||'<div class="note">질문을 생성할 근거가 부족합니다.</div>'}
  </div>`;

  h+=`<div class="card teacher"><h2>📄 성적 상세</h2>
    <div class="desc"><b>학기별 전체 평균 석차등급 추이</b>(전 석차과목 평균) — 학생의 전반적 성적 흐름.</div>
    ${semTrendSvg(a.semTrend)}
    <div class="desc" style="margin-top:12px">과목×학기 등급 그리드 — 색=등급(진초록=상위, 붉은색=하위). 셀에 마우스를 올리면 원점수/과목평균/표준편차.</div>
    <div style="overflow-x:auto">${gradeGrid(p.scores)}</div>
    <div class="legend">${(SCALE===5?[1,2,3,4,5]:[1,3,5,7,9]).map(r=>`<span><i style="background:${gcol(r)}"></i>${r}등급</span>`).join('')}</div>
    <div class="note">석차등급 체계: ${SCALE}등급제${SCALE===5?' (고교학점제)':''}</div>
  </div>`;

  $('#app').innerHTML=h;
  groupSections();
}

// ── 카드를 접이식 섹션으로 그룹화(제목 매칭 기반, 카드 수정 불필요) ──
const SECTIONS=[
  {key:'summary', title:'🎓 핵심 요약', open:true,  match:['Key Highlights','성적 강점맵','역량 밸런스']},
  {key:'act',     title:'📚 활동·세특·역량', open:true, match:['창체 진화','세특 리뷰','3대 역량','주도성 행위']},
  {key:'career',  title:'🎯 진로·전공 심화', open:true, match:['자동 추천','키워드 클라우드','성장 궤적','활동 밀도','진로 일관성','융합 지도','키워드 연결 네트워크','교과·활동 × 진로','썬버스트','합격 기준']},
  {key:'teacher', title:'👨‍🏫 교사용 진단·상담', open:false, match:['검토 체크','심화 탐구','Weak Spots','Next Step','면접·상담']},
  {key:'raw',     title:'📊 원자료', open:false, match:['성적 상세']},
];
window.__secOpen=window.__secOpen||{};
function groupSections(){
  const app=$('#app'); const hero=app.querySelector(':scope > .hero');
  const cards=[...app.querySelectorAll(':scope > .card')];
  const frag=document.createDocumentFragment(); if(hero) frag.appendChild(hero);
  const assigned=new Set();
  SECTIONS.forEach(sec=>{
    const mine=cards.filter(c=>{const t=c.querySelector('h2')?.textContent||''; return sec.match.some(m=>t.includes(m));});
    if(!mine.length) return; mine.forEach(c=>assigned.add(c));
    const open=(sec.key in window.__secOpen)?window.__secOpen[sec.key]:sec.open;
    const wrap=document.createElement('section'); wrap.className='sec'+(open?' open':'');
    const head=document.createElement('div'); head.className='sec-h';
    head.innerHTML=`<span>${sec.title}</span><span class="sec-cnt">${mine.length}</span><span class="sec-caret">▾</span>`;
    const body=document.createElement('div'); body.className='sec-body'; mine.forEach(c=>body.appendChild(c));
    head.onclick=()=>{ window.__secOpen[sec.key]=wrap.classList.toggle('open'); };
    wrap.appendChild(head); wrap.appendChild(body); frag.appendChild(wrap);
  });
  cards.filter(c=>!assigned.has(c)).forEach(c=>frag.appendChild(c)); // 미분류는 그대로 노출
  app.innerHTML=''; app.appendChild(frag);
}
