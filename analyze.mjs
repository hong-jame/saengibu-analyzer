/* 생기부 컨설팅 분석 엔진 — 파싱 데이터 → 제시용 신호(전부 실측, 판정 없음).
   브라우저/노드 공용. 입력: parse()의 출력 객체.  */

// 과목 → 교과군
export function groupOf(s) {
  if (/^(국어|공통국어|문학|독서|화법과 작문|화법과 언어|독서와 작문|언어와 매체|주제 탐구 독서|문학과 영상|고전|실용 국어|심화 국어)/.test(s)) return '국어';
  if (/^(수학|공통수학|미적분|확률과 통계|기하|대수|경제 수학|실용 수학|인공지능 수학)/.test(s) || /^수학[ⅠⅡ]/.test(s)) return '수학';
  if (/^(영어|공통영어|기본 영어|실용 영어|영어 독해|영어 회화|영어 독해와 작문|영미 문학|진로 영어)/.test(s)) return '영어';
  if (/^한국사/.test(s)) return '한국사';
  if (/^(통합사회|세계시민|한국지리|세계지리|세계사|동아시아|사회와 문화|현대사회|경제|정치|법과 사회|정치와 법|사회[·ㆍ]문화|생활과 윤리|윤리와 사상|여행지리|사회문제|도덕)/.test(s)) return '사회';
  if (/^(통합과학|과학탐구실험|물리학|물리|화학|생명과학|지구과학|과학과제 연구|융합과학|생활과 과학|과학의 역사)/.test(s)) return '과학';
  if (/^(체육|운동과 건강|스포츠)/.test(s)) return '체육';
  if (/^(음악|미술|연극|예술)/.test(s)) return '예술';
  return '기타'; // 기술·가정, 제2외국어(일본어·중국어), 한문, 교양 등
}

const semKey = r => r.grade * 10 + (r.semester || 0);

/* ── 1) 성적 강점맵: 교과군별 등급 추이 + 상대강세(z) ── */
export function strengthMap(r) {
  const rows = r.scores.filter(s => s.type === '석차' && s.rank != null).slice().sort((a, b) => semKey(a) - semKey(b));
  const byGroup = {};
  rows.forEach(s => {
    const g = groupOf(s.name);
    (byGroup[g] = byGroup[g] || []).push({ key: semKey(s), label: `${s.grade}-${s.semester}`, name: s.name, rank: s.rank, raw: s.raw, avg: s.avg, sd: s.sd, z: s.sd ? +((s.raw - s.avg) / s.sd).toFixed(2) : null });
  });
  const semList = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];
  const groups = Object.entries(byGroup).map(([g, arr]) => {
    // 교과군의 학기별 평균 등급(한 학기에 여러 과목이면 평균)
    const semAvg = semList.map(sm => {
      const ss = arr.filter(a => a.label === sm);
      return ss.length ? { sem: sm, avg: +(ss.reduce((x, y) => x + y.rank, 0) / ss.length).toFixed(1) } : null;
    }).filter(Boolean);
    const first = semAvg[0].avg, last = semAvg[semAvg.length - 1].avg;
    const avgRank = +(arr.reduce((a, b) => a + b.rank, 0) / arr.length).toFixed(2);
    const avgZ = arr.filter(a => a.z != null).length ? +(arr.filter(a => a.z != null).reduce((a, b) => a + b.z, 0) / arr.filter(a => a.z != null).length).toFixed(2) : null;
    return { group: g, points: arr, semAvg, latest: last, first, trend: +(first - last).toFixed(1), avgRank, avgZ };
  });
  // 강세/약세: 최근 등급 기준
  groups.sort((a, b) => a.avgRank - b.avgRank);
  return groups;
}

/* ── 2) 진로 타임라인: 희망분야 진화 + 날짜 있는 활동 연대기 ── */
export function timeline(r) {
  const events = [];
  const push = (date, kind, text) => events.push({ date, kind, text });
  const scan = (kind, text) => {
    if (!text) return;
    // 문장 단위 분리(한글/닫는괄호 뒤 마침표+공백; 날짜 내부 마침표는 뒤가 숫자/)/-라 분리 안 됨)
    const sentences = text.split(/(?<=[가-힣)])\.\s+/).map(s => s.trim()).filter(Boolean);
    sentences.forEach(sen => {
      const m = sen.match(/(\d{4})\.(\d{2})\.(\d{2})/);
      if (!m) return;
      let t = sen.replace(/\s+/g, ' ').trim();
      if (!/[.…]$/.test(t)) t += '.';                     // 완결된 문장으로
      if (t.length > 160) t = t.slice(0, 158).replace(/\S*$/, '').trim() + '…';
      push(`${m[1]}.${m[2]}.${m[3]}`, kind, t);
    });
  };
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => scan({ autonomy: '자율', club: '동아리', career: '진로' }[k], a.text)));
  const uniq = {}; events.forEach(e => { const key = e.date + '|' + e.text.slice(0, 24); if (!uniq[key]) uniq[key] = e; });
  const list = Object.values(uniq).sort((a, b) => a.date.localeCompare(b.date));
  return { hope: r.creative.hope, events: list };
}

/* ── 3) 진로 키워드 히트맵 ──
   핵심어(core): 그 진로에 특이적인 단어 → 헤드라인 점수.
   연관어(related): 여러 진로·교과에 두루 쓰이는 일반어 → 맥락으로만 별도 표시. */
export const KEYWORD_SETS = {
  '생명·과학': {
    core: ['생명과학', '생명공학', '생명 공학', '바이오', '유전자', '유전', 'DNA', 'RNA', '효소', '세포', '단백질', '줄기세포', '미생물', '면역', '백신', '항원', '항체', '염색체', '광합성', '물질대사', '미토콘드리아', '발효', '핵산', '유전체', '분자생물'],
    related: ['실험', '탐구', '생물', '화학', '건강', '질병', '의학', '식품', '진화', '감염'],
  },
  '수의·동물': {
    core: ['수의사', '수의학', '수의', '반려동물', '동물병원', '축산', '가축', '해부', '예방접종', '병리', '진료', '수의예'],
    related: ['동물', '반려', '생명', '질병', '치료', '건강', '세포', '단백질', '실험', '생물', '면역'],
  },
  '의약·보건': {
    core: ['의학', '간호', '보건', '헬스케어', '의료', '임상', '약학', '병리', '진단', '처방', '수술', '항체', '백신', '항생제', '병원체', '제약'],
    related: ['질병', '치료', '건강', '면역', '바이러스', '세포', '단백질', '실험', '생명', '생물', '병원'],
  },
  '공학·컴퓨터': {
    core: ['반도체', '트랜지스터', '회로', '소자', '공정', '알고리즘', '프로그래밍', '코딩', '파이썬', '인공지능', '머신러닝', '딥러닝', '로봇', '센서', '제어', '전자', '신소재', '나노', '아두이노', '데이터', '시스템', '구조물', '역학', '설계도'],
    related: ['실험', '탐구', '물리', '수학', '기술', '컴퓨터', '프로젝트', '분석'],
  },
  '인문·사회': {
    core: ['철학', '역사', '문학', '언어학', '심리', '인권', '윤리', '정치', '법학', '문화', '담론', '사료', '비평', '서사', '사회학', '미디어', '젠더', '민주주의', '정의'],
    related: ['분석', '탐구', '토론', '글쓰기', '발표', '사회', '조사'],
  },
  '상경·경영': {
    core: ['경제', '경영', '시장', '금융', '투자', '소비', '수요', '공급', '마케팅', '기업', '회계', '무역', '창업', '주식', '환율', '물가', '재무', '경영전략'],
    related: ['분석', '그래프', '통계', '탐구', '발표', '데이터', '조사'],
  },
  '교육': {
    core: ['교육', '교수법', '아동', '청소년', '발달', '상담', '교육과정', '멘토', '수업', '학습법', '교사', '교직', '학생 지도', '특수교육'],
    related: ['탐구', '발표', '활동', '프로젝트', '심리', '토론'],
  },
  '예체능·디자인': {
    core: ['디자인', '조형', '색채', '시각', '창작', '공연', '안무', '작곡', '연주', '연출', '건축', '패션', '영상', '미학', '체육', '스포츠', '운동', '재활'],
    related: ['활동', '표현', '창의', '발표', '기획', '예술'],
  },
};
/* 맞춤 키워드용 공용 연관어(일반 학업 어휘 — 과대집계 방지 버킷) */
export const GENERIC_RELATED = ['실험', '탐구', '분석', '데이터', '조사', '발표', '프로젝트', '자료', '통계', '그래프', '설계', '토론'];
/* setName(문자=프리셋) 또는 {name,core,related}(맞춤) → 키워드셋 반환 */
export function getSet(s) {
  if (s && typeof s === 'object' && Array.isArray(s.core)) return { core: s.core, related: (s.related && s.related.length ? s.related : GENERIC_RELATED) };
  return KEYWORD_SETS[s] || KEYWORD_SETS['생명·과학'];
}
export function keywordHeatmap(r, setName) {
  const set = getSet(setName);
  const core = set.core, related = set.related;
  const scan = text => {
    if (!text) return { core: 0, coreHits: [], rel: 0, relHits: [] };
    const coreHits = [];
    core.forEach(k => { const m = text.match(new RegExp(k, 'g')); if (m) coreHits.push([k, m.length]); });
    // 핵심어 매칭 구간을 가린 뒤 연관어 집계(예: '반려동물'이 '동물'로 중복 계상되지 않도록)
    let masked = text; core.forEach(k => { masked = masked.split(k).join(' '.repeat(k.length)); });
    const relHits = [];
    related.forEach(k => { const m = masked.match(new RegExp(k, 'g')); if (m) relHits.push([k, m.length]); });
    return { core: coreHits.reduce((a, b) => a + b[1], 0), coreHits, rel: relHits.reduce((a, b) => a + b[1], 0), relHits };
  };
  const subjects = {};
  r.details.forEach(d => {
    const c = scan(d.text); const key = d.subject;
    if (!subjects[key]) subjects[key] = { subject: key, group: groupOf(key), n: 0, rel: 0, kw: {}, relkw: {} };
    subjects[key].n += c.core; subjects[key].rel += c.rel;
    c.coreHits.forEach(([k, cnt]) => subjects[key].kw[k] = (subjects[key].kw[k] || 0) + cnt);
    c.relHits.forEach(([k, cnt]) => subjects[key].relkw[k] = (subjects[key].relkw[k] || 0) + cnt);
  });
  Object.values(subjects).forEach(s => {
    s.evidence = Object.entries(s.kw).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
    s.relEvidence = Object.entries(s.relkw).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
  });
  const subjRows = Object.values(subjects).sort((a, b) => b.n - a.n || b.rel - a.rel);
  const areas = ['autonomy', 'club', 'career'].map(k => ({ area: { autonomy: '자율활동', club: '동아리활동', career: '진로활동' }[k], byYear: r.creative[k].map(a => { const c = scan(a.text); return { grade: a.grade, n: c.core, rel: c.rel }; }) }));
  const total = subjRows.reduce((a, b) => a + b.n, 0) + areas.reduce((a, ar) => a + ar.byYear.reduce((x, y) => x + y.n, 0), 0);
  return { setName, core, related, subjects: subjRows, areas, total, linkedSubjects: subjRows.filter(s => s.n > 0).length };
}

