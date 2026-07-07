/* 생기부II(학교생활기록부II) PDF 파서 엔진 — 브라우저/노드 공용.
   입력: rich = [{lines:[...], tokens:[{s,x,y,w,h}]}]  (pdf.js 추출기 출력)
   출력: 구조화된 학생 객체.  '표식 탐색' 방식으로 열 위치 고정 없이 견고하게.  */

const S = v => (v == null ? '' : String(v)).trim();
const isFooter = l => /^\S*(고등학교|학교)\s*\d{4}년|^\S*(고등학교|학교)\/\d{4}\.|^\s*$/.test(l)
  || /^\S*고등학교?\s*\d{4}년\s*\d{1,2}월.*번호\s*\d+\s*성명/.test(l)
  || /\d+\s*\/\s*\d+\s+반\s+\d+\s+번호\s+\d+\s+성명/.test(l)      // 페이지 꼬리말(학교명 잘린 형태)
  || /^\d{4}\.\d{2}\.\d{2}\.?\/?\s*\d{2}:\d{2}(:\d{2})?/.test(l)   // 타임스탬프 꼬리말
  || /^(교육부|대한민국|재외국민|증명서\s*발급용|사실증명|나이스|NEIS)$/.test(l.trim())  // 워터마크/발급 문구
  || /^\d{4}\s*학년도\s*(1|2)?\s*학기?$/.test(l.trim());          // 반복 페이지 헤더(학년도/학기)

/* 토큰 → 라인 복원(y 보존). xMin으로 열 필터 */
function reconLinesY(tokens, xMin = 0) {
  const ts = tokens.filter(t => t.s !== '' && t.x >= xMin).slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let cur = null;
  for (const t of ts) { if (!cur || Math.abs(cur.y - t.y) > 3) { cur = { y: t.y, toks: [t] }; lines.push(cur); } else cur.toks.push(t); }
  return lines.map(ln => {
    ln.toks.sort((a, b) => a.x - b.x);
    let s = '', pe = null;
    for (const t of ln.toks) { if (pe != null) { const g = t.x - pe; if (g > (t.h || 8) * 1.2) s += '\t'; else if (g > (t.h || 8) * 0.25) s += ' '; } s += t.s; pe = t.x + t.w; }
    return { y: ln.y, s: s.replace(/\s+$/, ''), sp: /\s$/.test(s) };  // sp: 줄이 공백으로 끝났나(낱말 경계 줄바꿈)
  });
}
/* 셀 안 줄바꿈으로 잘린 낱말 복원 조인 —
   앞줄이 공백으로 안 끝났고(=낱말 중간 잘림) 한글-한글 경계면 공백 없이 이음. 그 외엔 공백. */
const _H = /[가-힣]/;
function joinSp(prev, next, prevEndedSpace) {
  if (!prev) return next || '';
  if (!next) return prev;
  const glue = (!prevEndedSpace && _H.test(prev[prev.length - 1]) && _H.test(next[0])) ? '' : ' ';
  return prev + glue + next;
}
function smartJoin(parts) { // parts: [{s, sp}]
  let out = '', prevSp = true;
  for (const p of parts) { const seg = (p.s || '').trim(); if (!seg) continue; out = joinSp(out, seg, prevSp); prevSp = p.sp; }
  return out;
}
/* y값을 밴드(라벨 y-중앙들)로 분류 → 해당 라벨값 반환 */
function bandOf(y, labels) { // labels: [{v, y}] y내림차순
  if (!labels.length) return null;
  if (labels.length === 1) return labels[0].v;
  for (let k = 0; k < labels.length; k++) {
    const hi = k === 0 ? Infinity : (labels[k - 1].y + labels[k].y) / 2;
    const lo = k === labels.length - 1 ? -Infinity : (labels[k].y + labels[k + 1].y) / 2;
    if (y <= hi && y > lo) return labels[k].v;
  }
  return labels[labels.length - 1].v;
}

/* 페이지 경계를 아는 전체 라인 목록(푸터/빈줄 제거, page 인덱스 부착) */
function flatLines(rich) {
  const out = [];
  rich.forEach((pg, pi) => pg.lines.forEach(l => { if (!isFooter(l)) out.push({ t: l, p: pi }); }));
  return out;
}

