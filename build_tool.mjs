/* 실제 배포본 빌더: pdf.js + 파서 + 분석 + 공유 렌더 + 드래그&드롭 → 자립형 생기부분석기.html
   사용: node build_tool.mjs   (node_modules의 pdf.js를 인라인) */
import fs from 'node:fs';

const strip = code => code.replace(/^export\s+/gm, '');          // ESM export 제거 → 전역 함수
const PARSE = strip(fs.readFileSync('parse.mjs', 'utf8'));
const ANALYZE = strip(fs.readFileSync('analyze.mjs', 'utf8'));
const RENDER = fs.readFileSync('app_render.js', 'utf8');
const CSS = fs.readFileSync('app_style.css', 'utf8');
const NAVI = fs.existsSync('navi.json') ? fs.readFileSync('navi.json', 'utf8') : '{"jonghap":[],"gyogwa":{}}';
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
const normOcr=s=>s.replace(/[•∙‧⋅]/g,'·');
function reconstructLines(items){
  const Y_TOL=3;
  const toks=items.filter(it=>it.str!=='').map(it=>({s:normOcr(it.str),x:it.transform[4],y:it.transform[5],w:it.width,h:it.height}));
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
  return items.filter(it=>it.str!=='').map(it=>({s:normOcr(it.str),x:+it.transform[4].toFixed(1),y:+it.transform[5].toFixed(1),w:+it.width.toFixed(1),h:+it.height.toFixed(1)}));
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
.snap-close{float:right;border:none;background:none;font-size:16px;cursor:pointer;color:var(--sub)}
.snap-row{display:grid;grid-template-columns:150px 1fr 40px 1fr;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:13px}
.snap-row:first-of-type{border-top:none}
.snap-arrow{text-align:center;color:var(--sub)}
.snap-val{font-weight:700}
.snap-val.up{color:#2f8f5f}
.snap-val.down{color:#c0392b}
.snap-new{display:inline-block;background:var(--soft);color:var(--accent);border-radius:9px;padding:1px 8px;font-size:12px;margin:2px 4px 0 0}
.cd-hist{display:flex;align-items:flex-end;gap:10px;height:110px;padding:8px 4px 0}
.cd-bar-wrap{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;flex:1;height:100%}
.cd-bar{width:26px;background:var(--accent);border-radius:4px 4px 0 0;min-height:2px}
.cd-bar-label{font-size:10px;color:var(--sub);margin-top:4px}
.cd-bar-n{font-size:11px;font-weight:700;color:var(--accent)}
.cd-wrow{display:grid;grid-template-columns:90px 1fr 44px;gap:8px;align-items:center;margin:4px 0;font-size:12.5px}
.cd-wtrack{background:#e9edf1;border-radius:6px;height:14px;overflow:hidden}
.cd-wfill{display:block;height:100%;background:var(--accent2);border-radius:6px;min-width:2px}
.cd-table{border-collapse:collapse;width:100%;font-size:12.5px}
.cd-table th{text-align:left;color:var(--sub);font-weight:600;padding:5px 8px;border-bottom:2px solid var(--line)}
.cd-table td{padding:5px 8px;border-bottom:1px solid var(--line)}
.lens-row{display:grid;grid-template-columns:150px 1fr 1fr;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:13px}
.lens-row:first-of-type{border-top:none}
.lens-head{font-weight:700;color:var(--accent)}
.sc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:10px}
.sc-card{border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center;background:#fbfcfd}
.sc-name{font-weight:700;font-size:13.5px}
.sc-meta{font-size:11px;color:var(--sub);margin:2px 0 4px}
.sc-radar{width:140px;margin:0 auto}
.sc-badges{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin:6px 0 4px}
.sc-badges .cbadge{font-size:10.5px;padding:2px 7px}
.sc-kw{font-size:11.5px;color:var(--accent);font-weight:600}
.sc-growth{font-size:10.5px;color:var(--sub);margin-top:2px}
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
      <button id="snapSave" title="현재 분석 요약을 파일로 저장해 두었다가 다음 학기와 비교할 수 있습니다">📥 스냅샷 저장</button>
      <button id="snapCompareBtn" title="저장해 둔 스냅샷 파일을 불러와 현재와 비교합니다">🔀 스냅샷 비교</button>
      <button id="batchcsv" title="여러 학생 PDF를 한 번에 → 학생별 키워드 요약 CSV">📚 일괄 CSV</button>
      <button id="compareBtn" title="여러 학생 PDF를 같은 진로군 렌즈로 나란히 비교합니다(최대 8명)">👯 학생 비교</button>
      <button id="dictBtn" title="판정에 쓰이는 표현 사전에 단어를 추가합니다(이 브라우저에 저장, 학생 데이터 아님)">⚙ 판정 사전</button>
      <button id="briefBtn" title="상담·면담용 핵심 카드만 남기고 나머지는 숨깁니다(다시 누르면 전체 보기)">🖨️ 브리핑 모드</button>
      <button id="lensBtn" title="같은 생기부를 다른 진로군 렌즈로도 분석해 나란히 비교합니다(예: 의학 vs 생명공학)">🔀 진로군 비교</button>
      <button id="dark" title="다크 모드">🌙</button>
      <button onclick="print()">인쇄</button>
    </div>
  </div>
  <div id="drop" class="dropzone"><b>📄 생기부 PDF를 여기로 끌어다 놓으세요</b>클릭해서 선택할 수도 있습니다 · NEIS 출력 텍스트 PDF · 100% 브라우저에서만 처리(외부 전송 없음)</div>
  <input type="file" id="file" accept="application/pdf" style="display:none">
  <input type="file" id="batchfile" accept="application/pdf" multiple style="display:none">
  <input type="file" id="comparefile" accept="application/pdf" multiple style="display:none">
  <input type="file" id="snapCompareFile" accept="application/json" style="display:none">
  <div id="lensmodal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;align-items:center;justify-content:center;padding:20px">
    <div style="background:var(--card);border-radius:14px;max-width:520px;width:100%;padding:20px 22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <b style="font-size:15px">🔀 진로군 비교</b>
        <button id="lensClose" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--sub)">✕</button>
      </div>
      <div class="desc" style="margin-bottom:10px">같은 생기부를 <b>두 번째 진로 렌즈</b>로도 분석해 첫 번째 렌즈(현재 적용된 진로군)와 나란히 비교합니다. 학생이 진로를 고민 중일 때(예: 의학 vs 생명공학) 근거 대비를 보는 용도입니다.</div>
      <input id="lensInput" type="text" placeholder="예: 의학, 간호, 임상, 병리" style="width:100%;margin:3px 0 8px;font:inherit;padding:7px 9px;border:1px solid var(--line);border-radius:8px">
      <div id="lensPresets" class="ctrls" style="gap:5px;margin-bottom:12px"></div>
      <div style="display:flex;justify-content:flex-end">
        <button id="lensGo" style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600">비교하기</button>
      </div>
    </div>
  </div>
  <div id="dictmodal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;align-items:center;justify-content:center;padding:20px">
    <div style="background:var(--card);border-radius:14px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto;padding:20px 22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <b style="font-size:15px">⚙ 판정 사전 편집</b>
        <button id="dictClose" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--sub)">✕</button>
      </div>
      <div class="desc" style="margin-bottom:12px">실사용 중 놓치는 표현이 있으면 여기에 <b>추가</b>하세요(기존 표현은 그대로 유지, 삭제 아님). <b>이 브라우저에만 저장</b>되며(단어만 저장, 학생 데이터 아님) 다음에 열 때도 자동 적용됩니다. 쉼표로 구분해서 입력하세요.</div>
      <label style="font-size:12px;color:var(--sub)">강점 표현(강한) — 예: 돋보임·뛰어남 계열</label>
      <textarea id="dict_strong" rows="2" style="width:100%;margin:3px 0 10px;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px"></textarea>
      <label style="font-size:12px;color:var(--sub)">강점 표현(보통) — 예: 성실·적극 계열</label>
      <textarea id="dict_weak" rows="2" style="width:100%;margin:3px 0 10px;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px"></textarea>
      <label style="font-size:12px;color:var(--sub)">지적 호기심·동기 표현 추가</label>
      <textarea id="dict_motive" rows="2" style="width:100%;margin:3px 0 10px;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px"></textarea>
      <label style="font-size:12px;color:var(--sub)">외부자료 확장 표현 추가(논문·서적·다큐 등)</label>
      <textarea id="dict_external" rows="2" style="width:100%;margin:3px 0 10px;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px"></textarea>
      <label style="font-size:12px;color:var(--sub)">공동체·협력 표현 추가</label>
      <textarea id="dict_community" rows="2" style="width:100%;margin:3px 0 10px;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px"></textarea>
      <label style="font-size:12px;color:var(--sub)">주도성 행위 동사 추가</label>
      <textarea id="dict_actionVerb" rows="2" style="width:100%;margin:3px 0 14px;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="dictReset">기본값으로</button>
        <button id="dictSave" style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600">저장 및 적용</button>
      </div>
    </div>
  </div>
  <div id="status"></div>
  <div id="snapcompare"></div>
  <div id="lenscompare"></div>
  <div id="studentcompare"></div>
  <div id="classdashbox"></div>
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
window.NAVI=${NAVI};
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

// ── 듀얼 진로군 비교(같은 생기부, 두 렌즈 나란히) ──
const lensPresetBox=$$('#lensPresets');
Object.keys(KEYWORD_SETS).forEach(nm=>{
  const b=document.createElement('button'); b.textContent=nm; b.style.fontSize='12px'; b.style.padding='4px 9px';
  b.onclick=()=>{ $$('#lensInput').value=KEYWORD_SETS[nm].core.join(', '); };
  lensPresetBox.appendChild(b);
});
$$('#lensBtn').onclick=()=>{
  if(!DATA.length){ setStatus('먼저 생기부 PDF를 넣어주세요.'); return; }
  $$('#lensInput').value=''; $$('#lensmodal').style.display='flex';
};
$$('#lensClose').onclick=()=>{ $$('#lensmodal').style.display='none'; };
function buildKwSetFromText(txt, fallbackName){
  const raw=(txt||'').split(/[,·]/).map(s=>s.trim()).filter(Boolean);
  if(!raw.length) return null;
  return { name: fallbackName||('맞춤('+raw[0]+(raw.length>1?' 외 '+(raw.length-1):'')+')'), core: raw, related: [] };
}
$$('#lensGo').onclick=()=>{
  const ksB=buildKwSetFromText($$('#lensInput').value);
  if(!ksB){ setStatus('비교할 진로 키워드를 입력해 주세요.', true); return; }
  const p=DATA[0].parsed;
  const labelA=DATA[0].set, aA=DATA[0].analysis;
  const aB=analyze(p, ksB);
  const metric=(a,key)=>a.profile[key];
  const radarOf=(a)=>{ const r=(a.radar||[]).find(x=>x.axis==='전공적합성'); return r?r.value:0; };
  const rows=[
    ['진로 핵심어 총', metric(aA,'진로핵심어총'), metric(aB,'진로핵심어총')],
    ['진로연계 과목수', metric(aA,'진로연계과목수'), metric(aB,'진로연계과목수')],
    ['전공적합성(레이더)', radarOf(aA), radarOf(aB)],
    ['융합 연결 교과 수', (aA.fusion.strong||[]).length, (aB.fusion.strong||[]).length],
    ['융합 빈 교과 수', (aA.fusion.gaps||[]).length, (aB.fusion.gaps||[]).length],
  ];
  const rowsHtml=rows.map(([label,vA,vB])=>{
    const win=vA>vB?'A':vB>vA?'B':'';
    return '<div class="lens-row"><span>'+esc(label)+'</span><span style="font-weight:'+(win==='A'?'700':'400')+';color:'+(win==='A'?'var(--accent)':'inherit')+'">'+vA+'</span><span style="font-weight:'+(win==='B'?'700':'400')+';color:'+(win==='B'?'var(--accent)':'inherit')+'">'+vB+'</span></div>';
  }).join('');
  const topA=(aA.thread.keywords||[]).slice(0,3).map(k=>k.keyword+'('+k.docs+'곳)').join(', ')||'—';
  const topB=(aB.thread.keywords||[]).slice(0,3).map(k=>k.keyword+'('+k.docs+'곳)').join(', ')||'—';
  const box=$$('#lenscompare');
  box.innerHTML='<div class="card" style="border-color:var(--accent)">'
    +'<button class="snap-close" onclick="document.getElementById(\\'lenscompare\\').innerHTML=\\'\\'" title="닫기">✕</button>'
    +'<h2>🔀 진로군 비교: '+esc(labelA)+' vs '+esc(ksB.name)+'</h2>'
    +'<div class="desc">같은 생기부를 두 진로 렌즈로 각각 분석했습니다. 진한 초록색이 그 지표에서 더 뚜렷한 쪽입니다. 판정이 아니라 근거 밀도 대비입니다.</div>'
    +'<div class="lens-row lens-head"><span>지표</span><span>'+esc(labelA)+'</span><span>'+esc(ksB.name)+'</span></div>'
    +rowsHtml
    +'<div style="margin-top:10px;font-size:12.5px"><b style="color:var(--accent)">'+esc(labelA)+'</b> 상위 진로키워드: '+esc(topA)+'</div>'
    +'<div style="font-size:12.5px;margin-top:2px"><b style="color:var(--accent)">'+esc(ksB.name)+'</b> 상위 진로키워드: '+esc(topB)+'</div>'
    +'</div>';
  $$('#lensmodal').style.display='none';
  box.scrollIntoView({behavior:'smooth',block:'start'});
  setStatus('✓ 진로군 비교 완료: '+labelA+' vs '+ksB.name);
};

// ── 학기별 스냅샷 저장/비교 — 파일 기반(브라우저에 영구저장 안 함, 교사가 직접 보관) ──
function buildSnapshotObj(label){
  if(!DATA.length) return null;
  const p=DATA[0].parsed, a=DATA[0].analysis;
  const lastGrowth=(a.growth&&a.growth.rows.length)?a.growth.rows[a.growth.rows.length-1]:null;
  return {
    version:1, savedAt:new Date().toISOString(), label:label||'',
    name:p.meta.name, scale:p.scale, set:DATA[0].set,
    profile:a.profile,
    threadKeywords:(a.thread.keywords||[]).map(k=>({keyword:k.keyword,docs:k.docs,total:k.total,grades:k.grades})),
    competency:(a.competency||[]).map(c=>({key:c.key,total:c.total})),
    growth:lastGrowth?{grade:lastGrowth.grade,kwTotal:lastGrowth.kwTotal,band:lastGrowth.band,tierLabel:lastGrowth.tierLabel,breadth:lastGrowth.breadth}:null,
  };
}
$$('#snapSave').onclick=()=>{
  if(!DATA.length){ setStatus('먼저 생기부 PDF를 넣어주세요.'); return; }
  const label=window.prompt('이 스냅샷의 라벨을 입력하세요 (예: 1학년 2학기)','');
  if(label===null) return;
  const snap=buildSnapshotObj(label);
  const json=JSON.stringify(snap,null,1);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const aEl=document.createElement('a'); aEl.href=url; aEl.download=(snap.name||'생기부')+'_'+(label||'스냅샷')+'.json'; aEl.click(); URL.revokeObjectURL(url);
  setStatus('✓ 스냅샷 저장됨: '+(label||'(라벨 없음)')+' — 파일로 보관해 두었다가 다음 학기 비교에 쓰세요.');
};
const PROFILE_LABELS=[['전과목평균등급','전과목 평균등급','low'],['국영수사과평균','국영수사과 평균','low'],['성취도A수','성취도 A 과목수','high'],['진로핵심어총','진로 핵심어 총','high'],['진로연계과목수','진로연계 과목수','high'],['공동체신호수','공동체역량 신호','high'],['세특강점총수','세특 강점 총수','high']];
function renderSnapshotCompare(old,cur){
  const box=$$('#snapcompare');
  if(old.name && cur.name && old.name!==cur.name){
    box.innerHTML='<div class="card"><button class="snap-close" onclick="document.getElementById(\\'snapcompare\\').innerHTML=\\'\\'">✕</button><h2>⚠ 다른 학생입니다</h2><div class="desc">스냅샷('+esc(old.name)+')과 현재 분석 대상('+esc(cur.name)+')의 이름이 다릅니다. 같은 학생의 스냅샷인지 확인해 주세요.</div></div>';
    return;
  }
  const rows=PROFILE_LABELS.map(([key,label,dir])=>{
    const ov=old.profile?old.profile[key]:null, cv=cur.profile?cur.profile[key]:null;
    if(ov==null||cv==null) return '';
    const better=dir==='low'?cv<ov:cv>ov, worse=dir==='low'?cv>ov:cv<ov;
    const cls=better?'up':worse?'down':'';
    const arrow=cv>ov?'↑':cv<ov?'↓':'→';
    return '<div class="snap-row"><span>'+esc(label)+'</span><span class="snap-val">'+ov+'</span><span class="snap-arrow">'+arrow+'</span><span class="snap-val '+cls+'">'+cv+'</span></div>';
  }).join('');
  const oldKw=new Set((old.threadKeywords||[]).map(k=>k.keyword));
  const newKw=(cur.threadKeywords||[]).filter(k=>!oldKw.has(k.keyword)).map(k=>k.keyword);
  const oldComp={}; (old.competency||[]).forEach(c=>oldComp[c.key]=c.total);
  const compRows=(cur.competency||[]).map(c=>{
    const ov=oldComp[c.key]||0; const arrow=c.total>ov?'↑':c.total<ov?'↓':'→'; const cls=c.total>ov?'up':c.total<ov?'down':'';
    return '<div class="snap-row"><span>'+esc(c.key)+'</span><span class="snap-val">'+ov+'</span><span class="snap-arrow">'+arrow+'</span><span class="snap-val '+cls+'">'+c.total+'</span></div>';
  }).join('');
  const newKwHtml=newKw.length?('<div style="margin-top:10px"><span style="font-weight:700;font-size:13px;color:var(--accent)">새로 등장한 진로 키워드</span><div style="margin-top:4px">'+newKw.map(k=>'<span class="snap-new">'+esc(k)+'</span>').join('')+'</div></div>'):'';
  box.innerHTML='<div class="card" style="border-color:var(--accent)">'
    +'<button class="snap-close" onclick="document.getElementById(\\'snapcompare\\').innerHTML=\\'\\'" title="닫기">✕</button>'
    +'<h2>🔀 스냅샷 비교: '+esc(old.label||'이전')+' → '+esc(cur.label||'현재')+'</h2>'
    +'<div class="desc">'+esc(old.name||'')+' 학생의 두 시점 분석을 비교합니다. 저장 시각: '+(old.savedAt?new Date(old.savedAt).toLocaleString('ko-KR'):'-')+' → 지금.</div>'
    +'<div style="font-weight:700;font-size:13px;margin:8px 0 2px;color:var(--accent)">성적·활동 지표</div>'
    +(rows||'<div class="note">비교 가능한 지표가 없습니다.</div>')
    +'<div style="font-weight:700;font-size:13px;margin:12px 0 2px;color:var(--accent)">3대 역량 신호</div>'
    +compRows
    +newKwHtml
    +'</div>';
  box.scrollIntoView({behavior:'smooth',block:'start'});
}
$$('#snapCompareBtn').onclick=()=>$$('#snapCompareFile').click();
$$('#snapCompareFile').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{
    const old=JSON.parse(await f.text());
    if(!DATA.length){ setStatus('비교하려면 먼저 현재 생기부 PDF를 넣어주세요.', true); e.target.value=''; return; }
    const cur=buildSnapshotObj('현재');
    renderSnapshotCompare(old,cur);
    setStatus('✓ 스냅샷 비교 완료: '+(old.label||'이전')+' vs 현재');
  }catch(err){ setStatus('스냅샷 파일을 읽을 수 없습니다: '+err.message, true); }
  e.target.value='';
};

// ── 강력 블라인드(이름·학교·대회명 마스킹) ──
$$('#blind').onclick=()=>{ blind=!blind; $$('#blind').classList.toggle('on',blind); if(DATA.length)render(); setStatus(blind?'🔒 강력 블라인드 ON — 이름·학교·대회명을 마스킹합니다(외부 제출용).':'강력 블라인드 OFF'); };
$$('#briefBtn').onclick=()=>{
  if(!DATA.length){ setStatus('먼저 생기부 PDF를 넣어주세요.'); return; }
  briefMode=!briefMode; $$('#briefBtn').classList.toggle('on',briefMode); render();
  setStatus(briefMode?'🖨️ 브리핑 모드 ON — 핵심 카드만 표시합니다. 이 상태로 인쇄하면 1페이지 요약이 나옵니다.':'브리핑 모드 OFF — 전체 카드로 돌아왔습니다.');
};

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

// ── 다중 파일 일괄 처리 → 학생별 키워드 요약 CSV + 학급 개관 대시보드(연구부 취합·학기말 업무용) ──
function classDashboardHtml(summaries){
  if(!summaries.length) return '';
  const buckets={}; summaries.forEach(s=>{ if(s.avg==null) return; const b=Math.floor(s.avg); buckets[b]=(buckets[b]||0)+1; });
  const maxScale=Math.max(5,...summaries.map(s=>s.scale||9));
  const bucketKeys=[]; for(let i=1;i<=maxScale;i++) bucketKeys.push(i);
  const maxCount=Math.max(1,...Object.values(buckets));
  const histBars=bucketKeys.map(k=>{
    const n=buckets[k]||0, hpx=Math.round(n/maxCount*80);
    return '<div class="cd-bar-wrap"><div class="cd-bar-n">'+(n||'')+'</div><div class="cd-bar" style="height:'+Math.max(hpx,2)+'px" title="'+n+'명"></div><div class="cd-bar-label">'+k+'점대</div></div>';
  }).join('');
  const wordCount={}; summaries.forEach(s=>(s.autoTop||[]).forEach(w=>{ wordCount[w]=(wordCount[w]||0)+1; }));
  const topWords=Object.entries(wordCount).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const maxW=Math.max(1,...topWords.map(w=>w[1]));
  const wordBars=topWords.map(([w,n])=>'<div class="cd-wrow"><span>'+esc(w)+'</span><span class="cd-wtrack"><span class="cd-wfill" style="width:'+Math.round(n/maxW*100)+'%"></span></span><span>'+n+'명</span></div>').join('');
  const sorted=summaries.slice().sort((a,b)=>(a.avg==null?99:a.avg)-(b.avg==null?99:b.avg));
  const tableRows=sorted.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(s.grades||'')+'</td><td>'+(s.avg==null?'-':s.avg)+'</td><td>'+(s.kwTotal==null?'-':s.kwTotal)+'</td><td>'+(s.community==null?'-':s.community)+'</td><td>'+esc((s.autoTop||[]).slice(0,3).join(', '))+'</td></tr>').join('');
  return '<div class="card" style="border-color:var(--accent)">'
    +'<button class="snap-close" onclick="document.getElementById(\\'classdashbox\\').innerHTML=\\'\\'" title="닫기">✕</button>'
    +'<h2>👥 학급 개관 대시보드 ('+summaries.length+'명)</h2>'
    +'<div class="desc">일괄 처리한 '+summaries.length+'명의 요약입니다. 같은 진로군 렌즈를 전원에 적용했습니다(현재 키워드 입력창 기준). 개인 CSV도 함께 다운로드됩니다.</div>'
    +'<div style="font-weight:700;font-size:13px;margin:10px 0 2px;color:var(--accent)">전과목 평균등급 분포</div>'
    +'<div class="cd-hist">'+histBars+'</div>'
    +'<div style="font-weight:700;font-size:13px;margin:14px 0 2px;color:var(--accent)">학급 공통 관심 키워드(자동추천 교차빈도)</div>'
    +(wordBars||'<div class="note">데이터가 부족합니다.</div>')
    +'<div style="font-weight:700;font-size:13px;margin:14px 0 2px;color:var(--accent)">학생별 요약(평균등급순)</div>'
    +'<div style="overflow-x:auto"><table class="cd-table"><tr><th>이름</th><th>학년</th><th>평균등급</th><th>진로핵심어</th><th>공동체신호</th><th>주요 키워드</th></tr>'+tableRows+'</table></div>'
    +'</div>';
}
$$('#batchcsv').onclick=()=>$$('#batchfile').click();
$$('#batchfile').onchange=async e=>{
  const files=[...e.target.files]; if(!files.length) return;
  const ks=currentKwSet();
  const rows=[['이름','학년','전과목평균등급','국영수사과','최종학기','성취도A','진로핵심어총','진로연계과목','공동체신호','자동키워드Top5','진로연계키워드']];
  const summaries=[];
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
      summaries.push({name:p.meta.name||f.name, grades:[...new Set(p.scores.map(s=>s.grade))].sort().join('·'), scale:p.scale,
        avg:pf.전과목평균등급, kwTotal:pf.진로핵심어총, community:pf.공동체신호수, autoTop:a.auto.slice(0,5).map(k=>k.word)});
      ok++;
    }catch(err){ rows.push([f.name,'(처리 실패: '+err.message+')']); }
    await new Promise(r=>setTimeout(r,0));
  }
  const csv=String.fromCharCode(0xFEFF)+rows.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\\r\\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const aEl=document.createElement('a'); aEl.href=url; aEl.download='학급_생기부_키워드요약_'+files.length+'명.csv'; aEl.click(); URL.revokeObjectURL(url);
  $$('#classdashbox').innerHTML=classDashboardHtml(summaries);
  $$('#classdashbox').scrollIntoView({behavior:'smooth',block:'start'});
  setStatus('✓ 일괄 처리 완료: '+ok+'/'+files.length+'명 (진로군 렌즈: '+ks.name+'). CSV 다운로드 + 아래 학급 대시보드 확인.');
  e.target.value='';
};