/* ── 4) 공백·검토 체크(교사뷰): 근거와 함께 신호만 ── */
export function gapChecklist(r, setName) {
  const set = getSet(setName);
  const has = t => set.core.some(k => (t || '').includes(k));
  const out = [];
  // 진로 연계 수상
  const linkedAward = r.awards.filter(a => has(a.name));
  out.push({ item: '진로 연계 수상', signal: linkedAward.length ? `${linkedAward.length}건` : '없음', detail: r.awards.length ? `보유 수상: ${r.awards.map(a => a.name).join(', ')}` : '수상 없음' });
  // 진로 키워드 0인 교과 세특
  const hm = keywordHeatmap(r, setName);
  const zero = hm.subjects.filter(s => s.n === 0 && !['체육', '예술'].includes(s.group)).map(s => s.subject);
  out.push({ item: '진로 키워드 없는 교과 세특', signal: `${zero.length}과목`, detail: zero.join(', ') || '없음' });
  // 3학년 자료
  const has3 = r.scores.some(s => s.grade === 3) || (r.creative.career || []).some(a => a.grade === 3 && a.text);
  out.push({ item: '3학년 자료', signal: has3 ? '있음' : '미기재', detail: has3 ? '' : '출력 시점 기준 3학년 항목 비어있음' });
  return out;
}

/* ── 강점(긍정 평가 요소) 추출 ──
   STRONG=분명한 우수성 표현, WEAK=태도/역량 표현. 강한 것 1+ 또는 (강+약)2+ 문장을 강점으로. */
export const STRONG_MARKERS = ['돋보', '뛰어', '인상적', '우수', '탁월', '모범', '주도적', '주도하', '리더십', '두각', '열정', '발휘', '통찰', '창의', '심화', '깊이 있', '완성도', '탐구력', '적극적으로 참여', '독창'];
export const WEAK_MARKERS = ['적극', '성실', '능동', '자발', '논리적', '체계적', '꼼꼼', '책임', '근면', '끈기', '기여', '함양', '확장', '집중', '완성', '설계', '분석', '주도', '협업', '노력'];
/* ── 부정어 보정 ── '적극적으로 참여하지 못함'처럼 긍정 표현어 뒤에 부정이 붙으면 오판정하지 않도록.
   뒤 12자 이내 부정 서술(못하/않/없/부족 등) 또는 바로 앞 부정 접두어(무·비·불·미)면 이 발생은 제외. */
const NEG_AFTER = /^.{0,12}?(못하|못했|못함|못한|않|없|아니|어려|부족|미흡|힘들|서툴|저조|실패|포기)/;
const NEG_BEFORE = /(무|비|불|미)$/;
function isNegated(text, idx, len) {
  if (NEG_AFTER.test(text.slice(idx + len, idx + len + 12))) return true;
  if (NEG_BEFORE.test(text.slice(Math.max(0, idx - 2), idx))) return true;
  return false;
}
/* term이 text 안에서 '부정되지 않은 채' 등장하는지(1회 이상) */
function hasPositiveHit(text, term) {
  let from = 0, idx;
  while ((idx = text.indexOf(term, from)) !== -1) { if (!isNegated(text, idx, term.length)) return true; from = idx + term.length; }
  return false;
}
function shorten(s, n = 74) {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > n) s = s.slice(0, n - 1).replace(/\S*$/, '').trim() + '…';
  else if (!/[.…]$/.test(s)) s += '.';
  return s;
}
/* 문장 → '정독 포인트'로 압축: 절 단위로 쪼개 강점어가 든 가장 짧은 핵심 절만 남김(요약감). */
export function gist(sen, n = 42) {
  const clauses = sen.split(/[,，·;]|(?<=[며고여])\s/).map(c => c.trim()).filter(c => c.length > 4);
  let best = null, bs = -1;
  clauses.forEach(c => {
    const sc = STRONG_MARKERS.filter(m => hasPositiveHit(c, m)).length * 2 + WEAK_MARKERS.filter(m => hasPositiveHit(c, m)).length;
    if (sc > bs || (sc === bs && best && c.length < best.length)) { bs = sc; best = c; }
  });
  let t = (best || sen).replace(/\s+/g, ' ').trim();
  if (t.length > n) t = t.slice(0, n - 1).replace(/\S*$/, '').trim() + '…';
  else t = t.replace(/[.…]+$/, '');
  return t;
}
export function extractPositive(text) {
  if (!text) return [];
  const sents = text.split(/(?<=[가-힣)])\.\s+/).map(s => s.trim()).filter(s => s.length > 10);
  const out = [];
  sents.forEach(sen => {
    const strong = [...new Set(STRONG_MARKERS.filter(m => hasPositiveHit(sen, m)))];
    const weak = [...new Set(WEAK_MARKERS.filter(m => hasPositiveHit(sen, m)))];
    const score = strong.length * 2 + weak.length;
    if (strong.length >= 1 || (strong.length + weak.length) >= 2) {
      const tags = strong.map(t => t.replace(/(적으로 참여|하$|있$)/, '')).concat(weak).slice(0, 3);
      out.push({ text: shorten(sen), gist: gist(sen), tags: [...new Set(tags)].slice(0, 3), score });
    }
  });
  return out.sort((a, b) => b.score - a.score);
}

/* ── 창체 강점 하이라이트: 학년 → 영역별 긍정 요소 ── */
export function creativeHighlights(r) {
  const areaName = { autonomy: '자율', club: '동아리', career: '진로' };
  const byGrade = {};
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => {
    if (!a.text) return;
    const hi = extractPositive(a.text).slice(0, 3);
    if (!hi.length) return;
    (byGrade[a.grade] = byGrade[a.grade] || []).push({ area: areaName[k], items: hi });
  }));
  return Object.keys(byGrade).map(Number).sort().map(g => ({ grade: g, areas: byGrade[g] }));
}

/* ── 학기별 전체 평균 석차등급 추이 ── */
export function semesterTrend(r) {
  return ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'].map(sm => {
    const rows = r.scores.filter(s => s.type === '석차' && s.rank != null && `${s.grade}-${s.semester}` === sm);
    return { sem: sm, avgRank: rows.length ? +(rows.reduce((a, b) => a + b.rank, 0) / rows.length).toFixed(2) : null, n: rows.length };
  }).filter(x => x.avgRank != null);
}

/* ── 세특 강점 하이라이트: 과목별 긍정 요소만(없으면 제외, 좋으면 많이) ── */
export function setukHighlights(r, setName) {
  const core = getSet(setName).core;
  const hit = t => core.reduce((a, k) => a + ((t || '').match(new RegExp(k, 'g')) || []).length, 0);
  const byGrade = {};
  r.details.forEach(d => {
    const hi = extractPositive(d.text);
    if (!hi.length) return; // 긍정 요소 없으면 담지 않음
    // 과목의 '평가 관점' 태그 요약(빈도순) — 교사가 정독 시 볼 포인트
    const tally = {}; hi.forEach(it => it.tags.forEach(t => tally[t] = (tally[t] || 0) + 1));
    const tags = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
    (byGrade[d.grade] = byGrade[d.grade] || []).push({ subject: d.subject, group: groupOf(d.subject), core: hit(d.text), tags, points: hi.length, items: hi.slice(0, 4) });
  });
  return Object.keys(byGrade).map(Number).sort().map(g => ({ grade: g, subjects: byGrade[g].sort((a, b) => (b.core - a.core) || (b.items.length - a.items.length)) }));
}