/* ── 섹션 구간 나누기: "1." ~ "8." 및 소제목 ── */
function sectionSpan(lines, startRe, endRe) {
  const a = lines.findIndex(o => startRe.test(o.t));
  if (a < 0) return null;
  let b = lines.length;
  for (let i = a + 1; i < lines.length; i++) if (endRe.test(lines[i].t)) { b = i; break; }
  return { a, b };
}

/* ── 1. 인적·학적 + 담임/반/번호 ── */
function parseMeta(rich, lines) {
  const meta = { name: '', gender: '', years: [], history: [] };
  const p1 = rich[0].lines;
  const nameLine = p1.find(l => /성명\s*:/.test(l));
  if (nameLine) {
    const m = nameLine.match(/성명\s*:\s*(\S+)\s*성별\s*:\s*(\S+)/);
    if (m) { meta.name = m[1]; meta.gender = m[2]; }
  }
  // 학년 반 번호 담임: "1 4 17 홍길동"
  p1.forEach(l => {
    const m = l.match(/^([1-3])\s+(\d{1,2})\s+(\d{1,2})\s+([가-힣]{2,4})$/);
    if (m) meta.years.push({ grade: +m[1], class: +m[2], no: +m[3], teacher: m[4] });
  });
  p1.forEach(l => { const m = l.match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일\s+(.+(?:졸업|입학))/); if (m) meta.history.push(m[4].trim() + ` (${m[1]}.${m[2]}.${m[3]})`); });
  return meta;
}

/* ── 2. 출결 ── */
function parseAttendance(lines) {
  const sp = sectionSpan(lines, /^2\.\s*출결상황/, /^3\.\s*수상경력/);
  if (!sp) return [];
  const out = [];
  for (let i = sp.a; i < sp.b; i++) {
    const m = lines[i].t.match(/^([1-3])\s+(\d{2,3})\s+((?:[\d.]+\s+){11}[\d.]+)\s*(.*)$/);
    if (m) {
      const v = m[3].split(/\s+/).map(x => x === '.' ? 0 : +x);
      out.push({ grade: +m[1], days: +m[2], absence: v.slice(0, 3), late: v.slice(3, 6), early: v.slice(6, 9), result: v.slice(9, 12), note: S(m[4]) });
    }
  }
  return out;
}

/* ── 3. 수상경력 ── */
function parseAwards(lines) {
  const sp = sectionSpan(lines, /^3\.\s*수상경력/, /^4\.\s*자격증/);
  if (!sp) return [];
  const out = [];
  for (let i = sp.a; i < sp.b; i++) {
    const l = lines[i].t;
    // 구양식: 학년 학기 수상명 연월일 수여기관 대상
    let m = l.match(/^([1-3])\s+([12])\s+(.+?)\s+(\d{4}\.\d{2}\.\d{2}\.)\s+(.+?)\s+(\S+)$/);
    if (m) { out.push({ grade: +m[1], semester: +m[2], name: m[3].trim(), date: m[4], org: m[5].trim(), target: m[6] }); continue; }
    // 신양식(학기열 없음): 학년 수상명 연월일 수여기관 대상
    m = l.match(/^([1-3])\s+(.+?)\s+(\d{4}\.\d{2}\.\d{2}\.)\s+(.+?)\s+(\S+)$/);
    if (m) { out.push({ grade: +m[1], semester: null, name: m[2].trim(), date: m[3], org: m[4].trim(), target: m[5] }); continue; }
    // 수상명이 줄바꿈으로 쪼개진 행(이름 조각만): 날짜行에 학년 없이 시작
    m = l.match(/^(\d{4}\.\d{2}\.\d{2}\.)\s+(.+?)\s+(\S+)$/) || l.match(/^([1-3])\s+(\d{4}\.\d{2}\.\d{2}\.)\s+(.+?)\s+(\S+)$/);
    if (m) {
      // 앞뒤 줄에서 이름 조각 이어붙이기(셀 세로중앙 배치로 이름이 위아래로 갈라짐)
      const before = i > sp.a ? lines[i - 1].t : '', after = i + 1 < sp.b ? lines[i + 1].t : '';
      const nameGuess = (/^[가-힣(].{0,30}$/.test(before) && !/\d{4}\./.test(before) ? before : '') + (/^[가-힣)].{0,15}$/.test(after) && !/\d{4}\./.test(after) ? after : '');
      const g4 = m.length === 5 ? { grade: +m[1], date: m[2], org: m[3], target: m[4] } : { grade: null, date: m[1], org: m[2], target: m[3] };
      if (nameGuess) out.push({ grade: g4.grade, semester: null, name: nameGuess.replace(/\s+/g, ''), date: g4.date, org: g4.org.trim(), target: g4.target });
    }
  }
  return out;
}

