// ===== DRAFT XI — 화면 2: 대회 허브, 경기 진행, 스쿼드·전술·일정·순위·기록·드래프트 보드, 경기 상세, 선수 프로필 =====
(function (G) {
'use strict';
const TL = G.TL, C = G.DXC, D = G.FMDATA, E = G.FMEngine, U = G.DXU;
if (!TL || !C || !U) return;
const { h, $, S, modal, closeModal, toast, seg, sel, ovrClass, ink, confirmBox } = TL;
const { ME, T, persist, posTag, ovrB, flag, crest, badge, rt, pname, panel } = U;
const RUN = { busy: false, total: 0, done: 0 };
const clone = o => JSON.parse(JSON.stringify(o));
const tm = m => T().mgrs[m].team;
const teamEl = (m, cls) => h('span', { class: 'dx-team ' + (cls || '') + (m === ME ? ' me' : '') }, badge(tm(m), 'sm'), h('span', { class: 'tn' }, tm(m).name));
const scoreTxt = r => `${r.score[0]} - ${r.score[1]}`;
const resOf = (f, m) => { const s = f.h === m ? 0 : 1; const r = f.r; return r.w === s ? 'W' : r.w === -1 ? 'D' : 'L'; };
const dayLabel = f => T().days[f.day].label;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

// ---------- 경기 진행 ----------
function updateRun() { const e = $('#dxrun'); if (e) e.textContent = RUN.busy ? `다른 경기 계산 중 ${RUN.done}/${RUN.total}` : ''; const b = $('#dxrunbar'); if (b) b.style.width = (RUN.total ? RUN.done / RUN.total * 100 : 0) + '%'; }
function simOthers(t, skip) {
  const list = t.days[t.day].fx.map(i => t.fx[i]).filter(f => !f.r && f.i !== skip);
  RUN.total = list.length + (skip != null && skip >= 0 ? 0 : 0); RUN.done = 0; RUN.busy = list.length > 0;
  return Promise.all(list.map(f => { const { job } = C.buildJob(t, f); const rp = { hs: TL.packSetup(job.hs), as: TL.packSetup(job.as) }; return TL.simJob(clone(job)).then(res => { C.applyResult(t, f, res, rp); RUN.done++; updateRun(); persist(); }); })).then(() => { RUN.busy = false; updateRun(); });
}
function liveOn(f) { const M = TL.M; return !!(M && !M.ended && U.liveFx === f.i && U.liveTid === T().id); }
function playLive(f) {
  const t = T(); const { job } = C.buildJob(t, f); const side = f.h === ME ? 0 : 1;
  U.pending = simOthers(t, f.i); U.liveFx = f.i; U.liveTid = t.id;
  TL.startMatch({ home: job.home, away: job.away, homeSetup: job.hs, awaySetup: job.as, seed: job.seed, neutral: job.neutral, big: job.big, control: [side], ctx: { type: 'career', fx: f.i, tid: t.id, label: `${t.name} · ${dayLabel(f)}`, back: 'm_home' } });
}
async function playQuick(f) {
  const t = T(); if (RUN.busy) return toast('다른 경기를 계산하는 중입니다.');
  modal(h('div', { class: 'stack' }, h('h2', null, '경기 계산 중'), h('div', { class: 'meter' }, h('i', { id: 'dxrunbar', style: { width: '0%' } })), h('div', { class: 'hint', id: 'dxrun' }, f ? `${tm(f.h).name} vs ${tm(f.a).name}` : '')), true);
  const others = simOthers(t, f ? f.i : -1);
  if (f && !f.r) { const { job } = C.buildJob(t, f); const res = await TL.simJob(clone(job)); C.applyResult(t, f, res, { hs: TL.packSetup(job.hs), as: TL.packSetup(job.as) }); persist(); }
  await others; closeModal(); finishDay();
}
function onMatchDone(ctx, summary, rp) {
  const t = T(); if (!t || ctx.tid !== t.id) return; const f = t.fx[ctx.fx]; if (!f || f.r) return;
  const res = C.applyResult(t, f, summary, { hs: rp.hs, as: rp.as, ops: rp.ops || [], ai: rp.ai });
  ctx.note = C.resultText(t, f) + (res.et ? ' · 연장전과 승부차기는 통계 모델로 계산했습니다.' : '') + ' 결과가 기록되었습니다.';
  persist(); (U.pending || Promise.resolve()).then(() => finishDay());
}
function finishDay() {
  const t = T(); if (!t || t.phase !== 'play' || !C.dayDone(t)) return; const idx = t.day; C.advance(t); persist(); U.showRound = idx; U.fixDay = null;
  if (S.screen.startsWith('m_')) TL.render();
}
function roundModal(idx) {
  const t = T(); const d = t.days[idx]; if (!d) return; const xi = C.bestXI(t, idx);
  const rows = d.fx.map(i => t.fx[i]).map(f => fxRow(f, true));
  const body = h('div', { class: 'stack' }, h('div', { class: 'lbl' }, t.name), h('h2', null, `${d.label} 결과`), h('div', { class: 'dx-fxlist' }, ...rows),
    xi.length ? h('div', null, h('div', { class: 'lbl', style: { margin: '6px 0' } }, '라운드 베스트 11'), h('div', { class: 'dx-xi' }, ...['ATT', 'MID', 'DEF', 'GK'].map(line => h('div', { class: 'ln' }, ...xi.filter(x => x.line === line).map(x => { const p = t.players[x.id]; return h('div', { class: 'xp' + (x.m === ME ? ' me' : '') }, rt(x.rt), h('span', { class: 'n' }, p ? pname(p) : ''), h('span', { class: 'dim' }, tm(x.m).short)); }))))) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { closeModal(); if (t.phase === 'done') champModal(); } }, t.phase === 'done' ? '시상식 보기' : '계속')));
  modal(body, false, 'dxround');
}
function champModal() {
  const t = T(); if (!t || t.phase !== 'done') return; const aw = C.awards(t); const c = t.mgrs[t.champion]; const mine = t.champion === ME;
  const aRow = (label, o, val) => o && t.players[o.id] ? h('div', { class: 'aw' }, h('div', { class: 'lbl' }, label), h('div', { class: 'n' }, pname(t.players[o.id])), h('div', { class: 'dim' }, `${tm(o.m).name} · ${val(o)}`)) : null;
  const conf = h('div', { class: 'dx-confetti', 'aria-hidden': 'true' }, ...Array.from({ length: 36 }, (_, i) => h('i', { style: { left: (i * 2.8 + (i % 3)) + '%', background: [c.team.color1, c.team.color2, '#f2c14e'][i % 3], animationDelay: (i % 9) * .18 + 's', animationDuration: 2.6 + (i % 5) * .35 + 's' } })));
  modal(h('div', { class: 'stack dx-champ' }, conf, h('div', { class: 'lbl' }, `${t.name} · CHAMPIONS`), h('div', { class: 'cup' }, '🏆'), h('h1', null, c.team.name), h('p', { class: 'hint' }, mine ? '축하합니다! 드래프트로 꾸린 팀이 정상에 올랐습니다.' : `${c.name} 감독(${C.STYLES[c.style] ? C.STYLES[c.style].n : ''})의 팀이 우승했습니다.`),
    h('div', { class: 'dx-awards' }, aRow('득점왕', aw.scorer, o => `${o.g}골 ${o.a}도움`), aRow('도움왕', aw.assist, o => `${o.a}도움`), aRow('대회 MVP', aw.mvp, o => `평균 평점 ${o.avg.toFixed(2)}`), aRow('최우수 골키퍼', aw.keeper, o => `클린시트 ${o.cs}회`)),
    h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn', onclick: () => { closeModal(); TL.go('m_stats'); } }, '기록 보기'), h('button', { class: 'btn primary', onclick: () => { closeModal(); U.archiveCur(); U.cfg = null; TL.go('m_new'); } }, '기록 보관 후 새 대회'), h('button', { class: 'btn', onclick: closeModal }, '닫기'))), false, 'dxchamp');
}

// ---------- 경기 한 줄 / 경기 상세 ----------
function fxRow(f, compact) {
  const r = f.r; const mine = f.h === ME || f.a === ME;
  return h('button', { type: 'button', class: 'dx-fx' + (mine ? ' mine' : '') + (r ? '' : ' todo'), onclick: () => r ? matchModal(f) : toast('아직 치르지 않은 경기입니다.') },
    h('span', { class: 'h' }, h('span', { class: 'tn' + (r && r.w === 0 ? ' win' : '') }, tm(f.h).name), badge(tm(f.h), 'sm')),
    h('span', { class: 'sc num' }, r ? h('b', null, scoreTxt(r)) : 'vs', r && r.pen ? h('small', null, `PK ${r.pen[0]}-${r.pen[1]}`) : r && r.et ? h('small', null, '연장') : null),
    h('span', { class: 'a' }, badge(tm(f.a), 'sm'), h('span', { class: 'tn' + (r && r.w === 1 ? ' win' : '') }, tm(f.a).name)),
    !compact ? h('span', { class: 'x dim' }, r ? `xG ${r.xg[0].toFixed(1)}–${r.xg[1].toFixed(1)}` : (f.n ? '중립' : '')) : null);
}
function shotMap(f) {
  const r = f.r, t = T(); const Wd = 105, Hd = 68; const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, at) => { const e = document.createElementNS(svgNS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const svg = mk('svg', { viewBox: `-2 -2 ${Wd + 4} ${Hd + 4}`, class: 'dx-shotmap', role: 'img', 'aria-label': '슈팅 맵' });
  const ln = { fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': .3 };
  svg.append(mk('rect', Object.assign({ x: 0, y: 0, width: Wd, height: Hd, rx: 1 }, ln, { fill: '#0f3d2b' })), mk('line', Object.assign({ x1: Wd / 2, y1: 0, x2: Wd / 2, y2: Hd }, ln)), mk('circle', Object.assign({ cx: Wd / 2, cy: Hd / 2, r: 9.15 }, ln)),
    mk('rect', Object.assign({ x: 0, y: Hd / 2 - 20.16, width: 16.5, height: 40.32 }, ln)), mk('rect', Object.assign({ x: Wd - 16.5, y: Hd / 2 - 20.16, width: 16.5, height: 40.32 }, ln)), mk('rect', Object.assign({ x: 0, y: Hd / 2 - 9.16, width: 5.5, height: 18.32 }, ln)), mk('rect', Object.assign({ x: Wd - 5.5, y: Hd / 2 - 9.16, width: 5.5, height: 18.32 }, ln)));
  for (const s of r.shots) { const team = tm(s.s === 0 ? f.h : f.a); const x = s.s === 0 ? 52.5 + s.x : 52.5 - s.x, y = s.s === 0 ? 34 + s.y : 34 - s.y; const goal = s.o === 'goal';
    const c = mk('circle', { cx: x, cy: y, r: (1 + Math.sqrt(s.xg) * 3.2).toFixed(2), fill: goal ? team.color1 : 'transparent', stroke: goal ? '#fff' : team.color1, 'stroke-width': goal ? .5 : .45, opacity: goal ? 1 : .85 });
    const p = t.players[s.p]; const tt = mk('title', {}); tt.textContent = `${s.m}' ${p ? p.name : ''} · xG ${s.xg.toFixed(2)} · ${{ goal: '골', save: '선방', block: '블록', miss: '빗나감', post: '골대' }[s.o] || s.o}`; c.append(tt); svg.append(c); }
  return svg;
}
function lineupPitch(f, side) {
  const r = f.r, t = T(); const m = side === 0 ? f.h : f.a; const setup = r.rp ? TL.unpackSetup(side === 0 ? r.rp.hs : r.rp.as) : null; const slots = setup ? E.slotsOf(setup) : E.FORMATIONS['4-3-3'];
  const el = h('div', { class: 'dx-pitch lg' }); const by = {}; for (const p of r.players) by[p.id] = p;
  (r.xi[side] || []).forEach(([id, slot]) => { const s = slots[slot]; const p = t.players[id], pr = by[id]; if (!s || !p) return;
    el.append(h('div', { class: 'sl', style: { left: (50 + s[2] * 42) + '%', top: (94 - s[1] * 92) + '%' } }, h('span', { class: 'c rt ' + U.rtCls(pr ? pr.rt : 0) }, pr ? pr.rt.toFixed(1) : '-'), h('span', { class: 'n' }, pname(p), pr && pr.g ? ' ⚽'.repeat(Math.min(3, pr.g)) : '', pr && pr.red ? ' 🟥' : pr && pr.yc ? ' 🟨' : ''))); });
  return h('div', { class: 'stack' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, teamEl(m), h('span', { class: 'dim' }, r.form[side])), el);
}
function pstatTable(f, side) {
  const r = f.r, t = T(); const ps = r.players.filter(p => p.side === side).sort((a, b) => (b.start - a.start) || b.rt - a.rt);
  const cols = [['분', p => p.min], ['골', p => p.g || ''], ['도움', p => p.a || ''], ['슈팅', p => p.sh ? `${p.sh}(${p.sot})` : ''], ['xG', p => p.xg ? p.xg.toFixed(2) : ''], ['키패스', p => p.kp || ''], ['패스', p => p.ps ? `${p.pk}/${p.ps}` : ''], ['태클', p => p.tkl ? `${p.tkw}/${p.tkl}` : ''], ['가로채기', p => p.int || ''], ['드리블', p => p.drb || ''], ['선방', p => p.sav || ''], ['파울', p => p.fl || ''], ['km', p => p.dist]];
  return h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table tight' }, h('thead', null, h('tr', null, h('th', null, tm(side === 0 ? f.h : f.a).short), h('th', null, '평점'), ...cols.map(c => h('th', { class: 'num' }, c[0])))),
    h('tbody', null, ...ps.map(p => { const pl = t.players[p.id]; return h('tr', { class: p.start ? '' : 'sub' }, h('td', null, h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, posTag(p.code), pl ? pname(pl) : p.id, p.yc ? ' 🟨' : '', p.red ? ' 🟥' : '', r.motm === p.id ? h('span', { class: 'dx-chip gold' }, 'MOM') : null)), h('td', null, rt(p.rt)), ...cols.map(c => h('td', { class: 'num' }, c[1](p)))); }))));
}
function matchModal(f) {
  const t = T(), r = f.r; if (!r) return; let tab = U.mTab || 'sum';
  const bar = (label, a, b, fmt) => { const tot = (a + b) || 1; fmt = fmt || (x => x); return h('div', { class: 'dx-bar' }, h('span', { class: 'num v' + (a > b ? ' hi' : '') }, fmt(a)), h('div', { class: 'mid' }, h('div', { class: 'lb' }, label), h('div', { class: 'tr' }, h('i', { style: { width: (a / tot * 100) + '%', background: tm(f.h).color1 } }), h('i', { style: { width: (b / tot * 100) + '%', background: tm(f.a).color1 } }))), h('span', { class: 'num v' + (b > a ? ' hi' : '') }, fmt(b))); };
  const st = r.st; const body = h('div');
  const evs = [].concat(r.goals.map(g => ({ k: 'g', side: g.side, min: g.min, g })), r.cards.map(c => ({ k: 'c', side: c.side, min: c.min, c })), r.subs.map(s => ({ k: 's', side: s.side, min: s.min, s }))).sort((a, b) => parseInt(a.min) - parseInt(b.min));
  const nm = id => t.players[id] ? pname(t.players[id]) : '';
  const evEl = e => { const inner = e.k === 'g' ? h('span', null, '⚽ ', e.g.id && !e.g.own ? nm(e.g.id) : e.g.name, e.g.own ? h('span', { class: 'dim' }, ' (자책골)') : null, e.g.ast ? h('span', { class: 'dim' }, ' 도움 ', nm(e.g.ast)) : null, e.g.xg != null ? h('span', { class: 'dim' }, ` · xG ${e.g.xg.toFixed(2)}`) : null, e.g.et ? h('span', { class: 'dx-chip' }, '연장') : null) : e.k === 'c' ? h('span', null, e.c.type === 'red' ? '🟥 ' : '🟨 ', e.c.id ? nm(e.c.id) : e.c.name) : h('span', null, '🔁 ', nm(e.s.in), h('span', { class: 'dim' }, ' ← '), nm(e.s.out));
    return h('div', { class: 'ev s' + e.side }, e.side === 0 ? inner : h('span'), h('span', { class: 'm num' }, e.min + "'"), e.side === 1 ? inner : h('span')); };
  const panes = {
    sum: () => h('div', { class: 'stack' }, h('div', { class: 'dx-tl' }, ...evs.map(evEl), !evs.length ? h('p', { class: 'dim', style: { textAlign: 'center' } }, '주요 장면이 없는 경기였습니다.') : null),
      r.penLog ? h('div', { class: 'dx-pens' }, h('div', { class: 'lbl' }, `승부차기 ${r.pen[0]} - ${r.pen[1]}`), ...[0, 1].map(s => h('div', { class: 'pk' }, h('span', { class: 'tn' }, tm(s === 0 ? f.h : f.a).short), ...r.penLog.filter(k => k.s === s).map(k => h('span', { class: k.ok ? 'ok' : 'no', title: k.name }, k.ok ? '●' : '✕'))))) : null,
      r.motm && t.players[r.motm] ? h('div', { class: 'dx-motm' }, h('span', { class: 'lbl' }, '경기 최우수 선수'), h('b', null, pname(t.players[r.motm])), rt((r.players.find(p => p.id === r.motm) || {}).rt)) : null),
    stats: () => h('div', { class: 'stack' }, bar('점유율', r.poss, 100 - r.poss, x => x + '%'), bar('기대 득점 (xG)', r.xg[0], r.xg[1], x => x.toFixed(2)), bar('슈팅', st[0].sh, st[1].sh), bar('유효 슈팅', st[0].sot, st[1].sot), bar('패스', st[0].ps, st[1].ps), bar('패스 성공률', pct(st[0].pk, st[0].ps), pct(st[1].pk, st[1].ps), x => x + '%'), bar('코너킥', st[0].co, st[1].co), bar('태클 성공', st[0].tkw, st[1].tkw), bar('가로채기', st[0].int, st[1].int), bar('선방', st[0].sav, st[1].sav), bar('파울', st[0].fl, st[1].fl), bar('오프사이드', st[0].off, st[1].off), bar('경고', st[0].yc, st[1].yc), bar('퇴장', st[0].rc, st[1].rc)),
    xi: () => h('div', { class: 'dx-two' }, lineupPitch(f, 0), lineupPitch(f, 1)),
    shots: () => h('div', { class: 'stack' }, shotMap(f), h('div', { class: 'hint', style: { textAlign: 'center' } }, `${tm(f.h).short} → 오른쪽 골문 · ${tm(f.a).short} → 왼쪽 골문 · 원 크기 = xG · 채워진 원 = 골`)),
    pl: () => h('div', { class: 'stack' }, pstatTable(f, 0), pstatTable(f, 1))
  };
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...[['sum', '요약'], ['stats', '통계'], ['xi', '라인업·평점'], ['shots', '슈팅 맵'], ['pl', '선수 기록']].map(([k, l]) => h('button', { role: 'tab', 'data-k': k, 'aria-selected': String(tab === k), onclick: () => show(k) }, l)));
  const show = k => { tab = U.mTab = k; tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.k === k))); body.innerHTML = ''; body.append(panes[k]()); };
  const sc = s => r.goals.filter(g => g.side === s).map(g => `${g.name.replace(' (자책)', '')} ${g.min}'${g.own ? ' (자책)' : ''}`).join(', ');
  const canRe = r.rp && r.rp.hs && r.rp.as;
  const head = h('div', { class: 'dx-mhead' }, h('div', { class: 'lbl' }, `${t.name} · ${dayLabel(f)}${f.n ? ' · 중립 경기장' : ''}`),
    h('div', { class: 'msb' }, h('div', { class: 'mt' }, badge(tm(f.h), 'lg'), h('b', null, tm(f.h).name), h('span', { class: 'dim' }, sc(0))), h('div', { class: 'ms num' }, scoreTxt(r), r.et ? h('small', null, r.pen ? `연장 · 승부차기 ${r.pen[0]}-${r.pen[1]}` : '연장전') : null), h('div', { class: 'mt' }, badge(tm(f.a), 'lg'), h('b', null, tm(f.a).name), h('span', { class: 'dim' }, sc(1)))));
  modal(h('div', null, h('div', { class: 'mhead' }, h('span', { class: 'grow' }), canRe ? h('button', { class: 'btn', title: '같은 시드로 다시 계산해 골 장면을 봅니다', onclick: () => rewatch(f, 'goals') }, '골 장면 보기') : null, canRe ? h('button', { class: 'btn', onclick: () => rewatch(f, 'full') }, '전체 다시 보기') : null, h('button', { class: 'btn', onclick: closeModal }, '닫기')), head, tabs, body), false, 'dxmatch');
  show(tab);
}
function rewatch(f, hl) {
  const t = T(), r = f.r; const hs = TL.unpackSetup(r.rp.hs), as = TL.unpackSetup(r.rp.as);
  const idsOf = st => st.lineup.concat(st.bench || []);
  closeModal();
  TL.reviewPrebuilt({ seed: C.fxSeed(t, f), neutral: !!f.n, big: !!f.ko, home: C.teamFromIds(t, f.h, idsOf(hs)), away: C.teamFromIds(t, f.a, idsOf(as)), hs, as, ops: r.rp.ops || [], ai: r.rp.ai || [0, 1], expect: r.s90 || r.score, hl: hl === 'full' ? 'full' : 'goals', label: `${t.name} · ${dayLabel(f)} · 다시 보기`, back: 'm_fix' });
}