/* ── 벤치마크용 정량 프로필(실측 지표) ── */
export function profile(r, setName) {
  const sc = r.scores.filter(s => s.type === '석차' && s.rank != null);
  const mean = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
  const core5 = sc.filter(s => ['국어', '수학', '영어', '사회', '과학'].includes(groupOf(s.name)));
  const lastSem = sc.length ? Math.max(...sc.map(s => s.grade * 10 + s.semester)) : 0;
  const hm = keywordHeatmap(r, setName);
  const cHi = creativeHighlights(r).reduce((a, g) => a + g.areas.reduce((x, ar) => x + ar.items.length, 0), 0);
  const sk = setukHighlights(r, setName);
  const hours = ['autonomy', 'club', 'career'].reduce((a, k) => a + r.creative[k].reduce((x, y) => x + (y.hours || 0), 0), 0);
  const comp = competencySignals(r);
  const commTotal = (comp.find(c => c.key === '공동체역량') || { total: 0 }).total;
  return {
    name: r.meta.name, set: setName,
    전과목평균등급: mean(sc.map(s => s.rank)),
    국영수사과평균: mean(core5.map(s => s.rank)),
    최종학기평균: mean(sc.filter(s => s.grade * 10 + s.semester === lastSem).map(s => s.rank)),
    성취도A수: r.scores.filter(s => s.type === '석차' && s.achv === 'A').length,
    진로핵심어총: hm.total,
    진로연계과목수: hm.linkedSubjects,
    창체강점요소수: cHi,
    창체총시간: hours,
    세특강점과목수: sk.reduce((a, g) => a + g.subjects.length, 0),
    세특강점총수: sk.reduce((a, g) => a + g.subjects.reduce((x, s) => x + s.items.length, 0), 0),
    공동체신호수: commTotal,
    봉사총시간: (r.volunteer && r.volunteer.totalHours != null) ? r.volunteer.totalHours : null,
  };
}

/* ── 제미나이 코어 기반 '심화 탐구 신호' 사전 (명문대/메디컬 학종 합격 패턴) ──
   전부 '등장 여부(실측)'만 탐지 — 탐구의 질/엄밀성 판정은 하지 않음. 교사용 진단으로만. */
export const ADVANCED_SIGNALS = {
  // '변별력 있는' 표식만(교과 기본어휘 제외). 등장 여부만 탐지 — 질 판정 없음.
  수리모델링: { emoji: '📐', kws: ['미분방정식', '모델링', '시뮬레이션', '알고리즘', '수리 모델', '수리적으로', '수식을 유도', '함수식을 세우', '함수식을 도출', '최적화', '수학적으로 재구성'] },
  도구활용: { emoji: '💻', kws: ['파이썬', 'python', '아두이노', 'arduino', '라즈베리파이', '코랩', 'colab', '알파폴드', 'alphafold', 'matlab', '머신러닝', '딥러닝', '코딩', '프로그래밍', '마이크로컨트롤러', '직접 제작한 장치', 'CNN', 'LSTM', '데이터 수집 프로그램'] },
  정량검증: { emoji: '📊', kws: ['정량적으로', '정량 분석', '오차를 보정', '상관관계', '통계적으로 유의', '유의미한 차이', '정규분포곡선', '회귀분석'] },
  고급개념: { emoji: '🧪', kws: ['룽게-쿠타', '미카엘리스-멘텐', '포아송', '푸리에', '웨이블릿', 'DPPH', 'PCR', '감마 함수', '로트카-볼테라', '폰 미제스', '테일러 급수', '프랙탈', '킬레이션', '전기영동', '단일 염기'] },
  회복탄력성: { emoji: '💪', kws: ['직접 제작', '단독으로', '재실험', '변인을 통제', '변인 통제', '실패 원인', '오차를 줄이', '직접 설계', '스스로 돌파', '아침 일찍 등교'] },
  리더십: { emoji: '🤝', kws: ['회장', '부회장', '기장', '반장', '자치회', '조율', '단합', '주도적으로 이끌', '리더십을 발휘'] },
  윤리소명: { emoji: '⚖️', kws: ['불평등', '의료 자원', '보건 의료', '의료 접근성', '생명윤리', '알 권리', '취약계층', '소외', '형평', '의료 취약'] },
};
const _esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function advancedSignals(r) {
  const perCat = {}, whereCat = {};
  const scan = (where, text) => {
    if (!text) return;
    for (const [cat, { kws }] of Object.entries(ADVANCED_SIGNALS)) {
      kws.forEach(k => {
        const n = (text.match(new RegExp(_esc(k), 'gi')) || []).length;
        if (n) { (perCat[cat] = perCat[cat] || {})[k] = (perCat[cat][k] || 0) + n; (whereCat[cat] = whereCat[cat] || new Set()).add(where); }
      });
    }
  };
  r.details.forEach(d => scan(d.subject, d.text));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => scan({ autonomy: '자율', club: '동아리', career: '진로' }[k], a.text)));
  // 종단탐구: 한 세특에 [개념/의문]+[모델링/데이터]+[솔루션/제언] 공존
  const G1 = ['의문', '궁금', '원리', '개념', '관심', '배우', '학습', '접하', '이해하'];
  const G3 = ['제언', '제안', '해결', '적용', '개발', '방안', '설계', '고안', '구현', '제작', '도출'];
  const G2 = [...ADVANCED_SIGNALS.수리모델링.kws, ...ADVANCED_SIGNALS.도구활용.kws, ...ADVANCED_SIGNALS.정량검증.kws];
  const any = (t, arr) => arr.some(k => t.includes(k));
  const jongdan = r.details.filter(d => d.text && any(d.text, G1) && any(d.text, G2) && any(d.text, G3)).map(d => d.subject);
  // 고마진 과목: 원점수 − 과목평균 ≥ 20
  const highMargin = r.scores.filter(s => s.type === '석차' && s.raw != null && s.avg != null && (s.raw - s.avg) >= 20)
    .map(s => ({ name: s.name, margin: +(s.raw - s.avg).toFixed(1), rank: s.rank })).sort((a, b) => b.margin - a.margin);
  const categories = {};
  Object.entries(ADVANCED_SIGNALS).forEach(([cat, { emoji }]) => {
    const kw = perCat[cat] || {};
    const evidence = Object.entries(kw).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
    categories[cat] = { emoji, n: evidence.reduce((a, b) => a + b.n, 0), where: [...(whereCat[cat] || [])], evidence };
  });
  return { categories, jongdan: [...new Set(jongdan)], highMargin };
}

/* ── 입학사정관 공통 평가요소(3대 역량) 신호 ──
   5개 대학(건국·경희·연세·중앙·한국외대) 공통 평가요소 프레임: 학업역량·진로역량·공동체역량.
   세특+창체+행동특성 원문에서 각 역량 하위지표의 '표현 등장'을 근거 문장과 함께 수집.
   전부 실측(등장 여부/빈도)만 — 역량의 수준·우열 판정은 하지 않음. */
