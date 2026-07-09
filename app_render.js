const $=s=>document.querySelector(s);
const gradeColor={국어:'#c0603a',수학:'#3b6ea5',영어:'#7a5bb0',한국사:'#b5762a',사회:'#2f8f6f',과학:'#2f6f4f',기타:'#8a94a0'};
function esc(s){return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function nm(n){return anon||blind? (n?n[0]:'')+'○○' : n}
// 강력 블라인드: 이름·학교·대회 등 개인 특정 고유명사 마스킹(표시 단계에서만)
let blind=false;
// 1페이지 상담 브리핑 모드: 핵심 카드만 남기고 나머지는 DOM에서 제외(토글시 render() 재호출로 복원)
let briefMode=false;
const BRIEF_MATCH=['종합 총평','성적 강점맵','역량 밸런스','진로 일관성·연계'];
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
  const W=440,H=168,pl=36,pr=20,pt=26,pb=30;
  const maxK=Math.max(1,...rows.map(r=>r.kwTotal));
  const xs=i=>pl+(W-pl-pr)*i/(rows.length-1); const y=v=>pt+(H-pt-pb)*(1-v/maxK);
  const tierCol={3:'#2f6f4f',2:'#3b8f66',1:'#77b58f',0:'#c0c7cf'};
  let s=`<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ggrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f8f5f" stop-opacity="0.42"/><stop offset="1" stop-color="#2f8f5f" stop-opacity="0.02"/></linearGradient></defs>`;
  [0,0.5,1].forEach(f=>{const v=maxK*f;s+=`<line x1="${pl}" y1="${y(v)}" x2="${W-pr}" y2="${y(v)}" stroke="#eef1f4"/><text x="${pl-6}" y="${y(v)+3}" font-size="9" fill="#9aa4b0" text-anchor="end">${Math.round(v)}</text>`;});
  const line=rows.map((r,k)=>xs(k)+' '+y(r.kwTotal));
  s+=`<path d="M${pl} ${y(0)} L${line.join(' L')} L${xs(rows.length-1)} ${y(0)} Z" fill="url(#ggrad)"/>`;
  s+=`<path d="M${line.join(' L')}" fill="none" stroke="#2f8f5f" stroke-width="3.2" stroke-linejoin="round"/>`;
  rows.forEach((r,k)=>{const cy=y(r.kwTotal);
    s+=`<circle cx="${xs(k)}" cy="${cy}" r="6" fill="#fff" stroke="#2f8f5f" stroke-width="3"/>`;
    s+=`<text x="${xs(k)}" y="${cy-13}" font-size="13" font-weight="800" fill="#2f6f4f" text-anchor="middle">${r.kwTotal}</text>`;
    s+=`<text x="${xs(k)}" y="${H-15}" font-size="10.5" font-weight="700" fill="#6b7684" text-anchor="middle">${r.grade}학년</text>`;
    s+=`<rect x="${xs(k)-16}" y="${H-11}" width="32" height="12" rx="6" fill="${tierCol[r.maxTier]||'#c0c7cf'}"/><text x="${xs(k)}" y="${H-2}" font-size="8" font-weight="700" fill="#fff" text-anchor="middle">${esc(r.band)}</text>`;
  });
  return s+'</svg>';
}
// ── 차트 자동 해석(판단) + 산출 논리 ──
function judgeGrowth(gt){
  if(!gt||!gt.rows.length) return null;
  if(!gt.multi) return {read:'아직 한 학년만 기재되어 성장 궤적 비교는 이릅니다. 상급 학년에서 같은 진로 주제를 이어가면 심화 흐름이 그려집니다.', logic:'세로축=자율·동아리·진로·세특에서 진로 핵심어가 등장한 횟수, 가로축=학년.'};
  const f=gt.rows[0], l=gt.rows[gt.rows.length-1];
  let read;
  if(l.kwTotal>=f.kwTotal*1.2) read=`진로 핵심어가 ${f.grade}학년 ${f.kwTotal}회 → ${l.grade}학년 ${l.kwTotal}회로 늘며 학년이 오를수록 전공 탐구가 짙어졌습니다(우상향). 관심이 구체화·심화되는 바람직한 흐름입니다.`;
  else if(l.kwTotal<=f.kwTotal*0.8) read=`진로 핵심어가 ${f.grade}학년 ${f.kwTotal}회 → ${l.grade}학년 ${l.kwTotal}회로 줄었습니다. 초반에 전공 탐구가 집중됐다가 이후 약해진 형태로, 상급 학년에서 같은 주제를 다시 이어가면 '지속성'이 강해집니다. (학년별 기재 분량 차이일 수도 있으니 원문도 함께 확인하세요.)`;
  else read=`진로 핵심어 빈도가 ${f.kwTotal}→${l.kwTotal}회로 비슷하게 유지됩니다. 꾸준하지만 심화가 뚜렷하진 않으니 후속 탐구로 깊이를 더하면 좋습니다.`;
  const bo=['하','중','상']; if(l.band!==f.band) read+=` 탐구 깊이는 ${f.band}→${l.band}로 ${bo.indexOf(l.band)>bo.indexOf(f.band)?'깊어졌':'낮아졌'}습니다.`;
  return {read, logic:'세로축=진로 핵심어 등장 횟수(전공 몰입도), 점 아래 배지=탐구 깊이 상/중/하. 빈도가 오를수록 전공 탐구가 짙어진 것으로 봅니다.'};
}
function judgeRadar(radar){
  if(!radar||!radar.length) return null;
  const bn=[...radar].sort((a,b)=>b.norm-a.norm), top=bn[0], low=bn[bn.length-1];
  const read = (top.norm-low.norm)<0.28
    ? `다섯 역량이 비교적 고르게 나타나는 균형형입니다. 특정 축에 치우치지 않아 종합적으로 안정적입니다.`
    : `${top.axis}이(가) 가장 두드러지고 ${low.axis}이(가) 상대적으로 약합니다. ${low.axis} 관련 활동·기록을 보완하면 오각형이 더 고르게 채워집니다.`;
  return {read:`${read} (강한 축: ${bn.slice(0,2).map(a=>a.axis+' '+a.pct+'%').join('·')} / 약한 축: ${low.axis} ${low.pct}%)`, logic:'각 축 길이=그 축 자신의 참고 상한 대비 백분율(축마다 독립 계산 — 다른 축과 원시 개수로 직접 비교하지 않습니다). 그래서 한 축의 숫자가 다른 축보다 커도 참고 상한이 다르면 그래프상 더 짧게 보일 수 있습니다.'};
}
function judgeSunburst(sb){
  if(!sb||!sb.total) return null;
  const pct=c=>Math.round(c/sb.total*100);
  const parts=sb.areas.map(a=>`${a.name} ${pct(a.chars)}%`).join(' · ');
  const setuk=sb.areas.find(a=>a.name==='세특'); let topSub='';
  if(setuk){const t=[...setuk.children].sort((x,y)=>y.chars-x.chars).slice(0,2).map(c=>c.name); topSub=` 세특 중에서는 ${t.join('·')} 비중이 커 학업 기록이 뼈대를 이룹니다.`;}
  return {read:`생기부 텍스트 비중은 ${parts}입니다.${topSub}`, logic:'면적=글자수 비중(활동의 양적 비중이며 질 평가는 아닙니다). 안=영역, 중간=과목/활동, 바깥=대표 키워드.'};
}
function judgeFusion(fm){
  if(!fm||!fm.nodes.length) return null;
  const main=fm.main[0]||'진로 핵심어';
  let read;
  if(fm.strong.length && fm.gaps.length) read=`'${main}' 탐구가 ${fm.strong.slice(0,3).map(s=>s.group).join('·')} 교과에서 확인됩니다. ${fm.gaps.map(g=>g.group).join('·')}에는 아직 연결이 없어, 이 교과 수행평가에 같은 주제를 접목하면 '여러 교과에서 다각도로 탐구한' 융합형 인상을 더할 수 있습니다.`;
  else if(fm.strong.length) read=`'${main}' 관련 탐구가 국·영·수·사·과 주요 교과에 고루 연결되어 있어 융합 폭이 넓은 편입니다.`;
  else read=`아직 교과별 연결이 뚜렷하지 않습니다. 세특에 진로 키워드가 드러나는 교과가 늘면 융합 지도가 채워집니다.`;
  return {read, logic:'노드=교과군, 실선(초록)=탐구가 연결된 교과, 점선(회색)=핵심어가 등장하지 않은 교과(빈 공간). 국·영·수·사·과 5개 기준으로 봅니다.'};
}
function judgeNetwork(net){
  if(!net||!net.keywords.length) return null;
  const fusion=net.keywords.filter(k=>k.areas.length>1).sort((a,b)=>b.areas.length-a.areas.length);
  const read = fusion.length
    ? `'${fusion[0].k}' 등 ${fusion.length}개 키워드가 서로 다른 교과·활동에 걸쳐 등장합니다(주황 노드). 한 개념이 교과 수업→동아리→진로활동으로 이어지는 '꼬리물기' 탐구의 근거입니다.`
    : `키워드 대부분이 한 교과·활동에만 나타나 아직 활동 간 연결(꼬리물기)은 뚜렷하지 않습니다. 같은 주제를 동아리나 진로활동으로 확장해 보면 연결선이 늘어납니다.`;
  return {read, logic:'선(엣지)=교과·활동에 그 키워드가 등장했다는 뜻. 주황 노드=2곳 이상에 걸친 키워드(융합), 회색=한 곳에서만 등장.'};
}
function judgeActivityHeat(ah){
  if(!ah||!ah.grades.length) return null;
  if(ah.grades.length<2) return {read:'아직 한 학년만 있어 학년 간 밀도 변화는 비교하기 이릅니다.', logic:'각 칸=학년×영역(자율·동아리·진로·세특)에서 진로 핵심어가 등장한 횟수. 짙을수록 그 학년·영역에 전공 탐구가 몰려 있다는 뜻입니다.'};
  const totals=ah.grades.map(g=>ah.rows.reduce((s,r)=>s+(r.cells.find(c=>c.grade===g)?.n||0),0));
  const f=totals[0], l=totals[totals.length-1];
  const read = l>=f*1.2 ? `학년이 오를수록 전체 색이 짙어져(${f}→${l}회) 진로 관련 활동이 여러 영역에서 꾸준히 확대됐습니다.`
    : l<=f*0.8 ? `초반 학년에 진로 활동이 몰려 있고(${f}회) 최근으로 갈수록 옅어졌습니다(${l}회). 최근 학년 기록이 아직 반영 전일 수도 있습니다.`
    : `학년별 밀도가 ${f}→${l}회로 비슷한 수준을 유지합니다.`;
  return {read, logic:'각 칸=학년×영역(자율·동아리·진로·세특)에서 진로 핵심어가 등장한 횟수, 색 농도로 표현. 짙을수록 그 학년·영역에 전공 탐구가 몰려 있다는 뜻입니다.'};
}
function judgeBox(j){ return j?`<div class="judge"><div class="judge-read"><b>📌 이렇게 읽습니다</b> · ${esc(j.read)}</div><div class="judge-logic">⚙ 산출 논리: ${esc(j.logic)}</div></div>`:''; }
// 종합 총평: 개별 판단을 모아 상단에 한 문단으로(가장 핵심적인 강점·보완점만 선별)
function overallSummary(a){
  const parts=[];
  const comp=(a.competency||[]).slice().sort((x,y)=>y.total-x.total);
  if(comp.length) parts.push(`${comp[0].label}(${comp[0].total}회)이 가장 두드러집니다`);
  const top=a.thread&&a.thread.keywords[0];
  if(top) parts.push(`'${top.keyword}' 진로 탐구가 ${top.docs}곳에서 확인되며${top.fusion?' 교과·활동을 넘나드는 융합형입니다':''}`);
  if(a.growth&&a.growth.multi){const f=a.growth.rows[0],l=a.growth.rows[a.growth.rows.length-1];
    parts.push(l.kwTotal>=f.kwTotal*1.2?`학년이 오르며 전공 탐구가 뚜렷이 깊어졌습니다`:l.kwTotal<=f.kwTotal*0.8?`초반에 비해 최근 학년의 진로 몰입도가 낮아진 편입니다`:`학년별 진로 몰입도는 꾸준한 편입니다`);
  }
  if(a.fusion&&a.fusion.gaps.length) parts.push(`${a.fusion.gaps.slice(0,2).map(g=>g.group).join('·')} 교과와의 연결은 아직 비어 있어 보완 여지가 있습니다`);
  const bal=a.balance;
  if(bal&&!bal.balanced&&bal.alerts.length) parts.push(bal.alerts[0].text.replace(/\.$/,''));
  if(!parts.length) return '';
  return parts.join('. ')+'.';
}
// 교과 융합 지도(허브-스포크): 연결=초록 실선, 빈 공간=회색 점선
function fusionSvg(fm){
  const nodes=fm.nodes,N=nodes.length; if(!N) return '';
  const W=560,H=300,cx=W/2,cy=H/2,R=Math.min(150,86+N*8); const main=fm.main[0]||'진로';
  const GREEN='#178055';
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  const pos=nodes.map((nd,i)=>{const a=-Math.PI/2+i*2*Math.PI/N;return{nd,nx:cx+R*Math.cos(a),ny:cy+R*Math.sin(a)}});
  pos.forEach(({nd,nx,ny})=>s+=`<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${nd.present?GREEN:'#ccd0d6'}" stroke-width="${nd.present?2:1.2}"${nd.present?'':' stroke-dasharray="4 4"'}/>`);
  pos.forEach(({nd,nx,ny})=>{const col=nd.present?GREEN:'#aeb4bd',bg=nd.present?'#e6f3ec':'#f4f5f7';
    s+=`<rect x="${nx-33}" y="${ny-15}" width="66" height="30" rx="8" fill="${bg}" stroke="${col}" stroke-width="1.4"${nd.present?'':' stroke-dasharray="4 3"'}><title>${nd.group}${nd.present?' · '+nd.n+'회':' · 빈 공간'}</title></rect>`;
    s+=`<text x="${nx}" y="${ny-1}" text-anchor="middle" font-size="12" font-weight="700" fill="${nd.present?'#1f2733':'#9aa4b0'}">${nd.group}</text>`;
    s+=`<text x="${nx}" y="${ny+11}" text-anchor="middle" font-size="9" fill="${nd.present?GREEN:'#aeb4bd'}">${nd.present?nd.n+'회':'빈 공간'}</text>`;});
  s+=`<circle cx="${cx}" cy="${cy}" r="31" fill="${GREEN}"/><text x="${cx}" y="${cy-1}" text-anchor="middle" font-size="${main.length>4?10:12}" font-weight="700" fill="#fff">${esc(main)}</text><text x="${cx}" y="${cy+12}" text-anchor="middle" font-size="8" fill="#cfe6d8">진로 핵심</text>`;
  return s+'</svg>';
}
// 역량 밸런스 방사형(레이더)
function radarSvg(axes){
  const N=axes.length, W=360,H=300,cx=W/2,cy=H/2+4,R=92;
  const pt=(i,rr)=>{const a=-Math.PI/2+i*2*Math.PI/N;return [cx+rr*Math.cos(a),cy+rr*Math.sin(a)];};
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  [0.25,0.5,0.75,1].forEach(f=>s+=`<polygon points="${axes.map((_,i)=>pt(i,R*f).join(',')).join(' ')}" fill="none" stroke="#e6e9ee"/>`);
  [25,50,75,100].forEach((pctLbl,k)=>{const f=(k+1)/4,[lx,ly]=pt(0,R*f);s+=`<text x="${(lx+3).toFixed(1)}" y="${(ly-2).toFixed(1)}" font-size="8" fill="#c3cad3">${pctLbl}%</text>`;});
  axes.forEach((_,i)=>{const [x,y]=pt(i,R);s+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e6e9ee"/>`;});
  s+=`<polygon points="${axes.map((a,i)=>pt(i,R*a.norm).join(',')).join(' ')}" fill="rgba(47,111,79,.22)" stroke="#2f6f4f" stroke-width="2"/>`;
  axes.forEach((a,i)=>{const [x,y]=pt(i,R*a.norm);s+=`<circle cx="${x}" cy="${y}" r="3" fill="#2f6f4f"/>`;});
  axes.forEach((a,i)=>{const [x,y]=pt(i,R+15);const anch=Math.abs(x-cx)<10?'middle':(x>cx?'start':'end');s+=`<text x="${x}" y="${y}" font-size="11" font-weight="600" fill="#1f2733" text-anchor="${anch}">${esc(a.axis)}</text><text x="${x}" y="${y+12}" font-size="9" fill="#9aa4b0" text-anchor="${anch}">${a.pct}%</text>`;});
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
function _lighten(hex,f){const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,L=c=>Math.round(c+(255-c)*f);return `rgb(${L(r)},${L(g)},${L(b)})`;}
// 간단 이진분할 트리맵(주식 히트맵 스타일): 값 비례 사각형, 매번 더 긴 변을 절반값 기준으로 자름
function treemapLayout(items,x,y,w,h){
  if(items.length===1){ items[0]._x=x; items[0]._y=y; items[0]._w=w; items[0]._h=h; return; }
  const total=items.reduce((a,b)=>a+b.value,0);
  let cum=0,splitIdx=1,best=Infinity;
  for(let i=1;i<items.length;i++){ cum+=items[i-1].value; const diff=Math.abs(cum-total/2); if(diff<best){best=diff;splitIdx=i;} }
  const left=items.slice(0,splitIdx), right=items.slice(splitIdx);
  const leftSum=left.reduce((a,b)=>a+b.value,0), frac=Math.max(0.06,Math.min(0.94,leftSum/total));
  if(w>=h){ const w1=w*frac; treemapLayout(left,x,y,w1,h); treemapLayout(right,x+w1,y,w-w1,h); }
  else{ const h1=h*frac; treemapLayout(left,x,y,w,h1); treemapLayout(right,x,y+h1,w,h-h1); }
}
// 키워드 히트맵(트리맵): 빈도=면적, 진하기=상대빈도(주식 히트맵과 같은 관용 스타일)
function wordHeatmapSvg(auto,opts){
  if(!auto.length) return '';
  opts=opts||{};
  const W=560,H=300;
  const base=opts.base||'#2f6f4f';
  const catColors=opts.catColors||null;       // {cat:색} 지정 시 색=범주, 진하기=빈도
  const items=auto.map(k=>({word:k.word,n:k.n,cat:k.cat,value:k.n}));
  treemapLayout(items,0,0,W,H);
  const mx=Math.max(...items.map(it=>it.n)), mn=Math.min(...items.map(it=>it.n));
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  items.forEach(it=>{
    const t=(it.n-mn)/((mx-mn)||1);           // 0~1 상대빈도
    const bcol=(catColors&&it.cat&&catColors[it.cat])||base;
    const fill=_lighten(bcol, 0.72*(1-t));     // 진할수록 빈도 높음
    const dark=t>0.42;
    const cx=it._x+it._w/2, cy=it._y+it._h/2;
    const fit=Math.min(it._w,it._h);
    const wordSz=Math.max(9,Math.min(17,fit*0.22)).toFixed(1);
    const numSz=Math.max(8,Math.min(12,fit*0.15)).toFixed(1);
    const showWord=it._w>30&&it._h>22;
    s+=`<g data-kw="${esc(it.word)}" style="cursor:pointer">`;
    s+=`<rect x="${it._x.toFixed(1)}" y="${it._y.toFixed(1)}" width="${Math.max(0,it._w-2).toFixed(1)}" height="${Math.max(0,it._h-2).toFixed(1)}" rx="4" fill="${fill}"><title>${esc(it.word)} ${it.n}회 · 클릭하면 원문</title></rect>`;
    if(showWord){
      s+=`<text x="${cx.toFixed(1)}" y="${(cy-3).toFixed(1)}" font-size="${wordSz}" font-weight="700" fill="${dark?'#fff':'#1f2733'}" text-anchor="middle">${T(it.word)}</text>`;
      s+=`<text x="${cx.toFixed(1)}" y="${(cy+11).toFixed(1)}" font-size="${numSz}" fill="${dark?'rgba(255,255,255,.8)':'rgba(31,39,51,.6)'}" text-anchor="middle">${it.n}회</text>`;
    }
    s+='</g>';
  });
  return s+'</svg>';
}

/* ─────────── 대학 전형 참고 (경기도교육청 수시NAVI 추출 데이터) ───────────
   원칙: 합격예측 아님. 대학이 공개한 평가요소 비중·인재상을 학생 실측값과 '나란히' 보여주는 참고 정보. */
function naviData(){ return (typeof window!=='undefined'&&window.NAVI)||{jonghap:[],gyogwa:{}}; }
// 학생 실측 3대 역량 비중(%) — a.competency의 total을 정규화
function studentCompMix(a){
  const c=a.competency||[]; const g=k=>((c.find(x=>x.key===k)||{}).total)||0;
  const ac=g('학업역량'), ca=g('진로역량'), co=g('공동체역량'); const tot=ac+ca+co;
  if(!tot) return null;
  return {acad:ac/tot*100, career:ca/tot*100, community:co/tot*100, raw:{ac,ca,co}};
}
function studentTextBlob(p){
  const t=[]; (p.details||[]).forEach(d=>t.push(d.text||''));
  ['autonomy','club','career'].forEach(k=>(p.creative&&p.creative[k]||[]).forEach(a=>t.push(a.text||'')));
  (p.behavior||[]).forEach(b=>t.push(b.text||'')); (p.awards||[]).forEach(a=>t.push(a.name||''));
  return t.join(' ');
}
const COMP_AX={학업:'#3f5fa8',진로:'#b8722e',공동체:'#2f8f6f'};
// 3분할 역량 비중 막대
function compMixBar(m){
  const seg=(w,c,lb)=>`<span style="width:${w.toFixed(1)}%;background:${c}" title="${lb} ${w.toFixed(0)}%">${w>=14?lb.replace('역량','')+' '+Math.round(w)+'%':''}</span>`;
  return `<div class="cmix">${seg(m.acad,COMP_AX.학업,'학업역량')}${seg(m.career,COMP_AX.진로,'진로역량')}${seg(m.community,COMP_AX.공동체,'공동체역량')}</div>`;
}
// Card 1) 역량 강조 전형 참고표
function naviCompMatchCard(a){
  const recs=(naviData().jonghap||[]).filter(r=>typeof r.acad==='number'&&typeof r.career==='number'&&typeof r.community==='number');
  const m=studentCompMix(a);
  if(!recs.length||!m) return '';
  const dist=r=>(Math.abs(r.acad-m.acad)+Math.abs(r.career-m.career)+Math.abs(r.community-m.community))/2; // 0~100
  const ranked=recs.map(r=>({r,sim:Math.max(0,100-dist(r))})).sort((x,y)=>y.sim-x.sim).slice(0,15);
  const row=({r,sim})=>{
    const w=`<span class="nv-w"><i style="color:${COMP_AX.학업}">학${Math.round(r.acad)}</i>·<i style="color:${COMP_AX.진로}">진${Math.round(r.career)}</i>·<i style="color:${COMP_AX.공동체}">공${Math.round(r.community)}</i></span>`;
    const ideal=r.ideal?`<div class="nv-ideal">${esc(r.ideal)}</div>`:'';
    return `<div class="nv-row"><div class="nv-top"><b>${esc(r.univ||'')}</b> <span class="g">${esc(r.type||'')}</span>${r.region?`<span class="nv-rg">${esc(r.region)}</span>`:''}<span class="nv-sim" title="평가비중 닮은 정도">닮음 ${Math.round(sim)}%</span></div>
      <div class="nv-meta">${w}${r.minGrade&&r.minGrade!=='없음'?`<span class="nv-min">수능최저 ${esc(r.minGrade)}</span>`:''}${r.interview&&r.interview!=='-'?`<span class="nv-int">면접 ${esc(r.interview)}</span>`:''}</div>${ideal}</div>`;
  };
  return `<div class="card"><h2>🏫 역량 강조 전형 참고표 <span style="font-size:12px;color:var(--sub);font-weight:400">— 수시NAVI</span></h2>
    <div class="desc"><b>합격 가능성 예측이 아닙니다.</b> 대학이 공개한 학종 <b>평가요소 역량 비중</b>(학업/진로/공동체)과 이 학생의 <b>실측 역량 균형</b>이 얼마나 <b>닮았는지</b>만 보여주는 참고 정보입니다. 지원 추천이 아니며, 반드시 각 대학 모집요강을 확인하세요.</div>
    <div class="nv-me">이 학생 실측 역량 균형 ${compMixBar(m)}<span class="g">(세특·창체·행특의 역량 표현 등장 비율)</span></div>
    <div class="nv-list">${ranked.map(row).join('')}</div>
    <div class="note">평가 비중이 비슷하다고 해서 그 전형이 유리·불리하다는 뜻이 아닙니다. '내 강조점이 어떤 평가구조와 통하는지' 감을 잡는 용도입니다. (표본: 학종 ${recs.length}개 전형)</div>
  </div>`;
}
// 인재상 키워드 사전(동의어→대표어, 역량축)
const IDEAL_KW=[
  {k:'창의',syn:['창의','독창','창조'],ax:'학업'},
  {k:'탐구',syn:['탐구','지식탐구','학문','지적'],ax:'학업'},
  {k:'도전',syn:['도전','개척','열정'],ax:'진로'},
  {k:'전문성',syn:['전문인','전문성','전문가','전문 '],ax:'진로'},
  {k:'자기주도',syn:['자기주도','주도적','자율'],ax:'진로'},
  {k:'융합',syn:['융합','통합','통섭'],ax:'진로'},
  {k:'글로벌',syn:['글로벌','세계','국제'],ax:'진로'},
  {k:'협력',syn:['협력','협동','상생','소통','의사소통'],ax:'공동체'},
  {k:'배려',syn:['배려','나눔','헌신','섬김'],ax:'공동체'},
  {k:'실천',syn:['실천','실천인','행동'],ax:'공동체'},
  {k:'리더십',syn:['리더','선도','이끄'],ax:'공동체'},
  {k:'윤리·인성',syn:['윤리','인성','바른','정직'],ax:'공동체'},
];
// Card 2) 인재상 키워드 매칭
function naviIdealCard(a){
  const recs=(naviData().jonghap||[]).filter(r=>r.ideal);
  if(!recs.length) return '';
  const blob=studentTextBlob(DATA[idx].parsed);
  const items=IDEAL_KW.map(o=>{
    const demand=recs.filter(r=>o.syn.some(sy=>r.ideal.includes(sy))).length;
    const matchedSyn=o.syn.map(s=>s.trim()).find(sy=>blob.includes(sy));
    return {k:o.k,ax:o.ax,demand,has:!!matchedSyn,syn:matchedSyn};
  }).filter(o=>o.demand>0).sort((x,y)=>y.demand-x.demand);
  if(!items.length) return '';
  const maxD=Math.max(1,...items.map(i=>i.demand)), hasN=items.filter(i=>i.has).length;
  const chip=o=>{
    const col=COMP_AX[o.ax];
    const bar=`<span class="nvi-bar"><span style="width:${Math.round(o.demand/maxD*100)}%;background:${col}"></span></span>`;
    if(o.has) return `<span class="nvi has" data-kw="${esc(o.syn)}" title="'${esc(o.syn)}' 원문 문장 보기 · 대학 ${o.demand}곳 언급" style="border-color:${col};background:${col}"><b>✓ ${esc(o.k)}</b><small>대학 ${o.demand}곳</small></span>`;
    return `<span class="nvi" title="내 생기부에서 아직 뚜렷하지 않음 · 대학 ${o.demand}곳 언급"><b>${esc(o.k)}</b><small>대학 ${o.demand}곳</small>${bar}</span>`;
  };
  return `<div class="card"><h2>💠 인재상 키워드 매칭 <span style="font-size:12px;color:var(--sub);font-weight:400">— 수시NAVI</span></h2>
    <div class="desc">여러 대학 <b>인재상 문구</b>에서 자주 나오는 키워드(<span style="color:${COMP_AX.학업}">학업</span>·<span style="color:${COMP_AX.진로}">진로</span>·<span style="color:${COMP_AX.공동체}">공동체</span>축)를, 이 학생 생기부에 <b>실제로 드러났는지</b> 대조했습니다. <b>진하게 채워진 ✓ 칩</b>은 생기부에 나타난 것(클릭 시 원문). 옅은 칩은 아직 뚜렷하지 않은 것으로, ‘대학 N곳’은 그 키워드를 인재상에 넣은 전형 수입니다. 채움 여부는 실측일 뿐 우열 판정이 아닙니다.</div>
    <div class="nvi-wrap">${items.map(chip).join('')}</div>
    <div class="note">인재상에 자주 등장하는 키워드 ${items.length}개 중 <b>${hasN}개</b>가 이 학생 생기부에서 확인됩니다.</div>
  </div>`;
}
// Card 3) 진로선택과목 반영 참고 노트
function naviJinroCard(a){
  const g=naviData().gyogwa||{};
  if(!g.univTotal) return '';
  const pct=Math.round(g.univReflectJinro/g.univTotal*100);
  return `<div class="card"><h2>📗 진로선택과목 반영 참고 <span style="font-size:12px;color:var(--sub);font-weight:400">— 수시NAVI</span></h2>
    <div class="desc">수시 <b>교과전형</b> 기준, 조사된 <b>${g.univTotal}개 대학 중 ${g.univReflectJinro}곳(${pct}%)</b>이 <b>진로선택과목 성취도(A/B/C)</b>를 성적에 반영합니다(대학마다 방식 상이). 학종에서도 진로선택 세특은 전공 관심의 핵심 근거가 됩니다.</div>
    <div class="note">참고용 경향 수치입니다. 개별 대학의 반영 교과·환산 방식은 반드시 모집요강을 확인하세요. 이 학생의 진로선택 세특 내용은 위 <b>‘교과·활동 × 진로 연계’</b>·<b>‘세특 리뷰’</b> 카드에서 근거로 확인할 수 있습니다.</div>
  </div>`;
}
// 호를 따라 눕는 접선 라벨(좁은 조각도 읽히도록 회전) — 왼쪽 절반은 뒤집어 거꾸로 보이지 않게
function tangentLabel(x,y,cm,text,fontSize,fill,weight){
  let deg=cm*180/Math.PI+90; if(Math.cos(cm)<0) deg+=180;
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fontSize}" font-weight="${weight||600}" fill="${fill}" text-anchor="middle" transform="rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${text}</text>`;
}
// 호 길이(px) 대비 글자 수를 추정해 라벨을 자름. '·'로 묶인 복수과목명은 앞쪽 하나만 사용(정보 손실 적고 짧음).
// 이웃 라벨과 맞닿지 않도록 여유(0.8배)를 두고, 그래도 안 들어가면 라벨을 생략(hover 툴팁으로 대체) — 억지로 채우지 않음.
function fitArcLabel(name, arcLenPx, fontSize){
  const base = name.split('·')[0];
  const usable = arcLenPx*0.8;
  const maxChars = Math.floor(usable/(fontSize*1.15));
  if(maxChars<2) return null;
  return base.length>maxChars ? base.slice(0,maxChars) : base;
}
function sunburstSvg(sb){
  if(!sb.total)return '';
  const W=420,H=404,cx=W/2,cy=H/2,r0=34,r1=80,r2=124,r3=162;
  const areaCol={'세특':'#178055','창체':'#3b6ea5','행특':'#b5762a'};
  let s=`<svg viewBox="0 0 ${W} ${H}"><defs><filter id="sbsh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.18"/></filter></defs>`;
  let a=-Math.PI/2;
  sb.areas.forEach(ar=>{
    const span=ar.chars/sb.total*2*Math.PI,a0=a,a1=a+span,col=areaCol[ar.name]||'#8a94a0';
    // 중간링: 큰 세그먼트→진한 색, 작은 세그먼트→연한 색(점진 음영)
    const kids=ar.children.slice().sort((x,y)=>y.chars-x.chars); let ca=a0;
    kids.forEach((c,ci)=>{
      const cs=c.chars/ar.chars*span,c0=ca,c1=ca+cs,cm=(c0+c1)/2;
      const lf=0.1+0.5*(ci/Math.max(1,kids.length-1)), shade=_lighten(col,lf), midDark=lf<0.32;
      s+=`<path d="${_arc(cx,cy,r1,r2,c0,c1)}" fill="${shade}" stroke="#fff" stroke-width="1"><title>${esc(c.name)} · ${c.chars}자</title></path>`;
      if(cs>0.14){const rl=(r1+r2)/2,tx=cx+rl*Math.cos(cm),ty=cy+rl*Math.sin(cm),lbl=fitArcLabel(c.name,cs*rl,9);if(lbl)s+=tangentLabel(tx,ty,cm,esc(lbl),9,midDark?'#fff':'#1f2733',700);}
      if(c.kw&&cs>0.12){s+=`<path d="${_arc(cx,cy,r2,r3,c0,c1)}" fill="${_lighten(col,0.8)}" stroke="#fff" stroke-width="0.6"/>`;const rl=(r2+r3)/2,tx=cx+rl*Math.cos(cm),ty=cy+rl*Math.sin(cm),lbl=fitArcLabel(c.kw,cs*rl,8);if(lbl)s+=tangentLabel(tx,ty,cm,esc(lbl),8,col,600);}
      ca=c1;
    });
    // 안쪽 영역 링(진한 원색, 그림자)
    s+=`<path d="${_arc(cx,cy,r0,r1,a0,a1)}" fill="${col}" filter="url(#sbsh)"><title>${esc(ar.name)} · ${ar.chars}자 (${Math.round(ar.chars/sb.total*100)}%)</title></path>`;
    const mid=(a0+a1)/2,rl2=(r0+r1)/2;
    s+=`<text x="${cx+rl2*Math.cos(mid)}" y="${cy+rl2*Math.sin(mid)+4}" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">${esc(ar.name)}</text>`;
    a=a1;
  });
  // 중앙 라벨(총 글자수)
  s+=`<circle cx="${cx}" cy="${cy}" r="${r0-3}" fill="var(--card)"/><text x="${cx}" y="${cy-2}" font-size="11" font-weight="800" fill="var(--ink)" text-anchor="middle">${(sb.total/1000).toFixed(1)}천자</text><text x="${cx}" y="${cy+11}" font-size="8" fill="var(--sub)" text-anchor="middle">생기부</text>`;
  return s+'</svg>';
}
/* 경량 force-directed 레이아웃(Fruchterman-Reingold 계열) — 순수 JS, 외부 라이브러리 없음.
   평균각도 배치 대신 물리 시뮬레이션으로 겹침·엉킴(hairball)을 줄인다. nodes: [{id,r}], edges: [{from,to}]. */