// ── 여러 학생 나란히 비교(같은 진로군 렌즈) ──
function renderStudentCompare(list, lensName){
  const box=$$('#studentcompare');
  if(!list.length){ box.innerHTML='<div class="card"><div class="note">처리 가능한 PDF가 없었습니다(스캔본이거나 인식 실패).</div></div>'; return; }
  const cardsHtml=list.map(({p,a})=>{
    const nmShown=nm(p.meta.name||'(이름 미인식)');
    const compBadges=(a.competency||[]).map(c=>'<span class="cbadge">'+esc(c.key.replace('역량',''))+' '+c.total+'</span>').join('');
    const topKw=a.thread.keywords[0];
    const growthLast=(a.growth&&a.growth.rows.length)?a.growth.rows[a.growth.rows.length-1]:null;
    return '<div class="sc-card">'
      +'<div class="sc-name">'+esc(nmShown)+'</div>'
      +'<div class="sc-meta">'+esc((p.meta.years||[]).map(y=>y.grade+'학년').join('·'))+' · 평균 '+(a.profile.전과목평균등급==null?'-':a.profile.전과목평균등급)+'등급</div>'
      +'<div class="sc-radar">'+radarSvg(a.radar)+'</div>'
      +'<div class="sc-badges">'+compBadges+'</div>'
      +'<div class="sc-kw">'+(topKw?esc(topKw.keyword)+'('+topKw.docs+'곳'+(topKw.fusion?'·융합':'')+')':'진로 핵심어 없음')+'</div>'
      +(growthLast?'<div class="sc-growth">탐구 깊이 '+esc(growthLast.band)+'</div>':'')
      +'</div>';
  }).join('');
  box.innerHTML='<div class="card" style="border-color:var(--accent)">'
    +'<button class="snap-close" onclick="document.getElementById(\\'studentcompare\\').innerHTML=\\'\\'" title="닫기">✕</button>'
    +'<h2>👯 학생 비교 ('+list.length+'명) <span style="font-size:12px;color:var(--sub);font-weight:400">진로군 렌즈: '+esc(lensName)+'</span></h2>'
    +'<div class="desc">같은 진로군 렌즈로 여러 학생을 나란히 봅니다. 비슷한 계열 학생들을 상담 준비 시 한눈에 비교하는 용도입니다(판정 아님).</div>'
    +'<div class="sc-grid">'+cardsHtml+'</div>'
    +'</div>';
  box.scrollIntoView({behavior:'smooth',block:'start'});
}
$$('#compareBtn').onclick=()=>$$('#comparefile').click();
$$('#comparefile').onchange=async e=>{
  const files=[...e.target.files]; if(!files.length) return;
  if(files.length>8){ setStatus('한 번에 최대 8명까지 비교할 수 있습니다.', true); e.target.value=''; return; }
  const ks=currentKwSet();
  const list=[];
  for(let i=0;i<files.length;i++){ const f=files[i];
    setStatus('👯 학생 비교 처리 중… '+(i+1)+'/'+files.length+' — '+f.name);
    try{
      const rich=await extractRichFromBuffer(await f.arrayBuffer(), pdfjsLib);
      if(rich.reduce((a,pg)=>a+pg.lines.join('').length,0)<300) continue;
      const p=parse(rich); list.push({p, a:analyze(p,ks)});
    }catch(err){}
    await new Promise(r=>setTimeout(r,0));
  }
  renderStudentCompare(list, ks.name);
  setStatus('✓ 학생 비교 완료: '+list.length+'/'+files.length+'명 (진로군 렌즈: '+ks.name+')');
  e.target.value='';
};