export const COMPETENCY = {
  학업역량: {
    emoji: '📖', desc: '학업성취도·태도·탐구력 — 배우려는 자세와 지적 호기심',
    subs: [
      { key: '지적호기심', emoji: '🔍', kws: ['호기심', '궁금', '의문을', '의문이', '의문을 품', '왜 그런', '흥미를 느끼', '흥미를 갖', '흥미를 가지', '관심을 갖', '관심을 가지', '관심을 두', '질문을 던지', '의구심', '문제의식', '더 알고 싶', '알아보고자', '탐구하고자'] },
      { key: '자기주도', emoji: '🧭', kws: ['스스로', '자기주도', '자발적', '능동적', '직접 찾아', '직접 조사', '직접 자료를', '주도적으로 학습', '자기 주도', '먼저 나서', '자율적으로', '자기 스스로'] },
      { key: '탐구·심화', emoji: '📈', kws: ['더 나아가', '나아가', '심화', '확장하여', '확장시켜', '후속 탐구', '추가로', '추가 탐구', '연계하여 탐구', '발전시켜', '파고들', '깊이 있게 탐구', '꼬리를 무는', '한 걸음 더', '심층적으로'] },
      { key: '성찰·회고', emoji: '🪞', kws: ['성찰', '깨닫', '돌아보', '반성', '재구성하며', '부족함을 느', '한계를 깨닫', '배운 점을', '느낀 점을', '보완점을 찾', '개선점을 찾', '스스로를 점검', '되돌아보'] },
    ],
  },
  진로역량: {
    emoji: '🎯', desc: '전공 관련 노력과 진로 탐색의 구체성·연계성',
    subs: [
      { key: '진로 구체화', emoji: '🧩', kws: ['진로', '장래', '희망 분야', '희망하는', '목표로 하', '되고자', '전공하고자', '계열에 관심', '꿈을', '진학하고자', '진로를 구체화'] },
      { key: '연계·확장', emoji: '🔗', kws: ['연계하여', '연결하여', '연결지어', '접목', '융합', '적용하여', '응용하여', '실생활에 적용', '진로와 연결'] },
      { key: '실천·산출', emoji: '🛠️', kws: ['보고서를 작성', '보고서로', '제작하', '설계하', '캠페인', '프로젝트를', '산출물', '포트폴리오', '직접 만들', '직접 제작', '기획하여', '결과물을'] },
    ],
  },
  공동체역량: {
    emoji: '🤝', desc: '협업·소통, 나눔·배려, 성실·책임, 리더십',
    subs: [
      { key: '협업·소통', emoji: '💬', kws: ['협력', '협업', '모둠', '조원', '팀원', '토론', '소통', '경청', '의견을 나누', '의견을 조율', '의견을 수렴', '함께', '공동으로', '역할을 분담', '갈등을 조정'] },
      { key: '나눔·배려', emoji: '💛', kws: ['배려', '나눔', '도움을 주', '도와주', '챙기', '멘토', '또래', '가르쳐 주', '설명해 주', '봉사', '헌신', '양보', '어려운 친구', '함께 나누'] },
      { key: '성실·책임', emoji: '🧱', kws: ['성실', '책임감', '맡은 바', '맡은 역할', '끝까지', '꾸준히', '묵묵히', '빠짐없이', '약속을 지키', '솔선수범', '근면', '성실히', '책임을 다', '역할에 충실'] },
      { key: '리더십', emoji: '⭐', kws: ['반장', '회장', '부회장', '부장', '팀장', '조장', '학급 임원', '학생회', '이끌', '주도하여', '주도적으로 이끌', '총괄', '기획하여 진행', '추진하여', '리더', '단합을 이끌'] },
    ],
  },
};
export function competencySignals(r) {
  const an = { autonomy: '자율', club: '동아리', career: '진로' };
  const srcs = [];
  r.details.forEach(d => d.text && srcs.push({ src: d.subject, grade: d.grade, text: d.text }));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => a.text && srcs.push({ src: an[k], grade: a.grade, text: a.text })));
  (r.behavior || []).forEach(b => b.text && srcs.push({ src: '행동특성', grade: b.grade, text: b.text }));
  // 문장 분해(소스 라벨·학년 유지)
  const sents = [];
  srcs.forEach(s => s.text.split(/(?<=[가-힣)])\.\s+/).forEach(t => { t = t.trim(); if (t.length > 8) sents.push({ src: s.src, grade: s.grade, t }); }));
  return Object.entries(COMPETENCY).map(([key, def]) => {
    const subs = def.subs.map(sub => {
      const seen = new Set(); const ev = []; let n = 0;
      sents.forEach(se => {
        const hits = sub.kws.filter(k => hasPositiveHit(se.t, k));
        if (!hits.length) return;
        n += hits.length;
        const sig = se.src + '|' + se.t.slice(0, 18);
        if (!seen.has(sig)) { seen.add(sig); ev.push({ src: se.src, grade: se.grade, text: shorten(se.t), hit: hits[0], key: sub.key }); }
      });
      return { key: sub.key, emoji: sub.emoji, n, docs: ev.length, evidence: ev.sort((a, b) => a.grade - b.grade).slice(0, 3) };
    });
    // 역량 대표 근거: 활성 하위지표에서 골고루 최대 3개(같은 문장이 여러 지표의 대표가 되어도 1회만)
    const top = []; const used = new Set();
    subs.filter(s => s.n).forEach(s => { const e = s.evidence[0]; if (e && !used.has(e.text)) { top.push(e); used.add(e.text); } });
    subs.filter(s => s.n).forEach(s => s.evidence.slice(1).forEach(e => { if (top.length < 3 && !used.has(e.text)) { top.push(e); used.add(e.text); } }));
    return { key, label: key, emoji: def.emoji, desc: def.desc, subs, total: subs.reduce((a, b) => a + b.n, 0), active: subs.filter(s => s.n > 0).length, top: top.slice(0, 3) };
  });
}

/* ── 진로 일관성·연계(career thread) ──
   입학사정관이 높게 보는 '한 주제가 3년간 교과·활동·행특으로 이어지는 연계성'.
   진로 핵심어별로 등장한 소스(세특/창체/수상/행특)를 모아, 여러 곳·여러 학년에 걸친 것을 상위로. */
export function careerThread(r, setName) {
  const core = getSet(setName).core;
  const an = { autonomy: '자율활동', club: '동아리', career: '진로활동' };
  const buckets = [];
  r.details.forEach(d => d.text && buckets.push({ type: '세특', label: d.subject, grade: d.grade, text: d.text }));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => a.text && buckets.push({ type: '창체', label: an[k], grade: a.grade, text: a.text })));
  (r.awards || []).forEach(a => buckets.push({ type: '수상', label: a.name, grade: a.grade, text: a.name }));
  (r.behavior || []).forEach(b => b.text && buckets.push({ type: '행특', label: '행동특성', grade: b.grade, text: b.text }));
  const ranked = core.map(k => {
    const hits = buckets.map(b => ({ b, n: (b.text.match(new RegExp(_esc(k), 'g')) || []).length })).filter(x => x.n > 0);
    if (!hits.length) return null;
    const subjGroups = [...new Set(hits.filter(x => x.b.type === '세특').map(x => groupOf(x.b.label)))];
    const sectTypes = [...new Set(hits.map(x => x.b.type))];
    return {
      keyword: k, docs: hits.length, total: hits.reduce((a, x) => a + x.n, 0),
      grades: [...new Set(hits.map(x => x.b.grade).filter(g => g != null))].sort(),
      groups: subjGroups, sectTypes,           // 교과 융합(교과군 수)·구분 융합(세특/창체/수상/행특)
      fusion: subjGroups.length >= 2 || sectTypes.length >= 3,
      sources: hits.map(x => ({ type: x.b.type, label: x.b.label, grade: x.b.grade, n: x.n })).sort((a, b) => (a.grade || 0) - (b.grade || 0)),
    };
  }).filter(Boolean).sort((a, b) => b.docs - a.docs || b.total - a.total);
  return { keywords: ranked.slice(0, 3), spanYears: ranked.length ? ranked[0].grades.length : 0 };
}

/* ── 주도성 행위 동사(Action Verb) 추출 ──
   사정관이 '주도성'의 근거로 읽는 능동 동사의 등장을 세특·창체에서 수집. 실측 빈도만. */
export const ACTION_VERBS = [
  { v: '질문·문제제기', kws: ['질문을 던지', '질문하', '의문을 제기', '문제를 제기', '문제의식', '왜 그런지 물', '의문을 품'] },
  { v: '기획·설계', kws: ['기획하', '설계하', '계획을 세우', '고안하', '구상하', '직접 설계', '직접 기획'] },
  { v: '분석·비교', kws: ['분석하', '비교하', '분류하', '해석하', '규명하', '체계적으로 정리'] },
  { v: '비판·평가', kws: ['비판적', '반박하', '한계를 지적', '문제점을 지적', '타당성을 검토', '오류를 발견', '비판하'] },
  { v: '대안·제언', kws: ['대안을 제시', '방안을 제안', '해결책을 제시', '개선안', '제언하', '새로운 방법을', '해결 방안을'] },
  { v: '적용·실행', kws: ['적용하', '구현하', '실험하', '제작하', '실천하', '직접 만들', '수행하', '직접 제작'] },
  { v: '탐구·조사', kws: ['탐구하', '조사하', '자료를 찾', '연구하', '파고들', '깊이 있게 살펴', '심층 조사'] },
];
export function actionVerbs(r) {
  const an = { autonomy: '자율', club: '동아리', career: '진로' };
  const srcs = [];
  r.details.forEach(d => d.text && srcs.push({ src: d.subject, grade: d.grade, text: d.text }));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => a.text && srcs.push({ src: an[k], grade: a.grade, text: a.text })));
  const sents = [];
  srcs.forEach(s => s.text.split(/(?<=[가-힣)])\.\s+/).forEach(t => { t = t.trim(); if (t.length > 8) sents.push({ src: s.src, grade: s.grade, t }); }));
  const cats = ACTION_VERBS.map(av => {
    let n = 0; const seen = new Set(); const ex = [];
    sents.forEach(se => {
      const hit = av.kws.find(k => hasPositiveHit(se.t, k)); if (!hit) return;
      n++; const sig = se.src + '|' + se.t.slice(0, 16);
      if (!seen.has(sig)) { seen.add(sig); ex.push({ src: se.src, grade: se.grade, text: shorten(se.t), hit }); }
    });
    return { v: av.v, n, docs: ex.length, examples: ex.sort((a, b) => a.grade - b.grade).slice(0, 2) };
  });
  return { total: cats.reduce((a, b) => a + b.n, 0), cats: cats.sort((a, b) => b.n - a.n) };
}

/* ── 탐구 서사(동기·과정·극복·산출·외부자료) 분석 ──
   '결과 위주'인지 '동기·과정이 드러나는지'를 세특별로 분해. Key Highlights / Weak Spots의 근거. */