/* ── 5. 창의적 체험활동 (좌표 기반) ── */
function parseCreative(rich, lines) {
  const startPage = rich.findIndex(pg => pg.lines.some(l => /^\d+\.\s*창의적\s*체험활동상황/.test(l)));
  // 창체 종료: '봉 사 활 동 실 적' 나오는 페이지/그 지점
  const areaLabel = /^(자율·자치활동|자율활동|동아리활동|진로활동)$/;
  const acts = { autonomy: [], club: [], career: [], volunteer: [], hope: {} };
  if (startPage < 0) return acts; // 창체 섹션 없음(스캔본·타 양식 등) — 빈 결과로 안전 반환
  const areaKey = { '자율·자치활동': 'autonomy', 자율활동: 'autonomy', 동아리활동: 'club', 진로활동: 'career' };
  // 신양식(고교학점제) 감지: 좌표 체계가 달라 시간 열 위치가 다름
  const isNew = rich.some(pg => pg.lines.some(l => /자율·자치활동|학교폭력\s*조치상황/.test(l)));
  const hoursX = isNew ? [140, 190] : [95, 165];

  // (1) 영역 라벨 → (year, area, hours) : 읽기순(페이지→Y내림) + 순서규칙으로 연도 산정
  const labelSeq = [];
  for (let pi = startPage; pi < rich.length; pi++) {
    const pg = rich[pi];
    if (pg.lines.some(l => /봉\s*사\s*활\s*동\s*실\s*적/.test(l)) && pi > startPage + 1) { /* 마지막 페이지도 포함해 라벨 수집 */ }
    const labs = pg.tokens.filter(t => areaLabel.test(t.s)).sort((a, b) => b.y - a.y);
    labs.forEach(t => {
      // 같은 y의 중간열 숫자 = 시간(양식별 열 위치)
      const time = pg.tokens.find(n => n.x > hoursX[0] && n.x < hoursX[1] && /^\d{1,3}$/.test(n.s) && Math.abs(n.y - t.y) < 4);
      labelSeq.push({ page: pi, area: t.s, y: t.y, hours: time ? +time.s : null });
    });
    if (pg.lines.some(l => /봉\s*사\s*활\s*동\s*실\s*적/.test(l))) break;
  }
  // 연도 산정: 진로활동 다음 자율(·자치)활동 → year++
  let year = 1, prev = null;
  const withYear = [];
  for (const L of labelSeq) {
    if (areaKey[L.area] === 'autonomy' && prev === 'career') year++;
    withYear.push({ ...L, year });
    prev = areaKey[L.area];
  }
  // (year,area)별 시간 확정(첫 등장의 hours), 빈 연도(hours=null 전부)는 제외
  const seen = new Set();
  for (const L of withYear) {
    const key = L.year + L.area;
    if (L.hours != null && !seen.has(key)) { seen.add(key); acts[areaKey[L.area]].push({ grade: L.year, hours: L.hours, text: '' }); }
  }

  // (3) 특기사항 내용: 표 괘선(hlines)으로 셀 밴드를 만들어 (연도,영역) 정확 배정
  const bandTop = (y, borders) => { for (let i = 0; i < borders.length - 1; i++) if (borders[i] > y && y >= borders[i + 1]) return borders[i]; return null; };
  const isHdr = s => /^창\s*의\s*적/.test(s) || /^영역\s*시간/.test(s) || /^학년$/.test(s) || s === '특기사항' || /^\s*$/.test(s);
  const buf = {}; const hopeByYear = {};
  const nearestCareerYear = (pi, y) => (withYear.filter(L => L.area === '진로활동' && L.page === pi).concat(withYear.filter(L => L.area === '진로활동' && L.page !== pi)).sort((a, b) => (a.page === pi ? 0 : 1e5) + Math.abs(a.y - y) - ((b.page === pi ? 0 : 1e5) + Math.abs(b.y - y)))[0]);
  for (let pi = startPage; pi < rich.length; pi++) {
    const pg = rich[pi];
    const borders = (pg.hlines || []).map(h => h.y);
    // 페이지 내 area 라벨 → 밴드(top) → {area, year}
    const map = {};
    withYear.filter(L => L.page === pi).forEach(L => { const t = bandTop(L.y, borders); if (t != null) map[t] = { area: areaKey[L.area], year: L.year }; });
    // 희망분야 캡처(전체 라인에서), 봉사 경계 y
    const rl = reconLinesY(pg.tokens);
    const bl = rl.find(r => /봉\s*사\s*활\s*동\s*실\s*적/.test(r.s));
    const bongsaY = bl ? bl.y : -1;
    rl.forEach(r => { const hm = r.s.match(/희망분야\s+(\S.*)/); if (hm) { const v = hm[1].trim().replace(/\s*분야\s*$/, ''); if (v) { const c = nearestCareerYear(pi, r.y); if (c) hopeByYear[c.year] = v; } } });
    // 특기사항 열 토큰(x 168~545), 봉사 위쪽만
    const ctoks = pg.tokens.filter(t => t.x >= 168 && t.x < 545 && t.y > bongsaY).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = []; let cur = null;
    for (const t of ctoks) { if (!cur || Math.abs(cur.y - t.y) > 3) { cur = { y: t.y, s: t.s }; rows.push(cur); } else cur.s += t.s; }
    for (const r of rows) {
      const sp = /\s$/.test(r.s);                         // trim 전 줄 끝 공백 여부
      let s = r.s.replace(/^특기사항\s*/, '').trim();
      if (isHdr(s) || /^희망분야/.test(s)) continue;
      const t = bandTop(r.y, borders);
      const info = t != null ? map[t] : null;
      if (!info) continue;
      const key = info.year + '|' + info.area;
      (buf[key] = buf[key] || []).push({ s, sp });
    }
    if (bongsaY >= 0) break;
  }
  Object.entries(buf).forEach(([k, arr]) => {
    const [yr, ak] = k.split('|');
    const list = acts[ak];
    let rec = list.find(r => r.grade === +yr);
    if (!rec) { rec = { grade: +yr, hours: null, text: '' }; list.push(rec); }
    rec.text = joinSp(rec.text, smartJoin(arr).replace(/\s+/g, ' ').trim(), true);
  });
  acts.hope = hopeByYear;
  ['autonomy', 'club', 'career'].forEach(k => acts[k].sort((a, b) => a.grade - b.grade));
  return acts;
}