// ---------- 허브 ----------
function tableEl(rows, opt) {
  opt = opt || {}; const q = opt.q || 0;
  return h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table' }, h('thead', null, h('tr', null, ...['#', '팀', '경기', '승', '무', '패', '득', '실', '차', opt.full ? 'xG' : null, opt.full ? 'xGA' : null, '승점', opt.full ? '최근' : null].filter(x => x != null).map(x => h('th', { class: x === '팀' ? '' : 'num' }, x)))),
    h('tbody', null, ...rows.map((x, i) => h('tr', { class: (x.m === ME ? 'me' : '') + (q && i === q - 1 ? ' cut' : '') }, h('td', { class: 'num' }, h('span', { class: 'rk' + (q && i < q ? ' q' : '') }, i + 1)), h('td', null, h('button', { class: 'linkbtn', onclick: () => { U.sqTeam = x.m; TL.go('m_squad'); } }, teamEl(x.m))), h('td', { class: 'num' }, x.p), h('td', { class: 'num' }, x.w), h('td', { class: 'num' }, x.d), h('td', { class: 'num' }, x.l), h('td', { class: 'num' }, x.gf), h('td', { class: 'num' }, x.ga), h('td', { class: 'num' }, (x.gf - x.ga > 0 ? '+' : '') + (x.gf - x.ga)),
      opt.full ? h('td', { class: 'num dim' }, x.xgf.toFixed(1)) : null, opt.full ? h('td', { class: 'num dim' }, x.xga.toFixed(1)) : null, h('td', { class: 'num' }, h('b', null, x.pts)), opt.full ? h('td', null, h('span', { class: 'dx-form' }, ...x.form.slice(-5).map(c => h('i', { class: c }, c)))) : null)))));
}
function bracketEl() {
  const t = T(); if (!t.ko) return null;
  const cols = t.ko.rounds.map((ids, k) => h('div', { class: 'bcol' }, h('div', { class: 'lbl' }, C.KO_NAME(t.ko.size / 2 ** k)), ...ids.map(i => { const f = t.fx[i], r = f.r; const side = (m, s) => h('div', { class: 'btm' + (r && r.w === s ? ' win' : '') + (m === ME ? ' me' : '') }, badge(tm(m), 'xs'), h('span', { class: 'tn' }, tm(m).name), h('span', { class: 'num' }, r ? r.score[s] + (r.pen ? ` (${r.pen[s]})` : '') : ''));
    return h('button', { class: 'dx-tie', onclick: () => r ? matchModal(f) : null }, side(f.h, 0), side(f.a, 1)); })));
  let n = t.ko.size / 2 ** t.ko.rounds.length; while (n >= 2 && t.phase !== 'done') { cols.push(h('div', { class: 'bcol' }, h('div', { class: 'lbl' }, C.KO_NAME(n)), ...Array.from({ length: n / 2 }, () => h('div', { class: 'dx-tie empty' }, h('div', { class: 'btm' }, '미정'), h('div', { class: 'btm' }, '미정'))))); n /= 2; }
  return h('div', { class: 'dx-bracket' }, ...cols);
}
function leaders(key, n, fmt) {
  const t = T(); const P = C.stats(t).P; const def = STAT_DEFS.find(x => x[0] === key); const val = def[2];
  const arr = Object.values(P).filter(o => t.players[o.id] && (!def[4] || def[4](o))).map(o => ({ o, v: val(o) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v || a.o.min - b.o.min).slice(0, n);
  return arr.map((x, i) => { const p = t.players[x.o.id]; return h('div', { class: 'dx-lead' + (x.o.m === ME ? ' me' : '') }, h('span', { class: 'rk num' }, i + 1), posTag(p.pos), h('span', { class: 'n' }, pname(p)), h('span', { class: 'dim' }, tm(x.o.m).short), h('b', { class: 'num' }, (def[3] || (v => v))(x.v))); });
}
const minApps = () => { const t = T(); const mx = Math.max(1, ...Object.values(C.stats(t).P).map(o => o.gp)); return Math.max(1, Math.floor(mx * .4)); };
const STAT_DEFS = [
  ['g', '득점', o => o.g], ['a', '도움', o => o.a], ['ga', '공격 포인트', o => o.g + o.a], ['avg', '평균 평점', o => o.avg, v => v.toFixed(2), o => o.rn >= minApps()], ['motm', '경기 MOM', o => o.motm],
  ['xg', 'xG', o => o.xg, v => v.toFixed(2)], ['gx', '득점 − xG', o => o.g - o.xg, v => (v > 0 ? '+' : '') + v.toFixed(2)], ['sh', '슈팅', o => o.sh], ['sot', '유효 슈팅', o => o.sot], ['kp', '키패스', o => o.kp],
  ['pp', '패스 성공률', o => o.ps >= 30 ? o.pk / o.ps * 100 : 0, v => v.toFixed(1) + '%', o => o.rn >= minApps()], ['ps', '패스 성공', o => o.pk], ['drb', '드리블 돌파', o => o.drb], ['tkw', '태클 성공', o => o.tkw], ['int', '가로채기', o => o.int],
  ['sav', '선방', o => o.sav], ['cs', '클린시트', o => o.cs], ['yc', '경고', o => o.yc], ['rc', '퇴장', o => o.rc], ['fl', '파울', o => o.fl], ['min', '출전 시간(분)', o => o.min], ['dist', '뛴 거리(km)', o => o.dist, v => v.toFixed(1)]
];
function viewHub() {
  const t = T(); if (!t) return U.viewLanding(); if (t.phase === 'draft') return U.viewDraft();
  const w = h('div', { class: 'wrap' }); const done = t.phase === 'done'; const day = t.days[Math.min(t.day, t.days.length - 1)];
  const f = !done ? C.nextFixtureOf(t, ME) : null; const st = C.standings(t); const myAlive = C.alive(t, ME);
  // 다음 경기 카드
  let main;
  if (done) { const c = t.mgrs[t.champion];
    main = h('section', { class: 'dx-panel dx-next dxc' }, h('div', { class: 'dx-pb stack' }, h('div', { class: 'lbl' }, `${t.name} · 대회 종료`), h('div', { class: 'nvs' }, badge(c.team, 'xl'), h('div', null, h('div', { class: 'dim' }, '우승'), h('h2', null, '🏆 ' + c.team.name), h('div', { class: 'dim' }, t.champion === ME ? '내 팀이 정상에 올랐습니다.' : `${c.name} 감독`))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: champModal }, '시상식'), h('button', { class: 'btn', onclick: () => { U.archiveCur(); U.cfg = null; TL.go('m_new'); } }, '기록 보관 후 새 대회'))));
  } else if (f) {
    const side = f.h === ME ? 0 : 1; const om = side === 0 ? f.a : f.h; const o = t.mgrs[om]; const un = C.suspendedSet(t, ME); const chk = C.matchSetup(t, ME); const prevs = t.fx.filter(x => x.r && ((x.h === ME && x.a === om) || (x.a === ME && x.h === om)));
    const live = liveOn(f); const oppTop = C.teamOf(t, om).players.slice().sort((a, b) => b.o - a.o).slice(0, 3);
    main = h('section', { class: 'dx-panel dx-next' }, h('div', { class: 'dx-pb stack' },
      h('div', { class: 'lbl' }, `다음 경기 · ${day.label}${f.ko ? ' · 단판 승부' : ''} · ${f.n ? '중립 경기장' : side === 0 ? '홈' : '원정'}`),
      h('div', { class: 'nvs' }, h('div', { class: 'nside' }, badge(tm(ME), 'xl'), h('b', null, tm(ME).name), h('span', { class: 'num pw' }, C.teamRating(t, ME))), h('div', { class: 'nmid num' }, 'VS'), h('div', { class: 'nside' }, badge(o.team, 'xl'), h('b', null, o.team.name), h('span', { class: 'num pw' }, C.teamRating(t, om)))),
      h('div', { class: 'dx-kv' }, h('div', null, h('div', { class: 'lbl' }, '상대 감독'), h('div', null, o.name)), h('div', null, h('div', { class: 'lbl' }, '전술 성향'), h('div', null, `${C.STYLES[o.style].n} · ${o.formation}`)), h('div', null, h('div', { class: 'lbl' }, '상대 전적'), h('div', null, prevs.length ? prevs.map(x => resOf(x, ME)).join(' ') : '첫 대결'))),
      h('div', { class: 'hint' }, '상대 주요 선수: ', ...oppTop.map((p, i) => h('span', null, i ? ', ' : '', pname(p), ` ${TL.posLabel(p.pos)} ${p.o}`))),
      un.size ? h('div', { class: 'warnbox' }, `출전 정지: ${[...un].map(id => t.players[id].name).join(', ')}`) : null,
      chk.changes.length ? h('div', { class: 'warnbox' }, `선발 ${chk.changes.length}자리가 비었거나 출전할 수 없어 경기 시작 시 자동으로 대체됩니다: ${chk.changes.map(c => t.players[c.in].name).join(', ')}`) : null,
      live ? h('div', { class: 'row' }, h('button', { class: 'btn primary lg', onclick: () => TL.go('match') }, '진행 중인 경기로 돌아가기'))
        : h('div', { class: 'row' }, h('button', { class: 'btn primary lg', disabled: RUN.busy, onclick: () => playLive(f) }, '경기 보기'), h('button', { class: 'btn', disabled: RUN.busy, onclick: () => playQuick(f) }, '결과만 보기'), h('button', { class: 'btn', onclick: () => TL.go('m_tactics') }, '전술'), TL.hlControls ? h('details', { class: 'dx-det' }, h('summary', null, '중계 설정'), TL.hlControls(true)) : null),
      h('div', { class: 'hint', id: 'dxrun' }, RUN.busy ? `다른 경기 계산 중 ${RUN.done}/${RUN.total}` : '같은 라운드의 다른 경기는 내 경기를 보는 동안 같은 엔진으로 함께 계산됩니다.')));
  } else {
    const left = day.fx.filter(i => !t.fx[i].r).length;
    main = h('section', { class: 'dx-panel dx-next' }, h('div', { class: 'dx-pb stack' }, h('div', { class: 'lbl' }, day.label), h('h2', null, !myAlive ? '탈락했습니다' : left ? '이번 라운드는 경기가 없습니다' : '라운드 종료'), h('p', { class: 'hint' }, !myAlive ? '남은 경기를 계속 진행해 우승팀을 확인할 수 있습니다.' : '다른 팀들의 경기를 진행합니다.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary lg', disabled: RUN.busy, onclick: () => playQuick(null) }, RUN.busy ? '계산 중…' : `남은 ${left}경기 진행`)), h('div', { class: 'hint', id: 'dxrun' }, '')));
  }
  // 내 팀 요약
  const mine = t.fx.filter(x => x.r && (x.h === ME || x.a === ME)); const rec = [0, 0, 0]; mine.forEach(x => { const r = resOf(x, ME); rec[r === 'W' ? 0 : r === 'D' ? 1 : 2]++; });
  const P = C.stats(t).P; const myTop = t.roster[ME].map(id => P[id]).filter(Boolean).sort((a, b) => (b.g * 3 + b.a * 2 + b.avg) - (a.g * 3 + a.a * 2 + a.avg)).slice(0, 4);
  const myCard = panel('내 팀', h('button', { class: 'btn sm', onclick: () => { U.sqTeam = ME; TL.go('m_squad'); } }, '스쿼드'),
    h('div', { class: 'dx-kv' }, h('div', null, h('div', { class: 'lbl' }, '전적'), h('div', { class: 'v num' }, `${rec[0]}승 ${rec[1]}무 ${rec[2]}패`)), h('div', null, h('div', { class: 'lbl' }, '선발 전력'), h('div', { class: 'v num' }, C.teamRating(t, ME))), h('div', null, h('div', { class: 'lbl' }, '최근 5경기'), h('div', { class: 'dx-form' }, ...mine.slice(-5).map(x => { const c = resOf(x, ME); return h('i', { class: c }, c); }), !mine.length ? h('span', { class: 'dim' }, '-') : null))),
    myTop.length ? h('div', { class: 'stack', style: { gap: '4px', marginTop: '10px' } }, ...myTop.map(o => { const p = t.players[o.id]; return h('div', { class: 'dx-lead' }, posTag(p.pos), h('span', { class: 'n' }, pname(p)), h('span', { class: 'dim' }, `${o.gp}경기 ${o.g}골 ${o.a}도움`), rt(o.avg)); })) : null,
    t.cfg.redrafts ? h('div', { class: 'dx-rd' }, h('div', null, h('b', null, '재드래프트'), h('div', { class: 'hint' }, `남은 횟수 ${t.rd[ME]}회 · 자유 계약 ${t.free.length}명`)), h('button', { class: 'btn sm', disabled: !C.canRedraft(t, ME), title: C.dayStarted(t) ? '라운드가 진행 중일 때는 할 수 없습니다' : '', onclick: redraftModal }, '선수 교체')) : null);
  // 오른쪽
  const right = h('div', { class: 'stack' });
  if (t.ko && (t.cfg.format === 'ko' || t.day >= t.days.findIndex(d => d.st === 'K'))) right.append(panel('토너먼트 대진', h('button', { class: 'btn sm', onclick: () => TL.go('m_table') }, '전체 보기'), bracketEl()));
  if (st.length) { const grp = st.length > 1 ? st.find(s => s.rows.some(x => x.m === ME)) : st[0]; right.append(panel(grp.name + ' 순위', h('button', { class: 'btn sm', onclick: () => TL.go('m_table') }, '전체 보기'), tableEl(st.length > 1 ? grp.rows : grp.rows.slice(0, 8), { q: C.qualLine(t) }))); }
  const lastDay = t.days.slice(0, t.day + 1).reverse().find(d => d.fx.some(i => t.fx[i].r));
  if (lastDay) right.append(panel(`${lastDay.label} 결과`, h('button', { class: 'btn sm', onclick: () => TL.go('m_fix') }, '일정·결과'), h('div', { class: 'dx-fxlist' }, ...lastDay.fx.map(i => t.fx[i]).filter(x => x.r).slice(0, 10).map(x => fxRow(x, true)))));
  const ld = leaders('g', 5), la = leaders('avg', 5);
  if (ld.length) right.append(h('div', { class: 'dx-two' }, panel('득점 순위', h('button', { class: 'btn sm', onclick: () => { U.statKey = 'g'; TL.go('m_stats'); } }, '더 보기'), ...ld), panel('평점 순위', null, ...(la.length ? la : [h('span', { class: 'dim' }, '경기 수가 더 필요합니다.')]))));
  const left = h('div', { class: 'stack' }, main, myCard, panel('소식', null, h('div', { class: 'dx-news' }, ...(t.news || []).slice(0, 8).map(n => h('div', { class: 'nw ' + n.type }, h('span', { class: 'dim num' }, n.type === 'draft' ? '드래프트' : (t.days[Math.min(n.day, t.days.length - 1)] || {}).label || ''), h('span', null, n.text))))));
  w.append(h('div', { class: 'dx-title' }, h('div', null, h('div', { class: 'lbl' }, `${C.FORMATS[t.cfg.format].n} · ${t.cfg.n}팀 · ${C.DRAFT_MODES[t.cfg.draftMode].n}`), h('h1', null, t.name)), h('div', { class: 'row' }, h('span', { class: 'dx-chip' }, done ? '종료' : `${day.label} (${Math.min(t.day + 1, t.days.length)}/${t.days.length}${t.cfg.format === 'league' ? '' : '+'})`), h('button', { class: 'btn sm ghost', onclick: () => confirmBox('이 대회를 포기하고 새 대회 설정으로 갈까요? 진행 중인 대회는 사라집니다.', () => { U.archiveCur(); U.cfg = null; TL.go('m_new'); }, '새 대회') }, '새 대회'))),
    h('div', { class: 'dx-hub' }, left, right));
  if (U.showRound != null) { const idx = U.showRound; U.showRound = null; setTimeout(() => { if (!document.querySelector('.modal')) roundModal(idx); }, 30); }
  return w;
}