function forceLayout(nodes, edges, W, H){
  const n = nodes.length; if(!n) return;
  const idx={}; nodes.forEach((nd,i)=>idx[nd.id]=i);
  nodes.forEach((nd,i)=>{ const a=-Math.PI/2+i*2*Math.PI/n, rr=Math.min(W,H)*0.32; nd.x=W/2+rr*Math.cos(a); nd.y=H/2+rr*Math.sin(a); });
  const k = Math.sqrt((W*H)/Math.max(1,n))*0.9;
  const ITER=260;
  for(let iter=0; iter<ITER; iter++){
    const cool = Math.max(0.03, 1-iter/ITER), temp = cool*k*0.6;
    const fx=new Array(n).fill(0), fy=new Array(n).fill(0);
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
      let dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;
      let dist=Math.sqrt(dx*dx+dy*dy)||0.01;
      const minDist=nodes[i].r+nodes[j].r+20;
      let force=(k*k)/dist; if(dist<minDist) force+=(minDist-dist)*3;
      dx/=dist; dy/=dist;
      fx[i]+=dx*force; fy[i]+=dy*force; fx[j]-=dx*force; fy[j]-=dy*force;
    }
    edges.forEach(e=>{
      const i=idx[e.from], j=idx[e.to]; if(i==null||j==null) return;
      let dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;
      let dist=Math.sqrt(dx*dx+dy*dy)||0.01;
      const force=(dist*dist)/k*0.55;
      dx/=dist; dy/=dist;
      fx[i]-=dx*force; fy[i]-=dy*force; fx[j]+=dx*force; fy[j]+=dy*force;
    });
    for(let i=0;i<n;i++){
      fx[i]+=(W/2-nodes[i].x)*0.012; fy[i]+=(H/2-nodes[i].y)*0.012;
      const dlen=Math.sqrt(fx[i]*fx[i]+fy[i]*fy[i])||0.01, lim=Math.min(dlen,temp);
      nodes[i].x+=(fx[i]/dlen)*lim; nodes[i].y+=(fy[i]/dlen)*lim;
      nodes[i].x=Math.max(nodes[i].r+8,Math.min(W-nodes[i].r-8,nodes[i].x));
      nodes[i].y=Math.max(nodes[i].r+8,Math.min(H-nodes[i].r-8,nodes[i].y));
    }
  }
}
// 키워드 연결 네트워크(소스노드=교과·창체, 키워드노드, 여러 소스 겹치면 융합·강조) — force-directed 배치
function networkSvg(net){
  if(!net.areas.length||!net.keywords.length)return '';
  const W=560,H=420;
  const areaCol={'세특':'#178055','창체':'#3b6ea5'};
  const maxAreaN=Math.max(1,...net.areas.map(a=>a.n)), maxKw=Math.max(1,...net.keywords.map(k=>k.n));
  const areaNodes=net.areas.map(ar=>({id:'A:'+ar.id, ar, r:18+11*(ar.n/maxAreaN)}));
  const kwNodes=net.keywords.map(kw=>({id:'K:'+kw.k, kw, multi:kw.areas.length>1, r:(kw.areas.length>1?7:4)+5*(kw.n/maxKw)}));
  const nodes=[...areaNodes,...kwNodes];
  const edges=[]; kwNodes.forEach(kn=>kn.kw.areas.forEach(id=>edges.push({from:'A:'+id,to:kn.id})));
  forceLayout(nodes,edges,W,H);
  const pos={}; nodes.forEach(nd=>pos[nd.id]=nd);
  let s=`<svg viewBox="0 0 ${W} ${H}"><defs><filter id="ng" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1" stdDeviation="1.3" flood-opacity="0.22"/></filter></defs>`;
  edges.forEach(e=>{const p=pos[e.from],q=pos[e.to],kn=pos[e.to];s+=`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${kn.multi?'#c9822f':'#dbe1e7'}" stroke-width="${kn.multi?2:1.1}" opacity="${kn.multi?0.85:0.5}"/>`;});
  areaNodes.forEach(nd=>{const p=pos[nd.id];s+=`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${nd.r.toFixed(1)}" fill="${areaCol[nd.ar.type]||'#3b6ea5'}" filter="url(#ng)"><title>${esc(nd.ar.label)} · ${nd.ar.n}회</title></circle><text x="${p.x.toFixed(1)}" y="${(p.y+4).toFixed(1)}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">${esc(nd.ar.label)}</text>`;});
  kwNodes.forEach(nd=>{const p=pos[nd.id],col=nd.multi?'#c9822f':'#aab2bd';s+=`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${nd.r.toFixed(1)}" fill="${col}"${nd.multi?' filter="url(#ng)"':''}><title>${esc(nd.kw.k)} · ${nd.kw.n}회 · ${nd.kw.areas.length}곳</title></circle><text x="${p.x.toFixed(1)}" y="${(p.y-nd.r-3).toFixed(1)}" font-size="${nd.multi?11:9.5}" font-weight="${nd.multi?800:600}" fill="${nd.multi?'#8a5a12':'#5a6472'}" text-anchor="middle">${esc(nd.kw.k)}</text>`;});
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

  // -0.5) 종합 총평(모든 판단의 요약 한 문단)
  const summary=overallSummary(a);
  if(summary){
    h+=`<div class="card" style="border-color:var(--accent)"><h2>🧭 종합 총평</h2>
      <div class="desc">아래 각 카드의 판단을 모은 한 문단 요약입니다. 전체를 다 읽기 전에 핵심만 먼저 파악하는 용도이며, 세부 근거는 각 카드에서 확인하세요.</div>
      <div class="judge-read" style="font-size:14px">${esc(summary)}</div>
    </div>`;
  }

  // 0) 자동 추천 키워드(빈도 기반) + 원문 문장 클릭 추적
  const auto=a.auto||[]; const hasKwBox=!!document.getElementById('kw');
  if(auto.length){
    h+=`<div class="card"><h2>🔎 자동 추천 키워드 <span style="font-size:12px;color:var(--sub);font-weight:400">— 생기부에 자주 나온 유의미 어휘</span></h2>
      <div class="desc">불용어·평가어를 제거하고 뽑은 <b>빈도 상위 어휘</b>입니다(형태소 근사). 진로 키워드를 정할 때 출발점으로 쓰세요. <b>칩을 클릭하면 그 단어가 쓰인 원문 문장</b>을 모아 보여줍니다(면접·검토용).${hasKwBox?' 오른쪽 <b>＋</b>는 위 진로 키워드 입력창에 추가합니다.':''}</div>
      <div class="akw-wrap">${auto.map(k=>`<span class="akw" data-kw="${esc(k.word)}" title="원문 문장 보기">${esc(k.word)} <b>${k.n}</b>${hasKwBox?`<button class="akw-add" data-addkw="${esc(k.word)}" title="진로 키워드에 추가">＋</button>`:''}</span>`).join('')}</div>
    </div>`;
    // 키워드 히트맵(트리맵 — 주식 히트맵과 같은 스타일: 빈도=사각형 크기, 진하기=상대빈도)
    h+=`<div class="card"><h2>🟩 키워드 히트맵 <span style="font-size:12px;color:var(--sub);font-weight:400">— 자주 등장한 어휘</span></h2>
      <div class="desc">생기부에 자주 등장한 어휘를 <b>사각형 크기·진하기</b>로 표현했습니다(클·진할수록 자주 등장). <b>사각형을 클릭하면 원문 문장</b>이 뜹니다 — 상담 시 학생이 자기 생기부의 방향을 직관적으로 파악하기 좋습니다.</div>
      ${wordHeatmapSvg(auto)}
    </div>`;
    // 키워드 히트맵 ② — 전공 지식 어휘(선택 진로군 핵심어)
    const mkw=a.majorKw||[];
    if(mkw.length){
      h+=`<div class="card"><h2>🟦 키워드 히트맵 <span style="font-size:12px;color:var(--sub);font-weight:400">— 전공 지식 어휘</span></h2>
      <div class="desc">선택한 진로군의 <b>전공 특이적 개념어</b>(예: 유전자·효소·반도체)가 생기부 전반에서 얼마나 등장하는지 크기·진하기로 표현했습니다. 일반 학업 어휘가 아니라 <b>전공 깊이를 드러내는 지식어</b>만 추렸습니다. <b>사각형 클릭 시 원문 문장.</b></div>
      ${wordHeatmapSvg(mkw,{base:'#2f5f8f'})}
    </div>`;
    }
    // 키워드 히트맵 ③ — 역량 표현 어휘(학업/진로/공동체, 색=역량군)
    const ckw=a.compKw||[];
    if(ckw.length){
      const CAT={학업:'#3f5fa8',진로:'#b8722e',공동체:'#2f8f6f'};
      h+=`<div class="card"><h2>🟨 키워드 히트맵 <span style="font-size:12px;color:var(--sub);font-weight:400">— 역량 표현 어휘</span></h2>
      <div class="desc">학업·진로·공동체 <b>역량을 드러내는 표현어</b>(예: 호기심·협력·성찰)의 등장 빈도입니다. <b>색=역량군, 크기·진하기=빈도.</b> 부정 서술(‘~하지 못함’)은 제외했습니다. <b>사각형 클릭 시 원문 문장.</b></div>
      <div class="dleg" style="display:flex;gap:14px;margin:2px 0 8px">${Object.entries(CAT).map(([k,c])=>`<div><i style="background:${c}"></i>${k}역량</div>`).join('')}</div>
      ${wordHeatmapSvg(ckw,{catColors:CAT})}
    </div>`;
    }
    // 계층형 썬버스트(생기부 텍스트 비중)
    const sb=a.sunburst;
    if(sb && sb.total){
      h+=`<div class="card"><h2>🌳 생기부 구성 썬버스트</h2>
        <div class="desc">생기부 텍스트를 <b>안쪽=영역(세특/창체/행특) → 중간=과목·활동 → 바깥=대표 키워드</b> 계층으로 쪼갰습니다. 면적(글자수)으로 <b>어떤 과목·활동이 굵직한 뼈대</b>인지 한눈에 파악합니다.</div>
        <div style="text-align:center">${sunburstSvg(sb)}</div>
        ${judgeBox(judgeSunburst(sb))}
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
      <div class="desc">학년이 오르며 관심이 <b>넓고 얕은 호기심 → 좁고 깊은 전공 탐구</b>로 발전하는지 추적합니다. 초록 영역=학년별 <b>진로 핵심어 등장 빈도</b>(전공 몰입도), 점 아래 배지=<b>탐구 깊이 상·중·하</b>·진하기=행위 수준. 우상향으로 넓어지면 전공 심화가 짙어진 것입니다. 아래 학년별 상세와 함께 보세요.</div>
      ${gt.multi?`<div style="text-align:center">${growthSvg(gt.rows)}</div>`:''}
      ${judgeBox(judgeGrowth(gt))}
      ${gt.rows.map(r=>`<div class="gt-row"><span class="gt-g">${r.grade}학년</span><div class="gt-body"><div>${r.keywords.length?r.keywords.map(k=>`<span class="tag">${esc(k.k)}×${k.n}</span>`).join(''):'<span class="g" style="color:var(--sub)">진로 핵심어 미검출</span>'}</div><div class="gt-meta">행위 수준 <b>${esc(r.tierLabel)}</b>${r.verbs.length?` <span class="g">(${r.verbs.slice(0,4).map(esc).join(', ')})</span>`:''} · 탐구 깊이 <b>${esc(r.band)}</b> · 진로 연계 교과 <b>${r.breadth}</b>개</div></div></div>`).join('')}
    </div>`;
  }

  // 1.45) 학년×영역 활동 밀도 히트맵
  const ah=a.actHeat;
  if(ah && ah.grades.length){
    h+=`<div class="card"><h2>🌡️ 학년별 활동 밀도</h2>
      <div class="desc">자율·동아리·진로·세특 각 영역에서 <b>진로 핵심어</b>가 학년별로 얼마나 등장했는지 색 농도로 표현했습니다(짙을수록 많음). 학년이 오를수록 짙어지면 전공 심화가 '우상향'으로 이어진다는 근거입니다.</div>
      <div style="overflow-x:auto">${actHeatSvg(ah)}</div>
      ${judgeBox(judgeActivityHeat(ah))}
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
    ${p.volunteer&&p.volunteer.totalHours!=null?`<div class="note">🙋 봉사활동 총 <b>${p.volunteer.totalHours}시간</b>${p.volunteer.byGrade.length?' ('+p.volunteer.byGrade.map(g=>g.grade+'학년 '+g.hours+'시간').join('·')+')':''} — 시간만 집계(내용은 판정하지 않음, 학년 구간은 표 인식 기준 추정치).</div>`:''}
  </div>`;

  // 2.5) 세특 리뷰 — 정독 포인트 (원문 요약, 어디에 집중해 읽을지)
  h+=`<div class="card"><h2>📚 세특 리뷰 — 정독 포인트</h2><div class="desc">방대한 세특을 <b>과목별 핵심만 압축</b>했습니다. 선생님이 원문을 정독할 때 <b>어디에 힘 주어 읽을지</b> 짚어주는 리뷰입니다 — <b>파란 태그=평가 관점</b>(그 과목에서 드러난 강점 축), 아래는 핵심 조각 요약. <span class="subj core">초록칩</span>·<span class="dot">●N</span> = 진로 핵심어 N회.</div>
    ${a.setuk.map(gr=>`<div class="yr-head">${gr.grade}학년</div>${gr.subjects.map(s=>`<div class="rv"><div class="rv-h"><span class="subj ${s.core?'core':''}">${esc(s.subject)}</span>${s.core?` <span class="dot">●${s.core}</span>`:''} ${(s.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${s.points>2?` <span class="rv-more">+${s.points-2}개 더</span>`:''}</div><ul class="hi-list">${s.items.slice(0,2).map(it=>`<li>${T(it.gist||it.text)}</li>`).join('')}</ul></div>`).join('')}`).join('')}
  </div>`;

  // 2.7) 입학사정관 3대 역량 신호(학업·진로·공동체)
  const comp=a.competency||[];
  h+=`<div class="card"><h2>🎓 입학사정관 3대 역량 신호</h2>
    <div class="desc">대학 입학사정관 <b>공통 평가요소</b>(학업·진로·공동체 역량, 5개 대학 공동기준) 관점에서, 세특·창체·행동특성 원문에 드러난 표현을 <b>근거와 함께</b> 모았습니다. 어느 역량이 어디서 보이는지를 제시하며, 우열 판정은 하지 않습니다.</div>
    ${(()=>{const shown=new Set();return comp.map(g=>{
      const ev=(g.top||[]).filter(e=>{if(shown.has(e.text))return false;shown.add(e.text);return true;});
      return `<div class="cgrp"><div class="chd">${g.emoji} ${esc(g.label)} <span class="cn">${g.total}회</span></div><div class="cdesc">${esc(g.desc)}</div>
      <div class="cbadges">${g.subs.map(s=>`<span class="cbadge${s.n?'':' off'}">${s.emoji} ${esc(s.key)} <b>${s.n}</b></span>`).join('')}</div>
      ${ev.length?ev.map(e=>`<div class="cev"><span class="cev-src">${e.grade}학년·${esc(e.src)}</span> ${T(e.text)}</div>`).join(''):`<div class="cev" style="opacity:.55">${g.total?'대표 문장이 다른 역량과 겹쳐 위에 이미 표시했습니다.':'이 역량에서 뚜렷한 표현은 확인되지 않았습니다.'}</div>`}
    </div>`;}).join('');})()}
    ${a.balance&&a.balance.alerts.length?a.balance.alerts.map(al=>`<div class="balert">⚖️ <b>균형 점검:</b> ${esc(al.text)}</div>`).join(''):(a.balance?`<div class="note" style="color:var(--accent)">⚖️ 학업 ${a.balance.academic} · 진로 ${a.balance.career} · 공동체 ${a.balance.community} — 세 역량이 비교적 고르게 나타납니다.</div>`:'')}
    <div class="note">표현 등장 여부(실측)만 집계합니다. 같은 문장이 여러 역량에 잡힐 수 있으며, 비어 있는 항목은 '해당 표현이 원문에 없다'는 뜻일 뿐 역량 부족을 의미하지 않습니다.</div>
  </div>`;

  // 2.72) 역량 밸런스 방사형(레이더)
  if(a.radar&&a.radar.length){
    h+=`<div class="card"><h2>🕸️ 역량 밸런스 (레이더)</h2>
      <div class="desc">추출된 신호를 <b>학업·전공적합성·리더십/소통·자기주도·성실/배려</b> 5개 축으로 매핑했습니다. 각 축의 숫자는 <b>그 축 자신의 참고 상한 대비 백분율</b>(축마다 독립 계산 — 축끼리 원시 개수를 직접 비교하지 않습니다). 오각형이 고르면 균형형, <b>유독 짧은 축이 있으면 그 부분이 보완 지점</b>입니다.</div>
      <div style="text-align:center">${radarSvg(a.radar)}</div>
      ${judgeBox(judgeRadar(a.radar))}
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
      <div class="desc">메인 진로 키워드(<b>${esc(fm.main[0]||'—')}</b>)가 <b>서로 다른 교과</b>에서 탐구됐는지를 지도로 봅니다. <span style="color:#178055;font-weight:700">초록 실선</span>=탐구가 연결된 교과, <span style="color:#9aa4b0;font-weight:700">회색 점선</span>=아직 <b>빈 공간</b>(융합 확장 여지). 최상위권일수록 하나의 주제를 여러 교과에서 다각도로 본 '융합형'을 선호합니다.</div>
      <div style="text-align:center">${fusionSvg(fm)}</div>
      ${fm.strong.length?`<div class="note">✅ 연결된 교과: ${fm.strong.map(s=>`<b>${esc(s.group)}</b>(${s.subjects.slice(0,2).map(x=>esc(x.subject)).join(', ')} · ${s.n}회)`).join(' &nbsp;·&nbsp; ')}</div>`:''}
      ${judgeBox(judgeFusion(fm))}
    </div>`;
  }

  // 2.86) 키워드 연결 네트워크(꼬리물기 — 교과·활동을 잇는 키워드)
  const net=a.network;
  if(net && net.areas.length && net.keywords.length){
    h+=`<div class="card"><h2>🌌 키워드 연결 네트워크</h2>
      <div class="desc">교과군·창체(<span style="color:#178055;font-weight:700">초록=세특</span>·<span style="color:#3b6ea5;font-weight:700">파랑=창체</span>)를 노드로 두고, 진로 핵심어를 연결했습니다. <b><span style="color:#c9822f">주황 키워드</span>=여러 교과·활동에 걸친 것</b> — 교과에서 배운 개념이 동아리·진로로 이어진 '꼬리물기·융합'을 직관적으로 보여줍니다. 위치는 서로 겹치지 않도록 자동 배치됩니다.</div>
      <div style="text-align:center">${networkSvg(net)}</div>
      ${judgeBox(judgeNetwork(net))}
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

  // 2.95) 대학 전형 참고 (수시NAVI 추출 — 합격예측 아님, 공개 평가요소/인재상 참고)
  h+=naviCompMatchCard(a);
  h+=naviIdealCard(a);
  h+=naviJinroCard(a);

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
  {key:'summary', title:'🎓 핵심 요약', open:true,  match:['종합 총평','Key Highlights','성적 강점맵','역량 밸런스']},
  {key:'act',     title:'📚 활동·세특·역량', open:true, match:['창체 진화','세특 리뷰','3대 역량','주도성 행위']},
  {key:'career',  title:'🎯 진로·전공 심화', open:true, match:['자동 추천','키워드 히트맵','성장 궤적','활동 밀도','진로 일관성','융합 지도','키워드 연결 네트워크','교과·활동 × 진로','썬버스트','합격 기준']},
  {key:'navi',    title:'🏫 대학 전형 참고 (수시NAVI)', open:false, match:['역량 강조 전형','인재상 키워드','진로선택과목 반영']},
  {key:'teacher', title:'👨‍🏫 교사용 진단·상담', open:false, match:['검토 체크','심화 탐구','Weak Spots','Next Step','면접·상담']},
  {key:'raw',     title:'📊 원자료', open:false, match:['성적 상세']},
];
window.__secOpen=window.__secOpen||{};
function groupSections(){
  const app=$('#app'); const hero=app.querySelector(':scope > .hero');
  let cards=[...app.querySelectorAll(':scope > .card')];
  if(briefMode) cards=cards.filter(c=>{const t=c.querySelector('h2')?.textContent||''; return BRIEF_MATCH.some(m=>t.includes(m));});
  const frag=document.createDocumentFragment(); if(hero) frag.appendChild(hero);
  if(briefMode){
    const banner=document.createElement('div'); banner.className='brief-banner';
    banner.textContent='🖨️ 브리핑 모드 — 상담용 핵심 카드만 표시 중입니다. 버튼을 다시 누르면 전체 보기로 돌아갑니다.';
    frag.appendChild(banner);
  }
  // 카드 바로가기 목차: 섹션과 같은 순서로 그룹핑, 클릭시 해당 섹션을 열고 스크롤(브리핑 모드에선 생략)
  let tocPanel=null, toc=null;
  if(!briefMode){
    toc=document.createElement('div'); toc.className='toc';
    toc.innerHTML='<button class="toc-toggle" type="button">📑 목차</button><div class="toc-panel"></div>';
    tocPanel=toc.querySelector('.toc-panel');
    toc.querySelector('.toc-toggle').onclick=()=>toc.classList.toggle('open');
    frag.appendChild(toc);
  }
  const assigned=new Set();
  SECTIONS.forEach(sec=>{
    const mine=cards.filter(c=>{const t=c.querySelector('h2')?.textContent||''; return sec.match.some(m=>t.includes(m));});
    if(!mine.length) return; mine.forEach(c=>assigned.add(c));
    const open=briefMode?true:((sec.key in window.__secOpen)?window.__secOpen[sec.key]:sec.open);
    const wrap=document.createElement('section'); wrap.className='sec'+(open?' open':'');
    const head=document.createElement('div'); head.className='sec-h';
    head.innerHTML=`<span>${sec.title}</span><span class="sec-cnt">${mine.length}</span><span class="sec-caret">▾</span>`;
    const body=document.createElement('div'); body.className='sec-body'; mine.forEach(c=>body.appendChild(c));
    head.onclick=()=>{ window.__secOpen[sec.key]=wrap.classList.toggle('open'); };
    wrap.appendChild(head); wrap.appendChild(body); frag.appendChild(wrap);
    if(!tocPanel) return;
    const gEl=document.createElement('div'); gEl.className='toc-group';
    const gt=document.createElement('div'); gt.className='toc-gtitle'; gt.textContent=sec.title; gEl.appendChild(gt);
    mine.forEach(c=>{
      const label=(c.querySelector('h2')?.textContent||'').trim();
      const b=document.createElement('button'); b.type='button'; b.className='toc-item'; b.textContent=label;
      b.onclick=()=>{
        if(!wrap.classList.contains('open')){ wrap.classList.add('open'); window.__secOpen[sec.key]=true; }
        toc.classList.remove('open');
        setTimeout(()=>c.scrollIntoView({behavior:'smooth',block:'start'}),40);
      };
      gEl.appendChild(b);
    });
    tocPanel.appendChild(gEl);
  });
  cards.filter(c=>!assigned.has(c)).forEach(c=>frag.appendChild(c)); // 미분류는 그대로 노출
  app.innerHTML=''; app.appendChild(frag);
}
