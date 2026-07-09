/* 프로토타입 리포트 빌더: parsed_*.json + analyze() → 자립형 report.html
   렌더/CSS는 app_render.js / app_style.css 공유(생기부분석기.html도 같은 파일 사용). */
import { analyze, compareToBenchmark } from './analyze.mjs';
import fs from 'node:fs';

const BENCH = {};
fs.readdirSync('.').filter(f => /^benchmark_.*\.json$/.test(f)).forEach(f => {
  try { const b = JSON.parse(fs.readFileSync(f, 'utf8')); BENCH[b.setName] = b; } catch { }
});

const students = [
  { file: 'parsed_sample3', set: '수의·동물', bench: '서울대 수의예과 합격 사례 (기준)' },
  { file: 'parsed_annayeong', set: '생명·과학' },
  { file: 'parsed_sample2', set: '의약·보건' },
];
const DATA = students.map(s => {
  const parsed = JSON.parse(fs.readFileSync(s.file + '.json', 'utf8'));
  const analysis = analyze(parsed, s.set);
  const bm = BENCH[s.set];
  return { set: s.set, bench: s.bench || '', parsed, analysis, benchmark: bm ? { setName: bm.setName, n: bm.n } : null, cmp: bm ? compareToBenchmark(analysis.profile, bm.band) : null };
});

const CSS = fs.readFileSync('app_style.css', 'utf8');
const RENDER = fs.readFileSync('app_render.js', 'utf8');
const NAVI = fs.existsSync('navi.json') ? fs.readFileSync('navi.json', 'utf8') : '{"jonghap":[],"gyogwa":{}}';

const html = `<meta charset="utf-8">
<title>생기부 컨설팅 리포트 (프로토타입)</title>
<style>${CSS}</style>
<div class="wrap">
  <div class="topbar">
    <div class="ctrls"><select id="stu"></select></div>
    <div class="ctrls">
      <button id="anon">가명 처리</button>
      <button id="blind" title="이름·학교·대회명까지 마스킹">🔒 블라인드</button>
      <button id="dark" title="다크 모드">🌙</button>
      <button onclick="print()">인쇄</button>
    </div>
  </div>
  <div id="app"></div>
  <p class="note">⚠ 프로토타입 · 모든 수치는 생기부 실측 기반(지어낸 값 없음) · 해석/판정은 하지 않으며 근거와 함께 신호만 제시합니다.</p>
</div>
<script>
const DATA = ${JSON.stringify(DATA)};
let idx=0, anon=false;
window.NAVI=${NAVI};
${RENDER}
function initSel(){const s=$('#stu');s.innerHTML=DATA.map((d,i)=>\`<option value="\${i}">\${d.parsed.meta.name} (\${d.set})</option>\`).join('');s.onchange=e=>{idx=+e.target.value;render()}}
$('#anon').onclick=()=>{anon=!anon;$('#anon').classList.toggle('on',anon);render()};
$('#dark').onclick=()=>{const on=document.body.classList.toggle('dark');$('#dark').classList.toggle('on',on);$('#dark').textContent=on?'☀️':'🌙'};
$('#blind').onclick=()=>{blind=!blind;$('#blind').classList.toggle('on',blind);render()};
initSel();render();
</script>`;

fs.writeFileSync('report.html', html);
console.log('report.html 생성 (' + (html.length / 1024).toFixed(0) + ' KB, 학생 ' + DATA.length + '명 임베드)');