// ---------- 재드래프트 ----------
function redraftModal() {
  const t = T(); if (!C.canRedraft(t, ME)) return toast('지금은 재드래프트를 할 수 없습니다.'); const outs = new Set(), ins = new Set(); let fpos = '';
  const draw = () => {
    const mx = t.cfg.redraftMax; const my = t.roster[ME].map(id => t.players[id]).sort((a, b) => a.o - b.o); let fr = t.free.map(id => t.players[id]).filter(p => !fpos || C.GRP(p.pos) === fpos).sort((a, b) => b.o - a.o);
    const row = (p, set, other) => h('button', { class: 'dx-rrow' + (set.has(p.id) ? ' on' : ''), onclick: () => { if (set.has(p.id)) set.delete(p.id); else { if (set.size >= mx) return toast(`한 번에 최대 ${mx}명까지 바꿀 수 있습니다.`); set.add(p.id); } draw(); } }, posTag(p.pos), h('span', { class: 'n' }, p.name), flag(p.bio && p.bio.natCode), h('span', { class: 'dim' }, p.age + '세'), ovrB(p.o));
    const ok = outs.size > 0 && outs.size === ins.size;
    const box = h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, '재드래프트'), h('button', { class: 'btn', onclick: closeModal }, '닫기')),
      h('p', { class: 'hint', style: { margin: 0 } }, `내보낼 선수와 데려올 자유 계약 선수를 같은 수로 고르세요 (최대 ${mx}명). 남은 횟수 ${t.rd[ME]}회. 내보낸 선수는 자유 계약으로 돌아가 다른 감독이 데려갈 수 있습니다.`),
      h('div', { class: 'dx-two' }, h('div', null, h('div', { class: 'lbl' }, `내보내기 (${outs.size})`), h('div', { class: 'dx-rcol' }, ...my.map(p => row(p, outs)))),
        h('div', null, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'lbl' }, `데려오기 (${ins.size}) · 자유 계약 ${t.free.length}명`), sel([['', '전체'], ['GK', 'GK'], ['CB', 'CB'], ['FB', '풀백'], ['DM', 'DM'], ['CM', 'CM'], ['AM', 'AM'], ['W', '윙'], ['ST', 'ST']], fpos, v => { fpos = v; draw(); }, 'dx_rf')), h('div', { class: 'dx-rcol' }, ...fr.map(p => row(p, ins))))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', disabled: !ok, onclick: () => { if (C.redraft(t, ME, [...outs], [...ins])) { C.repairSetup(t, ME, C.userSetup(t, ME), new Set()); persist(); closeModal(); toast('선수를 교체했습니다. 전술 화면에서 선발을 확인하세요.'); TL.render(); } else toast('교체할 수 없습니다. 골키퍼가 최소 1명은 남아야 합니다.'); } }, `교체 확정 (${outs.size}명)`), h('span', { class: 'hint' }, ok ? '' : '내보낼 선수와 데려올 선수 수를 맞춰 주세요.')));
    modal(box, false, 'dxrd');
  };
  draw();
}

