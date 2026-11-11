// ===== DRAFT XI — 경기 분석: 직전 경기의 흐름·팀 지표 비교(4분면)·히트맵·패스맵·슈팅·선수별 평가 =====
(function (G) {
'use strict';
const TL = G.TL, C = G.DXC, E = G.FMEngine, U = G.DXU;
if (!TL || !C || !U) return;
const { h, seg, sel } = TL;
const { ME, T, badge, rt, panel, posTag } = U;
const pname = p => (p ? p.name : ''); // 이 파일에서는 문자열(툴팁·선택 상자)로 쓰고, 링크가 필요한 곳은 TL.pl 사용
const LOGO = G.TC_LOGOPACK || {};
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, at, ...kids) => { const e = document.createElementNS(NS, tag); for (const k in at) if (at[k] != null) e.setAttribute(k, at[k]); for (const c of kids) if (c != null) e.append(c); return e; };
const tip = (el, text) => { const t = sv('title', {}); t.textContent = text; el.append(t); return el; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pc = (a, b) => b ? Math.round(a / b * 100) : 0;
const f1 = v => (Math.round(v * 10) / 10).toFixed(1), f2 = v => (Math.round(v * 100) / 100).toFixed(2);
const tm = m => T().mgrs[m].team;
const minOf = m => parseInt(m, 10) || 0;
const KIND = ['짧은 패스', '롱패스', '스루패스', '크로스', '굴려 주기', '스로인'];
const X = x => 52.5 + x, Y = y => 34 - y; // 공격 방향 → 오른쪽

function ctxOf() {
  const t = T(); if (!t) return null;
  const list = t.fx.filter(x => x.r && (x.h === ME || x.a === ME)); if (!list.length) return null;
  let f = U.rvFx != null ? list.find(x => x.i === U.rvFx) : null; if (!f) f = (t.last && list.find(x => x.i === t.last.fx)) || list[list.length - 1];
  const dt = (t.reviews && t.reviews[f.i]) || (t.last && t.last.fx === f.i && t.last.dt) || null;
  const my = f.h === ME ? 0 : 1; const ms = [f.h, f.a];
  return { t, f, r: f.r, dt, my, ms, teams: ms.map(tm), list };
}
function pitch(cls, opt) {
  opt = opt || {}; const ln = { fill: 'none', stroke: 'rgba(255,255,255,.32)', 'stroke-width': .3 };
  const s = sv('svg', { viewBox: opt.half ? '50 -2 57 72' : '-2 -2 109 72', class: 'rv-pitch ' + (cls || ''), role: 'img', 'aria-label': opt.label || '경기장' });
  s.append(sv('rect', { x: 0, y: 0, width: 105, height: 68, rx: 1, fill: '#0f3a29' }));
  for (let i = 0; i < 7; i++) if (i % 2) s.append(sv('rect', { x: i * 15, y: 0, width: 15, height: 68, fill: 'rgba(255,255,255,.025)' }));
  s.append(sv('rect', Object.assign({ x: 0, y: 0, width: 105, height: 68, rx: 1 }, ln)), sv('line', Object.assign({ x1: 52.5, y1: 0, x2: 52.5, y2: 68 }, ln)), sv('circle', Object.assign({ cx: 52.5, cy: 34, r: 9.15 }, ln)),
    sv('rect', Object.assign({ x: 0, y: 13.84, width: 16.5, height: 40.32 }, ln)), sv('rect', Object.assign({ x: 88.5, y: 13.84, width: 16.5, height: 40.32 }, ln)), sv('rect', Object.assign({ x: 0, y: 24.84, width: 5.5, height: 18.32 }, ln)), sv('rect', Object.assign({ x: 99.5, y: 24.84, width: 5.5, height: 18.32 }, ln)));
  if (!opt.noArrow) s.append(sv('path', { d: 'M86 65.3h12m-3-2 3 2-3 2', fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': .5 }));
  return s;
}
const head = (title, sub) => h('div', { class: 'rv-h' }, h('b', null, title), sub ? h('span', { class: 'dim' }, sub) : null);
const box = (v, l, cls) => h('div', { class: 'rv-box ' + (cls || '') }, h('b', null, v), h('span', null, l));
const tcol = (X0, s) => s === X0.my ? 'var(--gold)' : '#7fb4ff';

// ---------- 팀 평가 ----------
function teamAvg(t) {
  const TM = C.stats(t).TM.filter(x => x.p > 0); const n = TM.reduce((a, x) => a + x.p, 0) || 1; const s = k => TM.reduce((a, x) => a + x[k], 0);
  return { xg: s('xg') / n, sh: s('sh') / n, sot: s('sot') / n, pp: pc(s('pk'), s('ps')), ps: s('ps') / n, tkp: pc(s('tkw'), s('tkl')), int: s('int') / n, fl: s('fl') / n, gf: s('gf') / n, n };
}
function teamVerdict(X0, s) {
  const { r, dt, t, f } = X0; const o = 1 - s; const a = r.st[s], b = r.st[o]; const av = teamAvg(t); const good = [], bad = [];
  const poss = s === 0 ? r.poss : 100 - r.poss; const xg = r.xg[s], xga = r.xg[o], gf = r.score[s], ga = r.score[o];
  const pp = pc(a.pk, a.ps), tkp = pc(a.tkw, a.tkl);
  if (xg >= Math.max(1.2, av.xg * 1.25)) good.push(['기회 창출', `xG ${f2(xg)} — 대회 평균(${f2(av.xg)})을 크게 웃돌았습니다.`]);
  else if (xg <= av.xg * .6) bad.push(['기회 창출 부족', `xG ${f2(xg)} — 대회 평균(${f2(av.xg)})에 한참 못 미쳤습니다. 박스 안으로 공을 넣는 경로가 막혔습니다.`]);
  if (gf - xg >= .8) good.push(['결정력', `xG ${f2(xg)}로 ${gf}골. 기회를 놓치지 않았습니다.`]);
  else if (xg - gf >= .9) bad.push(['결정력', `xG ${f2(xg)}에 ${gf}골. 만든 기회에 비해 마무리가 아쉬웠습니다.`]);
  if (a.sh >= 6) { const q = xg / a.sh; if (q >= .13) good.push(['슈팅 품질', `슈팅당 xG ${f2(q)} — 좋은 위치에서 슈팅했습니다.`]); else if (q <= .065) bad.push(['슈팅 품질', `슈팅당 xG ${f2(q)} — 먼 거리·각 없는 슈팅이 많았습니다.`]); }
  if (a.sh >= 5 && pc(a.sot, a.sh) <= 22) bad.push(['유효 슈팅', `슈팅 ${a.sh}개 중 유효 ${a.sot}개(${pc(a.sot, a.sh)}%).`]);
  if (xga <= Math.min(.7, av.xg * .6)) good.push(['수비 조직', `상대 xG를 ${f2(xga)}로 묶었습니다.`]);
  else if (xga >= Math.max(1.6, av.xg * 1.35)) bad.push(['수비 조직', `상대에게 xG ${f2(xga)} (슈팅 ${b.sh}개)를 허용했습니다.`]);
  if (ga - xga >= .9) bad.push(['실점 억제', `허용 xG ${f2(xga)}에 ${ga}실점. 골키퍼·박스 안 수비가 버티지 못했습니다.`]);
  else if (xga - ga >= .9) good.push(['실점 억제', `허용 xG ${f2(xga)}에 ${ga}실점. 골키퍼와 수비가 잘 막아냈습니다.`]);
  if (a.ps >= 100) { if (pp >= av.pp + 4) good.push(['패스 정확도', `성공률 ${pp}% (대회 평균 ${av.pp}%).`]); else if (pp <= av.pp - 5) bad.push(['패스 정확도', `성공률 ${pp}% (대회 평균 ${av.pp}%). 빌드업에서 공을 자주 잃었습니다.`]); }
  if (poss >= 57) good.push(['주도권', `점유율 ${poss}%.`]); else if (poss <= 40 && xg < xga) bad.push(['주도권', `점유율 ${poss}%에 기회도 적었습니다. 공을 되찾은 뒤 지키지 못했습니다.`]);
  if (a.tkl >= 8) { if (tkp >= 68) good.push(['태클', `성공률 ${tkp}% (${a.tkw}/${a.tkl}).`]); else if (tkp <= 45) bad.push(['태클', `성공률 ${tkp}% (${a.tkw}/${a.tkl}). 1대1 수비에서 자주 벗겨졌습니다.`]); }
  if (a.int >= av.int * 1.3 && a.int >= 8) good.push(['패스 길목 차단', `가로채기 ${a.int}회 (대회 평균 ${f1(av.int)}).`]);
  if (a.fl >= Math.max(14, av.fl * 1.45)) bad.push(['파울', `파울 ${a.fl}개 (대회 평균 ${f1(av.fl)}).`]);
  if (a.rc) bad.push(['퇴장', `퇴장 ${a.rc}명으로 수적 열세에서 뛰었습니다.`]); else if (a.yc >= 4) bad.push(['경고', `경고 ${a.yc}장.`]);
  const spFor = r.goals.filter(g => g.side === s && g.sp).length, spAg = r.goals.filter(g => g.side === o && g.sp).length;
  if (spFor) good.push(['세트피스', `세트피스에서 ${spFor}골.`]); if (spAg) bad.push(['세트피스 수비', `세트피스에서 ${spAg}실점.`]);
  if (a.off >= 5) bad.push(['오프사이드', `오프사이드 ${a.off}회. 침투 타이밍이 맞지 않았습니다.`]);
  if (dt) {
    const ids = r.players.filter(p => p.side === s && p.start && p.min >= 80 && p.code !== 'GK').map(p => dt.ex[p.id]).filter(Boolean);
    if (ids.length >= 5) { const en = ids.reduce((x, e) => x + e.en, 0) / ids.length; if (en <= 48) bad.push(['체력', `풀타임 선수 평균 체력 ${Math.round(en)}%로 경기를 마쳤습니다. 압박·템포를 낮추거나 교체를 빨리 쓰세요.`]); else if (en >= 68) good.push(['체력 관리', `풀타임 선수 평균 체력 ${Math.round(en)}%.`]); }
    const ps = dt.pass.filter(p => p[0] === s); const ent = ps.filter(p => p[7] && p[2] <= 36 && p[4] > 36 && Math.abs(p[5]) < 20.2).length; if (ps.length > 80) { if (ent >= 9) good.push(['박스 진입', `박스 안으로 연결된 패스 ${ent}개.`]); else if (ent <= 2) bad.push(['박스 진입', `박스 안으로 연결된 패스가 ${ent}개뿐입니다.`]); }
    const cr = ps.filter(p => p[6] === 3); if (cr.length >= 8 && pc(cr.filter(p => p[7]).length, cr.length) <= 13) bad.push(['크로스', `크로스 ${cr.length}개 중 ${cr.filter(p => p[7]).length}개만 연결됐습니다.`]);
  }
  void f; return { good, bad };
}

// ---------- 선수 평가 ----------
function plRows(X0, s) { const { r, dt, t } = X0; return r.players.filter(p => p.side === s).map(p => Object.assign({ ex: (dt && dt.ex[p.id]) || {}, d: t.players[p.id] }, p)).sort((a, b) => (b.start - a.start) || b.min - a.min); }
function plPass(X0, id) { const { dt } = X0; if (!dt) return null; const ps = dt.pass.filter(p => p[1] === id); const ok = ps.filter(p => p[7]); return { n: ps.length, prog: ok.filter(p => p[4] - p[2] >= 10).length, fin: ok.filter(p => p[2] <= 17.5 && p[4] > 17.5).length, box: ok.filter(p => p[4] > 36 && Math.abs(p[5]) < 20.2 && p[2] <= 36).length, long: ps.filter(p => Math.hypot(p[4] - p[2], p[5] - p[3]) >= 30).length, longOk: ok.filter(p => Math.hypot(p[4] - p[2], p[5] - p[3]) >= 30).length, cr: ps.filter(p => p[6] === 3).length, crOk: ok.filter(p => p[6] === 3).length }; }
function octaVals(X0, p) {
  const e = p.ex, pp = plPass(X0, p.id) || { prog: 0, box: 0, crOk: 0 }; const k90 = p.min ? 90 / Math.max(20, p.min) : 1; const c = v => Math.round(clamp(v, 0, 99));
  if (p.code === 'GK') return [['선방', c(p.sav * 20)], ['배급', c(p.ps ? (p.pk / p.ps - .5) / .45 * 80 + Math.min(19, p.ps / 2) : 20)], ['전진 패스', c(pp.prog * 9)], ['공중볼', c((e.aer || 0) * 22)], ['볼 회수', c((e.rec || 0) * 9)], ['실점 억제', c(99 - X0.r.score[1 - p.side] * 28)], ['안정감', c(90 - (e.lost || 0) * 30 - p.fl * 20)], ['평점', c((p.rt - 5) / 4 * 99)]];
  return [['득점', c(p.g * 45 + p.xg * 40 + p.sot * 8)], ['슈팅', c(p.sh * 14 + p.sot * 10)], ['창의', c(p.kp * 22 + p.a * 40 + pp.box * 8 + pp.crOk * 8)], ['패스', c(p.ps >= 5 ? (p.pk / p.ps - .6) / .35 * 70 + Math.min(29, p.ps / 2) : 30)],
    ['전진', c((pp.prog * 5.5 + p.drb * 12) * Math.min(1.3, k90))], ['수비', c((p.tkw * 14 + p.int * 13 + (e.blk || 0) * 12 + (e.clr || 0) * 6) * Math.min(1.3, k90))], ['경합·회수', c(((e.aer || 0) * 10 + (e.rec || 0) * 6) * Math.min(1.3, k90))], ['활동량', c((p.dist * k90 - 7) / 5 * 99)]];
}
function plVerdict(X0, p) {
  const e = p.ex, good = [], bad = []; const pp = plPass(X0, p.id); const full = p.min >= 60; const per90 = p.min ? p.dist * 90 / Math.max(20, p.min) : 0; const gk = p.code === 'GK';
  if (p.g) good.push(`득점 ${p.g}`); if (p.a) good.push(`도움 ${p.a}`);
  if (!p.g && p.xg >= .6) bad.push(`기회 무산 (xG ${f2(p.xg)}, 무득점)`); else if (p.g && p.g - p.xg >= .6) good.push(`결정력 (xG ${f2(p.xg)})`);
  if (p.sh >= 3 && !p.sot) bad.push(`슈팅 ${p.sh}개 모두 빗나감`); else if (p.sh >= 3 && p.sot / p.sh >= .6) good.push(`유효 슈팅 ${p.sot}/${p.sh}`);
  if (p.kp >= 3) good.push(`키패스 ${p.kp}`);
  if (p.ps >= 20) { const q = pc(p.pk, p.ps); if (q >= 89) good.push(`패스 ${q}%`); else if (q <= 68) bad.push(`패스 미스 잦음 (${q}%)`); }
  if (pp) { if (pp.prog >= 8) good.push(`전진 패스 ${pp.prog}`); if (pp.box >= 3) good.push(`박스 투입 패스 ${pp.box}`); if (pp.cr >= 5 && !pp.crOk) bad.push(`크로스 ${pp.cr}개 모두 실패`); else if (pp.crOk >= 3) good.push(`크로스 성공 ${pp.crOk}`); if (pp.long >= 6 && pc(pp.longOk, pp.long) <= 30) bad.push(`롱패스 부정확 (${pp.longOk}/${pp.long})`); }
  if (p.drb >= 3) good.push(`돌파 ${p.drb}`); if ((e.lost || 0) >= 4) bad.push(`${e.lost}회 빼앗김`);
  if (p.tkw >= 3) good.push(`태클 성공 ${p.tkw}`); if (p.tkl >= 4 && p.tkw / p.tkl < .4) bad.push(`태클 성공률 낮음 (${p.tkw}/${p.tkl})`);
  if (p.int >= 3) good.push(`가로채기 ${p.int}`); if ((e.blk || 0) >= 2) good.push(`슈팅 블록 ${e.blk}`); if ((e.aer || 0) >= 4) good.push(`공중볼 승리 ${e.aer}`); if ((e.rec || 0) >= 9) good.push(`볼 회수 ${e.rec}`);
  if ((e.bt || 0) >= 3) bad.push(`돌파 허용 ${e.bt}`);
  if (p.fl >= 3) bad.push(`파울 ${p.fl}`); if (p.red) bad.push('퇴장'); else if (p.yc) bad.push('경고');
  if (!gk && full) { if (per90 >= 11.3) good.push(`활동량 ${f1(per90)}km/90`); else if (per90 <= 8.6) bad.push(`활동량 부족 (${f1(per90)}km/90)`); if (e.en != null && e.en <= 42) bad.push(`체력 고갈 (${e.en}%)`); }
  if (gk) { if (p.sav >= 4) good.push(`선방 ${p.sav}`); if (!X0.r.score[1 - p.side] && p.min >= 60) good.push('무실점'); }
  if (!good.length && p.rt >= 7.2) good.push('전반적으로 안정적'); if (!bad.length && p.rt && p.rt < 6.2 && p.min >= 30) bad.push('존재감 부족');
  return { good, bad };
}
function octa(vals, color) {
  const n = vals.length, cx = 80, cy = 78, R = 52; const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const rr = R * v / 99; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; };
  const s = sv('svg', { viewBox: '-24 0 208 156', class: 'rv-octa', role: 'img', 'aria-label': '경기 활약 그래프: ' + vals.map(v => v[0] + ' ' + v[1]).join(', ') });
  for (const k of [33, 66, 99]) s.append(sv('polygon', { points: vals.map((_, i) => pt(i, k).join(',')).join(' '), fill: 'none', stroke: 'rgba(255,255,255,.13)', 'stroke-width': .7 }));
  vals.forEach((v, i) => { const [x, y] = pt(i, 99); s.append(sv('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'rgba(255,255,255,.1)', 'stroke-width': .7 })); const [lx, ly] = pt(i, 128); const tx = sv('text', { x: lx, y: ly + 3, 'text-anchor': 'middle', class: 'rv-ol' }); tx.textContent = v[0]; s.append(tx); });
  s.append(sv('polygon', { points: vals.map((v, i) => pt(i, Math.max(4, v[1])).join(',')).join(' '), fill: color, 'fill-opacity': .32, stroke: color, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
  vals.forEach((v, i) => { const [x, y] = pt(i, Math.max(4, v[1])); s.append(tip(sv('circle', { cx: x, cy: y, r: 2.2, fill: color }), `${v[0]} ${v[1]}`)); });
  return s;
}

// ---------- 1. 개요 ----------
function cmpBars(X0) {
  const { r, dt } = X0; const a = r.st[0], b = r.st[1];
  const rows = [['점유율', r.poss, 100 - r.poss, '%'], ['슈팅', a.sh, b.sh], ['유효 슈팅', a.sot, b.sot], ['기대 득점 (xG)', +f2(r.xg[0]), +f2(r.xg[1])], ['패스', a.ps, b.ps], ['패스 성공률', pc(a.pk, a.ps), pc(b.pk, b.ps), '%'], ['태클 성공', a.tkw, b.tkw], ['가로채기', a.int, b.int],
    dt ? ['볼 회수', dt.rcv[0], dt.rcv[1]] : null, ['코너킥', a.co, b.co], ['오프사이드', a.off, b.off], ['파울', a.fl, b.fl], ['선방', a.sav, b.sav]].filter(Boolean);
  return h('div', { class: 'rv-cmp' }, ...rows.map(([l, x, y, u]) => { const tot = x + y || 1; return h('div', { class: 'rv-cr' }, h('b', { class: x > y ? 'w' : '' }, x + (u || '')), h('div', { class: 'rv-cb' }, h('span', null, l), h('div', { class: 'bar' }, h('i', { style: { width: (x / tot * 100) + '%', background: tcol(X0, 0) } }), h('i', { style: { width: (y / tot * 100) + '%', background: tcol(X0, 1) } }))), h('b', { class: y > x ? 'w' : '' }, y + (u || ''))); }));
}
function xgTimeline(X0) {
  const { r, t } = X0; const W = 640, H = 210, L = 34, R0 = 12, Tp = 12, B = 26; const maxM = Math.max(95, ...r.shots.map(s => minOf(s.m))); const cum = [0, 0];
  const tot = Math.max(1, r.xg[0], r.xg[1]) * 1.12; const xx = m => L + (W - L - R0) * m / maxM, yy = v => H - B - (H - B - Tp) * v / tot;
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rv-chart', role: 'img', 'aria-label': '시간대별 누적 xG' });
  for (let m = 0; m <= maxM; m += 15) { s.append(sv('line', { x1: xx(m), y1: Tp, x2: xx(m), y2: H - B, stroke: m === 45 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.08)', 'stroke-width': 1 })); const tx = sv('text', { x: xx(m), y: H - 8, 'text-anchor': 'middle', class: 'rv-ax' }); tx.textContent = m + "'"; s.append(tx); }
  for (let k = 0; k <= 4; k++) { const v = tot * k / 4; s.append(sv('line', { x1: L, y1: yy(v), x2: W - R0, y2: yy(v), stroke: 'rgba(255,255,255,.07)' })); const tx = sv('text', { x: L - 5, y: yy(v) + 4, 'text-anchor': 'end', class: 'rv-ax' }); tx.textContent = f1(v); s.append(tx); }
  for (const side of [0, 1]) { let d = `M${xx(0)} ${yy(0)}`; const col = tcol(X0, side); const marks = [];
    for (const sh of r.shots.filter(x => x.s === side).sort((a, b) => minOf(a.m) - minOf(b.m))) { const m = minOf(sh.m); d += `H${xx(m)}`; cum[side] += sh.xg; d += `V${yy(cum[side])}`; marks.push([m, cum[side], sh]); }
    d += `H${xx(maxM)}`; s.append(sv('path', { d, fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
    for (const [m, v, sh] of marks) { const p = t.players[sh.p]; s.append(tip(sv('circle', { cx: xx(m), cy: yy(v), r: sh.o === 'goal' ? 5.5 : 2.6, fill: sh.o === 'goal' ? col : '#12171a', stroke: sh.o === 'goal' ? '#fff' : col, 'stroke-width': 1.3 }), `${sh.m}' ${p ? p.name : ''} · xG ${f2(sh.xg)} · ${{ goal: '골', save: '선방', block: '블록', miss: '빗나감', post: '골대' }[sh.o] || sh.o}`)); } }
  return s;
}
function flowChart(X0) {
  const { dt } = X0; if (!dt || !dt.flow.length) return null; const n = dt.flow.length; const W = 640, H = 150, L = 34, mid = 70, bw = (W - L - 10) / n;
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rv-chart', role: 'img', 'aria-label': '5분 단위 경기 흐름' });
  s.append(sv('line', { x1: L, y1: mid, x2: W - 10, y2: mid, stroke: 'rgba(255,255,255,.25)' }));
  dt.flow.forEach((b, i) => { const tot = b[0][0] + b[1][0] || 1; const d = (b[0][0] - b[1][0]) / tot; const xg0 = b[0][2], xg1 = b[1][2]; const v = clamp(d * .6 + (xg0 - xg1) * 1.6, -1, 1); const side = v >= 0 ? 0 : 1; const hh = Math.abs(v) * 52 + 2; const x = L + i * bw + 2;
    s.append(tip(sv('rect', { x, y: side === 0 ? mid - hh : mid, width: bw - 4, height: hh, rx: 2, fill: tcol(X0, side), opacity: .85 }), `${i * 5}~${i * 5 + 5}분 · 점유 ${pc(b[0][0], tot)}% : ${pc(b[1][0], tot)}% · 슈팅 ${b[0][1]} : ${b[1][1]} · xG ${f2(xg0)} : ${f2(xg1)}`));
    for (const sd of [0, 1]) for (let k = 0; k < Math.min(4, b[sd][1]); k++) s.append(sv('circle', { cx: x + (bw - 4) / 2 + (k - (Math.min(4, b[sd][1]) - 1) / 2) * 5, cy: sd === 0 ? 8 : H - 22, r: 2, fill: tcol(X0, sd) }));
    if (i % 3 === 0) { const tx = sv('text', { x: x + (bw - 4) / 2, y: H - 5, 'text-anchor': 'middle', class: 'rv-ax' }); tx.textContent = (i * 5) + "'"; s.append(tx); } });
  const l0 = sv('text', { x: 2, y: 26, class: 'rv-ax' }); l0.textContent = X0.teams[0].short; const l1 = sv('text', { x: 2, y: H - 34, class: 'rv-ax' }); l1.textContent = X0.teams[1].short; s.append(l0, l1);
  return s;
}
function verdictBox(v) {
  const li = (arr, cls, empty) => arr.length ? arr.map(([k, d]) => h('div', { class: 'rv-vd ' + cls }, h('b', null, k), h('span', null, d))) : [h('div', { class: 'hint' }, empty)];
  return h('div', { class: 'dx-two' }, h('div', { class: 'stack' }, h('div', { class: 'rv-vh good' }, '잘된 점'), ...li(v.good, 'good', '수치상 특별히 두드러진 강점은 없었습니다.')), h('div', { class: 'stack' }, h('div', { class: 'rv-vh bad' }, '아쉬운 점'), ...li(v.bad, 'bad', '수치상 특별히 두드러진 약점은 없었습니다.')));
}
function tabSum(X0) {
  const fl = flowChart(X0);
  return h('div', { class: 'stack' },
    panel('내 팀 평가', h('span', { class: 'dim' }, '이 경기 기록을 대회 전체 평균과 비교한 결과'), verdictBox(teamVerdict(X0, X0.my))),
    h('div', { class: 'dx-two' }, panel('팀 기록 비교', null, cmpBars(X0)), h('div', { class: 'stack' }, panel('누적 xG', h('span', { class: 'dim' }, '큰 점 = 골'), xgTimeline(X0)), fl ? panel('경기 흐름', h('span', { class: 'dim' }, '5분 단위 · 막대가 위면 홈, 아래면 원정 우세 · 점 = 슈팅'), fl) : null)),
    panel(`${X0.teams[1 - X0.my].name} 평가`, null, verdictBox(teamVerdict(X0, 1 - X0.my))));
}

// ---------- 2. 팀 지표 비교 (4분면) ----------
const QUADS = [
  ['atk', '공격 효율', '경기당 슈팅', '득점 전환율 (%)', x => x.sh / x.p, x => x.sh ? x.gf / x.sh * 100 : 0, ['적게 쏘고 잘 넣음', '많이 쏘고 잘 넣음', '적게 쏘고 못 넣음', '많이 쏘지만 낭비'], (r, s) => [r.st[s].sh, r.st[s].sh ? r.score[s] / r.st[s].sh * 100 : 0], 1],
  ['qual', '슈팅 품질', '경기당 xG', '슈팅당 xG', x => x.xg / x.p, x => x.sh ? x.xg / x.sh : 0, ['기회는 적지만 질이 높음', '많은 기회 · 높은 질', '기회도 질도 부족', '기회는 많지만 질이 낮음'], (r, s) => [r.xg[s], r.st[s].sh ? r.xg[s] / r.st[s].sh : 0], 1],
  ['pass', '패스', '경기당 패스', '패스 성공률 (%)', x => x.ps / x.p, x => pc(x.pk, x.ps), ['적지만 정확', '많고 정확 (점유형)', '적고 부정확', '많지만 부정확'], (r, s) => [r.st[s].ps, pc(r.st[s].pk, r.st[s].ps)], 1],
  ['def', '수비 활동', '경기당 태클 + 가로채기', '경기당 실점 (낮을수록 좋음)', x => (x.tkl + x.int) / x.p, x => x.ga / x.p, ['조용하지만 실점 많음', '바쁘지만 실점 많음', '조용하고 단단함', '적극적이고 단단함'], (r, s) => [r.st[s].tkl + r.st[s].int, r.score[1 - s]], 3],
  ['xga', '실점 억제', '경기당 허용 xG', '경기당 실점 (낮을수록 좋음)', x => x.xga / x.p, x => x.ga / x.p, ['기회는 덜 주는데 실점 많음 (불운·GK)', '많이 내주고 많이 실점', '기회를 안 주고 실점도 적음', '많이 내주지만 잘 버팀'], (r, s) => [r.xg[1 - s], r.score[1 - s]], 2],
  ['tkl', '태클', '경기당 태클 시도', '태클 성공률 (%)', x => x.tkl / x.p, x => pc(x.tkw, x.tkl), ['신중하고 정확', '적극적이고 정확', '소극적이고 부정확', '무리한 태클 많음'], (r, s) => [r.st[s].tkl, pc(r.st[s].tkw, r.st[s].tkl)], 1],
  ['ctrl', '주도권', '평균 점유율 (%)', '경기당 xG 차이', x => x.poss / x.p, x => (x.xg - x.xga) / x.p, ['공 없이도 우세 (역습형)', '점유하고 우세', '공도 기회도 내줌', '점유하지만 실속 없음'], (r, s) => [s === 0 ? r.poss : 100 - r.poss, r.xg[s] - r.xg[1 - s]], 1],
  ['disc', '규율', '경기당 파울', '경기당 카드', x => x.fl / x.p, x => (x.yc + x.rc * 2) / x.p, ['파울은 적은데 카드 많음', '거칠고 카드도 많음', '깨끗한 팀', '파울은 많지만 카드는 적음'], (r, s) => [r.st[s].fl, r.st[s].yc + r.st[s].rc * 2], 2]
];
function quadChart(X0, q) {
  const { t, r, my, ms } = X0; const [, , xl, yl, fx, fy, ql, fm, gq] = q;
  const TM = C.stats(t).TM.filter(x => x.p > 0); const pts = TM.map(x => ({ m: x.m, x: fx(x), y: fy(x) }));
  if (pts.length < 2) return h('div', { class: 'hint' }, '비교할 팀 기록이 아직 부족합니다. 경기가 더 진행되면 표시됩니다.');
  const cur = fm(r, my); const xs = pts.map(p => p.x).concat(cur[0]), ys = pts.map(p => p.y).concat(cur[1]);
  const rng = a => { let lo = Math.min(...a), hi = Math.max(...a); if (hi - lo < 1e-6) { hi += 1; lo -= 1; } const pd = (hi - lo) * .1; return [lo - pd, hi + pd]; };
  const med = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const [x0, x1] = rng(xs), [y0, y1] = rng(ys); const mx = med(pts.map(p => p.x)), my0 = med(pts.map(p => p.y));
  const W = 680, H = 430, L = 52, R0 = 16, Tp = 16, B = 44; const xx = v => L + (W - L - R0) * (v - x0) / (x1 - x0), yy = v => H - B - (H - B - Tp) * (v - y0) / (y1 - y0);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rv-chart rv-quad', role: 'img', 'aria-label': `${xl} 대 ${yl} 4분면 그래프` });
  // 좋은 쪽 사분면을 옅게 칠함
  { const right = gq === 1 || gq === 3, top = gq === 0 || gq === 1; s.append(sv('rect', { x: right ? xx(mx) : L, y: top ? Tp : yy(my0), width: right ? W - R0 - xx(mx) : xx(mx) - L, height: top ? yy(my0) - Tp : H - B - yy(my0), fill: 'rgba(90,200,140,.08)' })); }
  s.append(sv('rect', { x: L, y: Tp, width: W - L - R0, height: H - B - Tp, fill: 'none', stroke: 'rgba(255,255,255,.18)' }));
  s.append(sv('line', { x1: xx(mx), y1: Tp, x2: xx(mx), y2: H - B, stroke: 'rgba(255,255,255,.35)', 'stroke-dasharray': '4 4' }), sv('line', { x1: L, y1: yy(my0), x2: W - R0, y2: yy(my0), stroke: 'rgba(255,255,255,.35)', 'stroke-dasharray': '4 4' }));
  const dec = v => Math.abs(v) >= 20 ? Math.round(v) : Math.abs(v) >= 2 ? f1(v) : f2(v);
  for (let k = 0; k <= 4; k++) { const vx = x0 + (x1 - x0) * k / 4, vy = y0 + (y1 - y0) * k / 4; const a = sv('text', { x: xx(vx), y: H - B + 14, 'text-anchor': 'middle', class: 'rv-ax' }); a.textContent = dec(vx); const b = sv('text', { x: L - 6, y: yy(vy) + 4, 'text-anchor': 'end', class: 'rv-ax' }); b.textContent = dec(vy); s.append(a, b); }
  const xt = sv('text', { x: (L + W - R0) / 2, y: H - 8, 'text-anchor': 'middle', class: 'rv-axt' }); xt.textContent = xl + ' →'; const yt = sv('text', { x: 13, y: (Tp + H - B) / 2, 'text-anchor': 'middle', class: 'rv-axt', transform: `rotate(-90 13 ${(Tp + H - B) / 2})` }); yt.textContent = yl + ' →'; s.append(xt, yt);
  const qp = [[L + 6, Tp + 14, 'start'], [W - R0 - 6, Tp + 14, 'end'], [L + 6, H - B - 7, 'start'], [W - R0 - 6, H - B - 7, 'end']]; ql.forEach((txt, i) => { const e = sv('text', { x: qp[i][0], y: qp[i][1], 'text-anchor': qp[i][2], class: 'rv-ql' }); e.textContent = txt; s.append(e); });
  const opp = ms[1 - my];
  for (const p of pts.sort((a, b) => (a.m === ME) - (b.m === ME))) { const team = tm(p.m); const cx = xx(p.x), cy = yy(p.y); const mine = p.m === ME, isOpp = p.m === opp; const g = sv('g', {});
    if (mine || isOpp) g.append(sv('circle', { cx, cy, r: 17, fill: mine ? 'rgba(242,193,78,.16)' : 'rgba(127,180,255,.14)', stroke: mine ? 'var(--gold)' : '#7fb4ff', 'stroke-width': 1.6 }));
    if (team.club && LOGO[team.club]) g.append(sv('image', { href: LOGO[team.club], x: cx - 11, y: cy - 11, width: 22, height: 22 }));
    else { g.append(sv('circle', { cx, cy, r: 10, fill: team.color1, stroke: team.color2, 'stroke-width': 1.5 })); const tx = sv('text', { x: cx, y: cy + 3, 'text-anchor': 'middle', class: 'rv-pt' }); tx.textContent = team.short.slice(0, 3); g.append(tx); }
    if (mine || isOpp) { const lb = sv('text', { x: cx, y: cy - 21, 'text-anchor': 'middle', class: 'rv-ptl' }); lb.textContent = mine ? '내 팀 (대회 평균)' : '직전 상대'; g.append(lb); }
    tip(g, `${team.name} · ${xl} ${dec(p.x)} · ${yl} ${dec(p.y)}`); s.append(g); }
  // 이번 경기의 내 팀 위치
  { const cx = clamp(xx(cur[0]), L, W - R0), cy = clamp(yy(cur[1]), Tp, H - B); const me = pts.find(p => p.m === ME); if (me) s.append(sv('line', { x1: xx(me.x), y1: yy(me.y), x2: cx, y2: cy, stroke: 'var(--gold)', 'stroke-width': 1.2, 'stroke-dasharray': '2 3' }));
    s.append(tip(sv('path', { d: `M${cx} ${cy - 9}L${cx + 9} ${cy}L${cx} ${cy + 9}L${cx - 9} ${cy}Z`, fill: 'var(--gold)', stroke: '#111', 'stroke-width': 1.2 }), `이번 경기 · ${xl} ${dec(cur[0])} · ${yl} ${dec(cur[1])}`)); const lb = sv('text', { x: cx, y: cy + 22, 'text-anchor': 'middle', class: 'rv-ptl' }); lb.textContent = '이번 경기'; s.append(lb); }
  return s;
}
function tabQuad(X0) {
  const q = QUADS.find(x => x[0] === U.rvQ) || QUADS[0];
  return h('div', { class: 'stack' }, panel('팀 지표 비교', h('span', { class: 'dim' }, '점선 = 대회 중앙값 · ◆ = 이번 경기의 내 팀'),
    h('div', { class: 'dx-chips', style: { marginBottom: '10px' } }, ...QUADS.map(x => h('button', { class: 'dx-chipbtn' + (x[0] === q[0] ? ' on' : ''), onclick: () => { U.rvQ = x[0]; TL.render(); } }, x[1]))),
    quadChart(X0, q),
    h('div', { class: 'hint', style: { marginTop: '8px' } }, '각 점은 대회에 참가한 팀의 경기당 평균입니다. 옅은 초록 영역이 좋은 쪽입니다. 팀 엠블럼에 마우스를 올리면 수치가 보입니다.')));
}

// ---------- 3. 히트맵 · 평균 위치 ----------
// 히트맵은 base64(0~255) 또는 예전 저장분의 숫자 배열
function hmOf(dt, id) { const v = dt.hm[id]; if (!v) return null; if (typeof v !== 'string') return v; const s = atob(v); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function teamHeat(X0, s) { const { dt, r } = X0; const n = dt.hw[0] * dt.hw[1]; const sum = new Float32Array(n); for (const p of r.players) if (p.side === s && p.code !== 'GK' && dt.hm[p.id]) { const a = hmOf(dt, p.id); for (let i = 0; i < n; i++) sum[i] += a[i]; } return sum; }
function network(X0, s) {
  const { dt, r, t } = X0; const col = tcol(X0, s); const svg = pitch('', { label: '평균 위치와 패스 연결' });
  const ids = r.xi[s].map(x => x[0]).filter(id => dt.pos[id]); const set = new Set(ids); const pair = {}, cnt = {};
  for (const p of dt.pass) { if (p[0] !== s || !p[7]) continue; cnt[p[1]] = (cnt[p[1]] || 0) + 1; if (p[8] != null && set.has(p[1]) && set.has(p[8])) { const k = p[1] < p[8] ? p[1] + '|' + p[8] : p[8] + '|' + p[1]; pair[k] = (pair[k] || 0) + 1; } }
  const mx = Math.max(1, ...Object.values(pair));
  for (const k in pair) { if (pair[k] < 3) continue; const [a, b] = k.split('|'); const A = dt.pos[a], B = dt.pos[b]; svg.append(tip(sv('line', { x1: X(A[0]), y1: Y(A[1]), x2: X(B[0]), y2: Y(B[1]), stroke: col, 'stroke-width': (.3 + 2.2 * pair[k] / mx).toFixed(2), 'stroke-opacity': (.25 + .6 * pair[k] / mx).toFixed(2), 'stroke-linecap': 'round' }), `${pname(t.players[a])} ↔ ${pname(t.players[b])} · 패스 ${pair[k]}회`)); }
  const mc = Math.max(1, ...ids.map(id => cnt[id] || 0));
  for (const id of ids) { const P = dt.pos[id]; const pr = r.players.find(p => p.id === id); const rad = 2 + 2 * (cnt[id] || 0) / mc; const g = sv('g', { class: 'rv-node', style: 'cursor:pointer' });
    g.append(sv('circle', { cx: X(P[0]), cy: Y(P[1]), r: rad.toFixed(2), fill: col, stroke: String(U.rvPid) === String(id) ? '#fff' : '#0b1512', 'stroke-width': String(U.rvPid) === String(id) ? .8 : .4 })); const tx = sv('text', { x: X(P[0]), y: Y(P[1]) + 1.1, 'text-anchor': 'middle', class: 'rv-nn' }); tx.textContent = pr ? pr.num : ''; g.append(tx);
    const nm = sv('text', { x: X(P[0]), y: Y(P[1]) + rad + 2.6, 'text-anchor': 'middle', class: 'rv-nl' }); nm.textContent = pname(t.players[id]); g.append(nm); tip(g, `${t.players[id].name} · 성공한 패스 ${cnt[id] || 0}회 — 눌러서 개인 히트맵`); g.addEventListener('click', () => { U.rvPid = id; TL.render(); }); svg.append(g); }
  return svg;
}
const sideSeg = X0 => seg([[0, X0.teams[0].name], [1, X0.teams[1].name]], U.rvSide == null ? X0.my : U.rvSide, v => { U.rvSide = v; U.rvPid = null; TL.render(); });
const needDt = () => h('div', { class: 'hint' }, '이 경기는 히트맵·패스 기록이 저장되지 않았습니다(이 기능이 생기기 전에 치른 경기). 요약·슈팅·선수 기록은 볼 수 있습니다.');
function tabHeat(X0) {
  const { dt, r, t } = X0; if (!dt) return panel('히트맵 · 위치', null, needDt());
  const s = U.rvSide == null ? X0.my : U.rvSide; const rows = plRows(X0, s); const p = U.rvPid != null ? rows.find(x => String(x.id) === String(U.rvPid)) : null; const pid = p ? p.id : null;
  return h('div', { class: 'stack' },
    h('div', { class: 'dx-two' }, panel(`${X0.teams[0].name} 팀 히트맵`, h('span', { class: 'dim' }, '공격 방향 →'), TL.heatmapSVG(teamHeat(X0, 0), { label: '홈 팀 히트맵' })), panel(`${X0.teams[1].name} 팀 히트맵`, h('span', { class: 'dim' }, '공격 방향 →'), TL.heatmapSVG(teamHeat(X0, 1), { label: '원정 팀 히트맵' }))),
    panel('평균 위치 · 패스 연결망', sideSeg(X0), h('div', { class: 'dx-two' }, h('div', null, network(X0, s), h('div', { class: 'hint' }, '원 크기 = 성공한 패스 수, 선 굵기 = 두 선수 사이 패스 횟수(3회 이상). 선수를 누르면 오른쪽에 개인 히트맵이 나옵니다.')),
      h('div', { class: 'stack' }, h('div', { class: 'row' }, h('span', { class: 'lbl' }, '선수'), sel([['', '선수 선택']].concat(rows.map(x => [x.id, `${x.num}. ${pname(x.d)}`])), pid || '', v => { U.rvPid = v || null; TL.render(); })),
        p && dt.hm[p.id] ? h('div', null, head(`${p.d.name} 히트맵`, `${p.min}분 · 평점 ${p.rt ? p.rt.toFixed(1) : '-'}`), TL.heatmapSVG(hmOf(dt, p.id), { label: p.d.name + ' 히트맵' })) : h('div', { class: 'hint' }, '선수를 고르면 개인 히트맵이 표시됩니다.')))));
}

// ---------- 4. 패스맵 ----------
const PF = [['all', '전체'], ['ok', '성공'], ['fail', '실패'], ['prog', '전진 패스'], ['fin', '파이널 서드 진입'], ['box', '박스 투입'], ['cross', '크로스'], ['long', '롱패스'], ['thr', '스루패스']];
const pfTest = { all: () => true, ok: p => p[7], fail: p => !p[7], prog: p => p[4] - p[2] >= 10, fin: p => p[2] <= 17.5 && p[4] > 17.5, box: p => p[2] <= 36 && p[4] > 36 && Math.abs(p[5]) < 20.2, cross: p => p[6] === 3, long: p => Math.hypot(p[4] - p[2], p[5] - p[3]) >= 30, thr: p => p[6] === 2 };
function tabPass(X0) {
  const { dt, t } = X0; if (!dt) return panel('패스맵', null, needDt());
  const s = U.rvSide == null ? X0.my : U.rvSide; const rows = plRows(X0, s); const pp0 = U.rvPid != null ? rows.find(x => String(x.id) === String(U.rvPid)) : null; const pid = pp0 ? pp0.id : null; const fk = pfTest[U.rvPf] ? U.rvPf : 'all';
  const base = dt.pass.filter(p => p[0] === s && (!pid || p[1] === pid)); const list = base.filter(pfTest[fk]); const col = tcol(X0, s);
  const svg = pitch('', { label: '패스맵' }); const many = list.length > 260;
  for (const p of list) { const ok = p[7]; svg.append(tip(sv('line', { x1: X(p[2]), y1: Y(p[3]), x2: X(p[4]), y2: Y(p[5]), stroke: ok ? col : '#ff6b6b', 'stroke-width': many ? .22 : .35, 'stroke-opacity': ok ? (many ? .42 : .7) : .6, 'stroke-linecap': 'round' }), `${pname(t.players[p[1]])}${p[8] ? ' → ' + pname(t.players[p[8]]) : ''} · ${KIND[p[6]]} · ${ok ? '성공' : '실패'}`)); svg.append(sv('circle', { cx: X(p[4]), cy: Y(p[5]), r: many ? .45 : .7, fill: ok ? col : '#ff6b6b', 'fill-opacity': .85 })); }
  const n = base.length, ok = base.filter(p => p[7]); const cntOf = k => { const a = base.filter(pfTest[k]); return [a.filter(p => p[7]).length, a.length]; };
  const dir = [base.filter(p => p[4] - p[2] > 5).length, base.filter(p => Math.abs(p[4] - p[2]) <= 5).length, base.filter(p => p[4] - p[2] < -5).length];
  const third = [base.filter(p => p[2] < -17.5).length, base.filter(p => p[2] >= -17.5 && p[2] <= 17.5).length, base.filter(p => p[2] > 17.5).length];
  const split = (title, vals, labels, cols) => { const tot = vals.reduce((a, b) => a + b, 0) || 1; return h('div', { class: 'rv-split' }, h('div', { class: 'lbl' }, title), h('div', { class: 'bar' }, ...vals.map((v, i) => h('i', { style: { width: (v / tot * 100) + '%', background: cols[i] }, title: `${labels[i]} ${v}회 (${pc(v, tot)}%)` }, v / tot > .1 ? pc(v, tot) + '%' : ''))), h('div', { class: 'lg' }, ...labels.map((l, i) => h('span', null, h('i', { style: { background: cols[i] } }), l)))); };
  const kinds = [0, 1, 2, 3].map(k => base.filter(p => p[6] === k).length);
  return h('div', { class: 'stack' }, panel('패스맵', sideSeg(X0),
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px', marginBottom: '8px' } }, h('span', { class: 'lbl' }, '선수'), sel([['', '팀 전체']].concat(rows.map(x => [x.id, `${x.num}. ${pname(x.d)}`])), pid || '', v => { U.rvPid = v || null; TL.render(); }), h('div', { class: 'dx-chips' }, ...PF.map(([k, l]) => h('button', { class: 'dx-chipbtn' + (k === fk ? ' on' : ''), onclick: () => { U.rvPf = k; TL.render(); } }, l)))),
    h('div', { class: 'rv-passgrid' }, h('div', null, svg, h('div', { class: 'hint' }, `표시 ${list.length}개 · 공격 방향 → · 빨간 선 = 실패한 패스. 선에 마우스를 올리면 누가 누구에게 준 패스인지 보입니다.`)),
      h('div', { class: 'stack' }, h('div', { class: 'rv-boxes' }, box(n, '패스 시도'), box(pc(ok.length, n) + '%', '성공률'), box(cntOf('prog')[0], '전진 패스 성공'), box(cntOf('fin')[0], '파이널 서드 진입'), box(cntOf('box')[0], '박스 투입 성공'), box(cntOf('cross').join('/'), '크로스 성공/시도'), box(cntOf('long').join('/'), '롱패스 성공/시도'), box(cntOf('thr').join('/'), '스루패스 성공/시도')),
        split('패스 방향', dir, ['전진', '횡패스', '후방'], ['#5ac88c', '#8a96a3', '#c98a5a']), split('패스를 시작한 지역', third, ['수비 진영', '중원', '공격 진영'], ['#5a8ac8', '#8a96a3', '#e0a84e']), split('패스 종류', kinds, ['짧은 패스', '롱패스', '스루패스', '크로스'], ['#8a96a3', '#5a8ac8', '#b07ae0', '#e0a84e'])))));
}

// ---------- 5. 슈팅 ----------
function tabShot(X0) {
  const { r, t } = X0; const OUT = { goal: '골', save: '선방', block: '블록', miss: '빗나감', post: '골대' }, OC = { goal: '#5ac88c', save: '#5a8ac8', block: '#8a96a3', miss: '#c96a5a', post: '#e0a84e' }; const TY = { normal: '일반', long: '중거리', finesse: '감아차기', header: '헤더', volley: '발리', freekick: '프리킥', penalty: '페널티킥' };
  const map = s => { const svg = pitch('', { half: true, label: '슈팅 위치', noArrow: true }); for (const sh of r.shots.filter(x => x.s === s)) { const p = t.players[sh.p]; const goal = sh.o === 'goal'; svg.append(tip(sv('circle', { cx: X(sh.x), cy: Y(sh.y), r: (1 + Math.sqrt(sh.xg) * 3.4).toFixed(2), fill: goal ? OC.goal : 'transparent', stroke: goal ? '#fff' : OC[sh.o] || '#fff', 'stroke-width': .45 }), `${sh.m}' ${p ? p.name : ''} · ${TY[sh.t] || sh.t} · xG ${f2(sh.xg)} · ${OUT[sh.o] || sh.o}`)); } return svg; };
  const outBar = s => { const list = r.shots.filter(x => x.s === s); const tot = list.length || 1; return h('div', { class: 'rv-split' }, h('div', { class: 'bar' }, ...Object.keys(OUT).map(k => { const n = list.filter(x => x.o === k).length; return n ? h('i', { style: { width: (n / tot * 100) + '%', background: OC[k] }, title: `${OUT[k]} ${n}` }, n) : null; })), h('div', { class: 'lg' }, ...Object.keys(OUT).map(k => h('span', null, h('i', { style: { background: OC[k] } }), OUT[k])))); };
  const byP = s => { const m = {}; for (const sh of r.shots.filter(x => x.s === s)) { const o = m[sh.p] || (m[sh.p] = { id: sh.p, n: 0, xg: 0, g: 0 }); o.n++; o.xg += sh.xg; if (sh.o === 'goal') o.g++; } const arr = Object.values(m).sort((a, b) => b.xg - a.xg).slice(0, 8); const mx = Math.max(.3, ...arr.map(o => o.xg));
    return h('div', { class: 'rv-hbars' }, ...arr.map(o => h('div', { class: 'r' }, TL.pl(pname(t.players[o.id]), o.id), h('div', { class: 'b' }, h('i', { style: { width: (o.xg / mx * 100) + '%', background: tcol(X0, s) } })), h('span', { class: 'num' }, `${f2(o.xg)} · ${o.n}슛${o.g ? ` · ${o.g}골` : ''}`)))); };
  const col = s => { const list = r.shots.filter(x => x.s === s); const inBox = list.filter(x => x.x > 36 && Math.abs(x.y) < 20.2).length;
    return panel(X0.teams[s].name, h('span', { class: 'dim' }, '원 크기 = xG · 초록 = 골'), map(s), h('div', { class: 'rv-boxes four', style: { margin: '10px 0' } }, box(list.length, '슈팅'), box(r.st[s].sot, '유효 슈팅'), box(f2(r.xg[s]), 'xG'), box(list.length ? f2(r.xg[s] / list.length) : '-', '슈팅당 xG'), box(inBox, '박스 안'), box(list.length - inBox, '박스 밖'), box(list.filter(x => x.t === 'header').length, '헤더'), box(r.score[s], '골')), outBar(s), h('div', { class: 'lbl', style: { margin: '10px 0 4px' } }, '선수별 xG'), byP(s)); };
  return h('div', { class: 'stack' }, h('div', { class: 'dx-two' }, col(0), col(1)),
    panel('슈팅 전체 목록', null, h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table tight' }, h('thead', null, h('tr', null, ...['시간', '팀', '선수', '종류', '거리', 'xG', '결과'].map(x => h('th', null, x)))), h('tbody', null, ...r.shots.slice().sort((a, b) => minOf(a.m) - minOf(b.m)).map(sh => h('tr', null, h('td', { class: 'num' }, sh.m + "'"), h('td', null, U.tlogo ? U.tlogo(X0.ms[sh.s]) : X0.teams[sh.s].short), h('td', null, TL.pl(pname(t.players[sh.p]), sh.p)), h('td', null, TY[sh.t] || sh.t), h('td', { class: 'num' }, Math.round(Math.hypot(52.5 - sh.x, sh.y)) + 'm'), h('td', { class: 'num' }, f2(sh.xg)), h('td', null, h('span', { class: 'dx-chip' + (sh.o === 'goal' ? ' good' : '') }, OUT[sh.o] || sh.o)))))))));
}

// ---------- 6. 선수별 ----------
function tabPlayers(X0) {
  const { dt } = X0; const s = U.rvSide == null ? X0.my : U.rvSide; const rows = plRows(X0, s); const col = tcol(X0, s);
  const card = p => { const v = plVerdict(X0, p), e = p.ex, pp = plPass(X0, p.id);
    return h('div', { class: 'rv-pc' + (X0.r.motm === p.id ? ' motm' : '') }, h('div', { class: 'rv-pch' }, badge(X0.teams[p.side], 'xs'), h('span', { class: 'num dim' }, p.num), TL.pl(p.d ? p.d.name : '', p.id), posTag(p.code), h('span', { class: 'dim' }, p.min + '분' + (p.start ? '' : ' · 교체')), X0.r.motm === p.id ? h('span', { class: 'dx-chip gold' }, 'MOM') : null, h('span', { style: { marginLeft: 'auto' } }, rt(p.rt))),
      h('div', { class: 'rv-pcb' }, octa(octaVals(X0, p), col),
        h('div', { class: 'stack', style: { gap: '6px', minWidth: 0 } }, h('div', { class: 'rv-mini' }, ...[['골', p.g], ['도움', p.a], ['슈팅', `${p.sh} (${p.sot})`], ['xG', f2(p.xg)], ['키패스', p.kp], ['패스', p.ps ? `${p.pk}/${p.ps}` : '-'], ['드리블', p.drb], ['태클', `${p.tkw}/${p.tkl}`], ['가로채기', p.int], dt ? ['볼 회수', e.rec || 0] : null, dt ? ['공중볼', e.aer || 0] : null, dt ? ['빼앗김', e.lost || 0] : null, pp ? ['전진 패스', pp.prog] : null, ['거리', p.dist + 'km'], dt && e.en != null ? ['종료 체력', e.en + '%'] : null, p.code === 'GK' ? ['선방', p.sav] : null].filter(Boolean).map(([l, x]) => h('span', null, h('i', null, l), h('b', null, x)))),
          h('div', { class: 'dx-chips' }, ...v.good.map(x => h('span', { class: 'dx-chip good' }, '▲ ' + x)), ...v.bad.map(x => h('span', { class: 'dx-chip bad' }, '▼ ' + x)), !v.good.length && !v.bad.length ? h('span', { class: 'dim' }, '두드러진 기록 없음') : null))));
  };
  return h('div', { class: 'stack' }, panel('선수별 평가', sideSeg(X0), h('div', { class: 'hint', style: { marginBottom: '10px' } }, '팔각형은 이 경기에서의 활약을 항목별 0~99로 환산한 것입니다(능력치가 아니라 경기 기록 기준). ▲ 잘한 점, ▼ 부족했던 점. 이름을 누르면 선수 능력치 창이 열립니다.'), h('div', { class: 'rv-pcs' }, ...rows.map(card))));
}

// ---------- 화면 ----------
const TABS = [['sum', '개요', tabSum], ['quad', '팀 지표 비교', tabQuad], ['heat', '히트맵 · 위치', tabHeat], ['pass', '패스맵', tabPass], ['shot', '슈팅', tabShot], ['pl', '선수별 평가', tabPlayers]];
function viewReview() {
  const X0 = ctxOf(); const w = h('div', { class: 'wrap rv' });
  if (!X0) { w.append(h('h1', null, '경기 분석'), h('p', { class: 'hint' }, '아직 치른 경기가 없습니다. 첫 경기를 마치면 여기에서 히트맵, 패스맵, 팀 지표 비교, 선수별 평가를 볼 수 있습니다.')); return w; }
  const { f, r, teams, t } = X0; const tab = TABS.find(x => x[0] === U.rvTab) || TABS[0]; const d = t.days.find(x => x.fx.includes(f.i));
  const scorers = s => r.goals.filter(g => g.side === s).map(g => `${g.name}${g.own ? ' (자책)' : ''} ${g.min}'`).join(' · ');
  const li = X0.list.findIndex(x => x.i === f.i); const lab = x => { const dd = t.days.find(y => y.fx.includes(x.i)); const s = x.h === ME ? 0 : 1; const res = x.r.w === s ? '승' : x.r.w === -1 ? '무' : '패'; return `${dd ? dd.label : ''} · ${x.h === ME ? 'vs' : '@'} ${tm(x.h === ME ? x.a : x.h).name} ${x.r.score[s]}-${x.r.score[1 - s]} (${res})${t.reviews && t.reviews[x.i] ? '' : ' · 요약만'}`; };
  const pick = i => { U.rvFx = X0.list[i].i; U.rvPid = null; TL.render(); };
  w.append(h('div', { class: 'rv-top' }, h('div', { class: 'row', style: { justifyContent: 'center', flexWrap: 'wrap', gap: '8px' } }, h('button', { class: 'btn sm', disabled: li <= 0, onclick: () => pick(li - 1) }, '◀ 이전 경기'), sel(X0.list.map((x, i) => [String(i), lab(x)]).reverse(), String(li), v => pick(+v), 'rvsel'), h('button', { class: 'btn sm', disabled: li >= X0.list.length - 1, onclick: () => pick(li + 1) }, '다음 경기 ▶')),
    h('div', { class: 'lbl' }, `경기 분석 · ${d ? d.label : ''} · 저장된 경기 ${X0.list.length}개`),
    h('div', { class: 'rv-score' }, h('div', { class: 'tm' }, badge(teams[0], 'lg'), h('div', null, h('b', null, U.tn ? U.tn(X0.ms[0]) : teams[0].name), h('span', { class: 'dim' }, `${r.form[0]} · xG ${f2(r.xg[0])}`))), h('div', { class: 'sc' }, h('b', null, `${r.score[0]} - ${r.score[1]}`), r.pen ? h('span', { class: 'dim' }, `승부차기 ${r.pen[0]}-${r.pen[1]}`) : r.et ? h('span', { class: 'dim' }, '연장') : null), h('div', { class: 'tm r' }, h('div', null, h('b', null, U.tn ? U.tn(X0.ms[1]) : teams[1].name), h('span', { class: 'dim' }, `${r.form[1]} · xG ${f2(r.xg[1])}`)), badge(teams[1], 'lg'))),
    h('div', { class: 'rv-gl' }, h('span', null, scorers(0)), h('span', null, scorers(1))),
    h('div', { class: 'row', style: { justifyContent: 'center', flexWrap: 'wrap' } }, h('button', { class: 'btn primary', onclick: () => TL.go('m_tactics') }, '전술 수정하러 가기'), h('button', { class: 'btn', onclick: () => U.matchModal(f) }, '경기 상세 · 다시 보기'), h('button', { class: 'btn', onclick: () => TL.go('m_squad') }, '스쿼드'))),
    h('div', { class: 'rv-tabs', role: 'tablist' }, ...TABS.map(x => h('button', { class: 'dx-chipbtn' + (x[0] === tab[0] ? ' on' : ''), role: 'tab', 'aria-selected': String(x[0] === tab[0]), onclick: () => { U.rvTab = x[0]; TL.render(); } }, x[1]))),
    tab[2](X0));
  return w;
}
U.octa = octa; U.viewReview = viewReview; U.hasReview = () => !!ctxOf();
})(window);