/* ── 6. 교과성적 + 세특 (좌표 기반: 학기는 Y밴드로) ── */
function parseSubjects(rich) {
  const startPage = rich.findIndex(pg => pg.lines.some(l => /^\d+\.\s*교과학습발달상황/.test(l)));
  if (startPage < 0) return { scores: [], details: [] };
  const scores = [], details = [];
  // 구양식: 과목 단위수 원점수/평균(표준편차) 성취도(수강자수) [석차등급]
  const rowRe = /^(?:([가-힣·]+(?:\([^)]*\))?)\s+)?([가-힣A-ZⅠ-Ⅹ0-9·\s]+?)\s+(\d+)\s+(\d+)\/([\d.]+)\(([\d.]+)\)\s+([ABCDE])\((\d+)\)(?:\s+(\d+))?$/;
  // 신양식(고교학점제): 과목 학점 원점수/평균 성취도 석차등급(1~5) 수강자수  ※표준편차 없음, 분포비율은 별도 줄
  const rowReNew = /^(?:([가-힣·/()0-9\s]+?)\s+)?([가-힣A-Za-z0-9ⅠⅡⅢⅣⅤ·\s]+?)\s+(\d{1,2})\s+(\d{1,3})\/([\d.]+)\s+([A-E])\s+([1-5])\s+(\d{1,4})$/;
  const jinroRe = /^(?:([가-힣·]+)\s+)?([가-힣A-ZⅠ-Ⅹ0-9·\s]+?)\s+(\d+)\s+(\d+)\/([\d.]+)\s+([ABC])\((\d+)\)\s+A\(([\d.]+)\)\s+B\(([\d.]+)\)\s+C\(([\d.]+)\)$/;
  const detHeader = /^과\s*목\s*세\s*부\s*능\s*력\s*및\s*특\s*기\s*사\s*항/;
  const subjNames = new Set();
  // 세특 과목명 매칭: 단일명 or '공통국어1·공통국어2' 같은 묶음(부분이 성적 과목에 존재)
  const isKnownSubject = nm => subjNames.has(nm) || (nm.includes('·') && nm.split('·').some(p => subjNames.has(p.trim())));
  let grade = null, mode = 'score', curDet = null, done = false;

  for (let pi = startPage; pi < rich.length && !done; pi++) {
    const pg = rich[pi];
    const rows = reconLinesY(pg.tokens).filter(r => !isFooter(r.s));
    const y6 = (() => { const t = pg.tokens.find(t => /^6\./.test(t.s) && t.x < 60); return t ? t.y : Infinity; })();
    // 학기 경계 = 학기열(x0<22)까지 닿는 가로선 (학기 셀은 병합되어 내부 과목행 경계는 x44부터)
    const semBorders = (pg.hlines || []).filter(h => h.x0 < 22 && h.y < y6).map(h => h.y).sort((a, b) => b - a);
    const semDigits = pg.tokens.filter(t => t.x < 45 && /^[12]$/.test(t.s) && t.y < y6);
    const semOf = y => {
      if (semBorders.length) { // 괘선 밴드(구양식): 밴드 안 학기숫자
        let top = Infinity, bot = -Infinity;
        for (const b of semBorders) { if (b > y) top = Math.min(top, b); else bot = Math.max(bot, b); }
        const d = semDigits.find(t => t.y < top && t.y > bot);
        if (d) return +d.s;
      }
      // 괘선 없음(신양식) 또는 폴백: 최근접 학기숫자
      return bandOf(y, semDigits.map(t => ({ v: +t.s, y: t.y })).sort((a, b) => b.y - a.y));
    };

    for (const row of rows) {
      let l = row.s;
      let m;
      if (/^\d+\.\s*독서활동상황/.test(l)) { done = true; break; }
      if ((m = l.match(/^\[([1-3])학년\]/))) { grade = +m[1]; mode = 'score'; curDet = null; continue; }
      if (/해당\s*학년의\s*자료가\s*없습니다/.test(l)) continue;
      if (detHeader.test(l)) { mode = 'detail'; curDet = null; continue; }
      if (/^<진로\s*선택\s*과목>/.test(l)) { mode = 'score'; continue; }
      if (/^<(체육\s*[·ㆍ]\s*예술|교양교과)/.test(l)) { mode = 'score'; continue; }
      if (/^이수(단위|학점)\s*합계/.test(l) || /원점수\/|성취도별|능력단위|성취도별\s*분포|E비율/.test(l)) continue;
      if (/^[ABCDE]\([\d.]+\)(\s+[ABCDE]\([\d.]+\))*$/.test(l.trim())) continue; // 신양식 분포비율 단독 줄

      if (mode === 'score') {
        const sem = semOf(row.y);
        l = l.replace(/^[12][ \t]+/, ''); // 줄 앞에 붙은 학기숫자 제거(이름 오염 방지)
        if ((m = l.match(jinroRe))) {
          scores.push({ grade, semester: sem, group: S(m[1]) || null, name: S(m[2]), units: +m[3], raw: +m[4], avg: +m[5], achv: m[6], takers: +m[7], dist: { A: +m[8], B: +m[9], C: +m[10] }, type: '진로선택', rank: null });
          subjNames.add(S(m[2])); continue;
        }
        if ((m = l.match(rowRe))) {
          const g1 = S(m[1]);
          scores.push({ grade, semester: sem, group: g1 && !/^[12]$/.test(g1) ? g1 : null, name: S(m[2]), units: +m[3], raw: +m[4], avg: +m[5], sd: +m[6], achv: m[7], takers: +m[8], rank: m[9] ? +m[9] : null, type: '석차' });
          subjNames.add(S(m[2])); continue;
        }
        if ((m = l.match(rowReNew))) { // 신양식(5등급제, 표준편차 없음)
          const g1 = S(m[1]);
          scores.push({ grade, semester: sem, group: g1 && !/^[12]$/.test(g1) ? g1 : null, name: S(m[2]), units: +m[3], raw: +m[4], avg: +m[5], sd: null, achv: m[6], rank: +m[7], takers: +m[8], type: '석차', scale5: true });
          subjNames.add(S(m[2])); continue;
        }
        if ((m = l.match(/^(?:([가-힣]+)\s+)?([가-힣\s]+?)\s+(\d+)\s+([ABCDE])$/))) {
          scores.push({ grade, semester: sem, group: S(m[1]) || null, name: S(m[2]), units: +m[3], achv: m[4], type: '체육예술' });
        }
      } else {
        const dm = l.match(/^([가-힣A-ZⅠ-Ⅹ0-9·\s]{2,30}?)\s*[:：]\s*(.+)$/);
        if (dm && isKnownSubject(dm[1].trim())) { curDet = { grade, subject: dm[1].trim(), text: dm[2].trim(), _sp: row.sp }; details.push(curDet); }
        else if (curDet) { curDet.text = joinSp(curDet.text, l.trim(), curDet._sp); curDet._sp = row.sp; }
      }
    }
  }
  details.forEach(d => { d.text = d.text.replace(/\s+/g, ' ').trim(); delete d._sp; });
  return { scores, details };
}

