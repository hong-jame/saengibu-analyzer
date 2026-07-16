/* pdf.js 텍스트 추출기 — 브라우저와 동일한 로직으로 좌표(Y) 기반 줄 복원.
   사용:  node extract.mjs <pdf경로> [출력접두어]
   출력:  <접두어>.lines.json  (페이지별 줄 배열)  +  <접두어>.txt (읽기용) */
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/* 표 괘선(가로선 y) 추출 — 셀 경계 기반 파싱용. 브라우저 추출기와 동일 로직 */
const _mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
const _ap = (m, x, y) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
async function hlinesOf(page) {
  const ol = await page.getOperatorList();
  let ctm = [1,0,0,1,0,0]; const stack = []; const segs = [];
  const add = (yy, xa, xb) => segs.push({ y: yy, x0: Math.min(xa, xb), x1: Math.max(xa, xb) });
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = _mul(ctm, a);
    else if (fn === OPS.constructPath) {
      const ops = a[0], args = a[1]; let k = 0, px = 0, py = 0;
      for (const op of ops) {
        if (op === OPS.moveTo) { px = args[k++]; py = args[k++]; }
        else if (op === OPS.lineTo) { const x = args[k++], y = args[k++]; const p1 = _ap(ctm, px, py), p2 = _ap(ctm, x, y); if (Math.abs(p1[1]-p2[1]) < 1.5 && Math.abs(p1[0]-p2[0]) > 15) add(Math.round((p1[1]+p2[1])/2), p1[0], p2[0]); px = x; py = y; }
        else if (op === OPS.curveTo) k += 6;
        else if (op === OPS.rectangle) { const x = args[k++], y = args[k++], w = args[k++], h = args[k++]; const p = _ap(ctm, x, y), p2 = _ap(ctm, x+w, y+h); if (Math.abs(p[1]-p2[1]) < 2 && Math.abs(p[0]-p2[0]) > 15) add(Math.round(p[1]), p[0], p2[0]); }
      }
    }
  }
  // y 인접(≤4px) 병합 + x범위 합치기, 내림차순
  segs.sort((a, b) => b.y - a.y);
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.y - s.y <= 4) { last.x0 = Math.min(last.x0, Math.round(s.x0)); last.x1 = Math.max(last.x1, Math.round(s.x1)); }
    else out.push({ y: s.y, x0: Math.round(s.x0), x1: Math.round(s.x1) });
  }
  return out;
}

/* OCR본은 '·'(가운뎃점) 대신 '•'(글머리 불릿) 등 유사문자를 쓰는 경우가 있어, 파서 정규식이 기대하는 문자로 정규화 */
const normOcr = s => s.replace(/[•∙‧⋅]/g, '·');

/* 같은 줄로 묶을 Y 허용오차(폰트 높이 대비). 표 셀이 여러 줄이면 값 조정 */
const Y_TOL = 3;

function reconstructLines(items) {
  // items: {str, transform:[a,b,c,d,x,y], width, height}
  const toks = items
    .filter(it => it.str !== '')
    .map(it => ({ s: normOcr(it.str), x: it.transform[4], y: it.transform[5], w: it.width, h: it.height }));
  // Y로 클러스터링(위→아래). y가 클수록 위쪽이므로 내림차순
  toks.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let cur = null;
  for (const t of toks) {
    if (!cur || Math.abs(cur.y - t.y) > Y_TOL) {
      cur = { y: t.y, toks: [t] };
      lines.push(cur);
    } else {
      cur.toks.push(t);
    }
  }
  // 각 줄 내부는 X 오름차순 정렬 후 조인. 큰 X간격은 공백/탭으로 근사
  return lines.map(ln => {
    ln.toks.sort((a, b) => a.x - b.x);
    let out = '';
    let prevEnd = null;
    for (const t of ln.toks) {
      if (prevEnd != null) {
        const gap = t.x - prevEnd;
        if (gap > (t.h || 8) * 1.2) out += '\t';       // 열 구분(넓은 간격)
        else if (gap > (t.h || 8) * 0.25) out += ' ';   // 단어 간격
      }
      out += t.s;
      prevEnd = t.x + t.w;
    }
    return out.replace(/\s+$/, '');
  });
}

function tokensOf(items) {
  return items
    .filter(it => it.str !== '')
    .map(it => ({ s: normOcr(it.str), x: +it.transform[4].toFixed(1), y: +it.transform[5].toFixed(1), w: +it.width.toFixed(1), h: +it.height.toFixed(1) }));
}

/* PDF 경로 → rich 배열([{lines, tokens, hlines}]). 브라우저 추출기와 동일 로직 */
export async function extractRich(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const rich = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    rich.push({ lines: reconstructLines(tc.items), tokens: tokensOf(tc.items), hlines: await hlinesOf(page) });
  }
  return rich;
}

/* CLI: node extract.mjs <pdf> [출력접두어] — 메인 모듈로 직접 실행할 때만 */
const _isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
const pdfPath = _isMain ? process.argv[2] : null;
const outPrefix = process.argv[3] || 'out';
if (pdfPath) {
  const rich = await extractRich(pdfPath);
  const pages = rich.map(r => r.lines);
  fs.writeFileSync(outPrefix + '.lines.json', JSON.stringify(pages, null, 0));
  fs.writeFileSync(outPrefix + '.rich.json', JSON.stringify(rich, null, 0));
  const txt = pages.map((ls, i) => `===== PAGE ${i + 1} =====\n` + ls.join('\n')).join('\n\n');
  fs.writeFileSync(outPrefix + '.txt', txt);
  console.log(`페이지 ${rich.length}개 추출 완료 → ${outPrefix}.lines.json / .rich.json / .txt`);
  console.log(`줄 수 합계: ${pages.reduce((a, l) => a + l.length, 0)}`);
}
