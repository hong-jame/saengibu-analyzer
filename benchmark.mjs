/* 계열별 합격 사례 배치 → 정량 기준 밴드.
   사용: node benchmark.mjs <폴더> <계열명(진로군)>
   예:   node benchmark.mjs "benchmark/생명수의" "수의·동물"
   출력: benchmark_<계열명>.json  (+ 요약 표) */
import { extractRich } from './extract.mjs';
import { parse } from './parse.mjs';
import { profile, PROFILE_METRICS } from './analyze.mjs';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const setName = process.argv[3] || '생명·과학';
if (!dir) { console.error('사용: node benchmark.mjs <폴더> <계열명>'); process.exit(1); }

const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
if (!files.length) { console.error(`${dir} 에 PDF가 없습니다.`); process.exit(1); }

const median = a => { const b = [...a].sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : +((b[n / 2 - 1] + b[n / 2]) / 2).toFixed(2); };

const profiles = [];
for (const f of files) {
  try {
    const rich = await extractRich(path.join(dir, f));
    const parsed = parse(rich);
    const pr = profile(parsed, setName);
    pr.file = f;
    profiles.push(pr);
    console.log(`  ✓ ${f} → ${parsed.meta.name} (평균 ${pr.전과목평균등급}등급, 진로연계 ${pr.진로연계과목수}과목)`);
  } catch (e) {
    console.log(`  ✗ ${f} 파싱 실패: ${e.message}`);
  }
}

const band = {};
PROFILE_METRICS.forEach(m => {
  const vals = profiles.map(p => p[m.key]).filter(v => v != null);
  if (!vals.length) return;
  band[m.key] = { min: Math.min(...vals), max: Math.max(...vals), median: median(vals), mean: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2), n: vals.length };
});

const out = { setName, n: profiles.length, reliable: profiles.length >= 3, universities: [], band, profiles };
const safe = setName.replace(/[^\w가-힣]+/g, '_');
const outFile = `benchmark_${safe}.json`;
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

console.log(`\n═══ 기준 밴드: ${setName} (N=${profiles.length}${profiles.length < 5 ? ' ⚠ 소표본—참고치' : ''}) ═══`);
console.log('지표'.padEnd(20) + 'min'.padStart(8) + '중앙'.padStart(8) + 'max'.padStart(8) + '  방향');
PROFILE_METRICS.forEach(m => {
  const b = band[m.key]; if (!b) return;
  console.log((m.label + (m.lowDisc ? '(변별↓)' : '')).padEnd(20) + String(b.min).padStart(8) + String(b.median).padStart(8) + String(b.max).padStart(8) + '  ' + (m.dir === 'low' ? '낮을수록↑' : '높을수록↑'));
});
console.log(`\n→ ${outFile} 저장 (${profiles.length}명)`);