/* ── 8. 행동특성 및 종합의견 (학년은 Y밴드) ── */
function parseBehavior(rich) {
  const startPage = rich.findIndex(pg => pg.lines.some(l => /^\d+\.\s*행동특성\s*및\s*종합의견/.test(l)));
  if (startPage < 0) return [];
  const byGrade = {};
  let curGrade = null; // 페이지 넘김 시 직전 학년 이어받기
  for (let pi = startPage; pi < rich.length; pi++) {
    const pg = rich[pi];
    // '9.'(신양식)/'8.'(구양식) 헤더가 이 페이지에 있으면 그 아래(y<헤더y)만 = 이전 섹션(독서/세특) 배제
    const hdr = reconLinesY(pg.tokens).find(r => /^\d+\.\s*행동특성/.test(r.s));
    const yMax = hdr ? hdr.y : Infinity;
    // 학년 경계 = 학년열(x0<50)까지 닿는 가로선. 밴드 내 학년숫자로 라벨, 없으면 직전 학년
    const bnds = (pg.hlines || []).filter(h => h.x0 < 55 && h.y < yMax).map(h => h.y).sort((a, b) => b - a);
    const digits = pg.tokens.filter(t => t.x < 55 && /^[1-3]$/.test(t.s) && t.y < yMax);
    const gradeAt = y => { let top = Infinity, bot = -Infinity; for (const b of bnds) { if (b > y) top = Math.min(top, b); else bot = Math.max(bot, b); } const d = digits.find(t => t.y < top && t.y > bot); return d ? +d.s : null; };
    const rows = reconLinesY(pg.tokens, 55).filter(r => !isFooter(r.s) && r.y < yMax && !/^\d+\.\s*행동특성|행\s*동\s*특\s*성\s*및|^학년$/.test(r.s));
    for (const row of rows) {
      const g = gradeAt(row.y);
      if (g != null) curGrade = g;
      if (curGrade == null) continue;
      (byGrade[curGrade] = byGrade[curGrade] || []).push({ s: row.s, sp: row.sp });
    }
  }
  return Object.keys(byGrade).map(Number).sort().map(g => ({ grade: g, text: smartJoin(byGrade[g]).replace(/\s+/g, ' ').trim() }));
}

export function parse(rich) {
  const lines = flatLines(rich);
  const meta = parseMeta(rich, lines);
  const subj = parseSubjects(rich);
  const scale = subj.scores.some(s => s.scale5) ? 5 : 9; // 석차등급 체계(5등급제 신양식 / 9등급제 구양식)
  return {
    meta,
    attendance: parseAttendance(lines),
    awards: parseAwards(lines),
    creative: parseCreative(rich, lines),
    ...subj,
    behavior: parseBehavior(rich),
    scale,
  };
}
