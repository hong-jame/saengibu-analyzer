/* 실제 배포본 빌더: pdf.js + 파서 + 분석 + 공유 렌더 + 드래그&드롭 → 자립형 생기부분석기.html
   사용: node build_tool.mjs   (node_modules의 pdf.js를 인라인) */
import fs from 'node:fs';

const strip = code => code.replace(/^export\s+/gm, '');          // ESM export 제거 → 전역 함수
const PARSE = strip(fs.readFileSync('parse.mjs', 'utf8'));
const ANALYZE = strip(fs.readFileSync('analyze.mjs', 'utf8'));
const RENDER = fs.readFileSync('app_render.js', 'utf8');
const CSS = fs.readFileSync('app_style.css', 'utf8');
const escScript = s => s.replace(/<\/script/gi, '<\\/script');   // 조기 종료 방지

/* pdf.js ESM 빌드 → 일반(classic) 스크립트 변환.
   file:// 더블클릭에서도 동작하도록 모듈 import를 완전히 제거:
   - import.meta.url → undefined
   - 끝의 export{..} → globalThis.pdfjsLib / globalThis.pdfjsWorker 할당
   워커 전역이 있으면 pdf.js가 워커 없이 메인스레드(fake worker)로 동작. */
function toClassic(file, globalName) {
  let c = fs.readFileSync('node_modules/pdfjs-dist/build/' + file, 'utf8');
  c = c.replace(/import\.meta\.url/g, 'undefined');
  const m = c.match(/export\{([^}]*)\};?\s*$/);
  if (!m) throw new Error(file + ': export문을 찾지 못함');
  const pairs = m[1].split(',').map(s => { const p = s.trim().split(/\s+as\s+/); return p.length === 2 ? `${p[1]}:${p[0]}` : `${p[0]}:${p[0]}`; }).join(',');
  // IIFE로 감싸 스코프 격리(압축 번들들의 최상위 let/const가 전역에서 충돌하는 것 방지)
  // + "use strict"로 원래 모듈의 스트릭트 시맨틱 유지
  return `(function(){"use strict";\n` + c.slice(0, m.index) + `globalThis.${globalName}={${pairs}};\n})();`;
}
const PDFLIB = escScript(toClassic('pdf.min.mjs', 'pdfjsLib'));
const PDFWORKER = escScript(toClassic('pdf.worker.min.mjs', 'pdfjsWorker'));