// ---------- 스쿼드 ----------
function viewSquad() {
  const t = T(); if (!t || t.phase === 'draft') return viewHub(); const m = U.sqTeam = Math.min(U.sqTeam || 0, t.cfg.n - 1); const mg = t.mgrs[m]; const P = C.stats(t).P; const un = C.suspendedSet(t, m);
  const setup = mg.ctrl === 'ai' ? C.aiSetup(t, m, un) : C.userSetup(t, m); const xi = new Set(setup.lineup);
  const ORD = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST']; const ps = t.roster[m].map(id => t.players[id]).sort((a, b) => ORD.indexOf(a.pos) - ORD.indexOf(b.pos) || b.o - a.o);
  const w = h('div', { class: 'wrap' });
  w.append(h('div', { class: 'dx-title' }, h('div', { class: 'row' }, badge(mg.team, 'xl'), h('div', null, h('div', { class: 'lbl' }, mg.ctrl === 'ai' ? `${mg.name} 감독 · ${C.STYLES[mg.style].n} · ${mg.formation}` : `${mg.name} · 내 팀`), h('h1', null, mg.team.name))), sel(t.mgrs.map(x => [x.id, x.team.name + (x.id === ME ? ' (나)' : '')]), m, v => { U.sqTeam = +v; TL.render(); }, 'dx_sq')));
  const avg = Math.round(ps.reduce((a, p) => a + p.o, 0) / ps.length * 10) / 10; const age = Math.round(ps.reduce((a, p) => a + (p.age || 25), 0) / ps.length * 10) / 10;
  const tbl = h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table' }, h('thead', null, h('tr', null, ...['#', '포지션', '선수', '국적', '나이', '능력치', '원 소속', '경기', '골', '도움', '평점', '상태'].map(x => h('th', null, x)))),
    h('tbody', null, ...ps.map(p => { const o = P[p.id]; return h('tr', null, h('td', { class: 'num dim' }, p.num || '-'), h('td', null, posTag(p.pos), h('span', { class: 'dim alt' }, ' ' + U.altPos(p))), h('td', null, h('b', null, pname(p)), h('div', { class: 'dim' }, U.archName(p))), h('td', null, h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, flag(p.bio && p.bio.natCode), h('span', { class: 'dim' }, (p.bio && p.bio.nat) || ''))), h('td', { class: 'num' }, p.age), h('td', null, ovrB(p.o)),
      h('td', null, h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, p.club ? crest(p.club, 'sm') : null, h('span', { class: 'dim' }, p.gen ? '가상 선수' : p.clubName))), h('td', { class: 'num' }, o ? `${o.gp}${o.sub ? ` (${o.sub})` : ''}` : 0), h('td', { class: 'num' }, o ? o.g : 0), h('td', { class: 'num' }, o ? o.a : 0), h('td', null, rt(o ? o.avg : 0)),
      h('td', null, un.has(p.id) ? h('span', { class: 'dx-chip bad' }, `정지 ${t.susp[p.id]}경기`) : xi.has(p.id) ? h('span', { class: 'dx-chip good' }, '선발') : h('span', { class: 'dim' }, '교체'), (t.ycAcc && t.ycAcc[p.id]) ? h('span', { class: 'dim' }, ` 🟨${t.ycAcc[p.id]}`) : null)); }))));
  w.append(h('div', { class: 'dx-hub' }, h('div', { class: 'stack' }, panel('예상 선발', h('span', { class: 'dim' }, E.formLabel(E.slotsOf(setup))), U.miniPitch(t, m, { slots: E.slotsOf(setup) }),
    h('div', { class: 'dx-kv', style: { marginTop: '12px' } }, h('div', null, h('div', { class: 'lbl' }, '선발 전력'), h('div', { class: 'v num' }, C.teamRating(t, m))), h('div', null, h('div', { class: 'lbl' }, '평균 능력치'), h('div', { class: 'v num' }, avg)), h('div', null, h('div', { class: 'lbl' }, '평균 나이'), h('div', { class: 'v num' }, age))),
    m === ME ? h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => TL.go('m_tactics') }, '전술·선발 수정')) : null)),
    panel(`선수단 ${ps.length}명`, null, tbl)));
  return w;
}
// ---------- 전술 ----------
function viewTactics() {
  const t = T(); if (!t || t.phase === 'draft') return viewHub(); const team = C.teamOf(t, ME); const setup = C.userSetup(t, ME); const f = t.phase === 'play' ? C.nextFixtureOf(t, ME) : null; const om = f ? (f.h === ME ? f.a : f.h) : null;
  const w = h('div', { class: 'wrap stack' });
  w.append(h('div', { class: 'dx-title' }, h('div', { class: 'row' }, badge(team, 'xl'), h('div', null, h('div', { class: 'lbl' }, om != null ? `다음 상대: ${tm(om).name} (${C.STYLES[t.mgrs[om].style].n} · ${t.mgrs[om].formation})` : '전술'), h('h1', null, '전술 · 선발 · 세트피스'))), TL.M && !TL.M.ended ? h('span', { class: 'hint' }, '진행 중인 경기의 전술은 경기 화면의 전술·교체 버튼에서 바꿉니다.') : null));
  const presets = { get: () => { try { return (JSON.parse(localStorage.getItem('draftxi.tacpresets.v1') || '{}'))[t.id] || []; } catch (e) { return []; } }, set: l => { let all = {}; try { all = JSON.parse(localStorage.getItem('draftxi.tacpresets.v1') || '{}'); } catch (e) { } all = { [t.id]: l }; try { localStorage.setItem('draftxi.tacpresets.v1', JSON.stringify(all)); } catch (e) { } } };
  w.append(TL.tacticsPanel({ team, setup, oppTeam: om != null ? C.teamOf(t, om) : null, oppSetup: om != null ? C.aiSetup(t, om, C.suspendedSet(t, om)) : null, live: null, unavail: C.suspendedSet(t, ME), cond: null, presets, onChange: () => { t.mgrs[ME].formation = E.FORMATIONS[setup.formation] ? setup.formation : t.mgrs[ME].formation; persist(); TL.render(true); } }));
  return w;
}
// ---------- 일정·결과 ----------
function viewFix() {
  const t = T(); if (!t || t.phase === 'draft') return viewHub(); if (U.fixDay == null || U.fixDay >= t.days.length) U.fixDay = Math.min(t.day, t.days.length - 1);
  const w = h('div', { class: 'wrap stack' }); w.append(h('div', { class: 'dx-title' }, h('h1', null, '일정 · 결과'), seg([['day', '라운드별'], ['mine', '내 경기']], U.fixTab || 'day', v => { U.fixTab = v; TL.render(); })));
  if ((U.fixTab || 'day') === 'mine') { const mine = t.fx.filter(f => f.h === ME || f.a === ME); w.append(panel(`내 경기 ${mine.length}`, null, h('div', { class: 'dx-fxlist wide' }, ...mine.map(f => h('div', { class: 'dx-fxwrap' }, h('span', { class: 'dim d' }, dayLabel(f)), fxRow(f), f.r ? h('span', { class: 'dx-form' }, h('i', { class: resOf(f, ME) }, resOf(f, ME))) : h('span')))))); return w; }
  w.append(h('div', { class: 'dx-days' }, ...t.days.map((d, i) => h('button', { class: (i === U.fixDay ? 'on' : '') + (i === t.day && t.phase === 'play' ? ' cur' : ''), onclick: () => { U.fixDay = i; TL.render(true); } }, d.label))));
  const d = t.days[U.fixDay]; const fxs = d.fx.map(i => t.fx[i]); const xi = C.bestXI(t, U.fixDay);
  if (t.groups && d.st === 'G') for (let g = 0; g < t.groups.length; g++) w.append(panel(C.GL(g) + '조', null, h('div', { class: 'dx-fxlist wide' }, ...fxs.filter(f => f.g === g).map(f => fxRow(f)))));
  else w.append(panel(d.label, fxs.every(f => f.r) ? h('button', { class: 'btn sm', onclick: () => roundModal(U.fixDay) }, '라운드 요약') : null, h('div', { class: 'dx-fxlist wide' }, ...fxs.map(f => fxRow(f)))));
  if (xi.length) w.append(panel('라운드 베스트 11', null, h('div', { class: 'dx-xi' }, ...['ATT', 'MID', 'DEF', 'GK'].map(line => h('div', { class: 'ln' }, ...xi.filter(x => x.line === line).map(x => { const p = t.players[x.id]; return h('div', { class: 'xp' + (x.m === ME ? ' me' : '') }, rt(x.rt), h('span', { class: 'n' }, p ? pname(p) : ''), h('span', { class: 'dim' }, tm(x.m).short)); }))))));
  return w;
}
// ---------- 순위·대진 ----------
function viewTable() {
  const t = T(); if (!t || t.phase === 'draft') return viewHub(); const w = h('div', { class: 'wrap stack' }); const st = C.standings(t); const q = C.qualLine(t);
  w.append(h('div', { class: 'dx-title' }, h('h1', null, t.ko && !st.length ? '토너먼트 대진' : '순위 · 대진')));
  if (t.ko) w.append(panel('토너먼트', null, bracketEl()));
  if (st.length === 1) w.append(panel(st[0].name, q ? h('span', { class: 'hint' }, `상위 ${q}팀 토너먼트 진출`) : null, tableEl(st[0].rows, { full: true, q })));
  else if (st.length) w.append(h('div', { class: 'dx-grid2' }, ...st.map(s => panel(s.name, null, tableEl(s.rows, { q })))));
  if (st.length && q && !t.ko) w.append(h('p', { class: 'hint' }, '순위 결정: 승점 → 골득실 → 다득점. 굵은 선 위의 팀이 토너먼트에 진출합니다.'));
  return w;
}
// ---------- 기록 ----------
function viewStats() {
  const t = T(); if (!t || t.phase === 'draft') return viewHub(); const w = h('div', { class: 'wrap stack' }); const S2 = C.stats(t);
  w.append(h('div', { class: 'dx-title' }, h('h1', null, '기록'), seg([['player', '선수 순위'], ['all', '선수 전체 표'], ['team', '팀 기록'], ['best', '베스트 11']], U.statTab, v => { U.statTab = v; TL.render(); })));
  if (!t.fx.some(f => f.r)) { w.append(panel(null, null, h('p', { class: 'dim' }, '아직 치른 경기가 없습니다.'))); return w; }
  if (U.statTab === 'player') {
    w.append(h('div', { class: 'dx-chips' }, ...STAT_DEFS.map(d => h('button', { class: 'dx-chipbtn' + (U.statKey === d[0] ? ' on' : ''), onclick: () => { U.statKey = d[0]; TL.render(true); } }, d[1]))));
    const def = STAT_DEFS.find(d => d[0] === U.statKey) || STAT_DEFS[0]; const rows = leaders(def[0], 25);
    w.append(h('div', { class: 'dx-grid2' }, panel(def[1] + ' 순위', def[4] ? h('span', { class: 'hint' }, `${minApps()}경기 이상 출전`) : null, ...(rows.length ? rows : [h('span', { class: 'dim' }, '기록이 없습니다.')])),
      h('div', { class: 'stack' }, ...[['g', '득점'], ['a', '도움'], ['avg', '평균 평점'], ['cs', '클린시트']].filter(x => x[0] !== def[0]).slice(0, 3).map(([k, l]) => panel(l, null, ...leaders(k, 5))))));
  } else if (U.statTab === 'all') {
    const cols = [['경기', o => o.gp], ['분', o => o.min], ['골', o => o.g], ['도움', o => o.a], ['xG', o => o.xg, v => v.toFixed(1)], ['슈팅', o => o.sh], ['유효', o => o.sot], ['키패스', o => o.kp], ['패스%', o => o.ps ? o.pk / o.ps * 100 : 0, v => v.toFixed(0)], ['태클', o => o.tkw], ['가로채기', o => o.int], ['드리블', o => o.drb], ['선방', o => o.sav], ['경고', o => o.yc], ['퇴장', o => o.rc], ['MOM', o => o.motm], ['평점', o => o.avg, v => v.toFixed(2)]];
    const sk = U.allSort == null ? 16 : U.allSort; const only = U.allMine; let arr = Object.values(S2.P).filter(o => t.players[o.id] && (!only || o.m === ME)); arr.sort((a, b) => cols[sk][1](b) - cols[sk][1](a)); arr = arr.slice(0, 80);
    w.append(panel(`선수 전체 표 · 상위 ${arr.length}명`, seg([[false, '전체'], [true, '내 팀']], !!only, v => { U.allMine = v; TL.render(true); }), h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table tight' }, h('thead', null, h('tr', null, h('th', null, '선수'), h('th', null, '팀'), ...cols.map((c, i) => h('th', { class: 'num' }, h('button', { class: 'thbtn' + (i === sk ? ' on' : ''), onclick: () => { U.allSort = i; TL.render(true); } }, c[0]))))),
      h('tbody', null, ...arr.map(o => { const p = t.players[o.id]; return h('tr', { class: o.m === ME ? 'me' : '' }, h('td', null, h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, posTag(p.pos), pname(p))), h('td', { class: 'dim' }, tm(o.m).short), ...cols.map((c, i) => h('td', { class: 'num' + (i === sk ? ' hi' : '') }, (c[2] || (v => v))(c[1](o))))); }))))));
  } else if (U.statTab === 'team') {
    const cols = [['경기', x => x.p], ['득점', x => x.gf], ['실점', x => x.ga], ['xG', x => x.xg, v => v.toFixed(1)], ['xGA', x => x.xga, v => v.toFixed(1)], ['점유율', x => x.p ? x.poss / x.p : 0, v => v.toFixed(0) + '%'], ['슈팅', x => x.sh], ['유효', x => x.sot], ['패스%', x => x.ps ? x.pk / x.ps * 100 : 0, v => v.toFixed(0)], ['태클', x => x.tkw], ['가로채기', x => x.int], ['파울', x => x.fl], ['코너', x => x.co], ['오프사이드', x => x.off], ['경고', x => x.yc], ['퇴장', x => x.rc], ['클린시트', x => x.cs]];
    const sk = U.tmSort == null ? 1 : U.tmSort; const arr = S2.TM.slice().sort((a, b) => cols[sk][1](b) - cols[sk][1](a));
    w.append(panel('팀 기록', h('span', { class: 'hint' }, '열 제목을 누르면 정렬'), h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table tight' }, h('thead', null, h('tr', null, h('th', null, '팀'), ...cols.map((c, i) => h('th', { class: 'num' }, h('button', { class: 'thbtn' + (i === sk ? ' on' : ''), onclick: () => { U.tmSort = i; TL.render(true); } }, c[0]))))),
      h('tbody', null, ...arr.map(x => h('tr', { class: x.m === ME ? 'me' : '' }, h('td', null, teamEl(x.m)), ...cols.map((c, i) => h('td', { class: 'num' + (i === sk ? ' hi' : '') }, (c[2] || (v => v))(c[1](x)))))))))));
  } else {
    const xi = C.bestXI(t, null);
    w.append(panel('대회 베스트 11', h('span', { class: 'hint' }, '절반 이상 출전한 선수 중 평균 평점 순'), xi.length ? h('div', { class: 'dx-xi big' }, ...['ATT', 'MID', 'DEF', 'GK'].map(line => h('div', { class: 'ln' }, ...xi.filter(x => x.line === line).map(x => { const p = t.players[x.id]; return h('div', { class: 'xp' + (x.m === ME ? ' me' : '') }, rt(x.rt), h('span', { class: 'n' }, p ? pname(p) : ''), h('span', { class: 'dim' }, tm(x.m).short)); })))) : h('p', { class: 'dim' }, '경기 수가 더 필요합니다.')));
  }
  return w;
}
// ---------- 드래프트 보드 ----------
function viewBoard() {
  const t = T(); if (!t) return U.viewLanding(); const d = t.draft; const w = h('div', { class: 'wrap stack' }); const gr = d.done ? C.draftGrades(t) : null;
  w.append(h('div', { class: 'dx-title' }, h('div', null, h('div', { class: 'lbl' }, C.DRAFT_MODES[d.mode].n), h('h1', null, '드래프트 보드')), gr ? h('span', { class: 'hint' }, '가치: 지명 순번에서 기대되는 능력치 대비 평균 차이 (+가 좋은 지명)') : null));
  const by = t.mgrs.map(() => []); for (const pk of d.picks) by[pk.m][pk.r] = pk;
  const rounds = Math.max(...by.map(a => a.length));
  w.append(panel(null, null, h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-board' }, h('thead', null, h('tr', null, h('th', null, 'R'), ...t.mgrs.map(m => h('th', { class: m.id === ME ? 'me' : '' }, h('div', { class: 'bh' }, badge(m.team, 'xs'), m.team.short), gr ? h('div', { class: 'dim num' }, (gr[m.id].avg > 0 ? '+' : '') + gr[m.id].avg.toFixed(1)) : null)))),
    h('tbody', null, ...Array.from({ length: rounds }, (_, r) => h('tr', null, h('td', { class: 'num dim' }, r + 1), ...t.mgrs.map(m => { const pk = by[m.id][r]; const p = pk && t.players[pk.pid]; const gone = p && !t.roster[m.id].includes(p.id); return h('td', { class: (m.id === ME ? 'me' : '') + (gone ? ' gone' : '') }, p ? h('div', { class: 'bc' }, h('span', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, posTag(p.pos), ovrB(p.o)), h('span', { class: 'n' }, pname(p))) : pk ? h('span', { class: 'dim' }, '방출') : ''); }))))))));
  if (t.rdLog && t.rdLog.length) w.append(panel('재드래프트 기록', null, ...t.rdLog.map(x => h('div', { class: 'dx-lead' }, badge(tm(x.m), 'xs'), h('span', { class: 'n' }, tm(x.m).name), h('span', { class: 'dim' }, (t.days[Math.min(x.day, t.days.length - 1)] || {}).label + ' 전'), h('span', null, x.ins.map(id => t.players[id] ? t.players[id].name : '?').join(', '), h('span', { class: 'dim' }, ' ← '), x.outs.map(id => t.players[id] ? t.players[id].name : '방출 선수').join(', '))))));
  return w;
}
// ---------- 선수 프로필 ----------
function showPlayer(id) {
  const t = T(); const p = t.players[id]; if (!p) return; const m = t.roster.findIndex(r => r.includes(id)); const team = m >= 0 ? tm(m) : { name: '자유 계약', color1: '#3a4150', color2: '#8b94a3', short: 'FA' };
  const o = C.stats(t).P[id]; const pk = t.draft.picks.find(x => x.pid === id);
  const kv = (l, v) => h('div', null, h('div', { class: 'lbl' }, l), h('div', { class: 'v num' }, v));
  const tabs = [];
  if (o) {
    tabs.push(['dx', '대회 기록', () => h('div', { class: 'stack' }, h('div', { class: 'dx-kv six' }, kv('경기', `${o.gp}${o.sub ? ` (교체 ${o.sub})` : ''}`), kv('출전 시간', o.min + '분'), kv('골', o.g), kv('도움', o.a), kv('평균 평점', o.avg ? o.avg.toFixed(2) : '-'), kv('MOM', o.motm)),
      h('div', { class: 'dx-kv six' }, kv('xG', o.xg.toFixed(2)), kv('슈팅 (유효)', `${o.sh} (${o.sot})`), kv('키패스', o.kp), kv('패스 성공률', o.ps ? pct(o.pk, o.ps) + '%' : '-'), kv('태클 성공', `${o.tkw}/${o.tkl}`), kv('가로채기', o.int)),
      h('div', { class: 'dx-kv six' }, kv('드리블 돌파', o.drb), kv('선방', o.sav), kv('클린시트', o.cs), kv('경고 / 퇴장', `${o.yc} / ${o.rc}`), kv('파울', o.fl), kv('뛴 거리', o.dist.toFixed(1) + 'km')))]);
    tabs.push(['log', '경기별 기록', () => h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table tight' }, h('thead', null, h('tr', null, ...['라운드', '상대', '결과', '위치', '분', '골', '도움', '슈팅', 'xG', '키패스', '패스', '평점'].map(x => h('th', null, x)))),
      h('tbody', null, ...o.log.map(([fi, r]) => { const f = t.fx[fi]; const mm = r.side === 0 ? f.h : f.a, om = r.side === 0 ? f.a : f.h; return h('tr', { class: 'click', onclick: () => { TL.closeAllModals(); matchModal(f); } }, h('td', { class: 'dim' }, dayLabel(f)), h('td', null, teamEl(om)), h('td', { class: 'num' }, h('span', { class: 'dx-form' }, h('i', { class: resOf(f, mm) }, resOf(f, mm))), ` ${f.r.score[r.side]}-${f.r.score[1 - r.side]}`), h('td', null, posTag(r.code)), h('td', { class: 'num' }, r.min), h('td', { class: 'num' }, r.g || ''), h('td', { class: 'num' }, r.a || ''), h('td', { class: 'num' }, r.sh ? `${r.sh}(${r.sot})` : ''), h('td', { class: 'num' }, r.xg ? r.xg.toFixed(2) : ''), h('td', { class: 'num' }, r.kp || ''), h('td', { class: 'num' }, r.ps ? `${r.pk}/${r.ps}` : ''), h('td', null, rt(r.rt))); }))))]);
  }
  const notes = [p.gen ? '이 대회를 위해 만들어진 가상 선수입니다.' : `FC27 데이터베이스 기준 능력치 · 원 소속 ${p.clubName || '-'}${p.lgName ? ` (${p.lgName})` : ''}`, pk ? `드래프트 ${pk.r + 1}라운드 · 전체 ${pk.n + 1}번째 지명 (${tm(pk.m).name})` : m >= 0 ? '재드래프트로 합류' : '드래프트에서 지명되지 않은 자유 계약 선수', t.susp && t.susp[id] ? `출전 정지 ${t.susp[id]}경기` : null].filter(Boolean);
  TL.modalOver(TL.profileView({ p, team: { name: team.name, c1: team.color1, c2: team.color2 }, bio: Object.assign({}, D.bioOf(p, 'en'), p.age != null ? { age: p.age, ageEst: false } : {}), fam: TL.famLevels(p), stars: { cur: TL.starsOf(p.o) }, badges: [h('span', { class: 'row', style: { display: 'inline-flex', gap: '6px', marginLeft: '8px', verticalAlign: 'middle' } }, flag(p.bio && p.bio.natCode), p.club ? crest(p.club, 'sm') : null)], notes, tabs, season: o ? `이번 대회: ${o.gp}경기 ${o.g}골 ${o.a}도움 · 평균 평점 ${o.avg ? o.avg.toFixed(2) : '-'}` : null }), 'profile');
}