export const INQUIRY = {
  motive: ['궁금', '의문', '관심을 갖', '관심을 가지', '관심이 생', '계기로', '알아보고자', '흥미를 느', '흥미를 갖', '호기심', '필요성을 느', '문제의식', '왜 그런', '주목하여', '주목함', '주목한'],
  process: ['조사하', '자료를 찾', '실험', '분석하', '탐구하', '비교하', '직접', '시행착오', '한계', '어려움', '오차', '반복', '수정', '보완', '검증', '파고들'],
  output: ['보고서', '발표', '제작', '결론', '제언', '제안', '해결', '도출', '작성', '설계', '산출물', '완성', '구현'],
  overcome: ['극복', '해결하기 위해', '스스로', '재실험', '원인을 찾', '대안을', '끝까지', '보완하여'],
  external: ['논문', '서적', '책을', '도서', '다큐', '기사를', '문헌', '저널', '전공서', '원문', '칼럼', '단행본'],
};
export function inquiryNarrative(r, setName) {
  const core = getSet(setName).core;
  const hasAny = (t, arr) => arr.some(k => t.includes(k));
  const CORE5 = ['국어', '수학', '영어', '사회', '과학'];
  const items = r.details.filter(d => d.text).map(d => {
    const t = d.text;
    const motive = hasAny(t, INQUIRY.motive), process = hasAny(t, INQUIRY.process), output = hasAny(t, INQUIRY.output), overcome = hasAny(t, INQUIRY.overcome), external = hasAny(t, INQUIRY.external);
    const coreN = core.reduce((a, k) => a + ((t.match(new RegExp(_esc(k), 'g')) || []).length), 0);
    const depth = [motive, process, output, overcome, external].filter(Boolean).length;
    let cls;
    // rich: 과정+산출을 갖추고, 동기/외부자료/풍부한 진로키워드로 서사가 두터운 세특
    if ((depth >= 3 && process && (output || overcome)) || (coreN >= 3 && process && output)) cls = 'rich';
    // shallow: 과정·동기가 없이 활동명·결과만 있거나 서사 요소가 거의 없는 세특
    else if ((!process && !motive) || (depth <= 1 && !overcome)) cls = 'shallow';
    else if ((motive || external) && process) cls = 'good';
    else cls = 'mid';
    return { subject: d.subject, group: groupOf(d.subject), grade: d.grade, motive, process, output, overcome, external, coreN, depth, cls, text: shorten(t, 92) };
  });
  return {
    rich: items.filter(i => i.cls === 'rich').sort((a, b) => b.depth - a.depth || b.coreN - a.coreN),
    shallow: items.filter(i => i.cls === 'shallow' && (i.coreN > 0 || CORE5.includes(i.group))).sort((a, b) => b.coreN - a.coreN),
    external: items.filter(i => i.external),
    all: items,
  };
}

/* ── 자동 키워드 추천 ── 생기부 전체에서 빈도 높은 '유의미한' 어휘 Top N (불용어·평가어·기능어 제거).
   형태소 분석기 없이 어절→조사/어미 제거 근사. 사용자가 진로 키워드를 정할 때 출발점으로. */
export const STOPWORDS = new Set(['그리고', '하지만', '또한', '통해', '대한', '위해', '때문', '경우', '바탕', '모습', '태도', '자세', '능력', '역량', '과정', '결과', '내용', '활동', '수업', '시간', '학습', '학생', '교과', '과목', '친구', '선생', '자신', '생각', '문제', '방법', '사용', '다양', '관련', '중요', '함양', '참여', '발표', '이해', '확인', '진행', '실시', '작성', '제출', '노력', '열정', '성실', '우수', '인상', '적극', '부분', '정도', '수준', '전체', '다음', '이후', '당시', '최근', '스스로', '직접', '매우', '가장', '특히', '통합', '기본', '실제', '조사', '분석', '비교', '발견', '설명', '제작', '설계', '구현', '토론', '협력', '모둠', '조원', '발전', '향상', '성장', '목표', '희망', '미래', '자료', '그래프', '통계', '실험', '보고서', '프로젝트', '캠페인', '성적', '등급', '평가', '수행', '기록', '교사', '담임', '반장', '역할', '수행평가', '선정', '선택', '표현', '작품', '주제', '활용', '제시', '구성', '이를', '있는', '있음', '있게', '통한', '위한', '대해', '보임', '가짐', '느낌', '생활', '전반', '학년', '학기', '전공', '계열', '진로', '탐구', '관심', '분야', '개념', '이용', '정리', '사고', '인간', '돋보임', '보여줌', '읽고', '살펴봄', '나타냄', '가능', '이해함', '드러남', '기울임', '접근', '내용을', '모습을', '역량을', '태도를', '사례', '방식', '사람', '우리', '함께', '가지', '모든', '주어진', '준비', '파악', '인식', '내용', '방안', '주장']);
export function autoKeywords(r) {
  const bag = {}; const srcOf = {};
  const feed = (src, text) => {
    if (!text) return;
    const words = text.replace(/[^가-힣]+/g, ' ').split(/\s+/).filter(Boolean);
    for (let w of words) {
      w = w.replace(/(으로서|으로써|에서의|에서|에게서|에게|께서|이라는|라는|이라고|라고|으로|로서|로써|와의|과의|만의|들의|들을|들이|들과|처럼|보다|까지|부터|마다|조차|이나|이란|이든|이라|와|과|을|를|이|가|은|는|의|에|도|만|로|랑|이고|하는|하여|하고|한다|했다|하며|한|할|해|함|됨|되어|되는|된|한테)$/, '');
      w = w.replace(/(하였음|하였다|하며|해봄|해봄|였음|으며|으로|음|임|고)$/, '');
      if (w.length < 2 || w.length > 6) continue;
      if (STOPWORDS.has(w)) continue;
      if (STRONG_MARKERS.includes(w) || WEAK_MARKERS.includes(w)) continue;
      bag[w] = (bag[w] || 0) + 1; (srcOf[w] = srcOf[w] || new Set()).add(src);
    }
  };
  const an = { autonomy: '자율', club: '동아리', career: '진로' };
  r.details.forEach(d => feed(d.subject, d.text));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => feed(an[k], a.text)));
  (r.behavior || []).forEach(b => feed('행특', b.text));
  (r.awards || []).forEach(a => feed('수상', a.name));
  return Object.entries(bag)
    .map(([word, n]) => ({ word, n, srcs: srcOf[word].size }))
    .filter(x => x.n >= 3 || x.srcs >= 2)              // '유의미' = 3회 이상 또는 2개 이상 소스
    .sort((a, b) => b.srcs - a.srcs || b.n - a.n)
    .slice(0, 12);
}

/* ── 전공 지식 키워드(히트맵용) ──
   선택 진로군의 전공 특이적 핵심어(core)만, 생기부 전반에서의 등장 빈도로.
   긴 핵심어부터 마스킹해 '유전자' 안의 '유전' 이중집계 방지(단독 시각화용 정제). */
export function majorKeywords(r, setName) {
  const core = getSet(setName).core;
  const texts = [];
  r.details.forEach(d => d.text && texts.push(d.text));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => a.text && texts.push(a.text)));
  (r.behavior || []).forEach(b => b.text && texts.push(b.text));
  (r.awards || []).forEach(a => a.name && texts.push(a.name));
  let masked = texts.join(' \n ');
  const bag = {};
  [...core].sort((a, b) => b.length - a.length).forEach(k => {
    const m = masked.match(new RegExp(_esc(k), 'g'));
    if (m) { bag[k] = m.length; masked = masked.split(k).join(' '.repeat(k.length)); }
  });
  return Object.entries(bag).map(([word, n]) => ({ word, n })).sort((a, b) => b.n - a.n).slice(0, 12);
}

/* ── 역량 표현 키워드(히트맵용) ──
   COMPETENCY의 하위 표현어를 문장 단위(부정어 보정)로 집계, 어느 역량군(학업/진로/공동체)인지 cat로 표시. */
export function competencyKeywords(r) {
  const an = { autonomy: '자율', club: '동아리', career: '진로' };
  const texts = [];
  r.details.forEach(d => d.text && texts.push(d.text));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => a.text && texts.push(a.text)));
  (r.behavior || []).forEach(b => b.text && texts.push(b.text));
  const sents = [];
  texts.forEach(t => t.split(/(?<=[가-힣)])\.\s+/).forEach(s => { s = s.trim(); if (s.length > 8) sents.push(s); }));
  const CATLABEL = { 학업역량: '학업', 진로역량: '진로', 공동체역량: '공동체' };
  const bag = {}, cat = {};
  Object.entries(COMPETENCY).forEach(([ck, def]) => def.subs.forEach(sub => sub.kws.forEach(k => {
    let n = 0; sents.forEach(s => { if (hasPositiveHit(s, k)) n++; });
    if (n) { bag[k] = (bag[k] || 0) + n; cat[k] = cat[k] || CATLABEL[ck]; }
  })));
  return Object.entries(bag).map(([word, n]) => ({ word, n, cat: cat[word] })).sort((a, b) => b.n - a.n).slice(0, 14);
}

/* ── Action Verb 수준(tier): 1=수집·탐색 / 2=분석·적용 / 3=기획·비판·제언 ── */
export const ACTION_TIER = { '탐구·조사': 1, '적용·실행': 2, '분석·비교': 2, '질문·문제제기': 3, '기획·설계': 3, '비판·평가': 3, '대안·제언': 3 };
const TIER_LABEL = { 0: '—', 1: '수집·탐색', 2: '분석·적용', 3: '기획·비판·제언' };

/* ── 학년별 역량 성장 궤적 ──
   학년이 오르며 (넓고 얕은 호기심 → 좁고 깊은 전공 탐구)로 발전하는지, 탐구 깊이·행위 수준의 변화를 추적. */