// 브라우저 추출기(extract.mjs와 동일 로직, pdfjsLib 주입형)
const EXTRACT_JS = `
function reconstructLines(items){
  const Y_TOL=3;
  const toks=items.filter(it=>it.str!=='').map(it=>({s:it.str,x:it.transform[4],y:it.transform[5],w:it.width,h:it.height}));
  toks.sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines=[]; let cur=null;
  for(const t of toks){ if(!cur||Math.abs(cur.y-t.y)>Y_TOL){cur={y:t.y,toks:[t]};lines.push(cur);} else cur.toks.push(t); }
  return lines.map(ln=>{
    ln.toks.sort((a,b)=>a.x-b.x);
    let s='',pe=null;
    for(const t of ln.toks){ if(pe!=null){const g=t.x-pe; if(g>(t.h||8)*1.2)s+='\\t'; else if(g>(t.h||8)*0.25)s+=' ';} s+=t.s; pe=t.x+t.w; }
    return s.replace(/\\s+$/,'');
  });
}
function tokensOf(items){
  return items.filter(it=>it.str!=='').map(it=>({s:it.str,x:+it.transform[4].toFixed(1),y:+it.transform[5].toFixed(1),w:+it.width.toFixed(1),h:+it.height.toFixed(1)}));
}
const _mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const _ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
async function hlinesOf(page, OPS){
  const ol=await page.getOperatorList();
  let ctm=[1,0,0,1,0,0]; const stack=[]; const segs=[];
  const add=(yy,xa,xb)=>segs.push({y:yy,x0:Math.min(xa,xb),x1:Math.max(xa,xb)});
  for(let i=0;i<ol.fnArray.length;i++){
    const fn=ol.fnArray[i], a=ol.argsArray[i];
    if(fn===OPS.save)stack.push(ctm.slice());
    else if(fn===OPS.restore)ctm=stack.pop()||ctm;
    else if(fn===OPS.transform)ctm=_mul(ctm,a);
    else if(fn===OPS.constructPath){
      const ops=a[0],args=a[1]; let k=0,px=0,py=0;
      for(const op of ops){
        if(op===OPS.moveTo){px=args[k++];py=args[k++];}
        else if(op===OPS.lineTo){const x=args[k++],y=args[k++];const p1=_ap(ctm,px,py),p2=_ap(ctm,x,y);if(Math.abs(p1[1]-p2[1])<1.5&&Math.abs(p1[0]-p2[0])>15)add(Math.round((p1[1]+p2[1])/2),p1[0],p2[0]);px=x;py=y;}
        else if(op===OPS.curveTo)k+=6;
        else if(op===OPS.rectangle){const x=args[k++],y=args[k++],w=args[k++],h=args[k++];const p=_ap(ctm,x,y),p2=_ap(ctm,x+w,y+h);if(Math.abs(p[1]-p2[1])<2&&Math.abs(p[0]-p2[0])>15)add(Math.round(p[1]),p[0],p2[0]);}
      }
    }
  }
  segs.sort((a,b)=>b.y-a.y);
  const out=[];
  for(const s of segs){ const last=out[out.length-1]; if(last&&last.y-s.y<=4){last.x0=Math.min(last.x0,Math.round(s.x0));last.x1=Math.max(last.x1,Math.round(s.x1));} else out.push({y:s.y,x0:Math.round(s.x0),x1:Math.round(s.x1)}); }
  return out;
}
async function extractRichFromBuffer(buf, pdfjsLib, onProgress){
  const doc=await pdfjsLib.getDocument({data:new Uint8Array(buf), useSystemFonts:true}).promise;
  const rich=[]; const N=doc.numPages;
  for(let p=1;p<=N;p++){
    if(onProgress) onProgress(p, N);
    const page=await doc.getPage(p);
    const tc=await page.getTextContent();
    rich.push({lines:reconstructLines(tc.items), tokens:tokensOf(tc.items), hlines:await hlinesOf(page, pdfjsLib.OPS)});
    await new Promise(r=>setTimeout(r,0)); // 메인스레드 양보 → 진행률 갱신·UI 멈춤 완화
  }
  return rich;
}`;