// ---------- 앱 연동 (app.js가 window.Manager로 호출) ----------
const view = screen => {
  if (!U.isLoaded()) return h('div', { class: 'wrap' }, h('p', { class: 'hint' }, '저장된 대회를 불러오는 중…'));
  const t = T();
  if (screen === 'm_new') return U.viewNew();
  if (!t) return U.viewLanding();
  if (screen === 'm_draft') return t.phase === 'draft' ? U.viewDraft() : viewBoard();
  if (t.phase === 'draft') return U.viewDraft();
  return ({ m_home: viewHub, m_squad: viewSquad, m_tactics: viewTactics, m_fix: viewFix, m_table: viewTable, m_stats: viewStats, m_board: viewBoard }[screen] || viewHub)();
};
G.Manager = {
  init() { U.load().then(() => { TL.render(); }); },
  navItems() { const t = T(); if (!U.isLoaded() || !t) return [['m_home', '홈'], ['m_new', '새 대회']]; if (t.phase === 'draft') return [['m_draft', '드래프트 룸']]; const it = [['m_home', '홈'], ['m_squad', '스쿼드'], ['m_tactics', '전술'], ['m_fix', '일정·결과'], ['m_table', t.cfg.format === 'ko' ? '대진' : '순위·대진'], ['m_stats', '기록'], ['m_board', '드래프트 보드']]; if (TL.M) it.push(['match', '경기']); return it; },
  view, hasPlayer: id => !!(T() && T().players[id]), showPlayer, onMatchDone,
  homeCard: () => h('span'),
  async storageInfo() { const s = U.SAVE(); if (!s.cur && !s.archive.length) return null; return { bytes: U.ser().length * 2, where: U.where() === 'idb' ? '브라우저 저장소' : '로컬 저장소' }; },
  async exportSave() { return JSON.parse(U.ser()); },
  async importSave(o) { if (o && o.v === 1) { U.setSave(o); persist(); } },
  async reset() { U.setSave({ v: 1, cur: null, archive: [] }); persist(); }
};
Object.assign(U, { viewBoard, viewHub, matchModal, roundModal, champModal, RUN });
})(window);