// ── 판정 사전 편집(사용자 피드백 루프) — localStorage에 '단어'만 저장(학생 데이터 아님, 영구저장 안전) ──
const DICT_FIELDS=['strong','weak','motive','external','community','actionVerb'];
function loadCustomDict(){ try{ const raw=localStorage.getItem('sgb_customdict'); return raw?JSON.parse(raw):{}; }catch(e){ return {}; } }
function splitList(s){ return (s||'').split(/[,\\n]/).map(x=>x.trim()).filter(Boolean); }
function fillDictForm(custom){ DICT_FIELDS.forEach(k=>{ const el=$$('#dict_'+k); if(el) el.value=(custom[k]||[]).join(', '); }); }
applyCustomDict(loadCustomDict());   // 저장된 사전을 페이지 로드 시 즉시 적용(이후 모든 분석에 반영, restoreSession보다 먼저 실행돼야 함)
$$('#dictBtn').onclick=()=>{ fillDictForm(loadCustomDict()); $$('#dictmodal').style.display='flex'; };
$$('#dictClose').onclick=()=>{ $$('#dictmodal').style.display='none'; };
$$('#dictSave').onclick=()=>{
  const custom={}; DICT_FIELDS.forEach(k=>{ const v=splitList($$('#dict_'+k).value); if(v.length) custom[k]=v; });
  try{ localStorage.setItem('sgb_customdict', JSON.stringify(custom)); }catch(e){}
  applyCustomDict(custom);
  $$('#dictmodal').style.display='none';
  if(DATA.length){ const ks=currentKwSet(); DATA[0].analysis=analyze(DATA[0].parsed, ks); render(); }
  setStatus('✓ 판정 사전이 저장·적용됐습니다.');
};
$$('#dictReset').onclick=()=>{
  if(!window.confirm('추가한 표현을 모두 지우고 기본값으로 되돌릴까요?')) return;
  try{ localStorage.removeItem('sgb_customdict'); }catch(e){}
  applyCustomDict({});
  fillDictForm({});
  if(DATA.length){ const ks=currentKwSet(); DATA[0].analysis=analyze(DATA[0].parsed, ks); render(); }
  setStatus('✓ 판정 사전을 기본값으로 되돌렸습니다.');
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