const html = `<meta charset="utf-8">
<title>생기부 분석기</title>
<style>${CSS}
.dropzone{border:2px dashed var(--line);border-radius:14px;padding:40px 20px;text-align:center;color:var(--sub);background:#fff;cursor:pointer;margin:14px 0;transition:.15s}
.dropzone:hover,.dropzone.hot{border-color:var(--accent);background:var(--soft);color:var(--accent)}
.dropzone b{color:var(--ink);font-size:15px;display:block;margin-bottom:4px}
#status{font-size:13px;color:var(--accent);margin:4px 0;min-height:18px;font-weight:600}
#status.err{color:#c0392b}
#applyKw{white-space:nowrap;font-weight:600}
#applyKw.dirty{background:var(--warm);color:#fff;border-color:var(--warm)}
</style>
<div class="wrap">
  <div class="topbar">
    <div class="ctrls" style="flex:1;min-width:280px;flex-direction:column;align-items:stretch;gap:5px">
      <label style="font-size:12.5px;color:var(--sub)">진로 핵심 키워드 <span style="color:#aab2bd">(쉼표로 구분 · 계열 버튼으로 시작해 편집 후 <b>적용</b> 또는 Enter)</span></label>
      <div style="display:flex;gap:6px">
        <input id="kw" type="text" placeholder="예: 반도체, 트랜지스터, 회로, 소자, 공정, 알고리즘" style="flex:1;min-width:0">
        <button id="applyKw" title="바꾼 키워드로 리포트를 다시 분석합니다 (Enter)">적용</button>
      </div>
      <div id="presets" class="ctrls" style="gap:5px"></div>
    </div>
    <div class="ctrls" style="align-self:flex-start">
      <button id="anon">가명 처리</button>
      <button id="blind" title="이름·학교·대회명 등 고유명사까지 마스킹(외부 제출용)">🔒 블라인드</button>
      <button id="prompt" title="분석 데이터를 AI 프롬프트로 클립보드에 복사">🤖 프롬프트 복사</button>
      <button id="csv" title="키워드별 원문 문장을 CSV로 내려받기">CSV</button>
      <button id="batchcsv" title="여러 학생 PDF를 한 번에 → 학생별 키워드 요약 CSV">📚 일괄 CSV</button>
      <button id="dark" title="다크 모드">🌙</button>
      <button onclick="print()">인쇄</button>
    </div>
  </div>
  <div id="drop" class="dropzone"><b>📄 생기부 PDF를 여기로 끌어다 놓으세요</b>클릭해서 선택할 수도 있습니다 · NEIS 출력 텍스트 PDF · 100% 브라우저에서만 처리(외부 전송 없음)</div>
  <input type="file" id="file" accept="application/pdf" style="display:none">
  <input type="file" id="batchfile" accept="application/pdf" multiple style="display:none">
  <div id="status"></div>
  <div id="app"></div>
  <p class="note">⚠ 모든 수치는 생기부 실측 기반(지어낸 값 없음) · 해석/판정은 하지 않으며 근거와 함께 신호만 제시 · 파일은 이 컴퓨터 브라우저에서만 열리고 어디로도 전송되지 않습니다.</p>
</div>
<script>window.__errs=[];window.onerror=function(m,s,l,c,e){window.__errs.push((m||'')+' @'+l+':'+c)};</script>
<script>${PDFWORKER}</script>
<script>${PDFLIB}</script>
<script>
// ── 엔진(파서/분석) ──
${PARSE}
${ANALYZE}
// ── 브라우저 추출기 ──
${EXTRACT_JS}
// ── 상태 + 렌더(공유) ──
let DATA=[], idx=0, anon=false;
${RENDER}
const setStatus=(m,err)=>{const el=document.getElementById('status');el.textContent=m||'';el.className=err?'err':'';};
async function handleFile(file){
  if(!file) return;
  try{
    setStatus('PDF 읽는 중…');
    const buf=await file.arrayBuffer();
    // pdfjsLib/pdfjsWorker는 위 인라인 스크립트가 전역으로 제공(워커 없이 메인스레드 동작)
    const rich=await extractRichFromBuffer(buf, pdfjsLib, (pg,tot)=>setStatus('PDF 분석 중… '+pg+'/'+tot+' 페이지'));
    // 진단 1: 텍스트가 거의 없으면 스캔본(이미지 PDF)
    const totalChars=rich.reduce((a,pg)=>a+pg.lines.join('').length,0);
    if(totalChars<300){ setStatus('이 PDF에서 텍스트가 추출되지 않습니다 — 스캔본(이미지)으로 보입니다. NEIS에서 직접 출력·저장한 텍스트 PDF만 지원합니다(신청서 스캔본 아님).', true); return; }
    setStatus('분석 중…');
    const parsed=parse(rich);
    // 진단 2: 생기부 구조 인식 여부(섹션별)
    const found={ 인적:!!parsed.meta.name, 성적:parsed.scores.length>0, 세특:parsed.details.length>0, 창체:['autonomy','club','career'].some(k=>parsed.creative[k].length>0), 행특:parsed.behavior.length>0 };
    if(!found.인적 && !found.성적 && !found.세특){
      setStatus('생기부(학교생활기록부Ⅱ) 구조를 인식하지 못했습니다. NEIS에서 출력한 학생부 PDF가 맞는지 확인해 주세요. (1쪽 예시: "'+((rich[0]&&rich[0].lines[0])||'빈 문서').slice(0,40)+'…")', true); return;
    }
    const missing=Object.entries(found).filter(([k,v])=>!v).map(([k])=>k);
    const kwset=currentKwSet();
    const analysis=analyze(parsed, kwset);
    DATA=[{set:kwset.name, bench:'', parsed, analysis, benchmark:null, cmp:null}];
    idx=0;
    setStatus('완료: '+(parsed.meta.name||'(이름 미인식)')+' · 진로군: '+kwset.name+(missing.length?' · ⚠ 미인식 섹션: '+missing.join(', '):''));
    render();
    window.__appliedKw=kwEl.value; markDirty();   // 로드 시 현재 키워드가 적용된 상태로 동기화
    saveSession();                                  // 새로고침 복구용 임시 저장
    document.getElementById('app').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){ setStatus('오류: '+e.message, true); console.error(e); }
}
// ── 드래그&드롭 + 파일 선택 ──
const dz=document.getElementById('drop'), fi=document.getElementById('file');
dz.onclick=()=>fi.click();
fi.onchange=e=>handleFile(e.target.files[0]);
dz.ondragover=e=>{e.preventDefault();dz.classList.add('hot');};
dz.ondragleave=()=>dz.classList.remove('hot');
dz.ondrop=e=>{e.preventDefault();dz.classList.remove('hot');handleFile(e.dataTransfer.files[0]);};
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>e.preventDefault());
const $$=s=>document.querySelector(s);
$$('#anon').onclick=()=>{anon=!anon;$$('#anon').classList.toggle('on',anon);if(DATA.length)render()};

// ── 진로군: 프리셋 칩 + 자유 키워드 입력 ──
const kwEl=$$('#kw');
// 입력창의 키워드로 맞춤 셋 구성(없으면 프리셋 기본)
function currentKwSet(){
  const raw=(kwEl.value||'').split(/[,·]/).map(s=>s.trim()).filter(Boolean);
  if(raw.length){ const name=(window.__presetName&&window.__presetKw===kwEl.value)?window.__presetName:'맞춤('+raw[0]+(raw.length>1?' 외 '+(raw.length-1):'')+')'; return {name, core:raw, related:[]}; }
  return {name:'생명·과학', core:KEYWORD_SETS['생명·과학'].core, related:KEYWORD_SETS['생명·과학'].related};
}
const applyBtn=$$('#applyKw');
// 입력값이 마지막 적용값과 다르면 '적용' 버튼을 강조(미반영 표시)
function markDirty(){ const d=kwEl.value!==(window.__appliedKw||''); applyBtn.classList.toggle('dirty',d); applyBtn.textContent=d?'적용 ●':'적용'; }
// 현재 키워드를 리포트에 반영
function applyKw(){
  window.__appliedKw=kwEl.value; markDirty();
  if(!DATA.length){ setStatus('먼저 생기부 PDF를 넣어주세요. (키워드는 파일을 넣으면 자동 적용됩니다)'); return; }
  const ks=currentKwSet();
  DATA[0].analysis=analyze(DATA[0].parsed, ks); DATA[0].set=ks.name; render();
  const p=DATA[0].parsed; setStatus('✓ 적용됨: '+(p.meta.name||'(이름 미인식)')+' · 진로군: '+ks.name);
  saveSession();
}
// 프리셋 칩 렌더 — 클릭 시 입력창 채우고 즉시 적용
const presetBox=$$('#presets');
Object.keys(KEYWORD_SETS).forEach(nm=>{
  const b=document.createElement('button'); b.textContent=nm; b.style.fontSize='12px'; b.style.padding='4px 9px';
  b.onclick=()=>{ kwEl.value=KEYWORD_SETS[nm].core.join(', '); window.__presetName=nm; window.__presetKw=kwEl.value; applyKw(); };
  presetBox.appendChild(b);
});
applyBtn.onclick=applyKw;
kwEl.oninput=()=>{ window.__presetName=null; markDirty(); };       // 타이핑=미적용 표시만(자동 반영 안 함)
kwEl.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); applyKw(); } };
// 자동 추천 키워드의 '＋'가 호출 — 진로 키워드 입력창에 추가 후 즉시 적용
window.__addKw=(w)=>{ const parts=(kwEl.value||'').split(/[,·]/).map(s=>s.trim()).filter(Boolean); if(!parts.includes(w)){ parts.push(w); kwEl.value=parts.join(', '); window.__presetName=null; applyKw(); } };

// ── 다크 모드 ──
$$('#dark').onclick=()=>{ const on=document.body.classList.toggle('dark'); $$('#dark').classList.toggle('on',on); $$('#dark').textContent=on?'☀️':'🌙'; };

// ── CSV 내보내기: 키워드별 원문 문장(면접·자소서용 데이터 가공) ──
$$('#csv').onclick=()=>{
  if(!DATA.length){ setStatus('먼저 생기부 PDF를 넣어주세요.'); return; }
  const a=DATA[0].analysis, p=DATA[0].parsed;
  const kws=[...new Set([...(a.auto||[]).map(k=>k.word), ...((a.heatmap&&a.heatmap.core)||[])])];
  const rows=[['키워드','학년','구분/과목','원문 문장']]; const seen=new Set();
  kws.forEach(kw=>kwSentences(p,kw).forEach(s=>{ const id=kw+'|'+s.src+'|'+s.text.slice(0,24); if(seen.has(id))return; seen.add(id); rows.push([kw,(s.grade!=null?s.grade+'학년':''),s.src,s.text]); }));
  if(rows.length<2){ setStatus('내보낼 키워드 문장이 없습니다.'); return; }
  const csv=String.fromCharCode(0xFEFF)+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\\r\\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const aEl=document.createElement('a'); aEl.href=url; aEl.download=(p.meta.name||'생기부')+'_키워드문장.csv'; aEl.click(); URL.revokeObjectURL(url);
  setStatus('✓ CSV 저장: '+(rows.length-1)+'개 문장 ('+kws.length+'개 키워드)');
};

// ── 강력 블라인드(이름·학교·대회명 마스킹) ──
$$('#blind').onclick=()=>{ blind=!blind; $$('#blind').classList.toggle('on',blind); if(DATA.length)render(); setStatus(blind?'🔒 강력 블라인드 ON — 이름·학교·대회명을 마스킹합니다(외부 제출용).':'강력 블라인드 OFF'); };

// ── AI 프롬프트 복사 ──
function buildPrompt(){
  const P=DATA[0], a=P.analysis, p=P.parsed;
  const who=(blind||anon)?'○○○ 학생':(p.meta.name||'학생');
  const hope=Object.entries(a.hope||{}).map(([y,v])=>y+'학년 '+maskText(v)).join(' → ')||'미기재';
  const L=[];
  L.push('# 생기부 분석 데이터 (실측 · '+(p.scale||9)+'등급제)');
  L.push('- 학생: '+who+' / 희망 진로: '+hope+' / 진로군 렌즈: '+P.set);
  const pf=a.profile||{};
  L.push('');L.push('## 성적 요약');
  L.push('전과목 평균 '+pf.전과목평균등급+'등급 · 국영수사과 '+pf.국영수사과평균+' · 최종학기 '+pf.최종학기평균+' · 성취도A '+pf.성취도A수+'과목');
  L.push('');L.push('## 진로 일관성·연계(핵심어)');
  L.push((a.thread.keywords||[]).map(k=>k.keyword+'('+k.docs+'곳·'+k.grades.join('·')+'학년)').join(', ')||'—');
  L.push('');L.push('## 입학사정관 3대 역량 신호');
  (a.competency||[]).forEach(c=>L.push('- '+c.label+' '+c.total+'회 ('+c.subs.map(s=>s.key+' '+s.n).join(', ')+')'));
  L.push('');L.push('## 주요 세특(정독 포인트)');
  (a.setuk||[]).forEach(g=>g.subjects.forEach(s=>L.push('- '+g.grade+'학년 '+s.subject+' ['+(s.tags||[]).join('·')+']: '+maskText(s.items&&s.items[0]?(s.items[0].gist||s.items[0].text):''))));
  L.push('');L.push('## 주도성 행위 동사: '+(a.actions.cats||[]).filter(c=>c.n).map(c=>c.v+' '+c.n).join(', '));
  L.push('## 교과 융합: 연결 '+(a.fusion.strong||[]).map(s=>s.group).join('·')+' / 빈 교과 '+((a.fusion.gaps||[]).map(g=>g.group).join('·')||'없음'));
  L.push('## 성장 궤적: '+maskText(a.growth?a.growth.note:''));
  L.push('## 아쉬운 점(결과 위주 세특): '+((a.inquiry.shallow||[]).slice(0,5).map(i=>i.subject).join(', ')||'없음'));
  L.push('');L.push('---');
  L.push('위 데이터를 바탕으로, 이 학생의 진로 역량을 강화할 수 있는 다음 학기 멘토링 계획 초안을 마크다운으로 작성해 줘. (1) 강점 요약 (2) 보완이 필요한 부분 (3) 구체적 후속 탐구·활동 제안 3가지 (4) 추천 도서·자료 방향. 생기부는 입시의 일부이며 판정이 아니라 지도용 참고임을 전제로 해 줘.');
  return L.join('\\n');
}
$$('#prompt').onclick=async()=>{
  if(!DATA.length){ setStatus('먼저 생기부 PDF를 넣어주세요.'); return; }
  const txt=buildPrompt();
  try{ await navigator.clipboard.writeText(txt); setStatus('✓ 프롬프트 복사됨 — AI 도구(Claude/ChatGPT 등)에 붙여넣기하세요.'); }
  catch(e){ const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); setStatus('✓ 프롬프트 복사됨 — AI 도구에 붙여넣기하세요.');}catch(_){ setStatus('복사 실패 — 브라우저 권한을 확인하세요.',true);} document.body.removeChild(ta); }
};

// ── 다중 파일 일괄 처리 → 학생별 키워드 요약 CSV(연구부 취합·학기말 업무용) ──
$$('#batchcsv').onclick=()=>$$('#batchfile').click();
$$('#batchfile').onchange=async e=>{
  const files=[...e.target.files]; if(!files.length) return;
  const ks=currentKwSet();
  const rows=[['이름','학년','전과목평균등급','국영수사과','최종학기','성취도A','진로핵심어총','진로연계과목','공동체신호','자동키워드Top5','진로연계키워드']];
  let ok=0;
  for(let i=0;i<files.length;i++){ const f=files[i];
    setStatus('📚 일괄 처리 중… '+(i+1)+'/'+files.length+' — '+f.name);
    try{
      const rich=await extractRichFromBuffer(await f.arrayBuffer(), pdfjsLib);
      if(rich.reduce((a,pg)=>a+pg.lines.join('').length,0)<300){ rows.push([f.name,'(스캔본·텍스트 없음)']); continue; }
      const p=parse(rich), a=analyze(p,ks), pf=a.profile;
      rows.push([p.meta.name||f.name, [...new Set(p.scores.map(s=>s.grade))].sort().join('·'),
        pf.전과목평균등급, pf.국영수사과평균, pf.최종학기평균, pf.성취도A수, pf.진로핵심어총, pf.진로연계과목수, pf.공동체신호수,
        a.auto.slice(0,5).map(k=>k.word).join(' '), a.thread.keywords.map(k=>k.keyword).join(' ')]);
      ok++;
    }catch(err){ rows.push([f.name,'(처리 실패: '+err.message+')']); }
    await new Promise(r=>setTimeout(r,0));
  }
  const csv=String.fromCharCode(0xFEFF)+rows.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\\r\\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const aEl=document.createElement('a'); aEl.href=url; aEl.download='학급_생기부_키워드요약_'+files.length+'명.csv'; aEl.click(); URL.revokeObjectURL(url);
  setStatus('✓ 일괄 CSV 저장: '+ok+'/'+files.length+'명 처리 (진로군 렌즈: '+ks.name+'). 단일 분석 화면은 그대로입니다.');
  e.target.value='';
};

// ── 세션 임시 저장(새로고침 복구) — sessionStorage는 로컬 전용, 탭 닫으면 삭제 ──
function saveSession(){ try{ if(DATA.length) sessionStorage.setItem('sgb_session', JSON.stringify({parsed:DATA[0].parsed, kw:kwEl.value})); }catch(e){} }
function restoreSession(){ try{
  const raw=sessionStorage.getItem('sgb_session'); if(!raw) return;
  const o=JSON.parse(raw); if(!o||!o.parsed) return;
  kwEl.value=o.kw||''; window.__appliedKw=kwEl.value; window.__presetName=null;
  const ks=currentKwSet();
  DATA=[{set:ks.name,bench:'',parsed:o.parsed,analysis:analyze(o.parsed,ks),benchmark:null,cmp:null}]; idx=0;
  render(); markDirty();
  setStatus('↻ 이전 분석을 복구했습니다'+(o.parsed.meta&&o.parsed.meta.name?' ('+o.parsed.meta.name+')':'')+'. 새 PDF를 넣으면 교체됩니다.');
}catch(e){} }
restoreSession();
</script>`;

fs.writeFileSync('생기부분석기.html', html);
console.log('생기부분석기.html 생성 (' + (html.length / 1024 / 1024).toFixed(2) + ' MB)');