export function growthTrajectory(r, setName) {
  const core = getSet(setName).core;
  const byGrade = {};
  const add = (g, group, text) => { if (g == null || !text) return; (byGrade[g] = byGrade[g] || { texts: [] }).texts.push({ group, text }); };
  r.details.forEach(d => add(d.grade, groupOf(d.subject), d.text));
  ['autonomy', 'club', 'career'].forEach(k => r.creative[k].forEach(a => add(a.grade, '창체', a.text)));
  const verbHit = text => ACTION_VERBS.filter(av => av.kws.some(k => text.includes(k))).map(av => av.v);
  const rows = Object.keys(byGrade).map(Number).sort().map(g => {
    const texts = byGrade[g].texts, allText = texts.map(t => t.text).join(' ');
    const kw = {}; core.forEach(k => { const n = (allText.match(new RegExp(_esc(k), 'g')) || []).length; if (n) kw[k] = n; });
    const kws = Object.entries(kw).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
    const kwGroups = new Set(); texts.forEach(t => { if (core.some(k => t.text.includes(k))) kwGroups.add(t.group); });
    const verbs = [...new Set(texts.flatMap(t => verbHit(t.text)))].sort((a, b) => (ACTION_TIER[b] || 0) - (ACTION_TIER[a] || 0));
    const maxTier = verbs.reduce((m, v) => Math.max(m, ACTION_TIER[v] || 0), 0);
    const depths = texts.map(t => [INQUIRY.motive, INQUIRY.process, INQUIRY.output, INQUIRY.overcome, INQUIRY.external].filter(arr => arr.some(k => t.text.includes(k))).length);
    const avgDepth = depths.length ? +(depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(1) : 0;
    const band = avgDepth >= 3.3 ? '상' : avgDepth >= 1.7 ? '중' : '하';   // 등급 착시 방지 — 상/중/하로 표기
    return { grade: g, keywords: kws.slice(0, 6), kwTotal: kws.reduce((a, b) => a + b.n, 0), breadth: kwGroups.size, groups: [...kwGroups], verbs, maxTier, tierLabel: TIER_LABEL[maxTier], avgDepth, band };
  });
  let note;
  if (rows.length >= 2) {
    const f = rows[0], l = rows[rows.length - 1];
    const deeper = l.avgDepth > f.avgDepth || l.maxTier > f.maxTier;
    note = `${f.grade}학년→${l.grade}학년: 탐구 깊이 ${f.band}→${l.band}, 행위 수준 ${f.tierLabel}→${l.tierLabel}` + (deeper ? ' — 심화 흐름이 보입니다.' : ' — 심화 흐름이 뚜렷하진 않습니다.');
  } else {
    note = '학년이 하나만 기재되어 시계열 비교는 아직 어렵습니다. 상급 학년 기록이 쌓이면 성장 궤적이 그려집니다.';
  }
  return { rows, note, multi: rows.length >= 2 };
}

/* ── 전공적합성 교과 융합 지도 ──
   메인 진로 키워드가 서로 다른 교과에서 연결되는지(허브-스포크). 빈 교과=융합 확장 여지. */
export function fusionMap(r, setName) {
  const core = getSet(setName).core;
  const th = careerThread(r, setName);
  const main = th.keywords.slice(0, 3).map(k => k.keyword);
  const present = new Set(); r.details.forEach(d => present.add(groupOf(d.subject)));
  const ORDER = ['국어', '수학', '영어', '사회', '과학', '한국사', '예술', '체육', '기타'];
  const nodes = ORDER.filter(g => present.has(g)).map(g => {
    const subs = r.details.filter(d => groupOf(d.subject) === g && d.text);
    let n = 0; const hitSubs = []; const kwset = new Set();
    subs.forEach(d => { let c = 0; core.forEach(k => { const m = (d.text.match(new RegExp(_esc(k), 'g')) || []).length; if (m) { c += m; kwset.add(k); } }); if (c) { n += c; hitSubs.push({ subject: d.subject, n: c }); } });
    return { group: g, present: n > 0, n, subjects: hitSubs.sort((a, b) => b.n - a.n), keywords: [...kwset].slice(0, 4) };
  });
  const CORE5 = ['국어', '수학', '영어', '사회', '과학'];
  return { main, nodes, strong: nodes.filter(nd => nd.present).sort((a, b) => b.n - a.n), gaps: nodes.filter(nd => !nd.present && CORE5.includes(nd.group)) };
}

/* ── 다음 학기 액션 플랜(Next Step) ── 측정된 '빈 축'에서 규칙 기반 후속 제안 생성 */
export function nextSteps(r, setName, pre = {}) {
  const hm = pre.heatmap || keywordHeatmap(r, setName);
  const inq = pre.inquiry || inquiryNarrative(r, setName);
  const av = pre.actions || actionVerbs(r);
  const th = pre.thread || careerThread(r, setName);
  const out = [];
  if (inq.shallow.length) out.push({ tag: '과정·동기', text: `${inq.shallow.slice(0, 3).map(i => i.subject).join(', ')} 세특은 활동·결과 위주로 읽힙니다. 다음 수행평가에서 '왜 이 주제를 골랐는지(동기)'와 '자료조사·실험 중 막힌 지점과 해결 과정'을 남기면 탐구의 깊이가 드러납니다.` });
  if (!inq.external.length) out.push({ tag: '지식 확장', text: `수업 중 생긴 의문을 논문·전공서적·다큐멘터리 등으로 확장해 찾아본 기록이 보이지 않습니다. 한 개념이라도 외부 자료로 파고들어 정리하면 지적 호기심의 근거가 됩니다.` });
  const fm = pre.fusion || fusionMap(r, setName);
  if (fm.strong.length && fm.gaps.length) out.push({ tag: '교과 융합', text: `${fm.strong.slice(0, 2).map(s => s.group).join('·')} 교과에서의 진로 탐구는 잘 드러납니다. 다음 학기에는 같은 주제를 ${fm.gaps.slice(0, 2).map(g => g.group).join('·')} 과목의 수행평가와 연계하면, 하나의 주제를 여러 교과에서 다각도로 탐구한 '융합형' 시각을 보여줄 수 있습니다.` });
  else if (fm.gaps.length) out.push({ tag: '진로 연계', text: `${fm.gaps.slice(0, 3).map(g => g.group).join(', ')} 교과에는 진로 핵심어 연결이 없습니다. 해당 과목 주제를 희망 진로와 접목한 발표·보고서를 한 번 시도해 보세요.` });
  const top = th.keywords[0];
  if (top && !top.sources.some(s => s.type === '창체')) out.push({ tag: '활동 확장', text: `'${top.keyword}' 관심이 교과 세특에는 나타나지만 동아리·자율활동으로는 이어지지 않았습니다. 자율동아리·프로젝트로 확장하면 진로 서사의 일관성이 강해집니다.` });
  if (av.total < 4) out.push({ tag: '주도성', text: `기획·분석·대안 제시 같은 주도적 행위 표현이 적은 편입니다. 활동을 남길 때 '무엇을 스스로 기획했고 어떤 대안을 제시했는지'가 드러나게 해 보세요.` });
  const has3 = r.scores.some(s => s.grade === 3) || (r.creative.career || []).some(a => a.grade === 3 && a.text);
  if (!has3) out.push({ tag: '학년 심화', text: `3학년 기록이 아직 비어 있습니다. 1~2학년의 관심을 같은 주제의 심화·확장(후속 탐구)으로 연결하면 '꼬리를 무는 탐구'가 완성됩니다.` });
  return out.slice(0, 5);
}

/* 벤치마크 지표 메타: dir=좋은 방향(low=낮을수록/high=높을수록), lowDisc=변별력 낮음(관찰) */
export const PROFILE_METRICS = [
  { key: '전과목평균등급', label: '전과목 평균등급', dir: 'low', unit: '등급' },
  { key: '국영수사과평균', label: '국·영·수·사·과 평균', dir: 'low', unit: '등급' },
  { key: '최종학기평균', label: '최종학기 평균등급', dir: 'low', unit: '등급' },
  { key: '성취도A수', label: '성취도 A 과목수', dir: 'high', unit: '과목' },
  { key: '진로핵심어총', label: '진로 핵심어 총', dir: 'high', unit: '회' },
  { key: '진로연계과목수', label: '진로연계 과목수', dir: 'high', unit: '과목' },
  { key: '세특강점총수', label: '세특 강점 총수', dir: 'high', unit: '개' },
  { key: '공동체신호수', label: '공동체역량 신호', dir: 'high', unit: '회' },
  { key: '창체강점요소수', label: '창체 강점 요소수', dir: 'high', unit: '개' },
  { key: '창체총시간', label: '창체 총시간', dir: 'high', unit: '시간', lowDisc: true },
  { key: '세특강점과목수', label: '세특 강점 과목수', dir: 'high', unit: '과목', lowDisc: true },
  { key: '봉사총시간', label: '봉사활동 총시간', dir: 'high', unit: '시간', lowDisc: true },
];

/* 대상 프로필 vs 기준 밴드: 지표별 값/범위/방향 (판정은 하지 않음, 위치만) */
export function compareToBenchmark(prof, band) {
  if (!band) return [];
  return PROFILE_METRICS.map(m => {
    const b = band[m.key];
    if (!b || prof[m.key] == null) return null;
    const v = prof[m.key];
    const pos = v < b.min ? 'below' : v > b.max ? 'above' : 'in';
    return { ...m, value: v, min: b.min, median: b.median, max: b.max, mean: b.mean, n: b.n, pos };
  }).filter(Boolean);
}

/* ── 면접·상담용 예상 질문 생성 ── 추출된 활동·키워드·신호를 조합해 규칙 기반 질문 리스트 */
export function interviewQuestions(r, setName, pre = {}) {
  const th = pre.thread || careerThread(r, setName);
  const inq = pre.inquiry || inquiryNarrative(r, setName);
  const adv = pre.advanced || advancedSignals(r);
  const fm = pre.fusion || fusionMap(r, setName);
  const comp = pre.competency || competencySignals(r);
  const Q = []; const add = (tag, q) => Q.push({ tag, q });
  const top = th.keywords[0];
  if (top) add('진로 심화', `생기부 전반에 '${top.keyword}' 관련 탐구가 ${top.docs}곳에서 보입니다. 그중 가장 깊이 파고든 사례 하나를 고른다면? 그 주제에 관심을 갖게 된 계기부터 설명해 주세요.`);
  const richItem = inq.rich[0] || inq.all.find(i => i.process);
  if (richItem) add('탐구 과정', `${richItem.subject} 세특의 탐구에서, 자료 조사나 실험 과정 중 가장 막혔던 지점은 무엇이었고 어떻게 해결했나요?`);
  const rigor = (adv.categories.정량검증 && adv.categories.정량검증.n) || (adv.categories.회복탄력성 && adv.categories.회복탄력성.n);
  if (rigor) add('탐구 엄밀성', `탐구에서 변인 통제나 오차 관리는 어떻게 진행했나요? 결과가 예상과 달랐던 부분이 있었다면 어떻게 해석했나요?`);
  const strongG = (fm.strong.find(s => s.group !== '기타') || fm.strong[0]);
  if (strongG && fm.gaps.length) add('융합 확장', `${strongG.group} 교과에서의 관심을 ${fm.gaps.slice(0, 1).map(g => g.group).join('')} 같은 다른 교과와 연결한다면, 어떤 주제를 다뤄보고 싶나요?`);
  if (inq.shallow[0]) add('과정 설명', `${inq.shallow[0].subject} 활동에서 결과 말고, 그 과정에서 스스로 판단하거나 선택한 지점이 있었다면 말해 주세요.`);
  const community = comp.find(c => c.key === '공동체역량');
  if (community && community.total) add('공동체', `협력이나 갈등 상황에서 본인의 역할이 드러난 활동이 있습니다. 그때 어떤 어려움이 있었고 어떻게 조율했나요?`);
  add('진로 연결', `지금까지의 탐구 경험이 지원하려는 전공(계열)에서 구체적으로 어떻게 이어질 수 있다고 생각하나요?`);
  return Q.slice(0, 7);
}

/* ── 역량 균형 점검 ── 학업·진로 대비 공동체 신호가 부족한지 등 균형 알림(판정 아님) */
export function balanceCheck(comp) {
  const get = k => (comp.find(c => c.key === k) || { total: 0 }).total;
  const academic = get('학업역량'), career = get('진로역량'), community = get('공동체역량');
  const alerts = [];
  const strongSide = Math.max(academic, career);
  if (strongSide >= 6 && community < strongSide * 0.4) alerts.push({ level: 'warn', text: '학업·진로 신호에 비해 협력·리더십 등 공동체역량 표현이 상대적으로 적습니다. 인성·소통이 드러나는 활동 기록을 보완하면 균형이 좋아집니다.' });
  if (community >= 6 && academic < community * 0.4) alerts.push({ level: 'warn', text: '공동체 활동은 풍부하나 학업·탐구의 깊이를 보여주는 표현이 상대적으로 적습니다. 탐구 과정·심화 기록을 보완해 보세요.' });
  return { academic, career, community, balanced: alerts.length === 0, alerts };
}

/* ── 시각화용 집계 데이터 ── */
// 1) 역량 밸런스 방사형(4~5축, 0~1 정규화 — soft cap)
export function radarProfile(r, setName, pre = {}) {
  const comp = pre.competency || competencySignals(r);
  const av = pre.actions || actionVerbs(r);
  const hm = pre.heatmap || keywordHeatmap(r, setName);
  const inq = pre.inquiry || inquiryNarrative(r, setName);
  const sub = (cat, key) => { const g = comp.find(c => c.key === cat); if (!g) return 0; const s = g.subs.find(x => x.key === key); return s ? s.n : 0; };
  const verb = v => (av.cats.find(c => c.v === v) || { n: 0 }).n;
  // cap = 축별 '충분히 높은' 기준값(관측 표본 기준 보정) — 축 간 규모 차이를 보정해 특정 축 고정 방지
  const raw = [
    { axis: '학업 역량', v: sub('학업역량', '지적호기심') + sub('학업역량', '탐구·심화') + sub('학업역량', '성찰·회고'), cap: 24 },
    { axis: '전공적합성', v: hm.total + inq.rich.length * 2, cap: 90 },
    { axis: '리더십·소통', v: sub('공동체역량', '협업·소통') + sub('공동체역량', '리더십'), cap: 40 },
    { axis: '자기주도성', v: sub('학업역량', '자기주도') + verb('기획·설계') + verb('대안·제언'), cap: 16 },
    { axis: '성실·배려', v: sub('공동체역량', '성실·책임') + sub('공동체역량', '나눔·배려'), cap: 24 },
  ];
  // 축마다 단위·규모가 달라 원시값은 서로 비교 불가(예: 전공적합성은 키워드 수 누적이라 자연히 커짐) →
  // 각 축을 '그 축 자신의 상한 대비 비율'로 독립 환산(축끼리 다시 비교해 늘리지 않음).
  // 그래야 그래프 위치와 표시되는 숫자(백분율)가 항상 일치한다.
  return raw.map(a => {
    const pct = Math.round(Math.min(100, (a.v / a.cap) * 100));
    return { axis: a.axis, value: a.v, pct, norm: +(0.04 + 0.96 * (pct / 100)).toFixed(3) };
  });
}
// 3) 학년×영역 활동 밀도(진로 핵심어 빈도)
export function activityHeat(r, setName) {
  const core = getSet(setName).core;
  const cnt = t => core.reduce((a, k) => a + ((t || '').match(new RegExp(_esc(k), 'g')) || []).length, 0);
  const grades = [...new Set([...r.scores.map(s => s.grade), ...['autonomy', 'club', 'career'].flatMap(k => r.creative[k].map(a => a.grade)), ...r.details.map(d => d.grade)].filter(g => g != null))].sort();
  const rows = [['자율', 'autonomy'], ['동아리', 'club'], ['진로', 'career']].map(([label, key]) =>
    ({ area: label, cells: grades.map(g => ({ grade: g, n: r.creative[key].filter(a => a.grade === g).reduce((x, a) => x + cnt(a.text), 0) })) }));
  rows.push({ area: '세특', cells: grades.map(g => ({ grade: g, n: r.details.filter(d => d.grade === g).reduce((x, d) => x + cnt(d.text), 0) })) });
  return { grades, rows, max: Math.max(1, ...rows.flatMap(rw => rw.cells.map(c => c.n))) };
}
// 4) 계층형 썬버스트(세특/창체/행특 → 과목·영역 → 대표 키워드), 면적=글자수
export function sunburstData(r, setName) {
  const core = getSet(setName).core;
  const topKw = t => { const m = {}; core.forEach(k => { const n = ((t || '').match(new RegExp(_esc(k), 'g')) || []).length; if (n) m[k] = n; }); const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : ''; };
  const an = { autonomy: '자율', club: '동아리', career: '진로' };
  const areas = [];
  const setuk = r.details.filter(d => d.text).map(d => ({ name: d.subject, chars: d.text.length, kw: topKw(d.text) }));
  if (setuk.length) areas.push({ name: '세특', children: setuk });
  const ch = []; ['autonomy', 'club', 'career'].forEach(k => { const t = r.creative[k].map(a => a.text).join(' '); if (t.trim()) ch.push({ name: an[k], chars: t.length, kw: topKw(t) }); });
  if (ch.length) areas.push({ name: '창체', children: ch });
  const beh = (r.behavior || []).map(b => b.text).join(' '); if (beh.trim()) areas.push({ name: '행특', children: [{ name: '행동특성', chars: beh.length, kw: topKw(beh) }] });
  areas.forEach(a => a.chars = a.children.reduce((x, c) => x + c.chars, 0));
  return { areas, total: areas.reduce((x, a) => x + a.chars, 0) };
}
// 2) 키워드 연결 네트워크(교과군·창체 = 소스노드, 진로 핵심어 = 키워드노드, 여러 소스 겹치면 융합)
export function keywordNetwork(r, setName) {
  const core = getSet(setName).core;
  const an = { autonomy: '자율', club: '동아리', career: '진로' };
  const areaMap = {}; const kwAreas = {};
  const scan = (id, label, type, text) => {
    if (!text) return;
    core.forEach(k => { const n = (text.match(new RegExp(_esc(k), 'g')) || []).length; if (n) { areaMap[id] = areaMap[id] || { id, label, type, n: 0 }; areaMap[id].n += n; (kwAreas[k] = kwAreas[k] || {})[id] = (kwAreas[k][id] || 0) + n; } });
  };
  r.details.forEach(d => { const g = groupOf(d.subject); scan('S:' + g, g, '세특', d.text); });
  ['autonomy', 'club', 'career'].forEach(k => scan('C:' + k, an[k], '창체', r.creative[k].map(a => a.text).join(' ')));
  const keywords = Object.entries(kwAreas).map(([k, areas]) => ({ k, areas: Object.keys(areas), n: Object.values(areas).reduce((a, b) => a + b, 0) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 12);
  const used = new Set(keywords.flatMap(k => k.areas));
  return { areas: Object.values(areaMap).filter(a => used.has(a.id)), keywords };
}

/* ── 사용자 판정 사전 편집(피드백 루프) ──
   교사가 실사용 중 발견한 표현을 추가만 하는(제거 없는) 안전한 튜닝. 학생 데이터 아닌 '단어'만 다뤄 영구 저장에 문제 없음.
   재호출해도 중복 누적되지 않도록, 최초 로드 시점 길이를 기준으로 매번 초기화 후 재적용(멱등). */
const _baseStrongLen = STRONG_MARKERS.length;
const _baseWeakLen = WEAK_MARKERS.length;
const _baseMotiveLen = INQUIRY.motive.length;
const _baseExternalLen = INQUIRY.external.length;
export function applyCustomDict(custom = {}) {
  STRONG_MARKERS.length = _baseStrongLen; if (custom.strong && custom.strong.length) STRONG_MARKERS.push(...custom.strong);
  WEAK_MARKERS.length = _baseWeakLen; if (custom.weak && custom.weak.length) WEAK_MARKERS.push(...custom.weak);
  INQUIRY.motive.length = _baseMotiveLen; if (custom.motive && custom.motive.length) INQUIRY.motive.push(...custom.motive);
  INQUIRY.external.length = _baseExternalLen; if (custom.external && custom.external.length) INQUIRY.external.push(...custom.external);
  const avIdx = ACTION_VERBS.findIndex(a => a.v === '사용자 추가 표현');
  if (avIdx >= 0) ACTION_VERBS.splice(avIdx, 1);
  if (custom.actionVerb && custom.actionVerb.length) { ACTION_VERBS.push({ v: '사용자 추가 표현', kws: custom.actionVerb }); ACTION_TIER['사용자 추가 표현'] = 2; }
  const subs = COMPETENCY.공동체역량.subs;
  const ci = subs.findIndex(s => s.key === '사용자 추가');
  if (ci >= 0) subs.splice(ci, 1);
  if (custom.community && custom.community.length) subs.push({ key: '사용자 추가', emoji: '✏️', kws: custom.community });
  return custom;
}

/* ── 윤문 점검(규칙 기반·로컬) ──
   세특·창체 원문 문장에서 '다듬을 후보' 지점만 신호로 표시. 맞춤법 교정기가 아니라 검토 보조.
   외부 전송 없이 브라우저 안에서만 동작(도구 핵심 원칙 유지). */
export const POLISH = {
  // 구체 근거 없이 남발되면 설득력이 떨어지는 평가어(상투어)
  cliche: ['성실히', '성실하게', '성실한 태도', '열심히', '적극적으로', '최선을 다', '뛰어난', '뛰어나게', '훌륭한', '훌륭히', '우수한', '우수하게', '인상적', '돋보', '열정적으로', '활발히', '능동적으로', '바람직', '모범적', '깊은 관심', '많은 관심', '많은 노력', '바른 태도', '보기 좋'],
  // 이중·과잉 피동(피동 어간에 '-어지다'가 다시 붙은 명백한 이중피동만 — 오탐 방지)
  passive: ['되어지', '보여지', '불려지', '쓰여지', '읽혀지', '잊혀지', '놓여지', '담겨지', '나뉘어지', '바뀌어지', '모아지', '생각되어지'],
  // 번역투(한 문장에 반복되면 다듬을 후보)
  translationese: ['에 대하여', '에 대한', '에 대해', '을 통하여', '를 통하여', '을 통해', '를 통해', '에 의하여', '에 의해'],
  // 학생부 기재 금지/유의 소지(고신뢰 표지만)
  neis: ['toeic', 'toefl', 'teps', '토익', '토플', '텝스', 'hsk', 'jlpt', '오픽', 'opic', 'ielts', '아이엘츠', '토셀', 'toeic speaking', '논문 게재', '학회지', '저널에 게재', '교외 대회', '교외대회'],
};
// 문장 종결 형식 판별: 명사형('~함/음/됨') vs 서술형('~다/요')
function endStyle(sent) {
  const s = sent.replace(/["'’”)\]\s.]+$/, '');
  const last = s.slice(-1); if (!last) return null;
  const code = last.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const jong = (code - 0xAC00) % 28;
    if (jong === 16) return '명사형';                 // ㅁ 받침 = 명사형 종결
    if (/[다요죠까]$/.test(s)) return '서술형';
    return null;
  }
  return null;                                        // 영문·숫자로 끝나면 판단 보류
}
export function polishReview(r) {
  const an = { autonomy: '자율활동', club: '동아리', career: '진로활동' };
  const raw = [];
  r.details.forEach(d => d.text && raw.push({ src: d.subject, grade: d.grade, type: '세특', text: d.text }));
  ['autonomy', 'club', 'career'].forEach(k => (r.creative[k] || []).forEach(a => a.text && raw.push({ src: an[k], grade: a.grade, type: '창체', text: a.text })));
  const sents = [];
  raw.forEach(o => o.text.split(/(?<=[가-힣)])\.\s+/).forEach(t => { t = t.trim().replace(/\s+/g, ' '); if (t.length >= 10) sents.push({ ...o, s: t }); }));
  let nom = 0, decl = 0;
  sents.forEach(o => { const e = endStyle(o.s); if (e === '명사형') nom++; else if (e === '서술형') decl++; });
  const dominant = nom >= decl ? '명사형' : '서술형';
  const styleMixed = nom > 0 && decl > 0;
  const findAll = (text, arr) => { const low = text.toLowerCase(), hit = []; arr.forEach(k => { if (low.includes(k.toLowerCase()) && !hit.includes(k)) hit.push(k); }); return hit; };
  const byType = { 금지표현: 0, 이중피동: 0, 상투어: 0, 번역투: 0, 장문: 0, 종결어미: 0 };
  const items = [];
  sents.forEach(o => {
    const t = o.s, issues = [];
    const neis = findAll(t, POLISH.neis);
    if (neis.length) { issues.push({ tag: '금지표현', tokens: neis, sev: 3, advice: '학생부 기재 금지 소지(어학성적·교외 수상·논문 등). 규정을 반드시 확인하세요.' }); byType.금지표현++; }
    const pas = findAll(t, POLISH.passive);
    if (pas.length) { issues.push({ tag: '이중피동', tokens: pas, sev: 2, advice: '이중·과잉 피동입니다. ‘되다/보이다’처럼 바로잡으세요(예: 보여진다→보인다).' }); byType.이중피동++; }
    const cl = findAll(t, POLISH.cliche);
    if (cl.length >= 2) { issues.push({ tag: '상투어', tokens: cl, sev: 1, advice: '평가어가 몰려 있습니다. 무엇을 어떻게 했는지 구체 행동·결과로 바꾸면 설득력이 높아집니다.' }); byType.상투어++; }
    const tr = findAll(t, POLISH.translationese);
    if (tr.length >= 2) { issues.push({ tag: '번역투', tokens: tr, sev: 1, advice: '‘~에 대한/~을 통해’가 반복됩니다. 간결한 서술로 다듬어 보세요.' }); byType.번역투++; }
    const commas = (t.match(/,/g) || []).length;
    if (t.length >= 150 || commas >= 7) { issues.push({ tag: '장문', tokens: [], sev: 1, advice: `한 문장이 ${t.length}자로 깁니다. 2~3문장으로 나누면 읽기 쉽습니다.` }); byType.장문++; }
    if (styleMixed) { const e = endStyle(t); if (e && e !== dominant) { issues.push({ tag: '종결어미', tokens: [], sev: 1, advice: `생기부는 ‘${dominant}’ 종결로 통일하는 것이 관례인데 이 문장은 ‘${e}’입니다.` }); byType.종결어미++; } }
    if (issues.length) items.push({ src: o.src, grade: o.grade, type: o.type, text: t, issues, sev: Math.max(...issues.map(i => i.sev)) });
  });
  items.sort((a, b) => b.sev - a.sev || b.issues.length - a.issues.length);
  return { total: sents.length, flagged: items.length, byType, dominant, items };
}

export function analyze(r, setName = '생명·과학') {
  const heatmap = keywordHeatmap(r, setName);
  const thread = careerThread(r, setName);
  const actions = actionVerbs(r);
  const inquiry = inquiryNarrative(r, setName);
  const fusion = fusionMap(r, setName);
  const advanced = advancedSignals(r);
  const competency = competencySignals(r);
  return {
    name: r.meta.name,
    strength: strengthMap(r),
    timeline: timeline(r),
    heatmap,
    gaps: gapChecklist(r, setName),
    semTrend: semesterTrend(r),
    creativeHi: creativeHighlights(r),
    setuk: setukHighlights(r, setName),
    advanced,
    competency,
    balance: balanceCheck(competency),
    thread,
    actions,
    inquiry,
    growth: growthTrajectory(r, setName),
    fusion,
    radar: radarProfile(r, setName, { competency, actions, heatmap, inquiry }),
    actHeat: activityHeat(r, setName),
    sunburst: sunburstData(r, setName),
    network: keywordNetwork(r, setName),
    auto: autoKeywords(r),
    majorKw: majorKeywords(r, setName),
    compKw: competencyKeywords(r),
    interview: interviewQuestions(r, setName, { thread, inquiry, advanced, fusion, competency }),
    nextSteps: nextSteps(r, setName, { heatmap, thread, actions, inquiry, fusion }),
    profile: profile(r, setName),
    polish: polishReview(r),
    hope: r.creative.hope,
  };
}
