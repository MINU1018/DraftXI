// ===== 앱 UI =====
(function () {
const D = window.FMDATA, E = window.FMEngine;
const LS = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
// 실축 리그·친선 모드 데이터베이스: 기본값은 FC27(data_fc27.js). 직접 수정한 DB는 IndexedDB에 저장
// 이전 버전(localStorage 'draftxi.db.v1', 구 팀 ID 기준 전술·시즌)은 FC27 전환 시 한 번 초기화
(function migrateFC27() {
  try {
    if (localStorage.getItem('draftxi.dbver') !== 'fc27') {
      for (const k of ['draftxi.db.v1', 'draftxi.setups.v1', 'draftxi.career.v1']) localStorage.removeItem(k);
      localStorage.setItem('draftxi.dbver', 'fc27');
    }
  } catch (e) { }
})();
const RDB_NAME = 'draftxi-realdb', RDB_ST = 'db';
function rdbOpen() { return new Promise((res, rej) => { try { const r = indexedDB.open(RDB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(RDB_ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
async function rdbGet() { const d = await rdbOpen(); return new Promise((res, rej) => { const r = d.transaction(RDB_ST, 'readonly').objectStore(RDB_ST).get('main'); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); }
async function rdbPut(txt) { const d = await rdbOpen(); return new Promise((res, rej) => { const tx = d.transaction(RDB_ST, 'readwrite'); tx.objectStore(RDB_ST).put(txt, 'main'); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); }
async function rdbDel() { try { const d = await rdbOpen(); await new Promise(res => { const tx = d.transaction(RDB_ST, 'readwrite'); tx.objectStore(RDB_ST).delete('main'); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); } catch (e) { } }
let db = D.buildDefaultDB(); let dbCustom = false, dbBytes = 0;
const dbLoad = (async () => {
  try { const txt = await rdbGet(); if (txt) { const o = JSON.parse(txt); if (o && o.version === db.version && Array.isArray(o.leagues)) { db = o; dbCustom = true; dbBytes = txt.length; posAvgCache = null; if (S.mode === 'real' && S.screen !== 'home' && S.screen !== 'match') render(); } } } catch (e) { }
})();
const S = {
  screen: 'm_home', home: 'ARS', away: 'LIV', control: 'home', setups: LS.get('draftxi.setups.v1') || {},
  speed: 8, view: '3d', cam: 'broadcast', cam2d: 'full', names: 'carrier', autoReplay: true,
  hl: 'full', hlGap: 32, hlSpeed: 1, fastDead: true, model: 'human', mode: null, homeAdv: true, cur: 'KRW',
  uiAccent: '#f2c14e', uiBg: 'graphite', ballSize: 1, pitchTheme: 'classic', pitchColor: '#2f7a3f', pitchPattern: 'stripes', zoom: 1,
  tacSide: 0, tacTab: 'lineup', selSlot: null, pendingSub: null, swapA: null, tacTeam: null,
  dbLeague: null, dbTeam: null, dbPlayer: null, sideTab: 'feed', lgTab: 'table'
};
const prefs = LS.get('draftxi.prefs.v1'); if (prefs) Object.assign(S, prefs); S.mode = 'virtual';
const savePrefs = () => LS.set('draftxi.prefs.v1', { home: S.home, away: S.away, control: S.control, speed: S.speed, view: S.view, cam: S.cam, cam2d: S.cam2d, names: S.names, autoReplay: S.autoReplay, hl: S.hl, hlGap: S.hlGap, hlSpeed: S.hlSpeed, fastDead: S.fastDead, model: S.model, mode: S.mode, homeAdv: S.homeAdv, cur: S.cur, uiAccent: S.uiAccent, uiBg: S.uiBg, pitchTheme: S.pitchTheme, pitchColor: S.pitchColor, pitchPattern: S.pitchPattern, zoom: S.zoom, ballSize: S.ballSize });
// ---------- 색상 (UI·경기장) ----------
const UI_BG = {
  graphite: ['기본(그래파이트)', { '--bg': '#0b0d11', '--panel': '#13161c', '--panel2': '#1a1e26', '--line': '#2a303b', '--line2': '#39414f' }],
  forest: ['기본(짙은 녹색)', { '--bg': '#0b110e', '--panel': '#111a16', '--panel2': '#16211c', '--line': '#26342d', '--line2': '#33463c' }],
  navy: ['남색', { '--bg': '#0a0f1a', '--panel': '#101827', '--panel2': '#152034', '--line': '#243149', '--line2': '#31415f' }],
  charcoal: ['차콜', { '--bg': '#0f0f11', '--panel': '#17171b', '--panel2': '#1d1d22', '--line': '#2c2c33', '--line2': '#3a3a43' }],
  wine: ['와인', { '--bg': '#130b0e', '--panel': '#1c1115', '--panel2': '#25161c', '--line': '#3a242c', '--line2': '#4a2f39' }]
};
const ACCENTS = [['#f2c14e', '금색'], ['#5cc98a', '초록'], ['#5aa9e6', '하늘'], ['#e46a5a', '빨강'], ['#b48cf2', '보라'], ['#f28fb8', '분홍'], ['#e8efe9', '흰색']];
const PITCHES = { classic: ['기본 잔디', '#2f7a3f'], deep: ['짙은 잔디', '#235f31'], bright: ['밝은 잔디', '#3d9450'], dry: ['마른 잔디', '#5f7f3a'], night: ['야간 조명', '#1f5a3a'], custom: ['직접 고르기', null] };
const PATTERNS = [['stripes', '세로 줄무늬'], ['checker', '체크무늬'], ['rings', '원형 무늬'], ['plain', '무늬 없음']];
function shade(hx, k) { const [r, g, b] = hexRGB(hx); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join(''); }
function pitchStyle() { const base = S.pitchTheme === 'custom' ? S.pitchColor : (PITCHES[S.pitchTheme] || PITCHES.classic)[1]; return { c: [base, shade(base, .88)], pattern: S.pitchPattern }; }
function applyTheme() {
  const r = document.documentElement.style; const bg = (UI_BG[S.uiBg] || UI_BG.forest)[1]; for (const k in bg) r.setProperty(k, bg[k]);
  const a = S.uiAccent || '#f2b33d'; r.setProperty('--accent', a); const [x, y, z] = hexRGB(a); r.setProperty('--accent-ink', (x * .299 + y * .587 + z * .114) > 150 ? '#141205' : '#ffffff');
}
let dbSaveT = null;
const saveDB = () => { posAvgCache = null; dbCustom = true; clearTimeout(dbSaveT); dbSaveT = setTimeout(() => { const txt = JSON.stringify(db); dbBytes = txt.length; rdbPut(txt).catch(() => toast('데이터베이스를 저장하지 못했습니다. 저장 공간을 확인하세요.')); }, 700); };
const saveSetups = () => LS.set('draftxi.setups.v1', S.setups);

// ---------- 공통 유틸 ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k]; if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'value') el.value = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const $ = s => document.querySelector(s);
const allTeams = () => db.leagues.flatMap(l => l.teams);
const teamById = id => allTeams().find(t => t.id === id);
const leagueOf = id => db.leagues.find(l => l.teams.some(t => t.id === id));
const overlayRoot = () => document.fullscreenElement || document.body;
function toast(msg) { const t = h('div', { class: 'toast', role: 'status', text: mdec(msg) }); overlayRoot().append(t); setTimeout(() => t.remove(), 2600); }
function ovrClass(v) { return v >= 85 ? 'c90' : v >= 78 ? 'c80' : v >= 70 ? 'c70' : v >= 60 ? 'c60' : 'c0'; }
function hexRGB(hx) { const n = parseInt(hx.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function cdist(a, b) { const x = hexRGB(a), y = hexRGB(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
function lum(hx) { const [r, g, b] = hexRGB(hx); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
const ink = c => lum(c) > .6 ? '#101410' : '#ffffff';
function seg(options, cur, on) {
  return h('div', { class: 'seg', role: 'group' }, options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), onclick: () => on(v) }, label)));
}
function sel(options, cur, on, id) {
  const s = h('select', { id, onchange: e => on(e.target.value) }, options.map(([v, l]) => h('option', { value: v }, l)));
  s.value = cur; return s;
}
function teamStrength(team, setup) {
  const ids = setup ? setup.lineup : E.autoPick(team, '4-3-3').lineup;
  const ps = ids.map(id => team.players.find(p => p.id === id)).filter(Boolean);
  return Math.round(ps.reduce((a, p) => a + D.calcOvr(p.stats, p.pos), 0) / Math.max(1, ps.length));
}
function setupFor(teamId) {
  const team = teamById(teamId); if (!team) return null;
  let s = S.setups[teamId];
  const valid = s && s.lineup && s.lineup.length === 11 && s.lineup.every(id => team.players.some(p => p.id === id)) && (E.FORMATIONS[s.formation] || (s.slots && s.slots.length === 11));
  if (!valid) { const keep = s && s.tactics; s = E.makeSetup(team, (s && E.FORMATIONS[s.formation]) ? s.formation : '4-3-3'); if (keep) s.tactics = keep; S.setups[teamId] = s; saveSetups(); }
  s.bench = (s.bench || []).filter(id => team.players.some(p => p.id === id) && !s.lineup.includes(id));
  const def = E.DEFAULT_TACTICS(); for (const k in def) if (s.tactics[k] === undefined) s.tactics[k] = def[k];
  s.takers = s.takers || { pen: '', fk: '', corner: '' };
  return s;
}
function kitColors(home, away) {
  const H = { c1: home.color1, c2: home.color2 };
  let A = { c1: away.color1, c2: away.color2 };
  if (cdist(A.c1, H.c1) < 130) {
    if (cdist(A.c2, H.c1) > 150) A = { c1: away.color2, c2: away.color1 };
    else A = cdist('#f2f2f2', H.c1) > cdist('#1b1e24', H.c1) ? { c1: '#f2f2f2', c2: away.color1 } : { c1: '#1b1e24', c2: away.color1 };
  }
  const gks = ['#f2d03d', '#3fd2c7', '#f07b2c', '#a07cf0', '#9be15d', '#ff6fae'];
  const pick = (avoid) => gks.find(c => avoid.every(a => cdist(c, a) > 120)) || '#f2d03d';
  const g0 = pick([H.c1, A.c1]); const g1 = pick([H.c1, A.c1, g0]);
  return [{ ...H, gk: g0 }, { ...A, gk: g1 }];
}
function shortName(n) { const p = String(n).split(' '); return p.length > 1 ? p.slice(1).join(' ') : n; }
function hashStr(s) { return D.hash(String(s)); }
// ---------- 통화 (가상 모드 금액). 내부 값은 유로, 표시만 환산 ----------
// 고정 환율(2025년 평균 근사치). 실시간 환율이 아님
const CURRENCIES = {
  KRW: { n: '원 (KRW)', rate: 1600, asia: '원', big: [1e8, '억 원'], small: [1e4, '만 원'] },
  USD: { n: '달러 (USD)', rate: 1.16, sym: '$', big: [1e6, '백만 달러'], small: [1e3, '천 달러'] },
  EUR: { n: '유로 (EUR)', rate: 1, sym: '€', big: [1e6, '백만 유로'], small: [1e3, '천 유로'] },
  GBP: { n: '파운드 (GBP)', rate: .87, sym: '£', big: [1e6, '백만 파운드'], small: [1e3, '천 파운드'] },
  JPY: { n: '엔 (JPY)', rate: 172, asia: '엔', big: [1e8, '억 엔'], small: [1e4, '만 엔'] },
  CNY: { n: '위안 (CNY)', rate: 8.3, asia: '위안', big: [1e8, '억 위안'], small: [1e4, '만 위안'] },
  CHF: { n: '스위스 프랑 (CHF)', rate: .94, sym: 'CHF ', big: [1e6, '백만 프랑'], small: [1e3, '천 프랑'] }
};
const cur = () => CURRENCIES[S.cur] || CURRENCIES.KRW;
function money(eur) {
  const c = cur(); const v = eur * c.rate; const a = Math.abs(v), sg = v < 0 ? '-' : '';
  if (c.asia) {
    if (a >= 1e12) return `${sg}${(a / 1e12).toFixed(a >= 1e13 ? 0 : 1)}조 ${c.asia}`;
    if (a >= 1e8) return `${sg}${a >= 1e10 ? Math.round(a / 1e8).toLocaleString() : (a / 1e8).toFixed(1).replace(/\.0$/, '')}억 ${c.asia}`;
    if (a >= 1e4) return `${sg}${Math.round(a / 1e4).toLocaleString()}만 ${c.asia}`;
    return `${sg}${Math.round(a).toLocaleString()} ${c.asia}`;
  }
  if (a >= 1e9) return `${sg}${c.sym}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sg}${c.sym}${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sg}${c.sym}${Math.round(a / 1e3)}K`;
  return `${sg}${c.sym}${Math.round(a)}`;
}
// 입력란: 유로 ↔ 선택 통화 단위 (big = 이적료, small = 주급)
function moneyIn(eur, kind) { const c = cur(); const u = c[kind][0]; return +(eur * c.rate / u).toFixed(u >= 1e6 ? 2 : 1); }
function moneyOut(v, kind) { const c = cur(); return Math.round((+v || 0) * c[kind][0] / c.rate); }
const moneyUnit = kind => cur()[kind][1];
// 저장된 소식 속 금액 토큰 ⟦유로⟧ → 현재 통화
function mdec(t) { return String(t).replace(/⟦(-?\d+)⟧/g, (m, n) => money(+n)).replace(/⟪[^|⟫]+\|([^⟫]*)⟫/g, '$1'); }
// 소식 본문: 금액 토큰은 현재 통화로, 선수 토큰 ⟪id|이름⟫은 누르면 프로필이 열리는 링크로
// 경기 컨디션 화살표: +2 = 12시(최상), 0 = 3시(보통), -2 = 6시(최악)
const FORM_LBL = { 2: '최상', 1: '좋음', 0: '보통', '-1': '나쁨', '-2': '최악' };
function formArrow(f) {
  if (f == null) return null; const deg = 90 - f * 45; const col = f >= 2 ? '#3fd47a' : f === 1 ? '#8fd45a' : f === 0 ? '#c9d2cc' : f === -1 ? '#f2b33d' : '#e46a5a';
  const svg = `<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="none" stroke="${col}" stroke-opacity=".45" stroke-width="1.5"/><g transform="rotate(${deg} 10 10)"><path d="M10 15.5V5.2M10 4.2l-3.6 4M10 4.2l3.6 4" stroke="${col}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  const e = h('span', { class: 'farrow', title: `경기 컨디션: ${FORM_LBL[f]}`, 'aria-label': `경기 컨디션 ${FORM_LBL[f]}` }); e.innerHTML = svg; return e;
}
function talkMark(p) { if (!M || !p.talkUntil || M.t >= p.talkUntil) return null; const re = p.talkV > .012 ? 1 : p.talkV < -.008 ? -1 : 0; if (!re) return null; return h('span', { class: re > 0 ? 'tk up' : 'tk down', title: re > 0 ? '대화 효과: 사기 상승' : '대화 효과: 사기 저하' }, re > 0 ? '▲' : '▼'); }
// 경기 이벤트 문장 속 선수 이름을 프로필 링크로
function evText(e) {
  const ps = [e.pid, e.outPid].map(i => i != null && i >= 0 && M ? M.pidList[i] : null).filter(Boolean);
  if (e.astId && M) { const a = M.pidList.find(q => q.d.id === e.astId); if (a) ps.push(a); }
  let parts = [e.text];
  for (const p of ps) { if (!p.name) continue; parts = parts.flatMap(x => { if (typeof x !== 'string') return [x]; const i = x.indexOf(p.name); if (i < 0) return [x]; return [x.slice(0, i), pl(p.name, p.d.id), x.slice(i + p.name.length)].filter(y => y !== ''); }); }
  return parts;
}
function rich(t) { const s = String(t); const out = []; let last = 0; const re = /⟪([^|⟫]+)\|([^⟫]*)⟫/g; let m; while ((m = re.exec(s))) { if (m.index > last) out.push(mdec(s.slice(last, m.index))); out.push(pl(m[2], m[1])); last = m.index + m[0].length; } if (last < s.length) out.push(mdec(s.slice(last))); return out; }
// ---------- 별점·포지션 숙련도·선수 링크 (실축·가상 공통) ----------
function starsOf(ovr) { return Math.max(.5, Math.min(5, Math.round((ovr - 45) / 9 * 2) / 2)); }
function starsEl(cur, pot, title) {
  const box = h('span', { class: 'stars', title: title || (pot != null ? `현재 ${cur}★ · 잠재 ${pot}★` : `${cur}★`), 'aria-label': pot != null ? `현재 별 ${cur}개, 잠재 별 ${pot}개` : `별 ${cur}개` });
  for (let i = 0; i < 5; i++) {
    const c = Math.max(0, Math.min(1, cur - i)) * 100, q = pot != null ? Math.max(c / 100, Math.min(1, pot - i)) * 100 : c;
    box.append(h('i', { style: { backgroundImage: `linear-gradient(90deg, var(--star) ${c}%, var(--star-pot) ${c}%, var(--star-pot) ${q}%, var(--star-empty) ${q}%)` } }, '★'));
  }
  return box;
}
// 포지션 표기 (FM 방식). 내부 코드 → 표시 이름
const POS_FM = { GK: 'GK', CB: 'DC', LB: 'DL', RB: 'DR', LWB: 'WBL', RWB: 'WBR', DM: 'DM', CM: 'MC', LM: 'ML', RM: 'MR', AM: 'AMC', LW: 'AML', RW: 'AMR', ST: 'ST' };
const POS_KO = { GK: '골키퍼', CB: '중앙 수비수', LB: '왼쪽 수비수', RB: '오른쪽 수비수', LWB: '왼쪽 윙백', RWB: '오른쪽 윙백', DM: '수비형 미드필더', CM: '중앙 미드필더', LM: '왼쪽 미드필더', RM: '오른쪽 미드필더', AM: '공격형 미드필더', LW: '왼쪽 공격형 미드필더', RW: '오른쪽 공격형 미드필더', ST: '스트라이커' };
const posLabel = c => POS_FM[c] || c;
const FAM_POS = [['ST', 50, 9], ['LW', 16, 24], ['AM', 50, 24], ['RW', 84, 24], ['LM', 16, 40], ['CM', 50, 40], ['RM', 84, 40], ['LWB', 16, 56], ['DM', 50, 56], ['RWB', 84, 56], ['LB', 16, 72], ['CB', 50, 72], ['RB', 84, 72], ['GK', 50, 91]];
const POS_ORDER = ['GK', 'CB', 'RB', 'LB', 'RWB', 'LWB', 'DM', 'CM', 'RM', 'LM', 'AM', 'RW', 'LW', 'ST'];
// 능숙한 포지션 전부 (표시용)
// 위치별 능력치 기준 능숙 포지션 (기본 10개 포지션만)
const POS_SHORT = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];
function fluentOf(p) { const l = POS_SHORT.filter(c => E.famLevel(p, c) >= 3); if (!l.includes(p.pos)) l.unshift(p.pos); return l.map(posLabel).join(', '); }
function fluentList(fam, primary) { const l = POS_ORDER.filter(c => (fam[c] || 0) >= 3); if (primary && !l.includes(primary)) l.unshift(primary); return l.map(posLabel).join(', '); }
const FAM_LBL = ['부적합', '미숙', '가능', '능숙'];
// 실축 선수는 엔진의 포지션 적합도로 숙련도 단계를 계산
function famLevels(p) {
  const o = {}; for (const [code] of FAM_POS) o[code] = E.famLevel(p, code);
  return o;
}
// 위치별 능력치 지도: 모든 포지션의 그 자리 능력치와 숙련도 색
// 성향 유형: 대표 포지션 유형 점수 + 다른 포지션별 추천 유형
function archPanel(p) {
  const T = D.POS_T; const main = E.archsOf(p, p.pos); const top = main.length ? main[0].v : 0;
  const rows = main.map((a, i) => h('div', { class: 'archrow' + (i === 0 ? ' best' : '') }, h('span', null, a.n), h('span', { class: 'lvbar' }, h('span', { class: 'trk' }, h('i', { style: { width: Math.max(4, Math.min(100, (a.v - 40) / 55 * 100)) + '%', background: i === 0 ? 'var(--accent)' : 'color-mix(in srgb, var(--chalk) 45%, transparent)' } })), h('span', { class: 'num' }, Math.round(a.v)))));
  const seen = new Set(); const others = [];
  for (const c of ['GK', 'CB', 'LB', 'LWB', 'DM', 'CM', 'LM', 'AM', 'LW', 'ST']) { const t = T[c]; if (seen.has(t) || t === T[p.pos]) continue; seen.add(t); const a = E.archsOf(p, c)[0]; if (a) others.push([c, a, E.posRating(p, c)]); }
  others.sort((a, b) => b[2] - a[2]);
  return h('div', { class: 'card stack', style: { gap: '8px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', { style: { margin: 0 } }, `${posLabel(p.pos)} 성향 유형`), main[0] ? h('span', { class: 'archtag' }, `추천: ${posLabel(p.pos)} (${main[0].n})`) : null),
    h('div', { class: 'stack', style: { gap: '4px' } }, ...rows),
    h('div', { class: 'hint' }, '다른 포지션에서 맞는 유형: ', ...others.slice(0, 5).map(([c, a, r], i) => h('span', null, i ? ' · ' : '', h('strong', null, `${posLabel(c)} ${r}`), ` ${a.n}`))),
    h('p', { class: 'hint', style: { margin: 0 } }, '같은 포지션이라도 강점이 다른 여러 유형이 있습니다. 유형 점수는 그 유형의 핵심 능력치 가중 평균을 포지션 평균 선수 기준으로 맞춘 값이고, 가장 높은 유형이 위치별 능력치의 절반을 차지합니다. 전술에서 그 유형에 맞는 역할을 주면 됩니다.'));
}
function famPitch(p) {
  const fam = famLevels(p), R = E.allRatings(p), best = Math.max(...Object.values(R));
  const box = h('div', { class: 'fampitch', role: 'img', 'aria-label': '위치별 능력치: ' + FAM_POS.map(([c]) => `${posLabel(c)} ${R[c]} ${FAM_LBL[fam[c]]}`).join(', ') });
  for (const [code, x, y] of FAM_POS) { const lv = fam[code] || 0; box.append(h('span', { class: 'fp l' + lv + (code === p.pos ? ' main' : ''), style: { left: x + '%', top: y + '%' }, title: `${posLabel(code)} (${POS_KO[code]}) · 능력치 ${R[code]} (능력치 공식 ${E.rawRating(p, code)} − 익숙함 보정 ${E.penOf(p, code).toFixed(1)}) · ${FAM_LBL[lv]} · 추천 유형 ${(E.archsOf(p, code)[0] || {}).n || '-'}` }, h('b', null, posLabel(code)), h('i', null, R[code]))); }
  return h('div', null, h('div', { class: 'hint', style: { marginBottom: '4px' } }, '능숙: ', h('strong', null, fluentOf(p))), box,
    h('div', { class: 'famleg' }, h('span', null, h('i', { class: 'l3' }), '능숙 (보정 0~2)'), h('span', null, h('i', { class: 'l2' }), '가능 (3~6)'), h('span', null, h('i', { class: 'l1' }), '미숙 (7~12)'), h('span', null, h('i', { class: 'l0' }), '부적합 (13+)')),
    h('div', { class: 'hint', style: { marginTop: '4px' } }, '숫자는 그 자리에 섰을 때의 능력치 = 그 자리 능력치 공식(기본 50% + 가장 잘 맞는 성향 유형 50%) − 익숙함 보정치입니다. 보정치는 선수마다 다르고(같은 능력치라도 어떤 선수는 DL이 편하고 어떤 선수는 낯설 수 있음), 새 포지션 훈련과 그 자리 실전 출전으로 줄어듭니다. 숫자에 마우스를 올리면 자세한 값과 추천 유형이 보입니다.'));
}
// 이름을 누르면 어느 화면에서든 선수 프로필이 열리도록 data-pid를 단 버튼
function pl(name, id, cls) { return id == null ? h('span', null, name) : h('button', { type: 'button', class: 'linkbtn pl' + (cls ? ' ' + cls : ''), 'data-pid': id }, name); }
function findRealPlayer(id) { for (const t of allTeams()) { const p = playerOf(t, id); if (p) return [t, p]; } return null; }
function openPlayerRef(id) {
  if (window.Manager && Manager.hasPlayer && Manager.hasPlayer(id)) return Manager.showPlayer(id);
  const f = findRealPlayer(id); if (f) return showPlayer(f[0], f[1]);
  toast('선수 정보를 찾을 수 없습니다.');
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pid]'); if (!b) return; e.preventDefault(); e.stopPropagation(); if (M && S.screen === 'match' && !L.modal) { L.playing = false; buildCtrl(); } openPlayerRef(b.dataset.pid); }, true);

// ---------- 네비게이션 ----------
const NAV_REAL = [['league', '리그'], ['setup', '친선 경기'], ['tactics', '팀'], ['match', '경기'], ['db', '데이터베이스']];
function navItems() {
  if (S.screen === 'home' || !S.mode) return [];
  if (S.mode === 'virtual' && window.Manager) return Manager.navItems();
  return NAV_REAL;
}
function renderNav() {
  const n = $('#nav'); if (!n) return; n.innerHTML = '';
  for (const [k, l] of navItems()) n.append(h('button', { 'data-go': k, 'aria-current': String(S.screen === k) }, l));
  n.append(h('button', { 'data-go': 'settings', 'aria-current': String(S.screen === 'settings') }, '설정'));
}
function go(screen) {
  if (screen === 'home') screen = 'm_home';
  if (screen === 'match' && !M) { toast('진행 중인 경기가 없습니다.'); return; }
  if (S.screen === 'match' && screen !== 'match') pauseLoop();
  S.screen = screen;
  render();
}
document.getElementById('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.go === 'search') return openSearch(); go(b.dataset.go); });
document.addEventListener('keydown', e => { if (false && e.key === '/' && S.screen !== 'home' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !document.querySelector('.modal[data-kind="search"]')) { e.preventDefault(); openSearch(); } });
// ---------- 통합 검색 (선수·구단·대회) ----------
// 악센트 무시 검색 (Ødegaard → odegaard)
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ı/g, 'i');
function realSearch(q) {
  const out = { players: [], clubs: [], comps: [] }; const qf = fold(q);
  for (const lg of db.leagues) {
    if (lg.name.toLowerCase().includes(q)) out.comps.push({ name: lg.name, sub: `${lg.teams.length}개 팀`, open: () => { closeAllModals(); S.leagueId = lg.id; go('league'); } });
    for (const t of lg.teams) {
      if (t.name.toLowerCase().includes(q) || (t.short || '').toLowerCase() === q) out.clubs.push({ name: t.name, sub: lg.name, kit: [t.color1, t.color2], open: () => showRealTeam(t) });
      for (const p of t.players) if (fold(p.name).includes(qf)) out.players.push({ name: p.name, id: p.id, sub: `${t.name} · ${posLabel(p.pos)} · 종합 ${D.calcOvr(p.stats, p.pos)}`, ovr: D.calcOvr(p.stats, p.pos) });
    }
  }
  out.players.sort((a, b) => b.ovr - a.ovr);
  return out;
}
function openSearch() {
  const input = h('input', { type: 'search', id: 'gsearch', placeholder: '선수 이름, 구단, 리그·대회 이름', autocomplete: 'off', style: { width: '100%', fontSize: '17px', padding: '10px 12px' } });
  const res = h('div', { class: 'gres' });
  let timer = 0;
  const run = () => {
    const q = input.value.trim().toLowerCase(); res.innerHTML = '';
    if (!q) { res.append(h('p', { class: 'hint' }, '한 글자 이상 입력하세요. 선수 이름을 누르면 프로필, 구단을 누르면 구단 정보가 열립니다.')); return; }
    const r = S.mode === 'virtual' && window.Manager && Manager.search ? Manager.search(q) : realSearch(q);
    const sec = (title, arr, row) => { if (!arr.length) return; res.append(h('div', { class: 'lbl', style: { marginTop: '8px' } }, `${title} (${arr.length > 40 ? '40+' : arr.length})`)); const box = h('div', { class: 'glist' }); arr.slice(0, 40).forEach(x => box.append(row(x))); res.append(box); };
    sec('대회·리그', r.comps, x => h('button', { class: 'gitem', onclick: x.open }, h('strong', null, x.name), h('span', { class: 'hint' }, x.sub)));
    sec('구단', r.clubs, x => h('button', { class: 'gitem', onclick: x.open }, x.kit ? h('span', { class: 'kit sm', style: { background: x.kit[0], borderColor: x.kit[1] } }) : null, h('strong', null, x.name), h('span', { class: 'hint' }, x.sub)));
    sec('선수', r.players, x => h('div', { class: 'gitem' }, pl(x.name, x.id), h('span', { class: 'hint' }, x.sub)));
    if (!r.players.length && !r.clubs.length && !r.comps.length) res.append(h('p', { class: 'hint' }, '검색 결과가 없습니다.'));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 140); });
  modal(h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, '검색'), h('button', { class: 'btn', onclick: closeModal }, '닫기')), input, res), false, 'search');
  run(); setTimeout(() => input.focus(), 30);
}
// 실축 모드 구단 정보 (검색에서 열기)
function showRealTeam(t) {
  const lg = leagueOf(t.id); const ps = t.players.slice().sort((a, b) => D.POSITIONS.indexOf(a.pos) - D.POSITIONS.indexOf(b.pos) || D.calcOvr(b.stats, b.pos) - D.calcOvr(a.stats, a.pos));
  const avg = Math.round(ps.map(p => D.calcOvr(p.stats, p.pos)).sort((a, b) => b - a).slice(0, 14).reduce((a, b) => a + b, 0) / Math.min(14, ps.length));
  const tb = h('tbody'); for (const p of ps) { const o = D.calcOvr(p.stats, p.pos); const bio = D.bioOf(p, langOf(t)); tb.append(h('tr', null, h('td', { class: 'num dim' }, p.num || ''), h('td', null, h('span', { class: 'tag' }, posLabel(p.pos))), h('td', null, pl(p.name, p.id)), h('td', { class: 'num' }, bio.age ?? '-'), h('td', null, starsEl(starsOf(o))), h('td', { class: 'num ' + ovrClass(o) }, o))); }
  modalOver(h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('span', { class: 'kit', style: { background: t.color1, borderColor: t.color2 } }), h('h2', { class: 'grow' }, t.name), h('button', { class: 'btn', onclick: closeModal }, '닫기')),
    h('div', { class: 'hint' }, `${lg ? lg.name : ''} · 선수 ${ps.length}명 · 주전 14명 평균 종합 ${avg}`),
    h('div', { class: 'plist', style: { maxHeight: '60vh' } }, h('table', null, h('thead', null, h('tr', null, ...['번호', '포지션', '이름', '나이', '능력', '종합'].map(x => h('th', null, x)))), tb))), 'club');
}
document.getElementById('brand').addEventListener('click', () => go('home'));
document.getElementById('brand').addEventListener('keydown', e => { if (e.key === 'Enter') go('home'); });
function setMode(mode, screen) { S.mode = mode; savePrefs(); go(screen); }
function scrollState() { const st = { screen: ($('#screen') || {}).scrollTop || 0, win: window.scrollY, box: ($('#modal .box') || {}).scrollTop || 0, lists: [...document.querySelectorAll('.plist')].map(e => e.scrollTop) }; return st; }
function restoreScroll(st) { requestAnimationFrame(() => { const sc = $('#screen'); if (sc) sc.scrollTop = st.screen; window.scrollTo(0, st.win); const bx = $('#modal .box'); if (bx) bx.scrollTop = st.box; document.querySelectorAll('.plist').forEach((e, i) => { if (st.lists[i] != null) e.scrollTop = st.lists[i]; }); }); }
function render(keep) {
  const st = keep ? scrollState() : null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); document.body.classList.remove('fsmode');
  closeAllModals();
  if (!/^m_|^match$|^settings$/.test(S.screen)) S.screen = 'm_home';
  const sc = $('#screen'); sc.innerHTML = '';
  renderNav();
  if (S.screen === 'home') sc.append(viewHome());
  else if (S.screen === 'settings') sc.append(viewSettings());
  else if (S.screen.startsWith('m_')) { if (window.Manager) sc.append(Manager.view(S.screen)); else sc.append(h('div', { class: 'wrap' }, h('p', null, '감독 모드 파일을 불러오지 못했습니다.'))); }
  else if (S.screen === 'setup') sc.append(viewSetup());
  else if (S.screen === 'league') sc.append(viewLeague());
  else if (S.screen === 'tactics') sc.append(viewTacticsScreen());
  else if (S.screen === 'match') { sc.append(viewMatch()); requestAnimationFrame(() => { resizeView(); }); }
  else if (S.screen === 'db') sc.append(viewDB());
  if (st) restoreScroll(st);
}

// ---------- 하이라이트 설정 공통 UI ----------
const HL_MODES = [['full', '풀 경기'], ['ext', '주요 하이라이트'], ['key', '핵심 하이라이트']];
function hlControls(compact) {
  const box = h('div', { class: compact ? 'row' : 'stack', style: compact ? null : { gap: '10px' } });
  const rerender = () => { savePrefs(); if (S.screen === 'match') { L.win = []; L.winIdx = 0; buildCtrl(); } else render(); };
  box.append(h('div', { class: 'row' }, compact ? null : h('span', { class: 'lbl', style: { minWidth: '110px' } }, '보기 방식'), seg(HL_MODES, S.hl, v => { S.hl = v; rerender(); })));
  if (S.hl === 'full') {
    box.append(h('div', { class: 'row' }, compact ? null : h('span', { class: 'lbl', style: { minWidth: '110px' } }, '재생 배속'), seg([[1, '1x'], [2, '2x'], [4, '4x'], [8, '8x'], [16, '16x'], [32, '32x']], S.speed, v => { S.speed = v; rerender(); }),
      h('label', { class: 'row', style: { gap: '6px' } }, h('input', { type: 'checkbox', id: 'fastdead' + (compact ? 'c' : ''), checked: S.fastDead, onchange: e => { S.fastDead = e.target.checked; savePrefs(); } }), '데드볼 빠르게')));
  } else {
    box.append(h('div', { class: 'row' }, compact ? null : h('span', { class: 'lbl', style: { minWidth: '110px' } }, '장면 사이'), seg([[16, '16x'], [32, '32x'], [64, '64x'], ['skip', '건너뛰기']], S.hlGap, v => { S.hlGap = v; rerender(); }),
      compact ? null : h('span', { class: 'lbl' }, '하이라이트'), seg([[1, '1x'], [2, '2x']], S.hlSpeed, v => { S.hlSpeed = v; rerender(); })));
  }
  if (!compact) box.append(h('p', { class: 'hint', style: { margin: 0 } }, S.hl === 'full' ? '모든 장면을 선택한 배속으로 봅니다. 데드볼 빠르게를 켜면 스로인·프리킥 준비 시간은 6배 빠르게 넘어갑니다.' : S.hl === 'key' ? '골, 페널티킥, 퇴장, 결정적 기회(xG 0.25 이상), 골대 강타만 정배속으로 보고 나머지는 선택한 배속으로 넘깁니다.' : '핵심 장면에 모든 슈팅, 선방, 코너킥과 위험 지역 프리킥, 경고 장면을 더해 정배속으로 봅니다.'));
  return box;
}

// ---------- 친선 경기 준비 ----------
function viewSetup() {
  const w = h('div', { class: 'wrap stack', style: { gap: '18px' } });
  w.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h2', null, '친선 경기'), h('span', { class: 'hint' }, '시즌을 치르려면 리그 화면으로 가세요.')));
  const teamCard = (side) => {
    const id = side === 0 ? S.home : S.away; const team = teamById(id) || allTeams()[0]; const lg = leagueOf(team.id);
    const setup = setupFor(team.id);
    const card = h('div', { class: 'card teamcard stack' });
    const lgSel = sel(db.leagues.map(l => [l.id, l.name]), lg.id, v => { const Lg = db.leagues.find(l => l.id === v); if (side === 0) S.home = Lg.teams[0].id; else S.away = Lg.teams[0].id; savePrefs(); render(); }, 'lg' + side);
    const tSel = sel(lg.teams.map(t => [t.id, t.name]), team.id, v => { if (side === 0) S.home = v; else S.away = v; savePrefs(); render(); }, 'tm' + side);
    const str = teamStrength(team, setup);
    card.append(
      h('div', { class: 'lbl' }, side === 0 ? '홈' : '원정'),
      h('div', { class: 'row' }, h('span', { class: 'kit', style: { background: team.color1, borderColor: team.color2 } }), h('div', { class: 'name' }, team.name)),
      h('div', { class: 'row' }, lgSel, tSel),
      h('div', { class: 'stack', style: { gap: '4px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'lbl' }, '선발 평균 능력치'), h('span', { class: 'num ' + ovrClass(str), style: { fontSize: '22px' } }, str)), h('div', { class: 'meter' }, h('i', { style: { width: Math.max(0, (str - 55) / 40 * 100) + '%' } }))),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, '포메이션'), sel(Object.keys(E.FORMATIONS).map(f => [f, f]), setup.formation, v => { const t = teamById(team.id); const old = S.setups[team.id]; const ns = E.makeSetup(t, v); ns.tactics = old.tactics; S.setups[team.id] = ns; saveSetups(); render(); }, 'fm' + side),
        h('button', { class: 'btn sm', onclick: () => { S.tacTeam = team.id; go('tactics'); } }, '전술 설정'))
    );
    return card;
  };
  w.append(h('div', { class: 'vs' }, teamCard(0), h('div', { class: 'mid' }, 'VS'), teamCard(1)));
  w.append(h('div', { class: 'card stack' },
    h('h3', null, '경기 설정'),
    h('div', { class: 'row' }, h('span', { class: 'lbl', style: { minWidth: '110px' } }, '내가 지휘할 팀'), seg([['home', '홈'], ['away', '원정'], ['both', '양 팀'], ['none', '관전만']], S.control, v => { S.control = v; savePrefs(); render(); })),
    hlControls(false),
    h('div', { class: 'row' }, h('span', { class: 'lbl', style: { minWidth: '110px' } }, '날씨'), seg([['clear', '맑음'], ['cloudy', '흐림'], ['rain', '비'], ['heavy', '폭우'], ['snow', '눈'], ['hot', '무더위'], ['wind', '강풍']], S.wxK || 'clear', v => { S.wxK = v; render(true); })),
    h('div', { class: 'row' }, h('span', { class: 'lbl', style: { minWidth: '110px' } }, '잔디 상태'), seg([['good', '좋음'], ['wet', '젖음'], ['heavy', '진흙'], ['worn', '패임'], ['frozen', '얼어붙음']], S.wxP || 'good', v => { S.wxP = v; render(true); }), h('span', { class: 'hint' }, '비·젖은 잔디는 볼 컨트롤과 패스·캐칭을 어렵게 하고, 진흙은 공을 느리게 하며 체력 소모를 늘립니다. 무더위도 체력 소모가 큽니다. 강풍은 높은 공을 흘립니다.')),
    h('div', { class: 'row' }, h('span', { class: 'lbl', style: { minWidth: '110px' } }, '화면'), seg([['3d', '3D'], ['2d', '2D 바둑알']], S.view, v => { S.view = v; savePrefs(); render(); }), h('label', { class: 'row', style: { gap: '6px' } }, h('input', { type: 'checkbox', id: 'autorp', checked: S.autoReplay, onchange: e => { S.autoReplay = e.target.checked; savePrefs(); } }), '골 장면 자동 리플레이')),
    h('p', { class: 'hint', style: { margin: 0 } }, '모든 판정(슈팅, 선방, 패스, 경합, 태클, 파울)은 관련 능력치를 조합한 확률로 결정됩니다. 체력이 떨어지면 모든 능력치가 함께 낮아집니다.'),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', style: { padding: '10px 22px', fontSize: '15px' }, onclick: () => startMatch({ home: teamById(S.home), away: teamById(S.away), control: controlSides(S.control), weather: { k: S.wxK || 'clear', pitch: S.wxP || 'good', wd: Math.random() * 6.28 }, ctx: { type: 'friendly' } }) }, '킥오프'), M && !M.ended ? h('button', { class: 'btn', onclick: () => go('match') }, '진행 중인 경기로 돌아가기') : null)
  ));
  return w;
}
function controlSides(c) { return c === 'home' ? [0] : c === 'away' ? [1] : c === 'both' ? [0, 1] : []; }

// ---------- 전술 화면 ----------
// 개인 지침 (포지션별로 보이는 항목이 다름 — 엔진 PI_ALLOWED와 같은 목록)
const PI_UI = {
  plen: ['패스 길이', [[-1, '짧게'], [0, '표준'], [1, '길게 (직접적으로)']], 'pass'],
  pass: ['패스 위험도', [[-1, '낮게 (안전하게)'], [0, '표준'], [1, '높게 (과감하게)']], 'pass'],
  tempo: ['템포', [[-1, '늦추기'], [0, '표준'], [1, '빠르게']], 'pass'],
  shoot: ['슈팅', [[-1, '적게'], [0, '표준'], [1, '자주']], 'pass'],
  dribble: ['드리블', [[-1, '적게'], [0, '표준'], [1, '자주']], 'drib'],
  dribDir: ['드리블 방향', [['none', '표준'], ['inside', '안쪽으로 좁혀 들어오기'], ['wide', '측면 방향으로']], 'drib'],
  cross: ['크로스 빈도', [[-1, '적게'], [0, '표준'], [1, '자주']], 'cross'],
  crossFrom: ['크로스 위치', [['none', '표준'], ['byline', '최종 라인까지 가서'], ['deep', '후방에서 일찍']], 'cross'],
  crossTarget: ['크로스 목표', [['mixed', '혼합'], ['near', '가까운 포스트'], ['center', '중앙'], ['far', '먼 포스트'], ['target', '표적 선수(공중볼 강한 동료)']], 'cross'],
  fwd: ['전진', [[-1, '위치 고수'], [0, '표준'], [1, '더 앞으로']], 'pos'],
  width: ['좌우 위치', [[-1, '좁게'], [0, '표준'], [1, '측면으로']], 'pos'],
  split: ['빌드업 때 센터백 사이로 내려오기 (라볼피아나)', [[0, '아니요'], [1, '예']], 'pos'],
  free: ['포지션', [[0, '전술대로'], [1, '자유롭게 이동']], 'pos'],
  press: ['압박', [[-1, '약하게'], [0, '표준'], [1, '강하게']], 'def'],
  tackle: ['태클', [[-1, '적당히'], [0, '표준'], [1, '세게']], 'def'],
  mark: ['마크', [['normal', '표준'], ['tight', '엄격하게']], 'def'],
  gkSpeed: ['배급 속도', [[-1, '천천히'], [0, '팀 지침'], [1, '빠르게']], 'gk'],
  gkTarget: ['배급 대상', [['team', '팀 지침'], ['cb', '센터백'], ['fb', '풀백'], ['cm', '중앙 미드필더'], ['wing', '측면 미드필더'], ['target', '타깃맨'], ['behind', '수비진 너머로']], 'gk'],
  gkMethod: ['배급 방식', [['team', '팀 지침'], ['roll', '굴려서 던지기'], ['throw', '손으로 길게 던지기'], ['pass', '발로 패스'], ['kick', '길게 차내기']], 'gk']
};
const PI_GROUPS = [['pass', '패스·슈팅'], ['drib', '드리블'], ['cross', '크로스'], ['pos', '위치 선정'], ['def', '수비'], ['gk', '배급']];
// 포지션 그룹별로 선택지를 조금 바꿈 (DC는 전진 금지, ST·AMC의 '측면으로'는 채널 침투)
function piOptions(k, g) {
  const o = PI_UI[k][1];
  if (k === 'fwd' && g === 'CB') return o.filter(x => x[0] <= 0);
  if (k === 'width' && (g === 'ST' || g === 'AM')) return [[-1, '좁게'], [0, '표준'], [1, '측면 채널로 침투']];
  return o;
}
function normInstr(ins) { if (ins.move) { if (ins.move === 'stay') ins.fwd = -1; else if (ins.move === 'roam') ins.free = 1; else if (ins.move === 'channels') ins.width = 1; delete ins.move; } return ins; }
const LBL_TEAM = [
  ['소유권을 가졌을 때', [
    ['width', '공격 폭', [[0, '좁게'], [1, '균형되게'], [2, '넓게'], [3, '측면 극대화']]],
    ['passing', '패스 형태', [[0, '짧게'], [1, '표준'], [2, '다이렉트하게'], [3, '매우 다이렉트하게']]],
    ['tempo', '경기 템포', [[0, '매우 낮게'], [1, '낮게'], [2, '표준'], [3, '높게'], [4, '매우 높게']]],
    ['waste', '시간 지연', [[2, '자주'], [1, '표준'], [0, '드물게']]],
    ['buildUp', '공격 전개', [[true, '수비 지역에서 빌드업'], [false, '롱볼 위주']]],
    ['focus', '진입 지역', [['mixed', '혼합'], ['left', '좌측면'], ['center', '중앙'], ['right', '우측면']]],
    ['finalThird', '공격 진영 플레이', [['mixed', '균형'], ['workIn', '박스 안으로 진입'], ['shootOnSight', '기회 되면 슈팅']]],
    ['cross', '크로스 형태', [['mixed', '혼합'], ['low', '낮게 깔린'], ['high', '높은'], ['whipped', '강한']]],
    ['creative', '창조성', [['disciplined', '더 엄격하게'], ['normal', '표준'], ['express', '더 자유롭게']]]
  ]],
  ['전환 상황', [
    ['onLoss', '소유권을 잃었을 때', [['neutral', '표준'], ['counterpress', '즉각 재압박'], ['regroup', '진형 재정비']]],
    ['onWin', '소유권을 되찾았을 때', [['neutral', '표준'], ['counter', '즉각 역습'], ['holdShape', '진형 유지']]],
    ['gkMethod', 'GK 배급 방식', [['mixed', '혼합'], ['roll', '짧게 굴리기'], ['throw', '던지기'], ['kick', '발로 차기']]],
    ['gkTarget', 'GK 배급 대상', [['any', '제한 없음'], ['cb', '중앙 수비수'], ['fb', '풀백'], ['playmaker', '플레이메이커'], ['target', '표적 타깃'], ['wing', '측면 공격수']]],
    ['gkTempo', 'GK 배급 템포', [['slow', '템포 늦추기'], ['normal', '표준'], ['fast', '빠르게 배급']]]
  ]],
  ['소유권을 잃었을 때', [
    ['defLine', '수비 라인 위치', [[0, '매우 낮게'], [1, '낮게'], [2, '표준'], [3, '높게'], [4, '매우 높게']]],
    ['engage', '압박 기준선', [[0, '매우 낮게'], [1, '낮게'], [2, '표준'], [3, '높게'], [4, '매우 높게']]],
    ['press', '압박 강도', [[0, '덜 압박'], [1, '표준'], [2, '더 자주'], [3, '극도로 빈번하게']]],
    ['tackling', '태클 성향', [['normal', '표준'], ['getStuckIn', '발을 빼지 마라'], ['stayOnFeet', '서서 수비하라']]],
    ['trap', '수비 트랩', [['none', '없음'], ['inside', '안쪽으로 몰아넣기'], ['outside', '바깥쪽으로 몰아넣기']]],
    ['offsideTrap', '오프사이드 트랩', [[false, '사용 안 함'], [true, '사용']]]
  ]]
];
function viewTacticsScreen() {
  const w = h('div', { class: 'wrap stack' });
  const season = curSeason();
  const choices = [];
  if (season && season.userTeam && teamById(season.userTeam)) choices.push([season.userTeam, teamById(season.userTeam).name + ' (리그)']);
  for (const id of [S.home, S.away]) if (!choices.some(c => c[0] === id) && teamById(id)) choices.push([id, teamById(id).name]);
  if (!S.tacTeam || !teamById(S.tacTeam)) S.tacTeam = choices[0][0];
  if (!choices.some(c => c[0] === S.tacTeam)) choices.push([S.tacTeam, teamById(S.tacTeam).name]);
  const team = teamById(S.tacTeam); ensureNumbers(team);
  w.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'row' }, h('span', { class: 'kit', style: { background: team.color1, borderColor: team.color2 } }), h('h2', null, team.name)),
    h('div', { class: 'row' }, seg(choices, S.tacTeam, v => { S.tacTeam = v; S.selSlot = null; render(); }), h('select', { id: 'anyteam', onchange: e => { if (e.target.value) { S.tacTeam = e.target.value; render(); } } }, h('option', { value: '' }, '다른 팀 보기'), ...db.leagues.map(l => h('optgroup', { label: l.name }, ...l.teams.map(t => h('option', { value: t.id }, t.name))))))));
  const S2 = S.teamTab || 'tactics';
  w.append(h('div', { class: 'tabs', role: 'tablist' }, [['tactics', '전술'], ['squad', '선수단·등번호'], ['overview', '팀 현황'], ['status', '선수 상황'], ['wage', '급여']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(S2 === k), onclick: () => { S.teamTab = k; render(); } }, l))));
  const inLeague = season && season.teamIds.includes(team.id) && !season.done;
  if (S2 === 'tactics') {
    if (M && !M.ended) w.append(h('p', { class: 'hint', style: { margin: 0 } }, '진행 중인 경기의 전술은 경기 화면의 전술·교체 버튼에서 바꿉니다.'));
    let oppId = S.tacTeam === S.home ? S.away : S.home;
    const mine = season && season.userTeam === S.tacTeam && !season.done;
    if (mine) { const nx = nextUserFixture(season); if (nx) oppId = nx.h === S.tacTeam ? nx.a : nx.h; }
    w.append(tacticsPanel({ team, setup: setupFor(team.id), oppTeam: teamById(oppId), oppSetup: teamById(oppId) ? setupFor(oppId) : null, live: null, unavail: mine ? unavailableSet(season, team) : null, cond: mine ? season.cond : null, presets: { get: () => (LS.get('draftxi.tacpresets.v1') || {})[team.id] || [], set: l => { const all = LS.get('draftxi.tacpresets.v1') || {}; all[team.id] = l; LS.set('draftxi.tacpresets.v1', all); } }, onChange: () => { saveSetups(); render(true); } }));
  } else if (S2 === 'squad') w.append(squadTab(team));
  else if (S2 === 'overview') w.append(overviewTab(team, inLeague ? season : (season && season.teamIds.includes(team.id) ? season : null)));
  else if (S2 === 'status') w.append(statusTab(team, season && season.teamIds.includes(team.id) ? season : null));
  else w.append(h('div', { class: 'card' }, h('p', { class: 'hint', style: { margin: 0 } }, '급여·계약 정보는 이적시장과 함께 감독 모드(가상 선수 세계)에서 제공할 예정입니다. 실존 선수 리그에서는 표시하지 않습니다.')));
  return w;
}
// ---------- 등번호 ----------
const NUM_PREF = { GK: [1, 13, 31, 41], CB: [4, 5, 6, 15, 26, 33], LB: [3, 12, 21, 35], RB: [2, 22, 24, 32], DM: [6, 16, 18, 36], CM: [8, 14, 20, 23], AM: [10, 19, 25, 27], LW: [11, 17, 27, 37], RW: [7, 17, 28, 38], ST: [9, 19, 29, 30, 39] };
function ensureNumbers(team) {
  const taken = new Set(team.players.filter(p => p.num).map(p => p.num)); let changed = false;
  const order = team.players.slice().sort((a, b) => D.calcOvr(b.stats, b.pos) - D.calcOvr(a.stats, a.pos));
  for (const p of order) { if (p.num) continue; let n = (NUM_PREF[p.pos] || []).find(x => !taken.has(x)); if (!n) { n = 40; while (taken.has(n)) n++; } p.num = n; taken.add(n); changed = true; }
  if (changed) saveDB();
}
function squadTab(team) {
  const box = h('div', { class: 'card stack' });
  box.append(h('p', { class: 'hint', style: { margin: 0 } }, '등번호를 바꾸면 바로 저장되고 다음 경기부터 유니폼에 반영됩니다. 이름을 누르면 선수 프로필을 엽니다.'));
  const tb = h('tbody');
  const list = team.players.slice().sort((a, b) => D.POSITIONS.indexOf(a.pos) - D.POSITIONS.indexOf(b.pos) || (a.num || 99) - (b.num || 99));
  for (const p of list) {
    const o = D.calcOvr(p.stats, p.pos); const bio = D.bioOf(p, langOf(team));
    const inp = h('input', { type: 'number', min: 1, max: 99, value: p.num || '', id: 'num_' + p.id, 'aria-label': p.name + ' 등번호', style: { width: '64px' }, onchange: e => {
      const v = Math.max(1, Math.min(99, Math.round(+e.target.value || 0)));
      const other = team.players.find(q => q !== p && q.num === v);
      if (other) { other.num = p.num; toast(`${other.name}와 등번호를 맞바꿨습니다.`); }
      p.num = v; saveDB(); render(true);
    } });
    tb.append(h('tr', null, h('td', null, inp), h('td', null, h('span', { class: 'tag' }, posLabel(p.pos))), h('td', null, pl(p.name, p.id), p.gen ? h('span', { class: 'gen' }, '가상') : null), h('td', null, starsEl(starsOf(o))), h('td', { class: 'num ' + ovrClass(o) }, o), h('td', { class: 'num' }, bio.age + (bio.ageEst ? '*' : '')), h('td', { class: 'dim' }, `${bio.nat || '-'} · ${bio.height}cm · ${bio.foot}`)));
  }
  box.append(h('div', { class: 'plist', style: { maxHeight: 'none' } }, h('table', null, h('thead', null, h('tr', null, ...['번호', '포지션', '이름', '능력', '종합', '나이', '국적·신체·주발'].map(x => h('th', null, x)))), tb)));
  box.append(h('p', { class: 'hint', style: { margin: 0 } }, '나이 옆 * 표시는 출생연도 자료가 없어 추정한 값입니다. 별은 종합 능력치 기준(90 이상 5개, 반 개 단위)입니다.'));
  return box;
}
function langOf(team) { const W = window.FMWORLD; if (team.nation && W && W.NATIONS[team.nation]) return W.NATIONS[team.nation][1] || 'en'; const lg = leagueOf(team.id); return lg ? (D.LANG[lg.id] || 'en') : 'en'; }
// ---------- 팀 현황 ----------
const LINES = [['골키퍼', ['GK']], ['수비', ['CB', 'LB', 'RB']], ['미드필드', ['DM', 'CM', 'AM']], ['공격', ['LW', 'RW', 'ST']]];
function overviewTab(team, se) {
  const g = h('div', { class: 'grid2' });
  const setup = setupFor(team.id); const xi = setup.lineup.map(id => playerOf(team, id)).filter(Boolean);
  const lineCard = h('div', { class: 'card stack' }, h('h3', null, '포지션별 전력'));
  for (const [nm, ps] of LINES) {
    const arr = team.players.filter(p => ps.includes(p.pos)).map(p => D.calcOvr(p.stats, p.pos)).sort((a, b) => b - a);
    const top = arr.slice(0, nm === '골키퍼' ? 1 : nm === '수비' ? 4 : 3); const v = top.length ? Math.round(top.reduce((a, b) => a + b, 0) / top.length) : 0;
    lineCard.append(h('div', null, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', null, nm, h('span', { class: 'dim' }, ` · ${arr.length}명`)), h('span', { class: 'num ' + ovrClass(v), style: { fontSize: '18px' } }, v)), h('div', { class: 'meter' }, h('i', { style: { width: Math.max(0, (v - 55) / 40 * 100) + '%' } }))));
  }
  lineCard.append(h('div', { class: 'hint' }, `현재 선발 평균 ${teamStrength(team, setup)} · ${setup.formation}`));
  g.append(lineCard);
  const best = team.players.slice().sort((a, b) => D.calcOvr(b.stats, b.pos) - D.calcOvr(a.stats, a.pos)).slice(0, 6);
  g.append(h('div', { class: 'card stack' }, h('h3', null, '핵심 선수'), h('div', { class: 'rank' }, best.map((p, i) => h('div', { class: 'rk' }, h('span', { class: 'num dim' }, i + 1), h('span', { class: 'rkn' }, pl(p.name, p.id), h('span', { class: 'dim' }, ' ' + posLabel(p.pos))), h('span', { class: 'num ' + ovrClass(D.calcOvr(p.stats, p.pos)) }, D.calcOvr(p.stats, p.pos)))))));
  if (se) {
    const tb = computeTable(se); const pos = tb.findIndex(r => r.id === team.id); const r = tb[pos];
    let xgF = 0, xgA = 0, cs = 0, n = 0, shF = 0, shA = 0;
    for (const rd of se.rounds) for (const m of rd.matches) if (m.res && (m.h === team.id || m.a === team.id)) { const s = m.h === team.id ? 0 : 1; n++; if (m.res.xg) { xgF += m.res.xg[s]; xgA += m.res.xg[1 - s]; } if ((s ? m.res.hs : m.res.as) === 0) cs++; if (m.res.st) { shF += m.res.st[s].shots; shA += m.res.st[1 - s].shots; } }
    const rows = [['순위', `${pos + 1}위 / ${tb.length}`], ['전적', `${r.w}승 ${r.d}무 ${r.l}패 · 승점 ${r.pts}`], ['득점·실점', `${r.gf} · ${r.ga}`], ['기대 득점·실점(xG)', n ? `${xgF.toFixed(1)} · ${xgA.toFixed(1)}` : '-'], ['경기당 슈팅·허용', n ? `${(shF / n).toFixed(1)} · ${(shA / n).toFixed(1)}` : '-'], ['무실점 경기', cs], ['최근 5경기', r.form.slice(-5).map(f => f === 'W' ? '승' : f === 'D' ? '무' : '패').join(' ') || '-']];
    g.append(h('div', { class: 'card stack' }, h('h3', null, `${se.leagueName} ${se.label}`), ...rows.map(([k, v]) => h('div', { class: 'row', style: { justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px' } }, h('span', { class: 'muted' }, k), h('strong', { class: 'num' }, v)))));
    const ps = Object.entries(se.pstats).filter(([id, s]) => s.team === team.id).map(([id, s]) => Object.assign({ id, name: pname(team, id, se) }, s));
    const tg = ps.sort((a, b) => b.goals - a.goals || b.ast - a.ast).slice(0, 5);
    g.append(h('div', { class: 'card stack' }, h('h3', null, '시즌 공격 포인트'), tg.length ? h('div', { class: 'rank' }, tg.map((x, i) => h('div', { class: 'rk' }, h('span', { class: 'num dim' }, i + 1), h('span', { class: 'rkn' }, pl(x.name, x.id)), h('span', { class: 'num' }, `${x.goals}골 ${x.ast}도움`)))) : h('p', { class: 'hint' }, '아직 기록이 없습니다.')));
  } else g.append(h('div', { class: 'card' }, h('p', { class: 'hint', style: { margin: 0 } }, '이 팀이 참가한 진행 중인 시즌이 없어 시즌 기록은 표시하지 않습니다.')));
  return g;
}
function pname(team, id, se) { const p = playerOf(team, id); if (p) return p.name; for (const t of allTeams()) { const q = playerOf(t, id); if (q) return q.name; } if (se && se.pstats[id] && se.pstats[id].name) return se.pstats[id].name; return (db.legacyNames && db.legacyNames[id]) || id; }
// ---------- 선수 상황 ----------
function statusTab(team, se) {
  const box = h('div', { class: 'card stack' });
  if (!se) box.append(h('p', { class: 'hint', style: { margin: 0 } }, '진행 중인 시즌이 없어 모든 선수의 체력이 100%입니다. 리그를 시작하면 체력·징계·누적 경고가 여기에 표시됩니다.'));
  const tb = h('tbody');
  const list = team.players.slice().sort((a, b) => D.POSITIONS.indexOf(a.pos) - D.POSITIONS.indexOf(b.pos));
  for (const p of list) {
    const cond = se ? Math.round(se.cond[p.id] ?? 100) : 100; const susp = se ? (se.susp[p.id] || 0) : 0; const yc = se ? (se.ycount[p.id] || 0) : 0; const st = se && se.pstats[p.id];
    const state = susp ? h('span', { class: 'pill bad' }, `출전 정지 ${susp}경기`) : cond < 72 ? h('span', { class: 'pill warn' }, '피로') : h('span', { class: 'pill good' }, '출전 가능');
    tb.append(h('tr', null, h('td', null, h('span', { class: 'tag' }, posLabel(p.pos))), h('td', null, pl(p.name, p.id)), h('td', null, state),
      h('td', null, h('span', { class: 'en2', style: { display: 'inline-block', width: '70px', verticalAlign: 'middle' } }, h('i', { style: { width: cond + '%', background: cond < 60 ? 'var(--bad)' : cond < 75 ? 'var(--warn)' : 'var(--good)' } })), h('span', { class: 'num dim' }, ` ${cond}%`)),
      h('td', { class: 'num' }, yc ? `${yc}장${yc % 5 === 4 ? ' (다음 경고 시 정지)' : ''}` : '-'), h('td', { class: 'num' }, st ? `${st.apps + st.sub}경기 ${st.goals}골 ${st.ast}도움 · 평점 ${(st.rsum / Math.max(1, st.apps + st.sub)).toFixed(2)}` : '-')));
  }
  box.append(h('div', { class: 'plist', style: { maxHeight: 'none' } }, h('table', null, h('thead', null, h('tr', null, ...['포지션', '이름', '상태', '체력', '누적 경고', '시즌 기록'].map(x => h('th', null, x)))), tb)));
  return box;
}
// ---------- 선수 프로필 ----------
const HEX = [['속도', ['pace', 'accel']], ['슈팅', ['finishing', 'shotPower', 'longShots', 'positioning', 'volleys']], ['패스', ['vision', 'crossing', 'longPass', 'shortPass', 'curve']], ['드리블', ['dribbling', 'ballControl', 'agility', 'balance', 'reactions']], ['수비', ['marking', 'interceptions', 'standTackle', 'slideTackle']], ['피지컬', ['strength', 'stamina', 'jumping', 'aggression', 'heading']]];
const HEX_GK = [['다이빙', ['gkDiving']], ['핸들링', ['gkHandling']], ['킥', ['gkKicking']], ['반응', ['gkReflexes']], ['위치선정', ['gkPositioning']], ['속도', ['pace', 'accel']]];
const hexVals = (st, gk) => (gk ? HEX_GK : HEX).map(([n, ks]) => [n, Math.round(ks.reduce((a, k) => a + st[k], 0) / ks.length)]);
let posAvgCache = null;
function posAverages() {
  if (posAvgCache) return posAvgCache; const acc = {};
  for (const t of allTeams()) for (const p of t.players) { const g = D.tmplOf(p.pos); const a = acc[g] || (acc[g] = { n: 0, s: {} }); a.n++; for (const k of D.STAT_KEYS) a.s[k] = (a.s[k] || 0) + p.stats[k]; }
  for (const g in acc) for (const k in acc[g].s) acc[g].s[k] /= acc[g].n;
  return posAvgCache = acc;
}
function radarSVG(vals, avg) {
  const W = 300, H = 270, cx = 150, cy = 140, R = 100, n = vals.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const r = R * Math.max(0, Math.min(99, v)) / 99; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const NS = 'http://www.w3.org/2000/svg'; const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'radar', role: 'img', 'aria-label': '능력치 육각형: ' + vals.map(v => `${v[0]} ${v[1]}`).join(', ') });
  for (const ring of [25, 50, 75, 99]) svg.append(el('polygon', { points: vals.map((_, i) => pt(i, ring).join(',')).join(' '), class: 'rg' }));
  vals.forEach((_, i) => { const [x, y] = pt(i, 99); svg.append(el('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'rg' })); });
  if (avg) svg.append(el('polygon', { points: avg.map((v, i) => pt(i, v[1]).join(',')).join(' '), class: 'ravg' }));
  svg.append(el('polygon', { points: vals.map((v, i) => pt(i, v[1]).join(',')).join(' '), class: 'rval' }));
  vals.forEach((v, i) => {
    const [x, y] = pt(i, v[1]); const c = el('circle', { cx: x, cy: y, r: 4, class: 'rdot' }); const tt = el('title', {}); tt.textContent = `${v[0]} ${v[1]}${avg ? ` (포지션 평균 ${avg[i][1]})` : ''}`; c.append(tt); svg.append(c);
    const hit = el('circle', { cx: x, cy: y, r: 12, fill: 'transparent' }); hit.append(tt.cloneNode(true)); svg.append(hit);
    const [lx, ly] = pt(i, 122); const tx = el('text', { x: lx, y: ly + 4, 'text-anchor': Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end', class: 'rlbl' }); tx.textContent = `${v[0]} ${v[1]}`; svg.append(tx);
  });
  return svg;
}
const STYLE_RULES = [
  ['pace', 88, '스프린터', '최고 속도가 매우 빠름'], ['dribbling', 87, '드리블러', '1대1 돌파에 능함'], ['finishing', 87, '결정력', '박스 안 마무리가 정확함'], ['longShots', 84, '중거리 슈터', '박스 밖에서도 위협적'],
  ['vision', 87, '플레이메이커', '찬스를 만드는 패스 시야'], ['crossing', 84, '크로서', '측면 크로스가 정확함'], ['longPass', 85, '롱패서', '전방 전환 패스가 정확함'], ['freeKick', 84, '프리킥 키커', '직접 프리킥이 위협적'],
  ['heading', 85, '공중볼 장악', '헤더 경합에 강함'], ['strength', 87, '피지컬', '몸싸움에서 잘 버팀'], ['stamina', 88, '강철 체력', '경기 끝까지 활동량 유지'], ['standTackle', 85, '태클러', '볼 탈취에 능함'],
  ['interceptions', 85, '길목 차단', '패스 길을 잘 읽음'], ['curve', 86, '감아차기', '공에 회전을 잘 줌'], ['gkReflexes', 86, '반사 신경', '근거리 슈팅 선방'], ['gkKicking', 84, '빌드업 키퍼', '정확한 킥 배급']
];
function analyzePlayer(p) {
  const avg = posAverages()[D.tmplOf(p.pos)]; if (!avg) return { good: [], bad: [], styles: [] };
  const gk = p.pos === 'GK';
  const keys = D.STAT_KEYS.filter(k => gk ? (k.startsWith('gk') || ['reactions', 'pace', 'jumping'].includes(k)) : !k.startsWith('gk'));
  // 포지션에서 중요한 능력치 위주로 평가 (포지션 평균이 낮은 능력치는 단점으로 보지 않음)
  const diffs = keys.map(k => ({ k, d: p.stats[k] - avg.s[k], imp: avg.s[k] })).filter(x => x.imp >= (gk ? 40 : 55));
  const good = diffs.filter(x => x.d >= 4).sort((a, b) => b.d - a.d).slice(0, 4);
  const bad = diffs.filter(x => x.d <= -4).sort((a, b) => a.d - b.d).slice(0, 3);
  const styles = STYLE_RULES.filter(([k, t]) => p.stats[k] >= t && (gk ? k.startsWith('gk') : !k.startsWith('gk'))).map(([k, t, n, d]) => ({ n, d }));
  return { good, bad, styles };
}
const TRAIT_NAMES = { S: '스피드', P: '피지컬', T: '테크닉', F: '결정력', A: '공중볼', V: '시야·패스', D: '수비', K: '킥', E: '체력' };
function showPlayer(team, p) {
  const bio = D.bioOf(p, langOf(team));
  const se = curSeason(); const st = se && se.pstats[p.id];
  modalOver(profileView({
    p, team: { name: team.name, c1: team.color1, c2: team.color2 }, bio, fam: famLevels(p), stars: { cur: starsOf(D.calcOvr(p.stats, p.pos)) },
    extraChips: (p.pt || []).filter(i => window.Career && Career.PTRAITS && Career.PTRAITS[i]).map(i => h('span', { class: 'chip ghost' }, Career.PTRAITS[i][0])),
    notes: [p.dob != null ? `FC27 데이터베이스 기준 (${db.ref || '2026-09-12'}). 키·몸무게는 자료가 없어 표시하지 않으며, 3D 경기에서는 기본 체형으로 나옵니다.` : null, p.gen ? '명단 인원이 부족해 자동 생성한 가상 선수입니다.' : null, bio.est ? '키·몸무게·주발·약발은 실제 자료가 없어 능력치로 추정한 값입니다. 데이터베이스에서 고칠 수 있습니다.' : null, bio.ageEst ? '이 선수는 출생연도 자료가 없어 나이를 추정했습니다.' : null].filter(Boolean),
    season: st ? `${se.label} 시즌: ${st.apps + st.sub}경기(선발 ${st.apps}) ${st.goals}골 ${st.ast}도움 · 평균 평점 ${(st.rsum / Math.max(1, st.apps + st.sub)).toFixed(2)} · 경기 최우수 ${st.motm}회` : null
  }), 'profile');
}
// 선수 프로필 본문 (실축·가상 공통). o: { p, team, bio, fam, stars:{cur,pot}, notes[], season, extraHead, tabs:[[key,label,fn]], badges[] }
function profileView(o) {
  const p = o.p, team = o.team, bio = o.bio; const ovr = D.calcOvr(p.stats, p.pos); const gk = p.pos === 'GK';
  const vals = hexVals(p.stats, gk); const avgS = posAverages()[D.tmplOf(p.pos)]; const avg = avgS ? hexVals(avgS.s, gk) : null;
  const an = analyzePlayer(p);
  const wk = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const age = bio.age != null ? `${bio.age}세${bio.ageEst ? ' (추정)' : ''}` : '-';
  const bioRows = [['나이', age], ['국적', bio.nat || '미입력'], bio.height != null ? ['키', `${bio.height}cm${bio.hEst ? ' (추정)' : ''}`] : null, bio.weight != null ? ['몸무게', `${bio.weight}kg${bio.wEst ? ' (추정)' : ''}`] : null, ['주발', bio.foot], ['약발', wk(bio.weak)]].filter(Boolean);
  const head = h('div', { class: 'phead' }, h('div', { class: 'pnum', style: { background: team.c1, color: ink(team.c1), borderColor: team.c2 } }, p.num || '-'),
    h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'lbl' }, `${team.name} · ${posLabel(p.pos)}`, (() => { const a = E.archsOf(p, p.pos)[0]; return a ? h('span', { class: 'archtag', title: '대표 포지션에서 가장 잘 맞는 성향 유형' }, `${posLabel(p.pos)} (${a.n})`) : null; })()), h('h2', null, p.name, p.gen ? h('span', { class: 'gen' }, '가상') : null, ...(o.badges || [])),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, starsEl(o.stars.cur, o.stars.pot), o.stars.pot != null ? h('span', { class: 'hint' }, `현재 ${o.stars.cur} · 잠재 ${o.stars.pot}${o.stars.potNote ? ' ' + o.stars.potNote : ''}`) : null)),
    h('div', { class: 'povr ' + ovrClass(ovr) }, ovr));
  const overview = () => h('div', { class: 'pgrid' },
    h('div', { class: 'stack' }, radarSVG(vals, avg), h('div', { class: 'hint', style: { textAlign: 'center' } }, h('span', { class: 'sw val' }), ' 선수  ', h('span', { class: 'sw avg' }), ` ${posLabel(p.pos)} 포지션 평균`)),
    h('div', { class: 'stack' },
      h('div', { class: 'biogrid' }, ...bioRows.map(([k, v]) => h('div', null, h('div', { class: 'lbl' }, k), h('div', { class: 'num' }, v)))),
      ...(o.notes || []).map(t => h('p', { class: 'hint', style: { margin: 0 } }, t)),
      h('div', { class: 'grid2', style: { gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } },
        h('div', null, h('div', { class: 'lbl' }, '포지션 숙련도'), famPitch(p)),
        h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', null, h('div', { class: 'lbl' }, '플레이 스타일'), h('div', { class: 'chips' }, ...(an.styles.length ? an.styles.map(x => h('span', { class: 'chip', title: x.d }, x.n)) : [h('span', { class: 'dim' }, '두드러진 스타일 없음')]), ...(p.traits || '').split('').filter(c => TRAIT_NAMES[c]).map(c => h('span', { class: 'chip ghost' }, TRAIT_NAMES[c])), ...(o.extraChips || []))),
          h('div', null, h('div', { class: 'lbl' }, '장점 (포지션 평균 대비)'), ...(an.good.length ? an.good.map(x => h('div', { class: 'gb good' }, `${D.STAT_LABELS[x.k]} ${p.stats[x.k]}`, h('span', { class: 'dim' }, ` +${Math.round(x.d)}`))) : [h('div', { class: 'dim' }, '-')])),
          h('div', null, h('div', { class: 'lbl' }, '단점 (포지션 평균 대비)'), ...(an.bad.length ? an.bad.map(x => h('div', { class: 'gb bad' }, `${D.STAT_LABELS[x.k]} ${p.stats[x.k]}`, h('span', { class: 'dim' }, ` ${Math.round(x.d)}`))) : [h('div', { class: 'dim' }, '-')])))),
      o.extraOverview || null,
      o.season ? h('div', { class: 'hint' }, o.season) : null));
  const statsTab = () => h('div', { class: 'stack' }, archPanel(p), statsGrid());
  const statsGrid = () => h('div', { class: 'sgrid' }, ...D.STAT_GROUPS.filter(([g]) => gk || g !== '골키퍼').map(([gname, keys]) => h('div', { class: 'sg' }, h('h4', null, gname), ...keys.map(k => h('div', { class: 'srow2' }, h('span', null, D.STAT_LABELS[k]), h('span', { class: 'bar1' }, h('i', { style: { width: p.stats[k] + '%' } })), h('span', { class: 'num ' + ovrClass(p.stats[k]) }, p.stats[k]))))));
  const tabs = [['ov', '개요', overview], ['st', '능력치', statsTab], ...(o.tabs || [])];
  const body = h('div', { class: 'pprof' });
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const pane = h('div');
  const show = k => { S.profTab = k; tabBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.k === k))); pane.innerHTML = ''; const t = tabs.find(x => x[0] === k) || tabs[0]; pane.append(t[2]()); };
  for (const [k, l] of tabs) tabBar.append(h('button', { role: 'tab', 'data-k': k, onclick: () => show(k) }, l));
  body.append(...[head, o.extraHead, tabBar, pane].filter(Boolean));
  show(tabs.some(t => t[0] === S.profTab) ? S.profTab : 'ov');
  const cm = { id: p.id, name: p.name, team: team.name, c1: team.c1, pos: p.pos, stats: p.stats, age: bio.age, ovr, gk };
  const cmpBtn = h('button', { class: 'btn', title: '두 선수의 능력치를 나란히 비교', onclick: () => compareAdd(cm) }, S.cmp && S.cmp.id !== p.id ? `${shortName(S.cmp.name)}와 비교` : S.cmp && S.cmp.id === p.id ? '비교 대기 중' : '비교');
  return h('div', null, h('div', { class: 'mhead' }, h('span', { class: 'grow' }), cmpBtn, ...(o.actions || []), h('button', { class: 'btn', onclick: closeModal }, '닫기')), body);
}
// ---------- 선수 비교 ----------
function compareAdd(m) {
  if (S.cmp && S.cmp.id !== m.id) { const a = S.cmp; S.cmp = null; return openCompare(a, m); }
  S.cmp = m; toast(`${m.name}을(를) 비교 대상으로 골랐습니다. 다른 선수 프로필에서 '비교'를 누르세요.`);
  const b = document.querySelector('.modal.layer[data-key="profile"] .mhead .btn, #modal[data-kind="profile"] .mhead .btn'); if (b && b.textContent === '비교') b.textContent = '비교 대기 중';
}
function radarCompare(a, b) {
  const W = 300, H = 270, cx = 150, cy = 140, R = 100, n = a.length;
  const pt = (i, v) => { const t = -Math.PI / 2 + i * 2 * Math.PI / n; const r = R * Math.max(0, Math.min(99, v)) / 99; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; };
  const NS = 'http://www.w3.org/2000/svg'; const el = (t, at) => { const e = document.createElementNS(NS, t); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'radar', role: 'img', 'aria-label': '능력치 비교: ' + a.map((v, i) => `${v[0]} ${v[1]} 대 ${b[i][1]}`).join(', ') });
  for (const ring of [25, 50, 75, 99]) svg.append(el('polygon', { points: a.map((_, i) => pt(i, ring).join(',')).join(' '), class: 'rg' }));
  a.forEach((_, i) => { const [x, y] = pt(i, 99); svg.append(el('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'rg' })); });
  svg.append(el('polygon', { points: b.map((v, i) => pt(i, v[1]).join(',')).join(' '), class: 'rvalb' }));
  svg.append(el('polygon', { points: a.map((v, i) => pt(i, v[1]).join(',')).join(' '), class: 'rval' }));
  a.forEach((v, i) => { const [lx, ly] = pt(i, 122); const tx = el('text', { x: lx, y: ly + 4, 'text-anchor': Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end', class: 'rlbl' }); tx.textContent = v[0]; svg.append(tx); });
  return svg;
}
function openCompare(A, B) {
  const gk = A.gk && B.gk; const va = hexVals(A.stats, gk), vb = hexVals(B.stats, gk);
  const head = m => h('div', { class: 'stack', style: { gap: '2px', minWidth: 0 } }, h('strong', null, pl(m.name, m.id)), h('span', { class: 'hint' }, `${m.team} · ${posLabel(m.pos)} · ${m.age != null ? m.age + '세' : ''}`), h('span', { class: 'num ' + ovrClass(m.ovr), style: { fontSize: '22px' } }, m.ovr));
  const rows = h('div', { class: 'cmpgrid' });
  for (const [gname, keys] of D.STAT_GROUPS.filter(([g]) => gk || g !== '골키퍼')) {
    rows.append(h('div', { class: 'cmpg' }, gname));
    for (const k of keys) {
      const x = A.stats[k], y = B.stats[k]; const d = x - y;
      rows.append(h('div', { class: 'cmpr' }, h('span', { class: 'num ' + (d > 0 ? 'win' : '') }, x), h('span', { class: 'cbar' }, h('i', { class: 'l', style: { width: Math.max(0, d) * 2.2 + '%' } }), h('em', null, D.STAT_LABELS[k]), h('i', { class: 'r', style: { width: Math.max(0, -d) * 2.2 + '%' } })), h('span', { class: 'num ' + (d < 0 ? 'win' : '') }, y)));
    }
  }
  const wa = D.STAT_KEYS.filter(k => (gk || !k.startsWith('gk')) && A.stats[k] > B.stats[k]).length, wb = D.STAT_KEYS.filter(k => (gk || !k.startsWith('gk')) && A.stats[k] < B.stats[k]).length;
  modalOver(h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, '선수 비교'), h('button', { class: 'btn', onclick: closeModal }, '닫기')),
    h('div', { class: 'cmphead' }, h('div', { class: 'cmpa' }, head(A)), h('div', { class: 'hint', style: { alignSelf: 'center' } }, 'vs'), h('div', { class: 'cmpb' }, head(B))),
    h('div', { class: 'grid2', style: { alignItems: 'start' } },
      h('div', { class: 'stack' }, radarCompare(va, vb), h('div', { class: 'hint', style: { textAlign: 'center' } }, h('span', { class: 'sw val' }), ` ${A.name}  `, h('span', { class: 'sw valb' }), ` ${B.name}`), h('div', { class: 'hint', style: { textAlign: 'center' } }, `세부 능력치 우위 ${wa} : ${wb}`)),
      rows)), 'compare');
}
function tacticsPanel(ctx) {
  const box = h('div', { class: 'stack' });
  const oppT = ctx.live ? ctx.live.M.teams[1 - ctx.live.T.side].db : ctx.oppTeam;
  const tabs = [['lineup', '선수 배치·역할'], ['team', '팀 지침'], ['set', '세트피스·주장']]; if (oppT) tabs.push(['oi', '상대 선수 지시']);
  if (S.tacTab === 'oi' && !oppT) S.tacTab = 'lineup';
  if (!ctx.live && ctx.presets) box.append(presetBar(ctx));
  box.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(S.tacTab === k), onclick: () => { S.tacTab = k; ctx.onChange(); } }, l))));
  if (S.tacTab === 'lineup') box.append(lineupTab(ctx));
  else if (S.tacTab === 'team') box.append(teamTab(ctx));
  else if (S.tacTab === 'oi') box.append(oiTab(ctx, oppT));
  else box.append(setTab(ctx));
  return box;
}
// 전술 프리셋: 포메이션·위치·역할·개인 지침·팀 지침(세트피스 포함)을 이름 붙여 여러 개 저장
const PRESET_MAX = 30;
const clone = o => JSON.parse(JSON.stringify(o));
function presetOf(setup, withXI) {
  const o = { formation: setup.formation, slots: setup.slots ? clone(setup.slots) : null, roles: clone(setup.roles), instr: clone(setup.instr), tactics: clone(setup.tactics) };
  if (withXI) Object.assign(o, { lineup: setup.lineup.slice(), bench: (setup.bench || []).slice(), captain: setup.captain, takers: clone(setup.takers || {}) });
  return o;
}
function applyPreset(ctx, pr) {
  const { team, setup } = ctx;
  setup.formation = pr.formation; if (pr.slots) setup.slots = clone(pr.slots); else delete setup.slots;
  setup.roles = clone(pr.roles); setup.instr = clone(pr.instr); setup.tactics = Object.assign(clone(setup.tactics || {}), clone(pr.tactics));
  if (pr.lineup) {
    const ok = id => team.players.some(p => p.id === id) && !(ctx.unavail && ctx.unavail.has(id));
    const used = new Set(); const nl = pr.lineup.map(id => ok(id) ? id : null); nl.forEach(id => id && used.add(id));
    // 빠진 자리는 기존 선발 중 남는 선수 → 그래도 없으면 자동 선택으로 채움
    const spare = setup.lineup.filter(id => !used.has(id) && ok(id));
    for (let i = 0; i < 11; i++) if (!nl[i]) { const id = spare.shift(); if (id) { nl[i] = id; used.add(id); } }
    if (nl.some(x => !x)) { const auto = availSetup(team, setup.formation, ctx.unavail || new Set(), ctx.cond, setup); for (let i = 0; i < 11; i++) if (!nl[i]) { const id = auto.lineup.find(x => !used.has(x)); nl[i] = id; used.add(id); } }
    setup.lineup = nl; setup.bench = (pr.bench || []).filter(id => ok(id) && !used.has(id)).slice(0, 12);
    if (pr.captain && nl.includes(pr.captain)) setup.captain = pr.captain;
    if (pr.takers) setup.takers = Object.assign({ pen: '', fk: '', corner: '' }, pr.takers);
  }
  S.selSlot = null; S.swapA = null;
}
function presetBar(ctx) {
  const list = ctx.presets.get() || [];
  const st = presetBar.st = presetBar.st || { sel: 0, xi: false };
  if (st.sel >= list.length) st.sel = 0;
  const name = h('input', { type: 'text', id: 'prname', placeholder: '새 전술 이름 (예: 홈 공격형)', maxlength: 24, style: { width: '180px' } });
  const saveNew = () => { const n = (name.value || '').trim() || `전술 ${list.length + 1}`; if (list.length >= PRESET_MAX) return toast(`최대 ${PRESET_MAX}개까지 저장할 수 있습니다.`); list.push({ n, xi: st.xi, s: presetOf(ctx.setup, st.xi) }); ctx.presets.set(list); st.sel = list.length - 1; toast(`'${n}' 전술을 저장했습니다.`); ctx.onChange(); };
  const cur = list[st.sel];
  return h('div', { class: 'card presetbar' },
    h('span', { class: 'lbl' }, '저장된 전술'),
    list.length ? sel(list.map((p, i) => [String(i), `${p.n} · ${p.s.slots ? E.formLabel(p.s.slots) : p.s.formation}${p.xi ? ' · 선발 포함' : ''}`]), String(st.sel), v => { st.sel = +v; ctx.onChange(); }, 'prsel') : h('span', { class: 'hint' }, '아직 없습니다'),
    cur ? h('button', { class: 'btn sm primary', onclick: () => { applyPreset(ctx, cur.s); toast(`'${cur.n}' 전술을 불러왔습니다.`); ctx.onChange(); } }, '불러오기') : null,
    cur ? h('button', { class: 'btn sm', onclick: () => confirmBox(`'${cur.n}'을(를) 지금 전술로 덮어쓸까요?`, () => { cur.s = presetOf(ctx.setup, st.xi); cur.xi = st.xi; ctx.presets.set(list); toast('덮어썼습니다.'); ctx.onChange(); }, '덮어쓰기') }, '덮어쓰기') : null,
    cur ? h('button', { class: 'btn sm ghost', onclick: () => confirmBox(`'${cur.n}' 전술을 삭제할까요?`, () => { list.splice(st.sel, 1); ctx.presets.set(list); st.sel = 0; ctx.onChange(); }) }, '삭제') : null,
    h('span', { class: 'sep' }), name, h('label', { class: 'row', style: { gap: '4px' }, title: '선발·벤치·주장·키커까지 함께 저장' }, h('input', { type: 'checkbox', checked: st.xi || null, onchange: e => { st.xi = e.target.checked; } }), '선발 명단 포함'),
    h('button', { class: 'btn sm', onclick: saveNew }, '지금 전술 저장'),
    h('span', { class: 'sep' }),
    h('button', { class: 'btn sm', title: '지금 전술과 저장된 전술 목록을 파일 하나로 내려받습니다', onclick: exportTac }, '파일로 내보내기'),
    h('label', { class: 'btn sm', for: 'tacfile', title: '내보낸 전술 파일을 불러와 저장 목록에 더하고 바로 적용합니다' }, '파일 불러오기'),
    h('input', { type: 'file', id: 'tacfile', accept: '.json,.txt', hidden: true, onchange: e => { const f = e.target.files[0]; if (f) f.text().then(importTac).catch(() => toast('파일을 읽지 못했습니다.')); } }));
  function exportTac() {
    const n = (name.value || '').trim() || '현재 전술'; const o = { app: 'draftxi', kind: 'tactics', v: 1, at: new Date().toISOString(), current: { n, xi: false, s: presetOf(ctx.setup, false) }, saved: list };
    if (downloadText(JSON.stringify(o, null, 1), `draftxi-tactics-${n.replace(/[^0-9A-Za-z가-힣_-]+/g, '_')}.json`, 'application/json')) toast('전술 파일을 내려받았습니다.'); else toast('파일을 만들지 못했습니다.');
  }
  function importTac(txt) {
    let o; try { o = JSON.parse(txt); } catch (e) { return toast('전술 파일 형식이 아닙니다.'); }
    const okP = p => p && p.s && Array.isArray(p.s.roles) && p.s.roles.length === 11 && Array.isArray(p.s.instr) && p.s.instr.length === 11 && p.s.tactics && (E.FORMATIONS[p.s.formation] || (p.s.slots && p.s.slots.length === 11));
    const items = [].concat(o && o.current ? [o.current] : [], (o && o.saved) || [], Array.isArray(o) ? o : []).filter(okP);
    if (!items.length) return toast('불러올 전술이 없습니다. DRAFT XI에서 내보낸 파일인지 확인하세요.');
    let added = 0, first = -1; for (const it of items) { if (list.length >= PRESET_MAX) break; if (list.some(x => x.n === it.n && JSON.stringify(x.s) === JSON.stringify(it.s))) continue; list.push({ n: String(it.n || '불러온 전술').slice(0, 24), xi: !!it.xi, s: it.s }); if (first < 0) first = list.length - 1; added++; }
    ctx.presets.set(list); applyPreset(ctx, items[0].s); if (first >= 0) st.sel = first;
    toast(`전술 ${added}개를 저장 목록에 더하고 '${items[0].n || '불러온 전술'}'을(를) 적용했습니다.`); ctx.onChange();
  }
}
// 상대 선수 지시: 밀착 마크 · 압박 · 태클 강도 · 약한 발로 유도
const OI_F = [['mark', '밀착 마크', [[0, '기본'], [1, '밀착']]], ['press', '압박', [[-1, '자제'], [0, '기본'], [1, '항상']]], ['tackle', '태클', [[-1, '부드럽게'], [0, '기본'], [1, '거칠게']]], ['foot', '약한 발로 유도', [[0, '기본'], [1, '유도']]]];
function oiTab(ctx, oppT) {
  const { setup, live } = ctx; setup.oi = setup.oi || {};
  if (!live && setup.oiFor !== oppT.id) { setup.oi = {}; setup.oiFor = oppT.id; }
  const box = h('div', { class: 'card stack' });
  let list;
  if (live) list = live.M.teams[1 - live.T.side].players.filter(p => !p.off).map(p => p.d);
  else { const os = ctx.oppSetup; list = os && os.lineup ? os.lineup.map(id => oppT.players.find(p => p.id === id)).filter(Boolean) : oppT.players.slice().sort((a, b) => D.calcOvr(b.stats, b.pos) - D.calcOvr(a.stats, a.pos)).slice(0, 14); }
  box.append(h('div', { class: 'row' }, h('h3', { class: 'grow', style: { margin: 0 } }, `${oppT.name} 선수별 지시`), h('button', { class: 'btn sm', onclick: () => { setup.oi = {}; ctx.onChange(); } }, '모두 초기화')));
  box.append(h('p', { class: 'hint', style: { margin: 0 } }, '밀착 마크: 공을 받을 때 볼 컨트롤이 어려워지고 그 선수에게 가는 패스가 더 자주 끊깁니다. 압박 항상: 공을 잡으면 더 자주 덤벼듭니다. 태클 거칠게: 공을 더 자주 빼앗지만 파울·경고가 늘어납니다. 약한 발로 유도: 슈팅 정확도가 조금 떨어집니다.'));
  const tb = h('table', { class: 'oit' }, h('thead', null, h('tr', null, h('th', null, '선수'), ...OI_F.map(f => h('th', null, f[1])))));
  const body = h('tbody');
  for (const d of list) {
    const o = setup.oi[d.id] || {};
    body.append(h('tr', null, h('td', null, h('span', { class: 'tag' }, posLabel(d.pos)), ' ', pl(d.name, d.id), h('span', { class: 'dim num' }, ' ' + D.calcOvr(d.stats, d.pos))),
      ...OI_F.map(([k, , opts]) => h('td', null, seg(opts.map(x => [String(x[0]), x[1]]), String(o[k] || 0), v => { const cur = Object.assign({}, setup.oi[d.id] || {}); cur[k] = +v; if (!cur[k]) delete cur[k]; if (Object.keys(cur).length) setup.oi[d.id] = cur; else delete setup.oi[d.id]; ctx.onChange(); })))));
  }
  tb.append(body); box.append(h('div', { class: 'plist', style: { maxHeight: 'none' } }, tb));
  return box;
}
function playerOf(team, id) { return team ? team.players.find(p => p.id === id) : null; }
// 프리셋을 사용자 지정 위치로 복사
function ensureSlots(setup) { if (!setup.slots || setup.slots.length !== 11) setup.slots = E.slotsOf(setup).map(x => [x[0], x[1], x[2]]); return setup.slots; }
// 구역 라벨 위치 = E.codeAt 경계의 가운데 (top% = 95 - y*92, left% = 50 + x*41)
const ZONES = [['ST', 50, 15], ['AML', 14, 34], ['AMC', 50, 34], ['AMR', 86, 34], ['ML', 14, 49], ['MC', 50, 49], ['MR', 86, 49], ['WBL', 14, 63], ['DM', 50, 63], ['WBR', 86, 63], ['DL', 14, 78], ['DC', 50, 78], ['DR', 86, 78]];
const ZONE_H = [.74, .58, .42, .27, .1].map(y => 95 - y * 92), ZONE_V = [50 - .55 * 41, 50 + .55 * 41];
function lineupTab(ctx) {
  const { team, setup, live } = ctx;
  const F = E.slotsOf(setup);
  const custom = !!(setup.slots && setup.slots.length === 11);
  const g = h('div', { class: 'tac' });
  const left = h('div', { class: 'stack' });
  const presets = Object.keys(E.FORMATIONS).map(f => [f, f]);
  left.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, '포메이션'), sel(custom ? [['custom', `사용자 지정 ${E.formLabel(F)}`], ...presets] : presets, custom ? 'custom' : setup.formation, v => {
    if (v === 'custom') return;
    if (live) { E.changeFormation(live.M, live.T, v); logOp({ side: live.T.side, op: 'form', f: v }); }
    else { setup.formation = v; delete setup.slots; setup.roles = E.FORMATIONS[v].map(s => s[3]); setup.instr = E.FORMATIONS[v].map(() => E.DEFAULT_INSTR()); }
    S.selSlot = null; ctx.onChange();
  }, 'tfm'),
    !live ? h('button', { class: 'btn sm', onclick: () => { const ns = availSetup(team, setup.formation, ctx.unavail || new Set(), ctx.cond, setup); const keepSlots = setup.slots; setup.lineup = ns.lineup; setup.bench = ns.bench; if (!keepSlots) setup.roles = ns.roles; setup.captain = ns.captain; S.selSlot = null; ctx.onChange(); } }, '자동 선발') : null,
    !live ? h('button', { class: 'btn sm', title: '각 자리 선수의 성향 유형에 가장 잘 맞는 역할로 바꿈', onclick: () => { let n = 0; E.slotsOf(setup).forEach((sl, k) => { const pp = playerOf(team, setup.lineup[k]); if (!pp) return; const f = roleFit(pp, sl[0]); const best = E.rolesForSlot(sl[0]).filter(r => f[r] != null).sort((a, b) => f[b] - f[a])[0]; if (best && setup.roles[k] !== best) { setup.roles[k] = best; n++; } }); toast(n ? `역할 ${n}개를 추천 역할로 바꿨습니다.` : '이미 모두 추천 역할입니다.'); ctx.onChange(); } }, '추천 역할로') : null,
    live ? h('span', { class: 'hint' }, `남은 교체 ${live.T.subsLeft}회`) : null));
  if (ctx.unavail && setup.lineup.some(id => ctx.unavail.has(id))) left.append(h('div', { class: 'warnbox' }, '출전할 수 없는 선수가 선발에 있습니다. 경기 시작 시 같은 자리에 가장 적합한 선수로 자동 교체됩니다.'));
  const pitch = h('div', { class: 'tpitch drag' });
  for (const t of ZONE_H) pitch.append(h('i', { class: 'zl h', style: { top: t + '%' } }));
  for (const l of ZONE_V) pitch.append(h('i', { class: 'zl v', style: { left: l + '%', top: ZONE_H[0] + '%', height: (ZONE_H[4] - ZONE_H[0]) + '%' } }));
  for (const [lb, x, y] of ZONES) pitch.append(h('span', { class: 'zone', style: { left: x + '%', top: y + '%' } }, lb));
  F.forEach((s, i) => {
    const p = playerOf(team, setup.lineup[i]);
    const lp = live ? live.T.players.find(q => q.slot === i && !q.off) : null;
    const lv = p ? E.famLevel(p, s[0]) : 3; const rt = p ? E.posRating(p, s[0]) : null;
    const susp = ctx.unavail && p && ctx.unavail.has(p.id);
    const btn = h('button', { class: 'slot ' + ['fam-x', 'fam-bad', 'fam-mid', ''][lv], 'data-si': i, 'aria-pressed': String(S.selSlot === i), style: { left: (50 + s[2] * 41) + '%', top: (95 - s[1] * 92) + '%' }, title: p ? `${p.name} (대표 ${posLabel(p.pos)} ${D.calcOvr(p.stats, p.pos)}) — ${posLabel(s[0])} 자리 능력치 ${rt} · ${FAM_LBL[lv]} · 끌어서 다른 선수 위에 놓으면 서로 자리 교체, 빈 곳에 놓으면 위치 이동` : posLabel(s[0]) },
      h('span', { class: 'disc', style: { background: s[0] === 'GK' ? '#f2d03d' : team.color1, color: s[0] === 'GK' ? '#111' : ink(team.color1), borderColor: susp ? '#e46a5a' : team.color2 } }, live && lp ? lp.num : (p ? rt : '?')),
      lp ? h('span', { class: 'en' }, h('i', { style: { width: lp.energy + '%', background: lp.energy < 60 ? 'var(--bad)' : lp.energy < 75 ? 'var(--warn)' : 'var(--good)' } })) : null,
      h('span', { class: 'nm' }, live && lp ? shortName(lp.name) : (p ? shortName(p.name) : '비어 있음')),
      h('span', { class: 'meta' }, susp ? '출전 불가' : `${posLabel(s[0])} · ${(E.ROLES[setup.roles[i]] || {}).n || ''}`));
    // 드래그: 놓은 위치의 구역으로 포지션이 바뀜 (GK는 고정)
    let drag = null;
    btn.addEventListener('pointerdown', e => { if (e.button > 0) return; drag = { x: e.clientX, y: e.clientY, moved: false }; btn.setPointerCapture(e.pointerId); });
    btn.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true; btn.classList.add('dragging');
      const r = pitch.getBoundingClientRect(); const lx = Math.max(4, Math.min(96, (e.clientX - r.left) / r.width * 100)), ty = Math.max(8, Math.min(84, (e.clientY - r.top) / r.height * 100));
      btn.style.left = lx + '%'; btn.style.top = ty + '%';
      const nx = (lx - 50) / 41, ny = (95 - ty) / 92; const tg = dropTarget(pitch, btn, e); pitch.querySelectorAll('.droptgt').forEach(x => x !== tg && x.classList.remove('droptgt')); if (tg) { tg.classList.add('droptgt'); btn.querySelector('.meta').textContent = '자리 교체'; } else btn.querySelector('.meta').textContent = posLabel(E.codeAt(ny, nx));
    });
    btn.addEventListener('pointerup', e => {
      if (!drag) return; const moved = drag.moved; drag = null; btn.classList.remove('dragging');
      if (!moved) return;
      const tg = dropTarget(pitch, btn, e); pitch.querySelectorAll('.droptgt').forEach(x => x.classList.remove('droptgt'));
      if (tg) { const j = +tg.dataset.si; btn.dataset.dragged = '1'; swapSlotPlayers(ctx, i, j); return; }
      if (s[0] === 'GK') { btn.dataset.dragged = '1'; return ctx.onChange(); } // 골키퍼 자리는 위치 이동 없음 (교체만)
      const r = pitch.getBoundingClientRect(); const lx = Math.max(4, Math.min(96, (e.clientX - r.left) / r.width * 100)), ty = Math.max(8, Math.min(84, (e.clientY - r.top) / r.height * 100));
      const nx = +(Math.round((lx - 50) / 41 * 50) / 50).toFixed(2), ny = +(Math.round((95 - ty) / 92 * 50) / 50).toFixed(2);
      const sl = ensureSlots(setup); const code = E.codeAt(ny, nx);
      if (code !== sl[i][0] && !E.rolesForSlot(code).includes(setup.roles[i])) setup.roles[i] = E.DEFAULT_ROLE[code] || E.rolesForSlot(code)[0];
      sl[i] = [code, ny, nx]; setup.formation = 'custom';
      if (live) E.refreshCodes(live.T);
      btn.dataset.dragged = '1'; ctx.onChange();
    });
    btn.addEventListener('click', e => { if (btn.dataset.dragged) { delete btn.dataset.dragged; return; } slotClick(ctx, i); });
    pitch.append(btn);
  });
  left.append(pitch);
  left.append(h('p', { class: 'hint', style: { margin: 0 } }, '자리를 누르면 그 자리의 역할·개인 지침을 정합니다. 선수 교체는 명단의 ⇄ 교체 버튼으로 합니다. ' + '바둑알 숫자는 그 자리에 섰을 때의 능력치입니다. 바둑알을 다른 선수 위에 끌어다 놓으면 두 선수의 자리가 바뀌고, 빈 곳에 놓으면 그 구역의 포지션(DL·DC·WBL·DM·MC·AMC·ST 등)으로 위치가 바뀝니다. 테두리 색: 노랑 가능 · 주황 미숙 · 빨강 부적합. 경기에서는 바둑알 숫자(그 자리 능력치 − 익숙함 보정) 비율만큼 능력치가 적용됩니다. 역할 목록의 숫자는 그 역할(성향 유형)에 대한 적합도이고 ★가 가장 잘 맞는 역할입니다.'));
  g.append(left);
  const right = h('div', { class: 'stack' });
  if (S.selSlot != null) right.append(slotEditor(ctx, S.selSlot));
  right.append(rosterTable(ctx));
  g.append(right);
  return g;
}
// 드래그한 바둑알을 다른 바둑알 위에 놓았는지 (가장 가까운 것, 지름 정도 이내)
function dropTarget(pitch, btn, e) {
  let best = null, bd = 30;
  for (const o of pitch.querySelectorAll('.slot')) { if (o === btn) continue; const d = o.querySelector('.disc').getBoundingClientRect(); const dist = Math.hypot(e.clientX - (d.left + d.width / 2), e.clientY - (d.top + d.height / 2)); if (dist < bd) { bd = dist; best = o; } }
  return best;
}
// 두 자리의 선수를 맞바꿈 (경기 중이면 엔진에서 위치 교체)
function swapSlotPlayers(ctx, i, j) {
  const { setup, live, team } = ctx;
  if (live) { E.swapSlots(live.M, live.T, i, j); logOp({ side: live.T.side, op: 'swap', a: i, b: j }); }
  else { const l = setup.lineup; [l[i], l[j]] = [l[j], l[i]]; }
  const a = playerOf(team, setup.lineup[j]), b = playerOf(team, setup.lineup[i]);
  if (a && b && !live) toast(`자리 교체: ${a.name} ↔ ${b.name}`);
  S.selSlot = null; S.swapA = null; ctx.onChange();
}
function slotClick(ctx, i) {
  const { setup, live } = ctx;
  // 교체 대상을 먼저 고른 상태면, 경기장 자리를 눌러도 그 자리 선수와 교체
  if (S.swapA) { const id = live ? (live.T.players.find(q => q.slot === i && !q.off) || {}).d?.id : setup.lineup[i]; const p = id && playerOf(ctx.team, id); if (p) return swapPick(ctx, p); }
  S.selSlot = S.selSlot === i ? null : i; ctx.onChange();
}
// 교체 버튼: 첫 번째 선수 선택 → 두 번째 선수 선택 시 바로 교체
function rosterGroup(ctx, id) { const { setup, live } = ctx; if (live) { const lp = live.T.all.find(q => q.d.id === id); if (lp && !lp.off) return 'field'; if (lp || live.T.usedIds.has(id)) return 'used'; return (setup.bench || []).includes(id) ? 'bench' : 'out'; } return setup.lineup.includes(id) ? 'xi' : (setup.bench || []).includes(id) ? 'bench' : 'out'; }
function swapPick(ctx, p) {
  const { team, setup, live } = ctx;
  if (!S.swapA) { if (live && rosterGroup(ctx, p.id) === 'used') return toast('이미 교체되어 나간 선수입니다.'); S.swapA = p.id; return ctx.onChange(); }
  if (S.swapA === p.id) { S.swapA = null; return ctx.onChange(); }
  const a = playerOf(team, S.swapA), b = p; S.swapA = null;
  if (!a) return ctx.onChange();
  const ga = rosterGroup(ctx, a.id), gb = rosterGroup(ctx, b.id);
  if (live) {
    const la = live.T.players.find(q => q.d.id === a.id && !q.off), lb = live.T.players.find(q => q.d.id === b.id && !q.off);
    if (la && lb) { E.swapSlots(live.M, live.T, la.slot, lb.slot); logOp({ side: live.T.side, op: 'swap', a: la.slot, b: lb.slot }); toast(`위치 교체: ${a.name} ↔ ${b.name}`); return ctx.onChange(); }
    const outP = la || lb, inD = la ? b : a, gIn = la ? gb : ga;
    if (!outP) { toast('경기장에 있는 선수와 벤치 선수를 하나씩 고르세요.'); return ctx.onChange(); }
    if (gIn !== 'bench') { toast(gIn === 'used' ? '이미 교체되어 나간 선수입니다.' : '벤치에 있는 선수만 투입할 수 있습니다.'); return ctx.onChange(); }
    if (live.T.subsLeft <= 0) { toast('교체 횟수를 모두 사용했습니다.'); return ctx.onChange(); }
    if (doSub(live, outP, inD)) toast(`교체: ${outP.name} → ${inD.name}`);
    S.selSlot = null; return ctx.onChange();
  }
  const l = setup.lineup, bn = setup.bench = setup.bench || [];
  const put = (arr, from, to) => { const k = arr.indexOf(from); if (k >= 0) arr[k] = to; };
  if (ga === 'xi' && gb === 'xi') { const i = l.indexOf(a.id), j = l.indexOf(b.id); l[i] = b.id; l[j] = a.id; }
  else if (ga === 'xi' || gb === 'xi') { const inn = ga === 'xi' ? b : a, outp = ga === 'xi' ? a : b, gIn = ga === 'xi' ? gb : ga; put(l, outp.id, inn.id); if (gIn === 'bench') put(bn, inn.id, outp.id); }
  else if (ga === 'bench' && gb === 'bench') { const i = bn.indexOf(a.id), j = bn.indexOf(b.id); bn[i] = b.id; bn[j] = a.id; }
  else if (ga === 'bench' || gb === 'bench') { const inn = ga === 'bench' ? b : a, outp = ga === 'bench' ? a : b; put(bn, outp.id, inn.id); }
  else { toast('둘 다 명단 외 선수입니다. 선발이나 벤치 선수와 바꾸세요.'); return ctx.onChange(); }
  if (!l.includes(setup.captain)) setup.captain = l[0];
  toast(`교체: ${a.name} ↔ ${b.name}`); ctx.onChange();
}
// 역할 목록에 선수의 유형 적합도 표시 (★ = 가장 잘 맞는 역할)
function roleFit(p, code) { const m = {}; if (p) for (const a of E.archsOf(p, code)) if (m[a.role] == null || a.v > m[a.role]) m[a.role] = a.v; return m; }
function roleOpts(p, code) { const f = roleFit(p, code); const best = Object.entries(f).sort((a, b) => b[1] - a[1])[0]; return E.rolesForSlot(code).map(r => [r, `${E.ROLES[r].n}${f[r] != null ? ` · ${Math.round(f[r])}` : ''}${best && best[0] === r ? ' ★' : ''}`]); }
function roleHint(p, code) { if (!p) return null; const a = E.archsOf(p, code)[0]; return a ? h('span', { class: 'hint' }, `추천: ${a.n} (${Math.round(a.v)})`) : null; }
function slotEditor(ctx, i) {
  const { team, setup, live } = ctx; const s = E.slotsOf(setup)[i];
  const p = playerOf(team, setup.lineup[i]);
  setup.instr[i] = normInstr(Object.assign(E.DEFAULT_INSTR(), setup.instr[i] || {}));
  const ins = setup.instr[i];
  const card = h('div', { class: 'card stack' });
  card.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', null, h('div', { class: 'lbl' }, `${posLabel(s[0])} (${POS_KO[s[0]]}) 자리`), h('div', { style: { fontSize: '17px', fontWeight: 600 } }, p ? p.name : '-')), h('button', { class: 'btn sm ghost', onclick: () => { S.selSlot = null; ctx.onChange(); } }, '닫기')));
  card.append(h('div', { class: 'instr' },
    h('div', { class: 'f' }, h('label', { class: 'lbl', for: 'role' + i }, '역할'), sel(roleOpts(p, s[0]), setup.roles[i], v => { setup.roles[i] = v; ctx.onChange(); }, 'role' + i), roleHint(p, s[0])),
  ));
  // 포지션별 개인 지침
  const g = E.SLOT_GROUP[s[0]] || 'CM'; const allowed = E.PI_ALLOWED[g] || [];
  for (const [gk, gl] of PI_GROUPS) {
    const keys = allowed.filter(k => PI_UI[k] && PI_UI[k][2] === gk); const extra = gk === 'def' && allowed.includes('markTarget');
    if (!keys.length && !extra) continue;
    const box = h('div', { class: 'instr' });
    for (const k of keys) { const opts = piOptions(k, g); box.append(h('div', { class: 'f' }, h('label', { class: 'lbl', for: 'in' + k + i }, PI_UI[k][0]), sel(opts.map(([v, l]) => [String(v), l]), String(ins[k] ?? E.DEFAULT_INSTR()[k]), v => { ins[k] = typeof opts[0][0] === 'number' ? +v : v; ctx.onChange(); }, 'in' + k + i))); }
    if (extra) box.append(h('div', { class: 'f' }, h('label', { class: 'lbl', for: 'mt' + i }, '특정 선수 마크'), sel([['-1', '없음'], ...oppSlots(ctx).map(([si, name]) => [String(si), name])], String(ins.markTarget), v => { ins.markTarget = +v; ctx.onChange(); }, 'mt' + i)));
    card.append(h('div', { class: 'pigrp' }, h('div', { class: 'lbl' }, gl), box));
  }
  card.append(h('p', { class: 'hint', style: { margin: 0 } }, `${posLabel(s[0])} 자리에서 쓸 수 있는 지침만 보입니다. 지침은 경기 중 선수의 위치·패스 선택·드리블 방향·크로스 지점·압박 거리 등에 그대로 반영됩니다.`));
  return card;
}
function oppSlots(ctx) {
  if (ctx.live) { const O = ctx.live.M.teams[1 - ctx.live.T.side]; return O.players.filter(p => !p.off).map(p => [p.slot, `${p.code} ${p.name}`]); }
  const os = ctx.oppSetup, ot = ctx.oppTeam; if (!os || !ot) return [];
  return E.slotsOf(os).map((s, i) => [i, `${posLabel(s[0])} ${(playerOf(ot, os.lineup[i]) || {}).name || ''}`]);
}
function rosterTable(ctx) {
  const { team, setup, live } = ctx;
  const inXI = new Set(setup.lineup);
  const bench = setup.bench || [];
  const onF = live ? new Set(live.T.players.filter(q => !q.off).map(q => q.d.id)) : null;
  // 선발은 자리 순서(골키퍼 → 수비 → 미드필더 → 공격, 같은 줄은 왼쪽부터)로 정렬하고 지금 서 있는 자리를 표시
  const SL = E.slotsOf(setup); const slotOfId = {};
  if (live) live.T.players.filter(q => !q.off).forEach(q => { slotOfId[q.d.id] = q.slot; }); else setup.lineup.forEach((id, i) => { slotOfId[id] = i; });
  const LINE = { GK: 0, CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1, DM: 2, CM: 2, LM: 2, RM: 2, AM: 2, LW: 3, RW: 3, ST: 3 };
  const bySlot = (a, b) => { const x = SL[slotOfId[a.id]] || ['CM', 0, 0], y = SL[slotOfId[b.id]] || ['CM', 0, 0]; return (LINE[x[0]] - LINE[y[0]]) || (LINE[x[0]] === 2 ? Math.round(x[1] * 8) - Math.round(y[1] * 8) : 0) || (x[2] - y[2]); };
  const groups = live ? [['경기장', live.T.players.filter(q => !q.off).map(q => playerOf(team, q.d.id) || q.d).sort(bySlot)], ['벤치', bench.filter(id => !onF.has(id)).map(id => playerOf(team, id)).filter(Boolean)]]
    : [['선발', team.players.filter(p => inXI.has(p.id)).sort(bySlot)], ['벤치', bench.map(id => playerOf(team, id)).filter(Boolean)], ['명단 외', team.players.filter(p => !inXI.has(p.id) && !bench.includes(p.id))]];
  const tb = h('tbody');
  for (const [gname, list] of groups) {
    if (live && gname === '명단 외') continue;
    tb.append(h('tr', { class: 'grp' }, h('td', { colspan: 5 }, gname + ` (${list.length})`)));
    for (const p of list) {
      const o = D.calcOvr(p.stats, p.pos);
      const lp = live ? live.T.all.find(q => q.d.id === p.id) : null;
      let status = '';
      if (live) status = lp ? (lp.sentOff ? '퇴장' : lp.subbedOff ? '교체됨' : lp.off ? '' : Math.round(lp.energy) + '%') : (live.T.usedIds.has(p.id) ? '교체됨' : '');
      else if (ctx.unavail && ctx.unavail.has(p.id)) status = '출전 정지';
      else if (ctx.cond && ctx.cond[p.id] != null && ctx.cond[p.id] < 100) status = '체력 ' + Math.round(ctx.cond[p.id]) + '%';
      const sel1 = S.swapA === p.id; const used = live && (status === '교체됨' || status === '퇴장');
      const canSwap = !(live && (live.M.ended || used)) && !(live && gname === '벤치' && live.T.subsLeft <= 0 && S.swapA && rosterGroup(ctx, S.swapA) === 'field');
      const acts = [];
      if (canSwap) acts.push(h('button', { class: 'btn sm swapbtn' + (sel1 ? ' primary' : S.swapA ? ' target' : ''), 'aria-pressed': String(sel1), onclick: e => { e.stopPropagation(); swapPick(ctx, p); } }, sel1 ? '선택됨' : S.swapA ? '⇄ 여기와 교체' : '⇄ 교체'));
      if (!live && gname === '벤치') acts.push(h('button', { class: 'btn sm ghost', onclick: e => { e.stopPropagation(); setup.bench = bench.filter(x => x !== p.id); if (S.swapA === p.id) S.swapA = null; ctx.onChange(); } }, '빼기'));
      if (!live && gname === '명단 외') acts.push(h('button', { class: 'btn sm ghost', onclick: e => { e.stopPropagation(); const b2 = setup.bench = setup.bench || []; if (b2.length >= 12) return toast('벤치는 최대 12명입니다.'); b2.push(p.id); ctx.onChange(); } }, '벤치로'));
      const sc = slotOfId[p.id] != null && (gname === '선발' || gname === '경기장') ? (SL[slotOfId[p.id]] || [])[0] : null;
      const slv = sc ? E.famLevel(p, sc) : 3; const srt = sc ? E.posRating(p, sc) : o;
      tb.append(h('tr', { class: (sel1 ? 'sel' : '') },
        h('td', null, h('span', { class: 'tag', title: sc ? `지금 자리 ${posLabel(sc)} · 대표 포지션 ${posLabel(p.pos)}` : '대표 포지션' }, posLabel(sc || p.pos)), sc && sc !== p.pos ? h('span', { class: 'dim', style: { fontSize: '11px', marginLeft: '4px' } }, posLabel(p.pos)) : null), h('td', null, lp ? formArrow(lp.form) : (ctx.form && ctx.form[p.id] != null ? formArrow(ctx.form[p.id]) : null), ' ', pl(p.name, p.id), lp ? talkMark(lp) : null, p.gen ? h('span', { class: 'gen' }, '가상') : null), h('td', { class: 'num ' + (sc && slv < 3 ? 'rt' + slv : ovrClass(srt)), title: sc && sc !== p.pos ? `${posLabel(sc)} 자리 능력치 ${srt} (대표 포지션 ${o}) · ${FAM_LBL[slv]}` : '' }, srt, sc && srt !== o ? h('span', { class: 'dim', style: { fontSize: '11px', marginLeft: '3px' } }, `(${o})`) : null),
        h('td', { class: status === '출전 정지' ? 'bad' : 'dim' }, status), h('td', { class: 'acts' }, ...acts)));
    }
  }
  const A = S.swapA ? playerOf(team, S.swapA) : null;
  const bar = h('div', { class: 'subbar' }, live ? h('span', { class: 'num' }, `교체 ${live.T.subsLeft}회 남음`) : null,
    A ? h('span', null, h('strong', null, A.name), live ? (rosterGroup(ctx, A.id) === 'field' ? ' 선택 — 벤치 선수(교체 투입) 또는 경기장 선수(위치 교체)의 교체 버튼을 누르세요.' : ' 선택 — 내보낼 경기장 선수의 교체 버튼을 누르세요.') : ' 선택 — 바꿀 선수의 교체 버튼(또는 경기장 자리)을 누르세요.') : h('span', { class: 'hint' }, '두 선수의 ⇄ 교체 버튼을 차례로 누르면 서로 바뀝니다. 경기장 자리를 누르면 역할·개인 지침을 정합니다.'),
    A ? h('button', { class: 'btn sm ghost', onclick: () => { S.swapA = null; ctx.onChange(); } }, '취소') : null);
  return h('div', { class: 'stack', style: { gap: '8px' } }, bar, h('div', { class: 'plist' }, h('table', null, h('thead', null, h('tr', null, h('th', null, '포지션'), h('th', null, '이름'), h('th', null, '능력'), h('th', null, '상태'), h('th', null, ''))), tb)));
}
function teamTab(ctx) {
  const t = ctx.setup.tactics;
  const box = h('div', { class: 'card' });
  for (const [title, fields] of LBL_TEAM) {
    const gr = h('div', { class: 'instr' });
    for (const [k, lab, opts] of fields) gr.append(h('div', { class: 'f' }, h('span', { class: 'lbl' }, lab), seg(opts, t[k], v => { t[k] = v; ctx.onChange(); })));
    box.append(h('div', { class: 'ti-group' }, h('h3', { style: { marginBottom: '12px' } }, title), gr));
  }
  return box;
}
function setTab(ctx) {
  const { team, setup, live } = ctx;
  const ids = live ? live.T.players.filter(p => !p.off).map(p => p.d.id) : setup.lineup;
  const opts = [['', '자동 선택 (능력치 최고)'], ...ids.map(id => { const p = playerOf(team, id); return [id, p ? `${p.name} (${posLabel(p.pos)})` : id]; })];
  for (const k of ['pen', 'fk', 'corner']) if (!ids.includes(setup.takers[k])) setup.takers[k] = '';
  if (!ids.includes(setup.captain)) setup.captain = '';
  const t = setup.tactics;
  const val = (id, k) => { const p = playerOf(team, id); return p ? p.stats[k] : '자동'; };
  const box = h('div', { class: 'card stack' });
  box.append(h('div', { class: 'instr' },
    h('div', { class: 'f' }, h('label', { class: 'lbl', for: 'tk_pen' }, '페널티 키커'), sel(opts, setup.takers.pen, v => { setup.takers.pen = v; ctx.onChange(); }, 'tk_pen'), h('span', { class: 'hint' }, `페널티 킥 ${val(setup.takers.pen, 'penalties')}`)),
    h('div', { class: 'f' }, h('label', { class: 'lbl', for: 'tk_fk' }, '프리킥 키커'), sel(opts, setup.takers.fk, v => { setup.takers.fk = v; ctx.onChange(); }, 'tk_fk'), h('span', { class: 'hint' }, `프리킥 ${val(setup.takers.fk, 'freeKick')} · 커브 ${val(setup.takers.fk, 'curve')}`)),
    h('div', { class: 'f' }, h('label', { class: 'lbl', for: 'tk_co' }, '코너킥 키커'), sel(opts, setup.takers.corner, v => { setup.takers.corner = v; ctx.onChange(); }, 'tk_co'), h('span', { class: 'hint' }, `크로스 ${val(setup.takers.corner, 'crossing')}`)),
    h('div', { class: 'f' }, h('label', { class: 'lbl', for: 'tk_cap' }, '주장'), sel(opts, setup.captain, v => { setup.captain = v; ctx.onChange(); }, 'tk_cap'), h('span', { class: 'hint' }, '주장이 뛰는 동안 수비 라인 정렬이 조금 더 안정됩니다.'))
  ));
  const SP = [
    ['공격 세트피스', [
      ['corner', '코너킥 전달', [['mixed', '혼합'], ['near', '니어 포스트'], ['far', '파 포스트'], ['short', '숏 코너'], ['edge', '박스 앞 컷백']]],
      ['cornerBody', '코너킥 공격 인원', [['safe', '안전 (4명)'], ['balanced', '균형 (5명)'], ['attack', '공격적 (7명)']]],
      ['fkDirect', '직접 프리킥', [['auto', '키커 판단'], ['shoot', '되도록 슈팅'], ['cross', '되도록 크로스']]],
      ['fkWide', '측면·먼 거리 프리킥', [['auto', '흐름대로 진행'], ['cross', '문전 크로스'], ['short', '짧게 연결']]],
      ['throwLong', '공격 지역 스로인', [['auto', '롱 스로인 특성 선수만'], ['long', '롱 스로인 (힘 좋은 선수)'], ['short', '짧게']]]]],
    ['수비 세트피스', [
      ['cornerDef', '코너킥 수비', [['man', '대인 마크'], ['mixed', '혼합 (지역 3 + 대인)'], ['zonal', '지역 방어']]]]]];
  for (const [title, fields] of SP) {
    const gr = h('div', { class: 'instr' });
    for (const [k, lab, opts2] of fields) gr.append(h('div', { class: 'f' }, h('span', { class: 'lbl' }, lab), seg(opts2, t[k] || opts2[0][0], v => { t[k] = v; ctx.onChange(); })));
    box.append(h('div', { class: 'ti-group' }, h('h3', { style: { marginBottom: '10px' } }, title), gr));
  }
  box.append(h('p', { class: 'hint', style: { margin: 0 } }, '코너킥: 헤더·점프가 좋은 선수부터 문전 핵심 위치에 배치됩니다. 박스 앞 컷백은 박스 밖에 선 선수에게 낮게 내줘 슈팅을 노립니다. 지역 방어 수비수는 자기 구역에 온 공중볼 경합에서 조금 유리하고, 대인 마크는 위험한 선수를 1:1로 붙잡습니다. 공격 인원이 많을수록 역습에 약해집니다.'));
  return box;
}

// ================= 경기 화면 =================
const SUM = Mx => (window.DXC ? DXC.fullSummary(Mx) : E.summary(Mx));
let M = null, R3 = null, R2 = null, loopOn = false, rafId = 0;
const L = { ph: 0, playing: true, last: 0, banner: null, replay: null, endShown: false, halfShown: false, infoCache: new Map(), kits: null, frameA: { players: [], ball: {} }, frameB: { players: [], ball: {} }, frameI: { players: [], ball: {} }, win: [], winIdx: 0, shownIdx: 0, ctx: { type: 'friendly' }, control: [] };
function startMatch(o) {
  const home = o.home, away = o.away;
  const hs = o.homeSetup || setupFor(home.id), as = o.awaySetup || setupFor(away.id);
  const ai = [0, 1].filter(s => !o.control.includes(s));
  const seed = o.seed || ((Math.random() * 1e9) | 0);
  const neutral = o.neutral != null ? !!o.neutral : !S.homeAdv;
  M = o.prebuilt || E.createMatch({ seed, neutral, big: !!o.big, weather: o.weather, teams: [{ team: home, setup: hs, condition: o.homeCond }, { team: away, setup: as, condition: o.awayCond }], aiSides: ai });
  M.seedUsed = seed; if (!M.opsLog) M.opsLog = []; L.rpBase = { seed, ai, neutral, big: !!o.big, weather: o.weather || null, hs: packSetup(hs), as: packSetup(as), hc: packCond(o.homeCond || {}), ac: packCond(o.awayCond || {}) };
  L.hlOverride = o.hlOverride || null; L.focus = o.focus || null;
  L.ctx = o.ctx || { type: 'friendly' }; L.control = o.control;
  L.kits = kitColors(home, away); L.infoCache.clear(); L.replay = null; L.endShown = false; L.halfShown = false; L.playing = true; L.banner = null; L.pendingReplay = null;
  L.ph = 0; L.win = []; L.winIdx = 0; L.shownIdx = 0; L.recorded = false;
  S.selPid = null; feedDirty = true;
  if (R3) R3.clearPlayers();
  go('match');
}
const FRAME_DT = () => M.rec.every * E.DT;
function bufEnd() { return M.rec.n - 1; }
function curHl() { return L.hlOverride || L.focus ? 'review' : S.hl; }
function leadFrames() { return curHl() === 'full' ? 2 : Math.ceil(17 / FRAME_DT()); }
function winFor(e) {
  if (L.focus) { if (!L.focus.includes(e.frame + ':' + e.type)) return null; const k = 1 / FRAME_DT(); return [e.frame - 15 * k, e.frame + 5 * k]; }
  if (L.hlOverride === 'goals') { const k = 1 / FRAME_DT(); if (e.type === 'goal') return [e.frame - 15 * k, e.frame + 6 * k]; if (e.type === 'red') return [e.frame - 5 * k, e.frame + 4 * k]; return null; }
  if (S.hl === 'full') return null;
  const ext = S.hl === 'ext'; let pre = 0, post = 0;
  switch (e.type) {
    case 'goal': pre = 15; post = 6; break;
    case 'shot': if (e.xg >= .25) { pre = 10; post = 4; } else if (ext) { pre = 7; post = 3; } break;
    case 'post': pre = 8; post = 3; break;
    case 'red': pre = 5; post = 4; break;
    case 'save': if (ext) { pre = 4; post = 3; } break;
    case 'setpiece': if (ext) { pre = 1; post = 9; } break;
    case 'yellow': if (ext) { pre = 4; post = 3; } break;
  }
  if (!pre && !post) return null;
  const k = 1 / FRAME_DT();
  return [e.frame - pre * k, e.frame + post * k];
}
function windows() { for (; L.winIdx < M.events.length; L.winIdx++) { const w = winFor(M.events[L.winIdx]); if (w) L.win.push(w); } return L.win; }
function inWindow(ph) { for (const w of windows()) if (ph >= w[0] && ph <= w[1]) return true; return false; }
function nextWindowStart(ph) { let m = Infinity; for (const w of windows()) if (w[0] > ph && w[0] < m) m = w[0]; return m; }
const metaF = { players: [], ball: {} };
function playRate(ph) {
  if (curHl() === 'review') return inWindow(ph) ? S.hlSpeed : 4000;
  if (S.hl === 'full') { let r = S.speed; if (S.fastDead && bufEnd() > 0 && E.readFrame(M, Math.max(0, Math.min(bufEnd(), Math.floor(ph))), metaF).phase === 1) r = Math.max(r, S.speed * 6); return r; }
  if (inWindow(ph)) return S.hlSpeed;
  return S.hlGap === 'skip' ? 4000 : S.hlGap;
}
function simulateAhead(need, budgetMs) {
  const t0 = performance.now(); let n = 0;
  while (bufEnd() < need && !M.ended && !M.halftimePause) { E.step(M); if (++n % 40 === 0 && performance.now() - t0 > budgetMs) break; }
}
function advanceLive(dt) {
  const lf = leadFrames();
  let target = L.ph + dt * playRate(L.ph) / FRAME_DT();
  simulateAhead(target + lf, S.hl === 'full' && S.speed <= 8 ? 6 : 12);
  if (curHl() !== 'full' && !inWindow(L.ph)) { const ns = nextWindowStart(L.ph); if (target > ns) target = ns; if (curHl() === 'review' && ns === Infinity && M.ended) target = bufEnd(); }
  const hardEnd = (M.ended || M.halftimePause) ? bufEnd() : bufEnd() - lf;
  L.ph = Math.max(L.ph, Math.min(target, Math.max(0, hardEnd)));
}
function lerpFrame(a, b, t, out) {
  out.players.length = b.players.length; out.t = a.t + (b.t - a.t) * t; out.phase = b.phase; out.half = b.half;
  if (a.half !== b.half) out.t = b.t;
  for (let i = 0; i < b.players.length; i++) {
    const p = a.players[i], q = b.players[i], o = out.players[i] || (out.players[i] = {});
    Object.assign(o, q);
    if (p && !p.hidden && !q.hidden && p.pid === q.pid && Math.hypot(q.x - p.x, q.y - p.y) < 4) {
      o.x = p.x + (q.x - p.x) * t; o.y = p.y + (q.y - p.y) * t;
      let d = q.face - p.face; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; o.face = p.face + d * t;
      o.speed = p.speed + (q.speed - p.speed) * t;
      if (p.anim === q.anim && q.animT >= p.animT) o.animT = p.animT + (q.animT - p.animT) * t;
    }
  }
  const jump = Math.hypot(b.ball.x - a.ball.x, b.ball.y - a.ball.y) > 12;
  for (const k of ['x', 'y', 'z']) out.ball[k] = jump ? b.ball[k] : a.ball[k] + (b.ball[k] - a.ball[k]) * t;
  return out;
}
function frameAt(ph) {
  if (bufEnd() < 0) { E.step(M); E.step(M); }
  const i = Math.floor(ph), t = ph - i;
  E.readFrame(M, Math.max(0, Math.min(bufEnd(), i)), L.frameA); E.readFrame(M, Math.max(0, Math.min(bufEnd(), i + 1)), L.frameB);
  return lerpFrame(L.frameA, L.frameB, t, L.frameI);
}
function pinfo(pid) {
  let v = L.infoCache.get(pid); if (v) return v;
  const p = M.pidList[pid]; if (!p) return null;
  const k = L.kits[p.side]; const gk = p.code === 'GK' || p.pos === 'GK';
  let hgt = p.d.h, wgt = p.d.w; if (!hgt && !p.d.nb && !(p.d.bio && p.d.bio.height === null)) { try { const bio = D.bioOf(p.d, 'en'); hgt = bio.height; wgt = bio.weight; } catch (e) { } }
  v = { pid, num: p.num, name: p.name, short: shortName(p.name), side: p.side, gk, c1: k.c1, c2: k.c2, gkColor: k.gk, textColor: gk ? ink(k.gk) : ink(k.c1), skin: D.hash(p.name) % 5, h: hgt || 180, w: wgt || 75 };
  L.infoCache.set(pid, v); return v;
}
let feedDirty = true;
function viewMatch() {
  const home = M.teams[0], away = M.teams[1];
  const wrap = h('div', { class: 'match' });
  const ctxLbl = L.ctx.label ? L.ctx.label : L.ctx.type === 'league' ? `${L.ctx.leagueName} ${L.ctx.round + 1}라운드` : L.ctx.type === 'review' ? `${L.ctx.leagueName} ${L.ctx.round + 1}라운드 · 하이라이트` : '친선 경기';
  wrap.append(h('div', { class: 'score' },
    h('span', { class: 'ctxlbl' }, ctxLbl + (M.wx && (M.wx.k !== 'clear' || M.wx.pitch !== 'good') ? ` · ${M.wx.label}${M.wx.temp != null ? ` ${M.wx.temp}°C` : ''}` : '')),
    h('div', { class: 'sb', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 't', style: { background: L.kits[0].c1, color: ink(L.kits[0].c1) } }, home.short),
      h('div', { class: 's', id: 'sc' }, '0 – 0'),
      h('div', { class: 't', style: { background: L.kits[1].c1, color: ink(L.kits[1].c1) } }, away.short),
      h('div', { class: 'clk', id: 'clk' }, '00:00')),
    h('div', { class: 'scorers', id: 'scorers' })));
  wrap.append(h('div', { class: 'view', id: 'view' },
    h('canvas', { id: 'c3', 'aria-label': '3D 경기 화면' }), h('canvas', { id: 'c2', 'aria-label': '2D 경기 화면' }),
    h('div', { class: 'labels', id: 'labels' }), h('div', { class: 'banner', id: 'banner' }), h('div', { class: 'rtag', id: 'rtag', hidden: true }, 'REPLAY'), h('div', { class: 'ff', id: 'fftag', hidden: true })));
  wrap.append(h('div', { class: 'ctrl', id: 'ctrl' }));
  wrap.append(h('aside', { class: 'side' },
    h('div', { class: 'tabs', role: 'tablist' }, [['feed', '해설'], ['stats', '통계'], ['players', '선수'], ['analysis', '분석']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(S.sideTab === k), onclick: () => { S.sideTab = k; document.querySelectorAll('.side .tabs button').forEach(b => b.setAttribute('aria-selected', String(b.textContent === l))); feedDirty = true; updateSide(true); } }, l))),
    h('div', { class: 'sidebody', id: 'sidebody' })));
  setTimeout(() => { initRenderers(); buildCtrl(); updateSide(true); startLoop(); }, 0);
  return wrap;
}
function initRenderers() {
  const c3 = $('#c3'), c2 = $('#c2'); if (!c3) return;
  try { R3 = new Render3D(c3); } catch (e) { R3 = null; if (S.view === '3d') { S.view = '2d'; toast('이 기기에서는 3D를 사용할 수 없어 2D로 표시합니다.'); } }
  R2 = new Render2D(c2);
  L.pitch = pitchStyle();
  if (R3) { R3.setMode(S.cam); R3.setKits(L.kits); R3.setModel(S.model, modelState); R3.setPitch(L.pitch); R3.setBallSize(S.ballSize || 1); }
  c2.addEventListener('click', ev => pickPlayer2D(ev));
  c3.addEventListener('click', ev => { if (R3 && R3.mode !== 'free') pickPlayer3D(ev); });
  applyViewVisibility(); resizeView();
}
function modelState(st) {
  if (st === 'loading' && S.view === '3d') toast('사람 모델을 불러오는 중입니다…');
  if (st === 'failed') { S.model = 'simple'; toast('사람 모델을 불러오지 못해 단순 모델로 표시합니다.'); buildCtrl(); }
}
function applyViewVisibility() { const c3 = $('#c3'), c2 = $('#c2'); if (!c3) return; c3.hidden = S.view !== '3d' || !R3; c2.hidden = !(S.view !== '3d' || !R3); $('#labels').innerHTML = ''; }
function resizeView() { if (R3 && $('#c3') && !$('#c3').hidden) R3.resize(); if (R2) R2.resize(); }
window.addEventListener('resize', () => { if (S.screen === 'match') resizeView(); });
function clockOf(F) {
  const t = F.t || 0; const half = F.half || 1; const m = Math.floor(t / 60), s = Math.floor(t % 60);
  const lim = half === 1 ? 45 : 90;
  if (m >= lim) return `${lim}+${m - lim + 1}'`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function matchDone() { return M.ended && L.ph >= bufEnd() - .5; }
function buildCtrl() {
  const c = $('#ctrl'); if (!c) return; c.innerHTML = '';
  if (L.replay) {
    const R = L.replay;
    const rng = h('input', { type: 'range', id: 'rpos', min: 0, max: Math.max(1, bufEnd()), step: 1, value: Math.floor(R.r), 'aria-label': '리플레이 위치', oninput: e => { R.r = +e.target.value; R.to = Math.max(R.to, R.r); } });
    c.append(...[h('button', { class: 'btn sm', onclick: () => { R.playing = !R.playing; buildCtrl(); } }, R.playing ? '일시정지' : '재생'),
      seg([[.25, '0.25x'], [.5, '0.5x'], [1, '1x'], [2, '2x']], R.speed, v => { R.speed = v; buildCtrl(); }),
      h('button', { class: 'btn sm', onclick: () => { R.r = Math.max(0, R.r - 5 / FRAME_DT()); } }, '−5초'),
      h('div', { class: 'rbar' }, rng, h('span', { class: 'num muted', id: 'rtime' }, '')),
      camControls(),
      h('button', { class: 'btn sm primary', onclick: endReplay }, matchDone() ? '리플레이 닫기' : '경기로 돌아가기')].filter(Boolean));
    return;
  }
  const done = matchDone();
  const items = [
    !done ? h('button', { class: 'btn sm' + (L.playing ? '' : ' primary'), onclick: togglePlay, title: '스페이스바' }, L.playing ? '일시정지' : '재생') : h('span', { class: 'tag' }, '경기 종료'),
    !done && L.ctx.type !== 'review' ? hlControls(true) : null,
    h('span', { class: 'sep' }),
    seg([['3d', '3D'], ['2d', '2D']], S.view, v => { S.view = v; savePrefs(); applyViewVisibility(); resizeView(); buildCtrl(); }),
    camControls(),
    S.view === '3d' && R3 ? sel([['human', '사람 모델'], ['simple', '단순 모델']], S.model, v => { S.model = v; savePrefs(); R3.setModel(v, modelState); }, 'model') : null,
    sel([['none', '이름 숨김'], ['carrier', '볼 보유자 이름'], ['all', '모든 이름']], S.names, v => { S.names = v; savePrefs(); $('#labels').innerHTML = ''; }, 'names'),
    h('span', { class: 'sep' }),
    h('button', { class: 'btn sm', onclick: toggleFullscreen, title: '경기 화면을 전체화면으로' }, isFs() ? '전체화면 끄기' : '전체화면'),
    isFs() ? h('button', { class: 'btn sm', onclick: () => { S.fsSide = !S.fsSide; $('.match').classList.toggle('noside', !S.fsSide); resizeView(); buildCtrl(); } }, S.fsSide ? '옆 패널 숨기기' : '옆 패널 보기') : null,
    L.control.length && !M.ended ? h('button', { class: 'btn sm', onclick: openLiveTactics }, '전술·교체') : null,
    L.control.length && !M.ended ? h('button', { class: 'btn sm', onclick: () => openTalk() }, '선수단 대화') : null,
    h('button', { class: 'btn sm', onclick: () => startReplay(Math.max(0, L.ph - 12 / FRAME_DT()), false) }, '리플레이'),
    !done && L.ctx.type !== 'review' ? h('button', { class: 'btn sm', onclick: simToEnd, title: '남은 시간을 즉시 계산합니다' }, '결과까지') : (L.ctx.back ? h('button', { class: 'btn sm primary', onclick: () => go(L.ctx.back) }, '돌아가기') : L.ctx.type === 'league' || L.ctx.type === 'review' ? h('button', { class: 'btn sm primary', onclick: () => go('league') }, '리그로 돌아가기') : h('button', { class: 'btn sm primary', onclick: () => go('setup') }, '새 경기'))
  ];
  c.append(...items.filter(Boolean));
}
function camControls() {
  if (S.view === '3d' && R3) return h('span', { class: 'row', style: { gap: '6px' } }, camSel(), zoomCtl());
  return sel([['full', '전체 경기장'], ['follow', '공 따라가기']], S.cam2d, v => { S.cam2d = v; savePrefs(); }, 'cam2');
}
// 카메라 확대 막대 (0.5x ~ 2.5x). 자유 카메라는 마우스 휠로 확대
function zoomCtl() {
  const lab = h('span', { class: 'num muted', style: { minWidth: '34px' } }, S.zoom.toFixed(1) + 'x');
  return h('label', { class: 'zoomctl', title: '카메라 확대' }, h('span', { class: 'muted' }, '확대'), h('input', { type: 'range', id: 'zoom', min: .5, max: 2.5, step: .1, value: S.zoom, 'aria-label': '카메라 확대', oninput: e => { S.zoom = +e.target.value; lab.textContent = S.zoom.toFixed(1) + 'x'; }, onchange: () => savePrefs() }), lab);
}
function camSel() {
  return sel([['broadcast', '중계 카메라'], ['wide', '전체 화면 카메라'], ['tactical', '전술 카메라(위)'], ['drone', '드론 카메라'], ['end', '공격 방향 카메라'], ['goal', '골대 뒤 카메라'], ['low', '측면 낮은 카메라'], ['ball', '근접 카메라'], ['player', '선수 시점'], ['free', '자유 카메라']], S.cam, v => { S.cam = v; savePrefs(); R3.setMode(v); if (v === 'free') toast('드래그: 회전 · 휠: 확대 · 오른쪽 드래그 또는 Shift+드래그: 이동'); if (v === 'player' && S.selPid == null) toast('경기장에서 선수를 누르면 그 선수를 따라갑니다.'); }, 'cam');
}
// ---------- 전체화면 (전술·교체·대화 창도 전체화면 안에 표시) ----------
const isFs = () => { const m = $('.match'); return !!m && (document.fullscreenElement === m || m.classList.contains('fs')); };
function toggleFullscreen() {
  const m = $('.match'); if (!m) return;
  if (isFs()) { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); m.classList.remove('fs', 'noside'); document.body.classList.remove('fsmode'); setTimeout(() => { resizeView(); buildCtrl(); }, 60); return; }
  S.fsSide = S.fsSide ?? false; m.classList.toggle('noside', !S.fsSide);
  const pseudo = () => { m.classList.add('fs'); document.body.classList.add('fsmode'); resizeView(); buildCtrl(); };
  if (m.requestFullscreen) m.requestFullscreen().then(() => { resizeView(); buildCtrl(); }).catch(pseudo); else pseudo();
}
document.addEventListener('fullscreenchange', () => { const m = $('.match'); if (!m) return; if (!document.fullscreenElement) { m.classList.remove('noside'); } document.querySelectorAll('.modal, .toast').forEach(e => { const root = overlayRoot(); if (e.parentNode !== root) root.append(e); }); setTimeout(() => { resizeView(); buildCtrl(); }, 60); });
function togglePlay() { L.playing = !L.playing; buildCtrl(); }
document.addEventListener('keydown', e => { if (S.screen !== 'match' || !M || L.modal) return; if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); if (L.replay) { L.replay.playing = !L.replay.playing; buildCtrl(); } else togglePlay(); } });
function startLoop() { if (loopOn) return; loopOn = true; L.last = performance.now(); rafId = requestAnimationFrame(loop); }
function pauseLoop() { loopOn = false; cancelAnimationFrame(rafId); }
function loop(now) {
  if (!loopOn) return;
  const dt = Math.min(.1, (now - L.last) / 1000); L.last = now;
  let F;
  if (L.replay) F = stepReplay(dt);
  else {
    if (L.playing && !L.modal) advanceLive(dt);
    F = frameAt(L.ph);
    processShownEvents();
    if (M.halftimePause && L.ph >= bufEnd() - .5 && !L.halfShown && !L.replay && !L.modal) { L.halfShown = true; L.playing = false; showHalftime(); }
    if (M.ended && L.ph >= bufEnd() - .5 && !L.endShown && !L.replay && !L.modal) { L.endShown = true; onMatchEnd(); buildCtrl(); showFulltime(); }
  }
  if (F) drawFrame(F, dt);
  rafId = requestAnimationFrame(loop);
}
function processShownEvents() {
  for (; L.shownIdx < M.events.length && M.events[L.shownIdx].frame <= L.ph; L.shownIdx++) {
    const e = M.events[L.shownIdx]; feedDirty = true;
    if (e.type === 'goal') {
      L.banner = { text: '골!', sub: e.text.replace(/^골! /, ''), t: 3.2 }; if (R3) R3.cheer = 1.6;
      if (S.autoReplay) L.pendingReplay = { at: e.frame + 1.6 / FRAME_DT(), from: Math.max(0, e.frame - 9 / FRAME_DT()), to: e.frame + 1.6 / FRAME_DT() };
    }
    if (e.type === 'red') L.banner = { text: '퇴장', sub: e.text, t: 2.2 };
  }
  if (L.pendingReplay && L.ph >= L.pendingReplay.at && bufEnd() >= L.pendingReplay.to && !L.modal) { const p = L.pendingReplay; L.pendingReplay = null; startReplay(p.from, true, p.to); }
}
function carrierOf(F) {
  if (F.ball.z > .6) return null; let best = null, bd = 1.1;
  for (const p of F.players) { if (p.hidden) continue; const d = Math.hypot(p.x - F.ball.x, p.y - F.ball.y); if (d < bd) { bd = d; best = p.pid; } }
  return best;
}
function drawFrame(F, dt) {
  const carrier = carrierOf(F);
  const cp = carrier != null ? M.pidList[carrier] : null;
  const attackDir = cp ? cp.team.dir * (F.half === M.half ? 1 : -1) : 1;
  const rate = L.replay ? (L.replay.playing ? L.replay.speed : 0) : (L.playing && !L.modal && !matchDone() ? Math.min(4, playRate(L.ph)) : 0);
  const opt = { selected: S.selPid, carrier, names: S.names, cam2d: S.cam2d, attackDir, rate, pitch: L.pitch, zoom: S.zoom, wx: M && M.wx };
  if (S.view === '3d' && R3) { R3.draw(F, pinfo, opt, dt); drawLabels(F, opt); }
  else if (R2) R2.draw(F, pinfo, opt);
  const bn = $('#banner'); if (bn) { if (L.banner && L.banner.t > 0) { L.banner.t -= dt; bn.innerHTML = ''; bn.append(L.banner.text, h('small', null, L.banner.sub)); bn.style.opacity = Math.min(1, L.banner.t * 2); } else bn.textContent = ''; }
  const fr = L.replay ? L.replay.r : L.ph;
  const sc = $('#sc'); if (sc) sc.textContent = scoreAt(fr);
  const ck = $('#clk'); if (ck) ck.textContent = clockOf(F);
  const rt = $('#rtag'); if (rt) rt.hidden = !L.replay;
  const ff = $('#fftag'); if (ff) { const fast = !L.replay && L.playing && !L.modal && curHl() !== 'full' && !inWindow(L.ph) && !matchDone(); ff.hidden = !fast; if (fast) ff.textContent = curHl() === 'review' || S.hlGap === 'skip' ? '다음 장면으로 이동 중' : `${S.hlGap}x 빨리 감기`; }
  if (L.replay) { const rp = $('#rpos'); if (rp && document.activeElement !== rp) rp.value = Math.floor(L.replay.r); const tt = $('#rtime'); if (tt) tt.textContent = clockOf(F); }
  updateSide(false);
}
function scoreAt(fr) { const s = [0, 0]; for (const e of M.events) if (e.type === 'goal' && e.frame <= fr) s[e.side]++; return `${s[0]} – ${s[1]}`; }
function drawLabels(F, opt) {
  const box = $('#labels'); if (!box) return;
  const want = [];
  if (S.names === 'all') for (const p of F.players) { if (!p.hidden) want.push(p); }
  else if (S.names === 'carrier' && opt.carrier != null) { const p = F.players.find(q => q.pid === opt.carrier); if (p) want.push(p); }
  if (S.selPid != null && !want.some(p => p.pid === S.selPid)) { const p = F.players.find(q => q.pid === S.selPid && !q.hidden); if (p) want.push(p); }
  while (box.children.length < want.length) box.append(h('span'));
  for (let i = 0; i < box.children.length; i++) {
    const el = box.children[i]; const p = want[i];
    if (!p) { el.hidden = true; continue; }
    const [x, y, ok] = R3.project(p.x, p.y, 2.25); el.hidden = !ok; el.style.left = x + 'px'; el.style.top = y + 'px';
    const inf = pinfo(p.pid); const txt = `${inf.num} ${inf.short}`; if (el.textContent !== txt) el.textContent = txt;
  }
}
function pickPlayer2D(ev) {
  const c = $('#c2'); const r = c.getBoundingClientRect(); const F = L.frameI;
  let best = null, bd = 1e9;
  const W = r.width, H = r.height; const vertical = H > W * 1.15; const pw = vertical ? 76 : 113, ph = vertical ? 113 : 76; let sc = Math.min(W / pw, H / ph);
  let cx = 0, cy = 0; if (S.cam2d === 'follow') { sc *= 2.1; cx = R2.view.cx; cy = R2.view.cy; }
  for (const p of F.players) { if (p.hidden) continue; const sx = vertical ? W / 2 - (p.y - cy) * sc : W / 2 + (p.x - cx) * sc; const sy = vertical ? H / 2 - (p.x - cx) * sc : H / 2 - (p.y - cy) * sc; const d = Math.hypot(sx - (ev.clientX - r.left), sy - (ev.clientY - r.top)); if (d < bd) { bd = d; best = p; } }
  S.selPid = best && bd < 30 ? (S.selPid === best.pid ? null : best.pid) : null; feedDirty = true;
}
function pickPlayer3D(ev) {
  const c = $('#c3'); const r = c.getBoundingClientRect(); const F = L.frameI; let best = null, bd = 1e9;
  for (const p of F.players) { if (p.hidden) continue; const [x, y, ok] = R3.project(p.x, p.y, 1); if (!ok) continue; const d = Math.hypot(x - (ev.clientX - r.left), y - (ev.clientY - r.top)); if (d < bd) { bd = d; best = p; } }
  S.selPid = best && bd < 40 ? (S.selPid === best.pid ? null : best.pid) : null; feedDirty = true;
}
// ---------- 리플레이 ----------
function startReplay(from, auto, to) {
  if (!M.rec.n) return;
  L.replay = { r: Math.max(0, from), from, to: to ?? Math.floor(L.ph), playing: true, speed: auto ? .5 : 1, auto: !!auto, a: { players: [], ball: {} }, b: { players: [], ball: {} } };
  if (R3) R3.updateCamera(E.readFrame(M, Math.floor(L.replay.r)), { snap: true }, .016);
  buildCtrl();
}
function stepReplay(dt) {
  const R = L.replay;
  if (R.playing) R.r += dt / FRAME_DT() * R.speed;
  const end = R.auto ? Math.min(R.to, bufEnd()) : Math.min(bufEnd(), Math.max(R.to, Math.floor(L.ph)));
  if (R.r >= end) { R.r = end; if (R.auto) { endReplay(); return frameAt(L.ph); } R.playing = false; }
  const i = Math.floor(R.r), t = R.r - i;
  E.readFrame(M, i, R.a); E.readFrame(M, Math.min(bufEnd(), i + 1), R.b);
  return lerpFrame(R.a, R.b, t, L.frameI);
}
function endReplay() { L.replay = null; buildCtrl(); }
// ---------- 사이드 패널 ----------
let sideT = 0;
function snapAt(fr) { let s = null; for (const x of M.rec.snaps) { if (x.n <= fr) s = x; else break; } return s; }
function updateSide(force) {
  const body = $('#sidebody'); if (!body) return;
  sideT++; if (S.sideTab === 'analysis' && !force) return; if (!force && !feedDirty && sideT % 30) return; feedDirty = false;
  body.innerHTML = '';
  const kc = L.kits; const fr = L.ph;
  const sc = $('#scorers'); if (sc) { sc.innerHTML = ''; for (const s of [0, 1]) { const g = M.events.filter(e => e.type === 'goal' && e.side === s && e.frame <= fr); if (g.length) sc.append(h('span', null, h('span', { class: 'pip', style: { background: kc[s].c1, border: '1px solid ' + kc[s].c2 } }), g.map(e => { const p = M.pidList[e.pid]; return `${p ? shortName(p.name) : ''}${e.own ? '(자책)' : ''} ${e.min}'`; }).join(', '))); } }
  if (S.sideTab === 'feed') {
    const f = h('div', { class: 'feed' });
    const evs = M.events.filter(e => e.frame <= fr && e.type !== 'clear' && e.type !== 'setpiece').slice(-120).reverse();
    if (!evs.length) f.append(h('p', { class: 'hint' }, '경기가 시작되면 주요 장면이 여기에 쌓입니다. 다시보기 버튼으로 장면을 돌려볼 수 있습니다.'));
    for (const e of evs) {
      f.append(h('div', { class: 'e ' + e.type + (e.quiet ? ' dim' : '') }, h('span', { class: 'm' }, e.min + "'"),
        h('span', null, e.side >= 0 ? h('span', { class: 'pip', style: { background: kc[e.side].c1, border: '1px solid ' + kc[e.side].c2 } }) : null, ...evText(e), e.type === 'shot' && e.xg != null ? h('span', { class: 'dim' }, ` xG ${e.xg.toFixed(2)}`) : null),
        (e.type === 'goal' || e.type === 'save' || e.type === 'post' || e.type === 'red') ? h('button', { class: 'btn sm', onclick: () => startReplay(Math.max(0, e.frame - 9 / FRAME_DT()), true, e.frame + 2 / FRAME_DT()) }, '다시보기') : h('span')));
    }
    body.append(f);
  } else if (S.sideTab === 'stats') {
    const snap = snapAt(fr); const z = { poss: 0, shots: 0, sot: 0, xg: 0, passes: 0, passOk: 0, tackles: 0, tackleWon: 0, inter: 0, fouls: 0, corners: 0, offsides: 0, saves: 0, yellow: 0, red: 0 };
    const [a, b] = snap ? snap.st : [z, z]; const tp = a.poss + b.poss || 1;
    const dist = M.teams.map(T => T.all.reduce((s, p) => s + p.dist, 0) / 1000);
    const rows = [['점유율', Math.round(a.poss / tp * 100) + '%', Math.round(b.poss / tp * 100) + '%', a.poss, b.poss], ['슈팅', a.shots, b.shots], ['유효 슈팅', a.sot, b.sot], ['기대 득점(xG)', a.xg.toFixed(2), b.xg.toFixed(2), a.xg, b.xg], ['패스', a.passes, b.passes], ['패스 성공률', pct(a.passOk, a.passes), pct(b.passOk, b.passes), a.passOk / Math.max(1, a.passes), b.passOk / Math.max(1, b.passes)], ['볼 경합', a.tackles, b.tackles], ['경합 승리', a.tackleWon, b.tackleWon], ['패스 차단', a.inter, b.inter], ['파울', a.fouls, b.fouls], ['코너킥', a.corners, b.corners], ['오프사이드', a.offsides, b.offsides], ['선방', a.saves, b.saves], ['경고', a.yellow, b.yellow], ['퇴장', a.red, b.red], ['뛴 거리(km)', dist[0].toFixed(1), dist[1].toFixed(1), dist[0], dist[1]]];
    body.append(h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, h('strong', null, M.teams[0].name), h('strong', null, M.teams[1].name)));
    for (const [n, x, y, vx, vy] of rows) {
      const A2 = vx ?? +x, B2 = vy ?? +y; const T = (A2 + B2) || 1;
      body.append(h('div', null, h('div', { class: 'stat' }, h('span', { class: 'v' }, x), h('span', { class: 'c' }, n), h('span', { class: 'v' }, y)), h('div', { class: 'bar2' }, h('i', { style: { width: (A2 / T * 100) + '%', background: kc[0].c1 === '#ffffff' ? '#d8dcd8' : kc[0].c1 } }), h('i', { style: { width: (B2 / T * 100) + '%', background: kc[1].c1 } }))));
    }
  } else if (S.sideTab === 'analysis') {
    body.append(analysisView(false));
  } else {
    if (S.selPid != null) { const p = M.pidList[S.selPid]; if (p) body.append(playerCard(p)); }
    for (const s of [0, 1]) {
      const T = M.teams[s];
      body.append(h('div', { class: 'row', style: { margin: '6px 0 4px', justifyContent: 'space-between' } }, h('strong', null, T.name), h('span', { class: 'hint' }, '체력 · km · 평점')));
      const list = T.all.filter(p => p.r.min > 0 || !p.off).sort((a, b) => (a.off ? 1 : 0) - (b.off ? 1 : 0) || a.slot - b.slot);
      for (const p of list) {
        const rt = liveRating(p);
        body.append(h('div', { class: 'prow', style: { opacity: p.off ? .5 : 1, cursor: 'pointer' }, onclick: () => { S.selPid = p.off ? null : p.pid; feedDirty = true; } },
          h('span', { class: 'num muted' }, p.num), h('span', null, formArrow(p.form), ' ', pl(shortName(p.name), p.d.id), talkMark(p), p.yc ? h('span', { style: { color: '#f2d03d' } }, ' ▮') : null, p.sentOff ? h('span', { style: { color: '#e46a5a' } }, ' ▮') : null, p.r.goals ? ` ⚽${p.r.goals > 1 ? p.r.goals : ''}` : ''),
          h('span', { class: 'en2' }, h('i', { style: { width: p.energy + '%', background: p.energy < 60 ? 'var(--bad)' : p.energy < 75 ? 'var(--warn)' : 'var(--good)' } })), h('span', { class: 'num dim', style: { textAlign: 'right' } }, (p.dist / 1000).toFixed(1)), h('span', { class: 'r ' + (rt >= 7.5 ? 'c90' : rt >= 6.8 ? 'c80' : rt >= 6.2 ? 'c70' : 'c60') }, rt.toFixed(1))));
      }
    }
  }
}
function playerCard(p) {
  const keys = p.code === 'GK' ? ['gkDiving', 'gkHandling', 'gkKicking', 'gkReflexes', 'gkPositioning', 'reactions'] : ['pace', 'accel', 'finishing', 'shotPower', 'shortPass', 'vision', 'dribbling', 'ballControl', 'standTackle', 'marking', 'strength', 'stamina'];
  const fat = E.fatigue(p); const tk = p.talkUntil && M.t < p.talkUntil ? p.talkV : 0;
  return h('div', { class: 'card', style: { marginBottom: '10px', padding: '12px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('strong', null, `${p.num} `, pl(p.name, p.d.id)), h('span', { class: 'tag' }, `${posLabel(p.pos)} → ${posLabel(p.code)}`)),
    h('div', { class: 'hint row', style: { gap: '6px' } }, formArrow(p.form), `경기 컨디션 ${FORM_LBL[p.form]} (${p.form > 0 ? '+' : ''}${(p.form * 2.5).toFixed(1)}%)${tk ? ` · 대화 효과 ${tk > 0 ? '+' : ''}${(tk * 100).toFixed(1)}% (${Math.max(0, Math.ceil((p.talkUntil - M.t) / 60))}분 남음)` : ''}`),
    h('div', { class: 'hint' }, `체력 ${Math.round(p.energy)}% (능력 ${Math.round((1 - fat) * 100) ? '-' + Math.round((1 - fat) * 100) + '%' : '영향 없음'}) · 적합도 ${Math.round(p.fam * 100)}% · 뛴 거리 ${(p.dist / 1000).toFixed(1)}km`),
    h('div', { style: { marginTop: '8px' } }, h('div', { class: 'lbl' }, '히트맵 (공격 방향 →)'), heatmapSVG(p.hm, { label: `${p.name} 히트맵` })),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', marginTop: '6px', fontSize: '12.5px' } }, keys.map(k => h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted' }, D.STAT_LABELS[k]), h('span', { class: 'num ' + ovrClass(p.s[k]) }, `${p.s[k]}`)))));
}
// 선수 히트맵 (공격 방향 → 오른쪽). 한 가지 색의 진하기로 머문 시간을 표시
function heatmapSVG(hm, opts) {
  opts = opts || {}; const W = E.HM_W, H = E.HM_H; const NS = 'http://www.w3.org/2000/svg'; const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el('svg', { viewBox: '0 0 105 68', class: 'heat', role: 'img', 'aria-label': opts.label || '히트맵 (공격 방향 오른쪽)' });
  svg.append(el('rect', { x: 0, y: 0, width: 105, height: 68, class: 'hp' }));
  if (hm) {
    // 3×3 가우시안으로 부드럽게
    const g = new Float32Array(W * H); let mx = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0, wsum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const w = (dx ? .5 : 1) * (dy ? .5 : 1); v += hm[yy * W + xx] * w; wsum += w; } g[y * W + x] = v / wsum; if (g[y * W + x] > mx) mx = g[y * W + x]; }
    const cw = 105 / W, ch = 68 / H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = mx ? g[y * W + x] / mx : 0; if (v < .06) continue; svg.append(el('rect', { x: x * cw, y: (H - 1 - y) * ch, width: cw + .05, height: ch + .05, fill: '#ff7a3d', 'fill-opacity': (.12 + .78 * Math.pow(v, .8)).toFixed(2) })); }
  }
  // 경기장 선
  const ln = (d) => svg.append(el('path', { d, class: 'hl' }));
  ln('M52.5 0V68'); ln('M0 13.84H16.5V54.16H0'); ln('M105 13.84H88.5V54.16H105'); svg.append(el('circle', { cx: 52.5, cy: 34, r: 9.15, class: 'hl', fill: 'none' }));
  svg.append(el('rect', { x: .3, y: .3, width: 104.4, height: 67.4, class: 'hl', fill: 'none' }));
  const ar = el('path', { d: 'M88 64h10m-3-2.5 3 2.5-3 2.5', class: 'harr' }); svg.append(ar);
  return svg;
}
function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '-'; }
function liveRating(p) { return M.ended ? p.r.rating : E.ratingOf(M, p); }
// ---------- 감독 조작 기록 (하이라이트 재계산용) ----------
function logOp(o) { if (!M || !M.opsLog) return; o.t = M.tick; const last = M.opsLog[M.opsLog.length - 1]; if (o.op === 'setup' && last && last.op === 'setup' && last.t === o.t && last.side === o.side) M.opsLog.pop(); M.opsLog.push(o); }
function doSub(live, outP, inD) { const out = outP.d.id; if (E.substitute(live.M, live.T, outP, inD)) { logOp({ side: live.T.side, op: 'sub', out, in: inD.id }); return true; } return false; }
const DEF_INSTR = JSON.stringify(E.DEFAULT_INSTR()), DEF_TAC = JSON.stringify(E.DEFAULT_TACTICS());
function packSetup(s0) {
  const s = JSON.parse(JSON.stringify(s0));
  if (s.instr && s.instr.every(x => !x || JSON.stringify(Object.assign(E.DEFAULT_INSTR(), x)) === DEF_INSTR)) delete s.instr;
  if (JSON.stringify(Object.assign(E.DEFAULT_TACTICS(), s.tactics)) === DEF_TAC) delete s.tactics;
  if (s.roles && E.FORMATIONS[s.formation] && JSON.stringify(s.roles) === JSON.stringify(E.FORMATIONS[s.formation].map(x => x[3]))) delete s.roles;
  if (s.takers && !s.takers.pen && !s.takers.fk && !s.takers.corner) delete s.takers;
  return s;
}
function unpackSetup(s0) {
  const s = JSON.parse(JSON.stringify(s0)); const F = E.slotsOf(s);
  if (!s.roles) s.roles = F.map(x => x[3]); if (!s.instr) s.instr = F.map(() => E.DEFAULT_INSTR()); s.tactics = Object.assign(E.DEFAULT_TACTICS(), s.tactics || {}); if (!s.takers) s.takers = { pen: '', fk: '', corner: '' };
  return s;
}
function packCond(c) { const o = {}; for (const k in c) if (c[k] < 99.5) o[k] = Math.round(c[k]); return o; }
// ---------- 경기 분석 ----------
const ORIGIN_KO = { open: '지공', counter: '역습', through: '스루패스', cross: '크로스', setpiece: '세트피스', long: '중거리', penalty: '페널티킥' };
function shotsUpTo(fr) { return M.shotLog.filter(x => x.f <= fr); }
function teamDiag(side) {
  const fr = L.ph; const snap = snapAt(fr); if (!snap) return [];
  const T = M.teams[side], O = M.teams[1 - side]; const st = snap.st[side], os = snap.st[1 - side];
  const minute = Math.floor(E.readFrame(M, Math.max(0, Math.floor(fr)), metaF).t / 60);
  if (minute < 15) return [{ lvl: 'info', t: '표본 부족', d: '15분 이후부터 진단합니다.', tip: '' }];
  const out = []; const add = (lvl, t, d, tip) => out.push({ lvl, t, d, tip });
  const shots = shotsUpTo(fr); const against = shots.filter(x => x.s !== side), mine = shots.filter(x => x.s === side);
  const xgBy = (arr, o) => arr.filter(x => x.origin === o).reduce((a, x) => a + x.xg, 0); const cnt = (arr, o) => arr.filter(x => x.origin === o).length;
  const oppXg = against.reduce((a, x) => a + x.xg, 0), myXg = mine.reduce((a, x) => a + x.xg, 0);
  if (xgBy(against, 'through') >= .45) add('warn', '뒷공간 노출', `상대 스루패스 슈팅 ${cnt(against, 'through')}회 · xG ${xgBy(against, 'through').toFixed(2)}`, '수비 라인 위치를 한 단계 낮추거나 오프사이드 트랩 해제. 속력이 빠른 센터백 기용.');
  if (xgBy(against, 'cross') >= .35) add('warn', '크로스 허용', `상대 크로스 슈팅 ${cnt(against, 'cross')}회 · xG ${xgBy(against, 'cross').toFixed(2)}`, '측면 압박 강도 높이기, 헤더·점프가 좋은 센터백 기용, 수비 트랩 "안쪽으로 몰아넣기" 해제.');
  if (xgBy(against, 'counter') >= .4) add('warn', '역습 취약', `상대 역습 슈팅 ${cnt(against, 'counter')}회 · xG ${xgBy(against, 'counter').toFixed(2)}`, '소유권을 잃었을 때 "즉각 재압박" 또는 "진형 재정비", 공격 폭 줄이기, 풀백 역할을 보수적으로.');
  if (xgBy(against, 'setpiece') >= .45) add('warn', '세트피스 실점 위험', `상대 세트피스 슈팅 ${cnt(against, 'setpiece')}회 · xG ${xgBy(against, 'setpiece').toFixed(2)}`, '파울을 줄이도록 태클 성향 "서서 수비하라", 공중볼이 강한 선수를 선발.');
  if (cnt(against, 'long') >= 5) add('info', '중거리 슈팅 허용', `박스 밖 슈팅 ${cnt(against, 'long')}회 허용`, '압박 기준선을 한 단계 올리거나 수비형 미드필더를 "앵커"로.');
  if (mine.length >= 7 && myXg / mine.length < .08) add('warn', '슈팅 질 낮음', `슈팅 ${mine.length}회 · 슈팅당 xG ${(myXg / mine.length).toFixed(2)}`, '공격 진영 플레이 "박스 안으로 진입", 중거리 슈터 외 선수는 슛 빈도 "적게".');
  const tp = st.poss + os.poss || 1; const poss = st.poss / tp;
  if (minute >= 30 && poss >= .55 && myXg < .35 * minute / 45) add('warn', '점유 대비 기회 부족', `점유율 ${Math.round(poss * 100)}% · xG ${myXg.toFixed(2)}`, '경기 템포 높이기, 패스 형태 "다이렉트하게", 공격수에게 "빈 공간 침투" 지시.');
  if (poss < .4) add('info', '점유 열세', `점유율 ${Math.round(poss * 100)}%`, myXg > oppXg ? '현재 효율은 좋습니다. 소유권을 되찾았을 때 "즉각 역습" 유지.' : '진형 유지와 짧은 패스로 소유 시간을 늘리거나, 수비 라인을 낮추고 역습 위주로 전환.');
  const pp = st.passes ? st.passOk / st.passes : 1;
  if (st.passes >= 60 && pp < .72) add('warn', '패스 정확도 낮음', `패스 성공률 ${Math.round(pp * 100)}% (${st.passOk}/${st.passes})`, '패스 형태 "짧게", 경기 템포 낮추기, 상대 압박이 강하면 GK 배급을 "발로 차기"로.');
  const myCross = M.passLog.filter(x => x.s === side && x.k === 'cross' && x.f <= fr); const crOk = myCross.filter(x => x.ok).length;
  if (myCross.length >= 8 && crOk / myCross.length < .25) add('info', '크로스 효율 낮음', `크로스 ${myCross.length}회 중 연결 ${crOk}회`, '크로스 형태 "낮게 깔린", 또는 진입 지역을 중앙으로.');
  if (st.offsides >= 4) add('info', '오프사이드 잦음', `오프사이드 ${st.offsides}회`, '침투형 공격수에게 "제자리 유지" 지시 또는 역할을 타깃맨·폴스 나인으로.');
  if (st.fouls >= 13 || st.yellow >= 3) add('warn', '파울·경고 많음', `파울 ${st.fouls} · 경고 ${st.yellow}`, '태클 성향 "서서 수비하라", 경고 받은 선수의 태클 강도 "조심스럽게".');
  if (st.tackles >= 20 && st.tackleWon / st.tackles < .38) add('info', '볼 경합 열세', `경합 승리 ${st.tackleWon}/${st.tackles}`, '압박 강도를 한 단계 낮춰 무리한 경합을 줄이거나, 볼위닝 미드필더 배치.');
  const tired = T.players.filter(p => !p.off && p.code !== 'GK' && p.energy < 62).sort((a, b) => a.energy - b.energy);
  if (tired.length) add(tired[0].energy < 55 ? 'warn' : 'info', '체력 저하', tired.slice(0, 3).map(p => `${shortName(p.name)} ${Math.round(p.energy)}%`).join(', '), T.subsLeft > 0 ? `교체 ${Math.min(T.subsLeft, tired.length)}명 고려 (남은 교체 ${T.subsLeft}회). 압박 강도 낮추기.` : '교체를 모두 사용했습니다. 압박 강도와 템포를 낮춰 체력 관리.');
  const threat = {}; for (const x of against) threat[x.p] = (threat[x.p] || 0) + x.xg;
  for (const x of M.passLog) if (x.s !== side && x.f <= fr && x.ok && (x.k === 'through' || x.k === 'cross')) threat[x.p] = (threat[x.p] || 0) + .05;
  const top = Object.entries(threat).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= .5) { const tp2 = M.pidList[top[0]]; add('info', '상대 위협 선수', `${tp2.name} (${tp2.code}) · 관여 xG ${top[1].toFixed(2)}`, `가장 가까운 수비 자원에게 ${shortName(tp2.name)} 전담 마크 지정 고려.`); }
  if (!out.length) add('good', '뚜렷한 취약점 없음', `xG ${myXg.toFixed(2)} : ${oppXg.toFixed(2)} · 점유율 ${Math.round(poss * 100)}%`, '현재 전술 유지.');
  return out;
}
function playerSummary(p) {
  const r = p.r; const good = [], bad = [];
  const xg = M.shotLog.filter(x => x.p === p.pid).reduce((a, x) => a + x.xg, 0);
  const pp = r.pass ? r.passOk / r.pass : 0; const d90 = p.dist / 1000 / Math.max(1, r.min) * 90;
  if (r.goals) good.push(`${r.goals}골`); if (r.ast) good.push(`${r.ast}도움`);
  if (r.kp >= 2) good.push(`기회 창출 ${r.kp}회`);
  if (r.pass >= 20 && pp >= .88) good.push(`패스 정확도 ${Math.round(pp * 100)}%`); if (r.pass >= 15 && pp < .7) bad.push(`패스 정확도 ${Math.round(pp * 100)}%`);
  if (r.drb >= 3) good.push(`돌파 성공 ${r.drb}회`);
  if (r.tklW >= 3) good.push(`경합 승리 ${r.tklW}회`); if (r.int >= 4) good.push(`패스 차단 ${r.int}회`);
  if (r.shots >= 3 && r.sot === 0) bad.push(`슈팅 ${r.shots}회 모두 유효 슈팅 아님`);
  else if (xg >= .7 && !r.goals) bad.push(`xG ${xg.toFixed(2)}에도 무득점`);
  if ((r.beaten || 0) >= 3) bad.push(`돌파 허용 ${r.beaten}회`);
  if (r.foul >= 3) bad.push(`파울 ${r.foul}회`); if (p.yc) bad.push(p.yc > 1 ? '경고 2회' : '경고'); if (p.sentOff) bad.push('퇴장');
  if (p.code === 'GK') { if (r.sav >= 4) good.push(`선방 ${r.sav}회`); const conc = M.score[1 - p.side]; if (conc >= 3) bad.push(`${conc}실점`); if (conc === 0 && r.min > 60) good.push('무실점'); }
  else if (r.min >= 45) { if (d90 >= 11) good.push(`활동량 ${d90.toFixed(1)}km/90분`); if (d90 < 8.6) bad.push(`활동량 ${d90.toFixed(1)}km/90분`); }
  if (!p.off && p.energy < 50) bad.push(`체력 ${Math.round(p.energy)}%`);
  return { good, bad, xg, pp };
}
function passMapSVG(side, pid, mode) {
  const fr = L.ph; const NS = 'http://www.w3.org/2000/svg'; const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el('svg', { viewBox: '-2 -2 109 72', class: 'pmap', role: 'img', 'aria-label': `${M.teams[side].name} 패스 지도 (오른쪽이 공격 방향)` });
  const X = x => x + 52.5, Y = y => 34 - y;
  svg.append(el('rect', { x: 0, y: 0, width: 105, height: 68, class: 'pf' }));
  for (const d of [`M52.5 0V68`, `M0 13.84H16.5V54.16H0`, `M105 13.84H88.5V54.16H105`, `M0 24.84H5.5V43.16H0`, `M105 24.84H99.5V43.16H105`]) svg.append(el('path', { d, class: 'pl' }));
  svg.append(el('circle', { cx: 52.5, cy: 34, r: 9.15, class: 'pl' }));
  const T = M.teams[side]; const log = M.passLog.filter(x => x.s === side && x.f <= fr && x.k !== 'throw');
  if (mode === 'network') {
    const pl = T.all.filter(p => p.sn > 50 && p.r.min > 0);
    const pos = {}; for (const p of pl) pos[p.pid] = [p.sx / p.sn, p.sy / p.sn];
    // 연결 횟수 계산: 성공한 패스의 다음 볼 보유자를 알 수 없어 목표 지점에서 가장 가까운 동료를 수신자로 추정
    const links = {};
    for (const x of log) { if (!x.ok) continue; let best = null, bd = 9; for (const p of pl) { if (p.pid === x.p) continue; const q = pos[p.pid]; const dd = Math.hypot(q[0] - x.x1, q[1] - x.y1); if (dd < bd) { bd = dd; best = p.pid; } } if (best == null) continue; const k = x.p < best ? x.p + '-' + best : best + '-' + x.p; links[k] = (links[k] || 0) + 1; }
    const mx = Math.max(1, ...Object.values(links));
    for (const k in links) { const [a, b] = k.split('-').map(Number); if (!pos[a] || !pos[b] || links[k] < 3) continue; const ln = el('line', { x1: X(pos[a][0]), y1: Y(pos[a][1]), x2: X(pos[b][0]), y2: Y(pos[b][1]), class: 'plink', 'stroke-width': (.3 + 1.6 * links[k] / mx).toFixed(2), opacity: (.35 + .6 * links[k] / mx).toFixed(2) }); const tt = el('title', {}); tt.textContent = `${M.pidList[a].name} ↔ ${M.pidList[b].name}: ${links[k]}회`; ln.append(tt); svg.append(ln); }
    for (const p of pl) { const [x, y] = pos[p.pid]; const n = log.filter(q => q.p === p.pid).length; const g = el('g', { class: 'pnode' + (pid != null && pid !== p.pid ? ' dim' : '') }); g.append(el('circle', { cx: X(x), cy: Y(y), r: (1.8 + Math.min(2.2, n / 25)).toFixed(2), fill: T.side === 0 ? L.kits[0].c1 : L.kits[1].c1 })); const tx = el('text', { x: X(x), y: Y(y) + .9, 'text-anchor': 'middle', class: 'pnum2', fill: ink(L.kits[side].c1) }); tx.textContent = p.num; g.append(tx); const tt = el('title', {}); tt.textContent = `${p.name} · 평균 위치 · 패스 ${n}회`; g.append(tt); svg.append(g); }
  } else {
    const lst = log.filter(x => pid == null || x.p === pid);
    for (const x of lst) { const ln = el('line', { x1: X(x.x0), y1: Y(x.y0), x2: X(x.x1), y2: Y(x.y1), class: x.ok ? 'pok' : 'pfail' }); const tt = el('title', {}); tt.textContent = `${M.pidList[x.p].name} · ${({ ground: '땅볼', lofted: '롱패스', through: '스루패스', cross: '크로스', roll: 'GK 배급' })[x.k] || x.k} · ${x.ok ? '성공' : '실패'}`; ln.append(tt); svg.append(ln); svg.append(el('circle', { cx: X(x.x1), cy: Y(x.y1), r: .55, class: x.ok ? 'pokd' : 'pfaild' })); }
  }
  // 슈팅 위치
  for (const x of shotsUpTo(fr).filter(x => x.s === side && (pid == null || x.p === pid))) { const c = el('circle', { cx: X(x.x), cy: Y(x.y), r: (.8 + x.xg * 3.5).toFixed(2), class: x.out === 'goal' ? 'sgoal' : 'sshot' }); const tt = el('title', {}); tt.textContent = `${M.pidList[x.p].name} 슈팅 · xG ${x.xg.toFixed(2)} · ${ORIGIN_KO[x.origin]} · ${({ goal: '골', save: '선방', miss: '빗나감', block: '블록', post: '골대' })[x.out]}`; c.append(tt); svg.append(c); }
  return svg;
}
function analysisView(big) {
  const box = h('div', { class: 'stack anl' + (big ? ' big' : '') });
  const sides = L.control.length ? L.control : [0, 1];
  if (S.anSide == null || ![0, 1].includes(S.anSide)) S.anSide = sides[0];
  const side = S.anSide; const T = M.teams[side];
  const rerender = () => { if (big) openAnalysis(); else updateSide(true); };
  box.append(seg([[0, M.teams[0].short], [1, M.teams[1].short]], side, v => { S.anSide = v; S.anPid = null; rerender(); }));
  // 전술 진단
  const dg = teamDiag(side);
  box.append(h('div', { class: 'stack', style: { gap: '6px' } }, h('h3', null, '전술 진단'), ...dg.map(x => h('div', { class: 'diag ' + x.lvl }, h('div', { class: 'row', style: { justifyContent: 'space-between', gap: '6px' } }, h('strong', null, x.t), h('span', { class: 'dlv' }, x.lvl === 'warn' ? '주의' : x.lvl === 'good' ? '양호' : '참고')), h('div', { class: 'num dim' }, x.d), x.tip ? h('div', { class: 'tip' }, '제안: ', x.tip) : null))));
  // 패스맵
  if (!S.anMode) S.anMode = 'network';
  const plist = T.all.filter(p => p.r.min > 0);
  box.append(h('div', { class: 'stack', style: { gap: '6px' } }, h('h3', null, '패스 지도'),
    h('div', { class: 'row' }, seg([['network', '패스 네트워크'], ['lines', '패스 선']], S.anMode, v => { S.anMode = v; rerender(); }),
      sel([['', '전체 선수'], ...plist.map(p => [String(p.pid), `${p.num} ${shortName(p.name)}`])], S.anPid == null ? '' : String(S.anPid), v => { S.anPid = v === '' ? null : +v; rerender(); }, big ? 'anpid2' : 'anpid')),
    passMapSVG(side, S.anPid, S.anMode),
    S.anPid != null && M.pidList[S.anPid] ? h('div', null, h('div', { class: 'lbl' }, `${M.pidList[S.anPid].name} 히트맵 (공격 방향 →)`), heatmapSVG(M.pidList[S.anPid].hm)) : null,
    h('div', { class: 'hint' }, S.anMode === 'network' ? '점은 평균 위치(오른쪽이 공격 방향), 선 굵기는 두 선수 사이 연결 패스 수입니다. 3회 이상만 표시합니다.' : '실선은 성공, 점선은 실패한 패스. 원은 슈팅 위치(클수록 xG 높음), 채워진 원은 골입니다.')));
  // 선수별 요약
  const rows = h('div', { class: 'stack', style: { gap: '6px' } }, h('h3', null, '선수별 요약'));
  for (const p of T.all.filter(p => p.r.min > 5).sort((a, b) => liveRating(b) - liveRating(a))) {
    const sm = playerSummary(p); const rt = liveRating(p);
    rows.append(h('details', { class: 'psum' }, h('summary', null, h('span', { class: 'num dim' }, p.num), h('span', { class: 'psn' }, pl(shortName(p.name), p.d.id), h('span', { class: 'dim' }, ` ${posLabel(p.code)} · ${Math.min(90, Math.round(p.r.min))}분`)), h('span', { class: 'r ' + (rt >= 7.5 ? 'c90' : rt >= 6.8 ? 'c80' : rt >= 6.2 ? 'c70' : 'c60') }, rt.toFixed(1))),
      h('div', { class: 'psb' },
        h('div', { class: 'num dim', style: { fontSize: '12px' } }, p.code === 'GK' ? `선방 ${p.r.sav} · 패스 ${p.r.passOk}/${p.r.pass} · 뛴 거리 ${(p.dist / 1000).toFixed(1)}km` : `패스 ${p.r.passOk}/${p.r.pass} · 키패스 ${p.r.kp} · 슈팅 ${p.r.shots}(유효 ${p.r.sot}, xG ${sm.xg.toFixed(2)}) · 돌파 ${p.r.drb} · 경합 승리 ${p.r.tklW} · 차단 ${p.r.int} · 돌파 허용 ${p.r.beaten || 0} · 파울 ${p.r.foul} · ${(p.dist / 1000).toFixed(1)}km`),
        h('div', { style: { maxWidth: '320px', marginTop: '6px' } }, h('div', { class: 'lbl' }, '히트맵 (공격 방향 →)'), heatmapSVG(p.hm, { label: `${p.name} 히트맵` })),
        h('div', { class: 'grid2', style: { gap: '8px', marginTop: '6px' } }, h('div', null, h('div', { class: 'lbl' }, '잘한 점'), ...(sm.good.length ? sm.good.map(x => h('div', { class: 'gb good' }, x)) : [h('div', { class: 'dim' }, '-')])), h('div', null, h('div', { class: 'lbl' }, '아쉬운 점'), ...(sm.bad.length ? sm.bad.map(x => h('div', { class: 'gb bad' }, x)) : [h('div', { class: 'dim' }, '-')]))))));
  }
  box.append(rows);
  if (!big) box.prepend(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => updateSide(true) }, '새로고침'), h('button', { class: 'btn sm', onclick: openAnalysis }, '크게 보기'), h('span', { class: 'hint' }, '현재 장면까지의 기록')));
  return box;
}
function openAnalysis() { L.playing = false; buildCtrl(); modal(h('div', null, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, '경기 분석'), h('button', { class: 'btn', onclick: () => { closeModal(); } }, '닫기')), analysisView(true)), false); }
// ---------- 모달 ----------
// 기본 창(#modal) 1개 + 그 위에 겹쳐 뜨는 층(.modal.layer). 닫기는 맨 위 층만 닫음
function modal(content, small, kind) {
  const old = $('#modal');
  const m = h('div', { class: 'modal', id: 'modal', role: 'dialog', 'aria-modal': 'true', 'data-kind': kind || '' }, h('div', { class: 'box' + (small ? ' small' : '') }, content));
  if (old) old.replaceWith(m); else { const first = document.querySelector('.modal.layer'); if (first) first.before(m); else overlayRoot().append(m); }
  L.modal = true; return m;
}
function modalLayer(content, key) {
  const old = document.querySelector(`.modal.layer[data-key="${key}"]`);
  const m = h('div', { class: 'modal layer', 'data-key': key, role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'box' }, content));
  if (old) old.replaceWith(m); else overlayRoot().append(m);
  L.modal = true; return m;
}
// 선수 프로필 등: 다른 창이 열려 있으면 그 위에 겹쳐 띄워 닫아도 아래 창이 남게 함
function modalOver(content, key) { const base = $('#modal'); if (base && base.dataset.kind !== key) return modalLayer(content, key); return modal(content, false, key); }
function syncModalFlag() { L.modal = !!document.querySelector('.modal'); }
function closeModalSilently() { const m = $('#modal'); if (m) m.remove(); syncModalFlag(); }
function closeModal() { const ls = document.querySelectorAll('.modal.layer'); if (ls.length) ls[ls.length - 1].remove(); else { const m = $('#modal'); if (m) m.remove(); } syncModalFlag(); }
function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.remove()); L.modal = false; }
function openLiveTactics() {
  const sides = L.control; if (!sides.includes(S.tacSide)) S.tacSide = sides[0];
  L.playing = false; buildCtrl();
  const lagSec = Math.max(0, (bufEnd() - L.ph) * FRAME_DT());
  const draw = () => {
    const T = M.teams[S.tacSide];
    modal(h('div', null,
      h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, `${T.name} 전술·교체`), sides.length > 1 ? seg(sides.map(s => [s, M.teams[s].name]), S.tacSide, v => { S.tacSide = v; S.selSlot = null; draw(); }) : null,
        h('button', { class: 'btn primary', onclick: () => { closeModal(); S.selSlot = null; S.pendingSub = null; S.swapA = null; L.playing = true; buildCtrl(); } }, '경기 재개')),
      lagSec > 3 ? h('p', { class: 'hint', style: { marginTop: 0 } }, `하이라이트 모드는 경기를 미리 계산해 두기 때문에, 바꾼 내용은 지금 화면보다 약 ${Math.round(lagSec)}초(경기 시간) 뒤 장면부터 반영됩니다.`) : null,
      tacticsPanel({ team: T.db, setup: T.setup, live: { M, T }, onChange: () => { L.infoCache.clear(); logOp({ side: T.side, op: 'setup', s: JSON.parse(JSON.stringify(T.setup)) }); const st = scrollState(); draw(); restoreScroll(st); } })));
  };
  draw();
}
function showHalftime() {
  const a = M.teams[0], b = M.teams[1];
  modal(h('div', { class: 'stack' }, h('h2', null, '하프타임'), h('div', { class: 'num', style: { fontSize: '40px' } }, `${a.short} ${M.score[0]} – ${M.score[1]} ${b.short}`),
    h('div', { class: 'hint' }, `슈팅 ${a.st.shots}–${b.st.shots} · 유효 슈팅 ${a.st.sot}–${b.st.sot} · xG ${a.st.xg.toFixed(2)}–${b.st.xg.toFixed(2)}`),
    h('div', { class: 'row' }, L.control.length ? h('button', { class: 'btn', onclick: () => { closeModal(); M.halftimePause = false; openLiveTactics(); } }, '전술·교체') : null, L.control.length ? h('button', { class: 'btn', onclick: () => openTalk(true) }, '하프타임 대화') : null, h('button', { class: 'btn primary', onclick: () => { closeModal(); M.halftimePause = false; L.playing = true; buildCtrl(); } }, '후반 시작'))), true);
}
// 선수단 대화: 상황에 맞는 말을 골라 15분 동안 선수들의 사기(능력치 배율)를 바꿈. 선수마다 반응이 다름
function openTalk(half) {
  const sides = L.control; if (!sides.length) return; let side = sides.includes(S.tacSide) ? S.tacSide : sides[0];
  L.playing = false; buildCtrl();
  let result = null;
  const draw = () => {
    const T = M.teams[side]; const last = T.talks[T.talks.length - 1];
    const cool = last && M.t - last.t < 120;
    const diff = M.score[side] - M.score[1 - side];
    const body = h('div', { class: 'stack' },
      h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, `${T.name} 선수단 대화`), sides.length > 1 ? seg([[0, M.teams[0].short], [1, M.teams[1].short]], side, v => { side = +v; result = null; draw(); }) : null, h('button', { class: 'btn', onclick: () => { half ? showHalftime() : closeModal(); } }, half ? '돌아가기' : '닫기')),
      h('p', { class: 'hint', style: { margin: 0 } }, `현재 ${diff > 0 ? diff + '골 앞섬' : diff < 0 ? -diff + '골 뒤짐' : '동점'} · 효과는 약 15분 동안 이어지고, 선수 성격·평점·점수 상황에 따라 반응이 다릅니다. 같은 말을 짧은 간격으로 반복하면 효과가 줄어듭니다.`),
      cool ? h('div', { class: 'warnbox' }, '방금 대화를 했습니다. 2분(경기 시간) 뒤에 다시 할 수 있습니다.') : null,
      h('div', { class: 'talkgrid' }, Object.entries(E.TALKS).map(([k, t]) => h('button', { class: 'talkbtn', disabled: !!cool, onclick: () => { const out = E.applyTalk(M, T, k); logOp({ side, op: 'talk', kind: k }); result = { k, out }; feedDirty = true; draw(); } }, h('strong', null, t.n), h('span', { class: 'hint' }, t.d)))),
      result ? h('div', { class: 'card stack', style: { gap: '4px' } }, h('strong', null, `"${E.TALKS[result.k].n}" 반응`),
        h('div', { class: 'talkres' }, result.out.map(o => { const p = M.pidList[o.pid]; return h('div', { class: 'tr ' + (o.re > 0 ? 'up' : o.re < 0 ? 'down' : '') }, h('span', null, o.re > 0 ? '▲' : o.re < 0 ? '▼' : '–'), h('span', null, shortName(p.name)), h('span', { class: 'hint' }, o.re > 0 ? '의욕이 올랐습니다' : o.re < 0 ? '불만을 보입니다' : '반응 없음')); })),
        h('div', { class: 'hint' }, `상승 ${result.out.filter(o => o.re > 0).length}명 · 변화 없음 ${result.out.filter(o => !o.re).length}명 · 하락 ${result.out.filter(o => o.re < 0).length}명`)) : null);
    modal(body, false);
  };
  draw();
}
function showFulltime() {
  const a = M.teams[0], b = M.teams[1];
  const motm = M.pidList.filter(p => p.r.min > 10).sort((x, y) => y.r.rating - x.r.rating)[0];
  const goals = s => M.goalsLog.filter(g => g.side === s).map(g => `${g.name} ${g.min}'`).join(', ') || '-';
  const lg = L.ctx.type === 'league' || L.ctx.type === 'review';
  modal(h('div', { class: 'stack' }, h('h2', null, L.ctx.type === 'review' ? '하이라이트 끝' : '경기 종료'), h('div', { class: 'num', style: { fontSize: '44px' } }, `${a.short} ${M.score[0]} – ${M.score[1]} ${b.short}`),
    h('div', { class: 'hint' }, `${a.name}: ${goals(0)}`), h('div', { class: 'hint' }, `${b.name}: ${goals(1)}`),
    motm ? h('div', null, h('span', { class: 'lbl' }, '최우수 선수 '), h('strong', null, pl(motm.name, motm.d.id), ` (${motm.team.name}) ${motm.r.rating.toFixed(1)}`)) : null,
    h('div', { class: 'hint' }, `슈팅 ${a.st.shots}–${b.st.shots} · 유효 ${a.st.sot}–${b.st.sot} · xG ${a.st.xg.toFixed(2)}–${b.st.xg.toFixed(2)} · 점유율 ${Math.round(a.st.poss / Math.max(1, a.st.poss + b.st.poss) * 100)}%`),
    L.ctx.type === 'league' || L.ctx.type === 'career' ? h('p', { class: 'hint', style: { margin: 0 } }, L.ctx.note || '결과가 리그에 기록되었습니다.') : L.ctx.mismatch ? h('p', { class: 'hint bad', style: { margin: 0 } }, L.ctx.mismatch) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { closeModal(); openAnalysis(); } }, '경기 분석'), h('button', { class: 'btn', onclick: () => { closeModal(); startReplay(0, false); } }, '전체 경기 리플레이'), h('button', { class: 'btn', onclick: () => { closeModal(); S.sideTab = 'stats'; feedDirty = true; render(); } }, '통계 보기'),
      L.ctx.back ? h('button', { class: 'btn primary', onclick: () => { closeModal(); go(L.ctx.back); } }, '돌아가기') : lg ? h('button', { class: 'btn primary', onclick: () => { closeModal(); go('league'); } }, '리그로 돌아가기') : h('button', { class: 'btn primary', onclick: () => { closeModal(); go('setup'); } }, '새 경기'))), true);
}
function simToEnd() {
  L.playing = false; buildCtrl();
  modal(h('div', { class: 'stack' }, h('h2', null, '결과 계산 중'), h('div', { class: 'meter' }, h('i', { id: 'simbar', style: { width: '0%' } })), h('div', { class: 'hint', id: 'simtxt' }, '')), true);
  const chunk = () => {
    let n = 0; while (!M.ended && n < 1500) { if (M.halftimePause) M.halftimePause = false; E.step(M); n++; }
    const bar = $('#simbar'); if (bar) bar.style.width = Math.min(100, M.t / 5900 * 100) + '%';
    const tx = $('#simtxt'); if (tx) tx.textContent = `${Math.floor(M.t / 60)}분 · ${M.score[0]} – ${M.score[1]}`;
    if (!M.ended) setTimeout(chunk, 0);
    else { closeModal(); L.halfShown = true; L.ph = bufEnd(); L.shownIdx = M.events.length; L.pendingReplay = null; L.playing = true; feedDirty = true; buildCtrl(); }
  };
  setTimeout(chunk, 30);
}
function onMatchEnd() {
  if (L.ctx.type === 'league' && !L.recorded) { L.recorded = true; recordLeagueResult(L.ctx, E.summary(M)); }
  if (L.ctx.type === 'career' && !L.recorded && window.Manager) { L.recorded = true; Manager.onMatchDone(L.ctx, SUM(M), Object.assign({}, L.rpBase, { ops: M.opsLog })); }
}

// ================= 리그 =================
const CAREER_KEY = 'draftxi.career.v1';
let career = LS.get(CAREER_KEY) || { seasons: [], active: null };
const saveCareer = () => { if (!LS.set(CAREER_KEY, career)) toast('저장 공간이 부족해 시즌을 저장하지 못했습니다. 지난 시즌을 삭제해 보세요.'); };
function curSeason() { return career.seasons.find(s => s.id === career.active) || null; }
function makeFixtures(ids, seed) {
  const r = E._t.RNG(seed); const t = ids.slice();
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  if (t.length % 2) t.push(null);
  const n = t.length, half = []; const arr = t.slice();
  const streak = {};
  for (let rd = 0; rd < n - 1; rd++) {
    const ms = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i]; if (!a || !b) continue;
      const sa = streak[a] || 0, sb = streak[b] || 0; const aHome = sa < sb || (sa === sb && r() < .5);
      const hm = aHome ? a : b, aw = aHome ? b : a; ms.push({ h: hm, a: aw });
      streak[hm] = (streak[hm] || 0) > 0 ? streak[hm] + 1 : 1; streak[aw] = (streak[aw] || 0) < 0 ? streak[aw] - 1 : -1;
    }
    half.push(ms);
    arr.splice(1, 0, arr.pop());
  }
  const second = half.map(ms => ms.map(m => ({ h: m.a, a: m.h })));
  const rounds = [...half, ...second].map(ms => ({ matches: ms.map(m => ({ h: m.h, a: m.a, res: null })) }));
  let day = 0; const mid = new Set([4, 12, 19, 27, 33]);
  rounds.forEach((rd, i) => { rd.day = day; day += mid.has(i + 1) ? 3 : 7; });
  return rounds;
}
function seasonLabel(prev) { if (!prev) return '2026-27'; const y = +prev.label.slice(0, 4) + 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; }
const AI_FORMS = ['4-3-3', '4-2-3-1', '4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-1-2-1-2', '5-3-2'];
function startSeason(leagueId, userTeam) {
  const lg = db.leagues.find(l => l.id === leagueId);
  const prev = career.seasons.filter(s => s.leagueId === leagueId).slice(-1)[0];
  const id = 'S' + Date.now().toString(36);
  const seed = hashStr(id);
  const se = { id, leagueId, leagueName: lg.name, label: seasonLabel(prev), userTeam: userTeam || null, teamIds: lg.teams.map(t => t.id), rounds: makeFixtures(lg.teams.map(t => t.id), seed), cur: 0, pstats: {}, susp: {}, ycount: {}, cond: {}, form: {}, seed, done: false };
  for (const t of lg.teams) se.form[t.id] = AI_FORMS[hashStr(t.id + id) % AI_FORMS.length];
  for (const s of career.seasons) if (s.done) for (const rd of s.rounds) for (const m of rd.matches) if (m.res) { delete m.res.cards; delete m.res.st; delete m.res.rp; delete m.res.pr; }
  career.seasons.push(se); career.active = id;
  saveCareer();
  return se;
}
function unavailableSet(se, team) { const u = new Set(); for (const p of team.players) if ((se.susp[p.id] || 0) > 0) u.add(p.id); return u; }
function availSetup(team, formation, unavail, cond, cur) {
  let pool = team.players.filter(p => !unavail.has(p.id));
  const fresh = pool.filter(p => !cond || cond[p.id] == null || cond[p.id] >= 72);
  if (fresh.some(p => p.pos === 'GK') && fresh.length >= 14) pool = fresh;
  const tp = Object.assign({}, team, { players: pool });
  if (cur && cur.slots && cur.slots.length === 11) { const pk = E.autoPick(tp, cur.slots); const s = E.makeSetup(tp, '4-3-3'); s.lineup = pk.lineup; s.bench = pk.bench; return s; }
  return E.makeSetup(tp, formation);
}
function setupForLeague(se, teamId) {
  const team = teamById(teamId); const un = unavailableSet(se, team);
  if (teamId === se.userTeam) {
    const s = JSON.parse(JSON.stringify(setupFor(teamId)));
    const used = new Set(s.lineup);
    s.lineup.forEach((id, i) => {
      if (!un.has(id)) return;
      const code = E.slotsOf(s)[i][0];
      const cand = team.players.filter(p => !un.has(p.id) && !used.has(p.id)).sort((a, b) => D.calcOvr(b.stats, b.pos) * E.familiarity(b.pos, code) - D.calcOvr(a.stats, a.pos) * E.familiarity(a.pos, code))[0];
      if (cand) { s.lineup[i] = cand.id; used.add(cand.id); }
    });
    s.bench = (s.bench || []).filter(id => !un.has(id) && !s.lineup.includes(id));
    if (s.bench.length < 7) for (const p of team.players.filter(p => !un.has(p.id) && !s.lineup.includes(p.id) && !s.bench.includes(p.id)).sort((a, b) => D.calcOvr(b.stats, b.pos) - D.calcOvr(a.stats, a.pos))) { if (s.bench.length >= 9) break; s.bench.push(p.id); }
    return s;
  }
  return availSetup(team, se.form[teamId] || '4-3-3', un, se.cond);
}
function condFor(se, teamId) { const team = teamById(teamId); const c = {}; for (const p of team.players) c[p.id] = se.cond[p.id] ?? 100; return c; }
function nextUserFixture(se) { if (!se || !se.userTeam) return null; for (let i = se.cur; i < se.rounds.length; i++) { const m = se.rounds[i].matches.find(m => m.h === se.userTeam || m.a === se.userTeam); if (m && !m.res) return Object.assign({ round: i }, m); } return null; }
function matchSeed(se, ri, mi) { return (hashStr(se.id + ':' + ri + ':' + mi) ^ 0x5bd1e995) >>> 0; }
function recordLeagueResult(ctx, res) {
  const se = career.seasons.find(s => s.id === ctx.seasonId); if (!se) return;
  const m = se.rounds[ctx.round].matches[ctx.mi]; if (m.res) return;
  delete m.pending; applyResult(se, m, res, Object.assign({}, L.rpBase, { ops: M.opsLog }));
  saveCareer();
}
function applyResult(se, m, res, rp) {
  m.res = { hs: res.score[0], as: res.score[1], xg: res.xg, goals: res.goals, cards: res.cards, st: res.st ? res.st.map(s => ({ shots: s.shots, sot: s.sot, poss: Math.round(s.poss) })) : null, motm: null, rp: rp || null, pr: res.players.filter(x => x.min >= 30).map(x => [x.id, x.side, x.rating, x.code || '']) };
  for (const tid of [m.h, m.a]) { const t = teamById(tid); if (!t) continue; for (const p of t.players) if ((se.susp[p.id] || 0) > 0) se.susp[p.id]--; }
  let best = null;
  for (const pr of res.players) {
    const team = pr.side === 0 ? m.h : m.a;
    const s = se.pstats[pr.id] || (se.pstats[pr.id] = { team, apps: 0, sub: 0, min: 0, goals: 0, ast: 0, yc: 0, rc: 0, rsum: 0, motm: 0 });
    s.team = team; if (!s.name) { const tt = teamById(team); const pp = playerOf(tt, pr.id); if (pp) s.name = pp.name; }
    if (pr.start) s.apps++; else s.sub++;
    s.min += pr.min; s.goals += pr.goals; s.ast += pr.ast; s.yc += pr.yc; s.rc += pr.red ? 1 : 0; s.rsum += pr.rating;
    se.cond[pr.id] = pr.energy;
    if (pr.min > 30 && (!best || pr.rating > best.rating)) best = pr;
    // 징계: 경고 누적 5장마다 1경기, 경고 2장 퇴장 1경기, 다이렉트 퇴장 3경기
    if (pr.yc && !pr.red) { const before = se.ycount[pr.id] || 0; se.ycount[pr.id] = before + pr.yc; if (Math.floor((before + pr.yc) / 5) > Math.floor(before / 5)) se.susp[pr.id] = (se.susp[pr.id] || 0) + 1; }
    if (pr.red) { const direct = res.cards.some(c => c.id === pr.id && c.direct); se.susp[pr.id] = (se.susp[pr.id] || 0) + (direct ? 3 : 1); }
  }
  if (best) { se.pstats[best.id].motm++; m.res.motm = { id: best.id, r: best.rating }; }
}
function maybeFinishRound(se) {
  const rd = se.rounds[se.cur]; if (!rd || rd.matches.some(m => !m.res)) return false;
  const next = se.rounds[se.cur + 1]; const days = next ? next.day - rd.day : 7;
  const stam = {}; for (const id of se.teamIds) for (const p of teamById(id).players) stam[p.id] = p.stats.stamina;
  for (const id in se.cond) se.cond[id] = Math.min(100, se.cond[id] + days * E.recoverPerDay(stam[id] ?? 70, 0));
  se.cur++;
  if (se.cur >= se.rounds.length) se.done = true;
  return true;
}
function computeTable(se) {
  const T = {}; for (const id of se.teamIds) T[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
  for (const rd of se.rounds) for (const m of rd.matches) if (m.res && T[m.h] && T[m.a]) {
    const a = T[m.h], b = T[m.a]; const x = m.res.hs, y = m.res.as;
    a.p++; b.p++; a.gf += x; a.ga += y; b.gf += y; b.ga += x;
    if (x > y) { a.w++; b.l++; a.pts += 3; a.form.push('W'); b.form.push('L'); } else if (x < y) { b.w++; a.l++; b.pts += 3; a.form.push('L'); b.form.push('W'); } else { a.d++; b.d++; a.pts++; b.pts++; a.form.push('D'); b.form.push('D'); }
  }
  const nm = id => (teamById(id) || { name: id }).name;
  return Object.values(T).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || nm(a.id).localeCompare(nm(b.id)));
}
// ----- 백그라운드 계산: 웹 워커 풀, 안 되면 메인 스레드에서 나눠 계산 -----
const Pool = { workers: [], ok: null, queue: [], busy: new Map(), cb: new Map(), seq: 0, localBusy: false };
function poolInit() {
  if (Pool.ok !== null) return;
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) { const w = new Worker('dx_worker.js'); w.onmessage = e => onWorkerMsg(w, e.data); w.onerror = ev => { ev.preventDefault && ev.preventDefault(); workerFailed(w); }; Pool.workers.push(w); }
    Pool.ok = true;
  } catch (e) { Pool.ok = false; }
}
function workerFailed(w) {
  // 워커를 쓸 수 없는 환경이면 대기 중인 작업을 메인 스레드로 넘김
  const job = Pool.busy.get(w); Pool.busy.delete(w);
  Pool.workers = Pool.workers.filter(x => x !== w); try { w.terminate(); } catch (e) { }
  if (job) Pool.queue.unshift(job);
  if (!Pool.workers.length) Pool.ok = false;
  pump();
}
function onWorkerMsg(w, msg) { const job = Pool.busy.get(w); Pool.busy.delete(w); if (job) { const cb = Pool.cb.get(job.id); if (msg.error) { Pool.queue.unshift(job); Pool.ok = false; } else { Pool.cb.delete(job.id); cb && cb(msg.res); } } pump(); }
function pump() {
  if (!Pool.ok) {
    if (!Pool.localBusy && Pool.queue.length) { const job = Pool.queue.shift(); const cb = Pool.cb.get(job.id); Pool.cb.delete(job.id); Pool.localBusy = true; runLocal(job, res => { Pool.localBusy = false; cb && cb(res); pump(); }); }
    return;
  }
  for (const w of Pool.workers) { if (Pool.busy.has(w) || !Pool.queue.length) continue; const job = Pool.queue.shift(); Pool.busy.set(w, job); try { w.postMessage(job); } catch (e) { workerFailed(w); return; } }
}
function runLocal(job, cb) {
  const Mx = E.createMatch({ seed: job.seed, neutral: !!job.neutral, big: !!job.big, weather: job.weather, teams: [{ team: job.home, setup: job.hs, condition: job.hc }, { team: job.away, setup: job.as, condition: job.ac }], aiSides: [0, 1] });
  const chunk = () => { const t0 = performance.now(); while (!Mx.ended && performance.now() - t0 < 30) for (let i = 0; i < 200 && !Mx.ended; i++) E.step(Mx); if (Mx.ended) cb(SUM(Mx)); else setTimeout(chunk, 0); };
  setTimeout(chunk, 0);
}
function simJob(job) { poolInit(); return new Promise(res => { job.id = ++Pool.seq; Pool.cb.set(job.id, res); Pool.queue.push(job); pump(); }); }
function buildJob(se, ri, mi) {
  const m = se.rounds[ri].matches[mi]; const home = teamById(m.h), away = teamById(m.a);
  return { seed: matchSeed(se, ri, mi), neutral: !S.homeAdv, home: JSON.parse(JSON.stringify(home)), away: JSON.parse(JSON.stringify(away)), hs: setupForLeague(se, m.h), as: setupForLeague(se, m.a), hc: condFor(se, m.h), ac: condFor(se, m.a) };
}
const RUN = { active: false, cancel: false, done: 0, total: 0, label: '' };
function simRoundOthers(se, ri, skip) {
  const rd = se.rounds[ri]; const jobs = [];
  rd.matches.forEach((m, mi) => {
    if (m.res || m.pending || m.watching) return; if (skip && skip(m)) return;
    m.pending = true;
    const job = buildJob(se, ri, mi); const rp = { seed: job.seed, neutral: job.neutral, ai: [0, 1], hs: packSetup(job.hs), as: packSetup(job.as), hc: packCond(job.hc), ac: packCond(job.ac), ops: [] };
    jobs.push(simJob(job).then(res => { delete m.pending; if (!m.res) applyResult(se, m, res, rp); RUN.done++; updateRunUI(); saveCareer(); if (S.screen === 'league' && !RUN.active && !L.modal) render(); }));
  });
  RUN.total += jobs.length; updateRunUI();
  return Promise.all(jobs);
}
async function simRounds(n, includeUser) {
  const se = curSeason(); if (!se || RUN.active) return;
  RUN.active = true; RUN.cancel = false; RUN.done = 0; RUN.total = 0; render();
  for (let k = 0; k < n && !se.done && !RUN.cancel; k++) {
    const ri = se.cur;
    if (!includeUser) { const fx = nextUserFixture(se); if (fx && fx.round === ri) break; }
    RUN.label = `${ri + 1}라운드 계산 중`;
    await simRoundOthers(se, ri, null);
    maybeFinishRound(se); saveCareer();
  }
  RUN.active = false; for (const rd of se.rounds) for (const m of rd.matches) { delete m.pending; delete m.watching; }
  saveCareer(); render();
  if (se.done) showSeasonEnd(se);
}
function updateRunUI() { const b = $('#runbar'); if (b) b.style.width = (RUN.total ? RUN.done / RUN.total * 100 : 0) + '%'; const t = $('#runtxt'); if (t) t.textContent = `${RUN.label} · ${RUN.done}/${RUN.total}경기`; }
function isUserMatch(se, m) { return se.userTeam && (m.h === se.userTeam || m.a === se.userTeam); }
function launchLeagueMatch(se, ri, mi, control) {
  const m = se.rounds[ri].matches[mi]; m.watching = true;
  // 다른 경기는 이 경기를 보는 동안 뒤에서 계산
  RUN.done = 0; RUN.total = 0; RUN.label = '다른 경기';
  simRoundOthers(se, ri, x => x === m);
  startMatch({ home: teamById(m.h), away: teamById(m.a), homeSetup: setupForLeague(se, m.h), awaySetup: setupForLeague(se, m.a), homeCond: condFor(se, m.h), awayCond: condFor(se, m.a), seed: matchSeed(se, ri, mi), control, ctx: { type: 'league', seasonId: se.id, round: ri, mi, leagueName: se.leagueName } });
}
function playUserMatch(se) {
  const fx = nextUserFixture(se); if (!fx || fx.round !== se.cur) return;
  const mi = se.rounds[se.cur].matches.findIndex(m => m.h === fx.h && m.a === fx.a);
  launchLeagueMatch(se, se.cur, mi, [fx.h === se.userTeam ? 0 : 1]);
}
async function quickRound(se) {
  if (RUN.active) return; const ri = se.cur;
  RUN.active = true; RUN.cancel = false; RUN.done = 0; RUN.total = 0; RUN.label = `${ri + 1}라운드 계산 중`; render();
  for (const m of se.rounds[ri].matches) delete m.watching;
  await simRoundOthers(se, ri, null);
  maybeFinishRound(se); saveCareer(); RUN.active = false; render(); showRoundResults(se, ri);
}
// ----- 리그 화면 -----
function viewLeague() {
  const se = curSeason();
  const w = h('div', { class: 'wrap stack', style: { gap: '16px' } });
  if (!se) { w.append(newSeasonCard()); const ps = pastSeasons(); if (ps) w.append(ps); return w; }
  if (!RUN.active) {
    // 직접 보던 경기를 중간에 두고 나왔으면 그 경기는 다시 계산 대상으로 돌림
    for (const m of se.rounds[se.cur] ? se.rounds[se.cur].matches : []) if (m.watching && !(M && L.ctx.type === 'league' && !M.ended && L.ctx.seasonId === se.id)) delete m.watching;
    const r0 = se.cur;
    if (maybeFinishRound(se)) { saveCareer(); setTimeout(() => showRoundResults(se, r0), 0); }
  }
  const user = se.userTeam ? teamById(se.userTeam) : null;
  w.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } },
    h('div', null, h('div', { class: 'lbl' }, `${se.label} 시즌${user ? ' · ' + user.name + ' 감독' : ' · 관전 모드'}`), h('h2', null, se.leagueName)),
    h('div', { class: 'row' }, h('span', { class: 'tag' }, se.done ? '시즌 종료' : `${se.cur + 1} / ${se.rounds.length} 라운드`), h('button', { class: 'btn sm', onclick: () => { career.active = null; saveCareer(); render(); } }, '시즌 목록'))));
  w.append(roundPanel(se));
  w.append(h('div', { class: 'tabs', role: 'tablist' }, [['table', '순위표'], ['fixtures', '일정·결과'], ['stats', '개인 기록'], ['totw', '이주의 팀'], ['gotm', '이달의 골']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(S.lgTab === k), onclick: () => { S.lgTab = k; render(); } }, l))));
  if (S.lgTab === 'table') w.append(tableView(se));
  else if (S.lgTab === 'fixtures') w.append(fixturesView(se));
  else if (S.lgTab === 'totw') w.append(totwView(se));
  else if (S.lgTab === 'gotm') w.append(gotmView(se));
  else w.append(statsView(se));
  return w;
}
function newSeasonCard() {
  const leagues = db.leagues.filter(l => l.teams.length >= 4 && !l.other);
  if (!leagues.length) return h('div', { class: 'card' }, h('p', null, '4팀 이상인 리그가 없습니다. 데이터베이스에서 팀을 추가하세요.'));
  if (!S.nsLeague || !leagues.some(l => l.id === S.nsLeague)) S.nsLeague = leagues[0].id;
  const lg = leagues.find(l => l.id === S.nsLeague);
  if (S.nsTeam !== '' && (!S.nsTeam || !lg.teams.some(t => t.id === S.nsTeam))) S.nsTeam = lg.teams[0].id;
  return h('div', { class: 'card stack' }, h('h2', null, '새 시즌'),
    h('div', { class: 'row' }, h('span', { class: 'lbl', style: { minWidth: '90px' } }, '리그'), sel(leagues.map(l => [l.id, `${l.name} (${l.teams.length}팀)`]), lg.id, v => { S.nsLeague = v; S.nsTeam = null; render(); }, 'nslg')),
    h('div', { class: 'row' }, h('span', { class: 'lbl', style: { minWidth: '90px' } }, '내 팀'), sel([['', '없음 — 관전 모드'], ...lg.teams.map(t => [t.id, t.name])], S.nsTeam || '', v => { S.nsTeam = v; render(); }, 'nstm')),
    h('p', { class: 'hint', style: { margin: 0 } }, `홈·원정 ${(lg.teams.length - 1) * 2}라운드. 내 팀 경기는 직접 보거나(풀 경기·하이라이트) 결과만 볼 수 있고, 다른 경기는 같은 엔진으로 뒤에서 계산됩니다. 경고 5장마다 1경기, 경고 누적 퇴장 1경기, 다이렉트 퇴장 3경기 출전 정지가 적용됩니다.`),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { startSeason(lg.id, S.nsTeam || null); S.lgTab = 'table'; S.fxRound = null; render(); } }, '시즌 시작')));
}
function pastSeasons() {
  if (!career.seasons.length) return null;
  const box = h('div', { class: 'card stack' }, h('h3', null, '저장된 시즌'));
  for (const s of career.seasons.slice().reverse()) {
    const tb = computeTable(s); const champ = s.done && tb[0] ? (teamById(tb[0].id) || {}).name : null;
    box.append(h('div', { class: 'row', style: { justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '8px' } },
      h('div', null, h('strong', null, `${s.leagueName} ${s.label}`), h('div', { class: 'hint' }, s.done ? `우승 ${champ}` : `${s.cur}/${s.rounds.length} 라운드 진행${s.userTeam ? ' · ' + ((teamById(s.userTeam) || {}).name || '') : ' · 관전'}`)),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { career.active = s.id; S.fxRound = null; saveCareer(); render(); } }, s.done ? '보기' : '이어하기'),
        h('button', { class: 'btn sm danger', onclick: () => confirmBox(`${s.leagueName} ${s.label} 시즌을 삭제할까요?`, () => { career.seasons = career.seasons.filter(x => x !== s); if (career.active === s.id) career.active = null; saveCareer(); render(); }) }, '삭제'))));
  }
  return box;
}
function roundPanel(se) {
  const card = h('div', { class: 'card stack' });
  if (RUN.active) { card.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('strong', { id: 'runtxt' }, `${RUN.label} · ${RUN.done}/${RUN.total}경기`), h('button', { class: 'btn sm', onclick: () => { RUN.cancel = true; toast('현재 라운드를 마치고 멈춥니다.'); } }, '중단')), h('div', { class: 'meter' }, h('i', { id: 'runbar', style: { width: (RUN.total ? RUN.done / RUN.total * 100 : 0) + '%' } }))); return card; }
  if (se.done) {
    const tb = computeTable(se); const ch = teamById(tb[0].id);
    card.append(h('h3', null, '시즌 종료'), h('div', { class: 'champ' }, `우승 ${ch ? ch.name : ''}`),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { startSeason(se.leagueId, se.userTeam); S.fxRound = null; render(); } }, '다음 시즌 시작'), h('button', { class: 'btn', onclick: () => showSeasonEnd(se) }, '시즌 결산')));
    return card;
  }
  const ri = se.cur; const rd = se.rounds[ri];
  const fx = nextUserFixture(se); const userThis = fx && fx.round === ri;
  const others = rd.matches.filter(m => !isUserMatch(se, m)); const othersDone = others.filter(m => m.res).length;
  card.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', null, `${ri + 1}라운드`), h('span', { class: 'hint' }, `시즌 ${rd.day + 1}일째${othersDone ? ` · 다른 경기 ${othersDone}/${others.length} 완료` : ''}`)));
  if (userThis) {
    const opp = teamById(fx.h === se.userTeam ? fx.a : fx.h); const home = fx.h === se.userTeam;
    const ut = teamById(se.userTeam); const un = unavailableSet(se, ut);
    card.append(h('div', { class: 'nextm' }, h('span', { class: 'kit', style: { background: opp.color1, borderColor: opp.color2 } }), h('div', null, h('div', { class: 'lbl' }, home ? '홈 경기' : '원정 경기'), h('div', { class: 'opp' }, `vs ${opp.name}`), un.size ? h('div', { class: 'hint bad' }, `출전 정지: ${[...un].map(id => shortName((playerOf(ut, id) || {}).name || id)).join(', ')}`) : null)));
    card.append(hlControls(false));
    card.append(h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => playUserMatch(se) }, '경기 보기'), h('button', { class: 'btn', onclick: () => { S.tacTeam = se.userTeam; go('tactics'); } }, '전술 설정'), h('button', { class: 'btn', onclick: () => quickRound(se) }, '결과만 보기')));
  } else {
    card.append(h('p', { class: 'hint', style: { margin: 0 } }, se.userTeam ? '이번 라운드에는 내 팀 경기가 없습니다.' : '관전 모드입니다. 아래 경기를 누르면 그 경기를 직접 보고, 나머지는 뒤에서 계산됩니다.'));
    card.append(h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => quickRound(se) }, '이번 라운드 계산'), !se.userTeam ? h('button', { class: 'btn', onclick: () => simRounds(5, true) }, '5라운드 계산') : null, !se.userTeam ? h('button', { class: 'btn', onclick: () => simRounds(99, true) }, '시즌 끝까지') : null));
  }
  const list = h('div', { class: 'fx' });
  rd.matches.forEach((m, mi) => {
    const H = teamById(m.h), A = teamById(m.a); const mine = isUserMatch(se, m);
    list.append(h('button', { class: 'fxrow' + (mine ? ' mine' : ''), title: m.res ? '경기 기록 보기' : (!mine ? '이 경기 직접 보기' : ''), onclick: () => { if (m.res) showMatchDetail(se, ri, m); else if (mine) playUserMatch(se); else if (!m.pending) launchLeagueMatch(se, ri, mi, []); else toast('계산 중인 경기입니다.'); } },
      h('span', { class: 'fxh' }, H ? H.name : m.h), h('span', { class: 'fxs num' }, m.res ? `${m.res.hs} – ${m.res.as}` : (m.pending ? '계산 중' : 'vs')), h('span', { class: 'fxa' }, A ? A.name : m.a)));
  });
  card.append(list);
  if (se.userTeam) card.append(h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', disabled: userThis, onclick: () => simRounds(99, false) }, '내 경기 전까지 계산'), h('button', { class: 'btn sm ghost', onclick: () => confirmBox('남은 시즌 전체를 내 팀 경기까지 포함해 결과만 계산할까요? 몇 분 걸릴 수 있습니다.', () => simRounds(99, true), '계산') }, '시즌 끝까지 결과만')));
  return card;
}
function tableView(se) {
  const tb = computeTable(se); const n = tb.length; const big = n >= 18;
  const zone = i => big ? (i < 4 ? 'z-ucl' : i === 4 ? 'z-uel' : i >= n - 3 ? 'z-rel' : '') : (i === 0 ? 'z-ucl' : i >= n - 1 ? 'z-rel' : '');
  const body = h('tbody');
  tb.forEach((r, i) => {
    const t = teamById(r.id) || { name: r.id, color1: '#888', color2: '#fff' };
    body.append(h('tr', { class: (r.id === se.userTeam ? 'mine ' : '') + zone(i) }, h('td', { class: 'num pos' }, i + 1), h('td', { class: 'tn' }, h('span', { class: 'kit sm', style: { background: t.color1, borderColor: t.color2 } }), t.name),
      ...[r.p, r.w, r.d, r.l, r.gf, r.ga, (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga)].map(v => h('td', { class: 'num' }, v)), h('td', { class: 'num pts' }, r.pts),
      h('td', null, h('span', { class: 'form' }, r.form.slice(-5).map(f => h('i', { class: 'f' + f }, f === 'W' ? '승' : f === 'D' ? '무' : '패'))))));
  });
  return h('div', { class: 'card', style: { padding: '0' } }, h('div', { class: 'ltable' }, h('table', null, h('thead', null, h('tr', null, ...['#', '팀', '경기', '승', '무', '패', '득점', '실점', '득실', '승점', '최근 5경기'].map(x => h('th', null, x)))), body)),
    h('div', { class: 'legend' }, h('span', null, h('i', { class: 'z-ucl' }), '챔피언스리그권'), big ? h('span', null, h('i', { class: 'z-uel' }), '유로파리그권') : null, h('span', null, h('i', { class: 'z-rel' }), '강등권')));
}
function fixturesView(se) {
  if (S.fxRound == null || S.fxRound >= se.rounds.length) S.fxRound = Math.min(se.cur, se.rounds.length - 1);
  const ri = S.fxRound; const rd = se.rounds[ri];
  const box = h('div', { class: 'card stack' });
  box.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', disabled: ri <= 0, onclick: () => { S.fxRound--; render(); } }, '이전'), h('strong', null, `${ri + 1}라운드`), h('button', { class: 'btn sm', disabled: ri >= se.rounds.length - 1, onclick: () => { S.fxRound++; render(); } }, '다음'), h('span', { class: 'hint' }, `시즌 ${rd.day + 1}일째`)));
  box.append(h('div', { class: 'fx' }, rd.matches.map(m => { const H = teamById(m.h), A = teamById(m.a); return h('button', { class: 'fxrow' + (isUserMatch(se, m) ? ' mine' : ''), onclick: () => m.res && showMatchDetail(se, ri, m) }, h('span', { class: 'fxh' }, H ? H.name : m.h), h('span', { class: 'fxs num' }, m.res ? `${m.res.hs} – ${m.res.as}` : 'vs'), h('span', { class: 'fxa' }, A ? A.name : m.a)); })));
  return box;
}
function statsView(se) {
  const rows = Object.entries(se.pstats).map(([id, s]) => { const t = teamById(s.team); return Object.assign({ id, name: pname(t, id, se), tname: t ? t.short : '', avg: s.rsum / Math.max(1, s.apps + s.sub) }, s); });
  const mk = (title, key, fmt, filter) => {
    const list = rows.filter(filter || (r => r[key] > 0)).sort((a, b) => b[key] - a[key] || a.min - b.min).slice(0, 10);
    return h('div', { class: 'card' }, h('h3', { style: { marginBottom: '8px' } }, title), list.length ? h('div', { class: 'rank' }, list.map((r, i) => h('div', { class: 'rk' + (r.team === se.userTeam ? ' mine' : '') }, h('span', { class: 'num dim' }, i + 1), h('span', { class: 'rkn' }, pl(r.name, r.id), h('span', { class: 'dim' }, ' ' + r.tname)), h('span', { class: 'num' }, fmt(r))))) : h('p', { class: 'hint' }, '아직 기록이 없습니다.'));
  };
  const minApps = Math.max(1, Math.floor(se.cur * .4));
  return h('div', { class: 'grid2' }, mk('득점', 'goals', r => r.goals), mk('도움', 'ast', r => r.ast), mk('평균 평점', 'avg', r => r.avg.toFixed(2), r => r.apps + r.sub >= minApps), mk('경기 최우수 선수', 'motm', r => r.motm), mk('경고', 'yc', r => r.yc), mk('출전 시간(분)', 'min', r => r.min));
}
function showMatchDetail(se, ri, m) {
  const H = teamById(m.h), A = teamById(m.a); const r = m.res;
  const pn = id => pname(H, id, se);
  const gl = s => r.goals.filter(g => g.side === s).map(g => h('span', null, pl(g.name, g.id), `${g.own ? ' (자책)' : ''} ${g.min}'${g.sp === 'penalty' ? ' (PK)' : ''}`, g.ast ? h('span', null, ' · 도움 ', pl(shortName(pn(g.ast)), g.ast)) : null));
  modal(h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, `${ri + 1}라운드`), h('button', { class: 'btn', onclick: closeModal }, '닫기')),
    h('div', { class: 'num', style: { fontSize: '30px' } }, `${H.name} ${r.hs} – ${r.as} ${A.name}`),
    h('div', { class: 'grid2' }, h('div', null, h('div', { class: 'lbl' }, H.name), ...gl(0).map(x => h('div', null, x))), h('div', null, h('div', { class: 'lbl' }, A.name), ...gl(1).map(x => h('div', null, x)))),
    r.st ? h('div', { class: 'hint' }, `슈팅 ${r.st[0].shots}–${r.st[1].shots} · 유효 ${r.st[0].sot}–${r.st[1].sot} · xG ${r.xg[0]}–${r.xg[1]} · 점유율 ${Math.round(r.st[0].poss / Math.max(1, r.st[0].poss + r.st[1].poss) * 100)}%`) : null,
    r.cards && r.cards.length ? h('div', { class: 'hint' }, r.cards.map(c => `${c.type === 'red' ? '퇴장' : '경고'} ${c.name} ${c.min}'`).join(' · ')) : null,
    r.motm ? h('div', null, h('span', { class: 'lbl' }, '최우수 선수 '), h('strong', null, pl(pn(r.motm.id), r.motm.id), ` ${r.motm.r.toFixed(1)}`)) : null,
    r.rp ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => reviewMatch(se, ri, se.rounds[ri].matches.indexOf(m), null) }, '하이라이트 보기 (골·퇴장)'), h('span', { class: 'hint' }, '같은 조건으로 경기를 다시 계산해 장면을 보여줍니다.')) : h('p', { class: 'hint', style: { margin: 0 } }, '이 경기는 하이라이트 재생 정보가 없습니다.')), true);
}
// ---------- 하이라이트 재계산 ----------
function reviewMatch(se, ri, mi, focus) {
  const m = se.rounds[ri].matches[mi]; const r = m.res; if (!r || !r.rp) return;
  const rp = r.rp; const home = teamById(m.h), away = teamById(m.a);
  const hs = unpackSetup(rp.hs), as = unpackSetup(rp.as);
  const okIds = (t, st) => st.lineup.every(id => playerOf(t, id)) && st.bench.every(id => playerOf(t, id));
  if (!okIds(home, hs) || !okIds(away, as)) { toast('선수 데이터가 바뀌어 이 경기를 다시 계산할 수 없습니다.'); return; }
  const cond = (t, c) => { const o = {}; for (const p of t.players) o[p.id] = c[p.id] ?? 100; return o; };
  const Mx = E.createMatch({ seed: rp.seed, neutral: !!rp.neutral, big: !!rp.big, weather: rp.weather, teams: [{ team: home, setup: hs, condition: cond(home, rp.hc || {}) }, { team: away, setup: as, condition: cond(away, rp.ac || {}) }], aiSides: rp.ai || [0, 1] });
  modal(h('div', { class: 'stack' }, h('h2', null, '하이라이트 준비 중'), h('div', { class: 'meter' }, h('i', { id: 'simbar', style: { width: '0%' } })), h('div', { class: 'hint' }, '같은 시드와 선발·전술·교체 기록으로 경기를 다시 계산합니다.')), true);
  const ops = rp.ops || []; let oi = 0;
  const chunk = () => {
    const t0 = performance.now();
    while (!Mx.ended && performance.now() - t0 < 40) { for (let i = 0; i < 100 && !Mx.ended; i++) { while (oi < ops.length && ops[oi].t <= Mx.tick) E.applyOp(Mx, ops[oi++]); Mx.halftimePause = false; E.step(Mx); } }
    const bar = $('#simbar'); if (bar) bar.style.width = Math.min(100, Mx.t / 5900 * 100) + '%';
    if (!Mx.ended) return setTimeout(chunk, 0);
    closeModal();
    const same = Mx.score[0] === r.hs && Mx.score[1] === r.as;
    let foc = null;
    if (focus != null) { const ge = Mx.events.filter(e => e.type === 'goal'); const g = ge[focus]; if (g) foc = [g.frame + ':goal']; }
    startMatch({ prebuilt: Mx, home, away, homeSetup: hs, awaySetup: as, seed: rp.seed, control: [], hlOverride: 'goals', focus: foc, ctx: { type: 'review', seasonId: se.id, round: ri, mi, leagueName: se.leagueName, mismatch: same ? null : `데이터가 바뀌어 다시 계산한 결과(${Mx.score[0]}-${Mx.score[1]})가 기록(${r.hs}-${r.as})과 다릅니다.` } });
    L.halfShown = true;
  };
  setTimeout(chunk, 30);
}
// 저장된 시드·전술·교체 기록으로 경기를 다시 계산해 보여줌 (드래프트 대회의 지난 경기 다시 보기)
function reviewPrebuilt(o) {
  const Mx = E.createMatch({ seed: o.seed, neutral: !!o.neutral, big: !!o.big, teams: [{ team: o.home, setup: o.hs }, { team: o.away, setup: o.as }], aiSides: o.ai || [0, 1] });
  modal(h('div', { class: 'stack' }, h('h2', null, '경기 준비 중'), h('div', { class: 'meter' }, h('i', { id: 'simbar', style: { width: '0%' } })), h('div', { class: 'hint' }, '같은 시드와 선발·전술·교체 기록으로 경기를 다시 계산합니다.')), true);
  const ops = o.ops || []; let oi = 0;
  const chunk = () => {
    const t0 = performance.now();
    while (!Mx.ended && performance.now() - t0 < 40) { for (let i = 0; i < 100 && !Mx.ended; i++) { while (oi < ops.length && ops[oi].t <= Mx.tick) E.applyOp(Mx, ops[oi++]); Mx.halftimePause = false; E.step(Mx); } }
    const bar = $('#simbar'); if (bar) bar.style.width = Math.min(100, Mx.t / 5900 * 100) + '%';
    if (!Mx.ended) return setTimeout(chunk, 0);
    closeModal();
    const same = !o.expect || (Mx.score[0] === o.expect[0] && Mx.score[1] === o.expect[1]);
    startMatch({ prebuilt: Mx, home: o.home, away: o.away, homeSetup: o.hs, awaySetup: o.as, seed: o.seed, control: [], hlOverride: o.hl || 'goals', ctx: { type: 'review', label: o.label, leagueName: '', round: 0, back: o.back, mismatch: same ? null : `다시 계산한 결과(${Mx.score[0]}-${Mx.score[1]})가 기록(${o.expect[0]}-${o.expect[1]})과 다릅니다.` } });
    L.halfShown = true;
  };
  setTimeout(chunk, 30);
}
// ---------- 이주의 팀 ----------
const TOTW_SHAPE = [['GK', ['GK'], 1], ['DEF', ['CB', 'LB', 'RB', 'LWB', 'RWB'], 4], ['MID', ['DM', 'CM', 'AM', 'LM', 'RM'], 3], ['ATT', ['LW', 'RW', 'ST'], 3]];
function totwFor(se, ri) {
  const rd = se.rounds[ri]; const cand = [];
  for (const m of rd.matches) if (m.res && m.res.pr) for (const [id, side, rt, code] of m.res.pr) cand.push({ id, team: side === 0 ? m.h : m.a, rt, code, m });
  const used = new Set(); const xi = [];
  for (const [g, codes, n] of TOTW_SHAPE) { const list = cand.filter(c => codes.includes(c.code) && !used.has(c.id)).sort((a, b) => b.rt - a.rt).slice(0, n); for (const c of list) { used.add(c.id); xi.push(Object.assign({ g }, c)); } }
  return xi;
}
function totwView(se) {
  const played = se.rounds.map((rd, i) => [i, rd]).filter(([i, rd]) => rd.matches.some(m => m.res && m.res.pr));
  const box = h('div', { class: 'card stack' });
  if (!played.length) { box.append(h('p', { class: 'hint', style: { margin: 0 } }, '아직 기록된 라운드가 없습니다. 이번 업데이트 이후 치른 경기부터 집계됩니다.')); return box; }
  if (S.totwRound == null || !played.some(([i]) => i === S.totwRound)) S.totwRound = played[played.length - 1][0];
  const ri = S.totwRound; const xi = totwFor(se, ri);
  box.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, '라운드'), sel(played.map(([i]) => [String(i), `${i + 1}라운드`]), String(ri), v => { S.totwRound = +v; render(true); }, 'totwr'), h('span', { class: 'hint' }, '4-3-3 · 해당 라운드 30분 이상 출전 선수 중 포지션별 최고 평점')));
  const pitch = h('div', { class: 'tpitch totw' });
  const rowsY = { GK: 92, DEF: 70, MID: 44, ATT: 16 };
  for (const g of ['GK', 'DEF', 'MID', 'ATT']) {
    const ps = xi.filter(x => x.g === g); ps.forEach((x, i) => {
      const t = teamById(x.team); const left = ps.length === 1 ? 50 : 12 + i * 76 / (ps.length - 1);
      pitch.append(h('div', { class: 'slot', style: { left: left + '%', top: rowsY[g] + '%' } },
        h('span', { class: 'disc', style: { background: t ? t.color1 : '#888', color: ink(t ? t.color1 : '#888'), borderColor: t ? t.color2 : '#fff', fontSize: '14px' } }, x.rt.toFixed(1)),
        h('span', { class: 'nm' }, pl(shortName(pname(t, x.id, se)), x.id)), h('span', { class: 'meta' }, `${t ? t.short : ''} · ${posLabel(x.code)}`)));
    });
  }
  const best = xi.slice().sort((a, b) => b.rt - a.rt)[0];
  box.append(h('div', { class: 'tac', style: { gridTemplateColumns: 'minmax(260px, 420px) minmax(0, 1fr)' } }, pitch,
    h('div', { class: 'stack' }, best ? h('div', { class: 'card' }, h('div', { class: 'lbl' }, '이주의 선수'), h('div', { class: 'champ', style: { fontSize: '22px' } }, pl(pname(teamById(best.team), best.id, se), best.id)), h('div', { class: 'hint' }, `${(teamById(best.team) || {}).name || ''} · 평점 ${best.rt.toFixed(1)}`)) : null,
      h('div', { class: 'rank' }, xi.map(x => { const t = teamById(x.team); return h('div', { class: 'rk' + (x.team === se.userTeam ? ' mine' : '') }, h('span', { class: 'tag' }, posLabel(x.code)), h('span', { class: 'rkn' }, pl(pname(t, x.id, se), x.id), h('span', { class: 'dim' }, ' ' + (t ? t.short : ''))), h('span', { class: 'num' }, x.rt.toFixed(1))); })))));
  return box;
}
// ---------- 이달의 골 ----------
const SEASON_START = new Date(Date.UTC(2026, 7, 15));
function monthOf(se, day) { const y0 = +String(se.label).slice(0, 4) || 2026; const d = new Date(Date.UTC(y0, 7, 15 + day)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
const STYPE_KO = { normal: '슈팅', header: '헤더', volley: '발리', long: '중거리', finesse: '감아차기', freekick: '프리킥', penalty: '페널티킥' };
function goalScore(g) { const xg = g.xg ?? .2; const bonus = { finesse: .18, volley: .2, freekick: .3, long: .15, header: .05 }[g.st] || 0; return (1 - Math.min(1, xg)) * .7 + bonus + Math.min(.35, (g.dist || 10) / 90) + (g.org === 'counter' ? .05 : 0); }
function gotmView(se) {
  const all = [];
  se.rounds.forEach((rd, ri) => rd.matches.forEach((m, mi) => { if (!m.res || !m.res.goals) return; let gi = -1; for (const g of m.res.goals) { gi++; if (g.own || g.sp === 'penalty' || g.xg == null) continue; all.push({ g, gi, ri, mi, m, month: monthOf(se, rd.day) }); } }));
  const box = h('div', { class: 'card stack' });
  if (!all.length) { box.append(h('p', { class: 'hint', style: { margin: 0 } }, '아직 집계할 골이 없습니다. 이번 업데이트 이후 치른 경기부터 슈팅 정보(xG·거리·종류)가 기록됩니다.')); return box; }
  const months = [...new Set(all.map(x => x.month))].sort();
  if (!S.gotmMonth || !months.includes(S.gotmMonth)) S.gotmMonth = months[months.length - 1];
  if (!S.gotmMode) S.gotmMode = 'style';
  const list = all.filter(x => x.month === S.gotmMonth).sort((a, b) => S.gotmMode === 'xg' ? a.g.xg - b.g.xg : goalScore(b.g) - goalScore(a.g)).slice(0, 10);
  box.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, '월'), sel(months.map(mm => [mm, `${+mm.slice(5)}월 (${mm.slice(0, 4)})`]), S.gotmMonth, v => { S.gotmMonth = v; render(true); }, 'gotmm'),
    seg([['style', '멋있는 골'], ['xg', '낮은 xG 순']], S.gotmMode, v => { S.gotmMode = v; render(true); })));
  box.append(h('p', { class: 'hint', style: { margin: 0 } }, S.gotmMode === 'xg' ? '득점 확률(xG)이 낮았던 골부터 나열합니다. 페널티킥과 자책골은 제외합니다.' : '낮은 xG, 슈팅 거리, 슈팅 종류(프리킥·발리·감아차기 가산), 역습 여부를 합산한 점수 순입니다.'));
  const rows = h('div', { class: 'rank' });
  list.forEach((x, i) => {
    const t = teamById(x.g.side === 0 ? x.m.h : x.m.a); const o = teamById(x.g.side === 0 ? x.m.a : x.m.h);
    rows.append(h('div', { class: 'rk gotm' + ((x.m.h === se.userTeam || x.m.a === se.userTeam) && t && t.id === se.userTeam ? ' mine' : '') }, h('span', { class: 'num dim' }, i + 1),
      h('span', { class: 'rkn' }, h('strong', null, pl(x.g.name, x.g.id)), h('span', { class: 'dim' }, ` ${t ? t.short : ''} vs ${o ? o.short : ''} · ${x.ri + 1}R ${x.g.min}'`), h('div', { class: 'dim', style: { fontSize: '12px' } }, `${STYPE_KO[x.g.st] || '슈팅'} · ${x.g.dist}m · xG ${x.g.xg.toFixed(2)} · ${ORIGIN_KO[x.g.org] || ''}`)),
      x.m.res.rp ? h('button', { class: 'btn sm', onclick: () => reviewMatch(se, x.ri, x.mi, x.gi) }, '보기') : h('span')));
  });
  box.append(rows);
  return box;
}
function showRoundResults(se, ri) {
  const rd = se.rounds[ri]; if (!rd || S.screen !== 'league') return;
  modal(h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, `${ri + 1}라운드 결과`), h('button', { class: 'btn primary', onclick: () => { closeModal(); if (se.done) showSeasonEnd(se); } }, '확인')),
    h('p', { class: 'hint', style: { margin: 0 } }, '경기를 누르면 기록과 하이라이트(골·퇴장)를 볼 수 있습니다.'),
    h('div', { class: 'fx' }, rd.matches.map(m => { const H = teamById(m.h), A = teamById(m.a); return h('button', { class: 'fxrow' + (isUserMatch(se, m) ? ' mine' : ''), onclick: () => m.res && showMatchDetail(se, ri, m) }, h('span', { class: 'fxh' }, H ? H.name : m.h), h('span', { class: 'fxs num' }, m.res ? `${m.res.hs} – ${m.res.as}` : '-'), h('span', { class: 'fxa' }, A ? A.name : m.a)); }))), true);
}
function showSeasonEnd(se) {
  const tb = computeTable(se); const ch = teamById(tb[0].id);
  const top = Object.entries(se.pstats).map(([id, s]) => Object.assign({ id }, s)).sort((a, b) => b.goals - a.goals)[0];
  const tp = top && playerOf(teamById(top.team), top.id);
  const mine = se.userTeam ? tb.findIndex(r => r.id === se.userTeam) + 1 : null;
  modal(h('div', { class: 'stack' }, h('h2', null, `${se.leagueName} ${se.label} 시즌 종료`), h('div', { class: 'champ' }, `우승 ${ch ? ch.name : ''} · 승점 ${tb[0].pts}`),
    tp ? h('div', null, h('span', { class: 'lbl' }, '득점왕 '), h('strong', null, pl(tp.name, tp.id), ` ${top.goals}골`)) : null,
    mine ? h('div', null, h('span', { class: 'lbl' }, '내 팀 순위 '), h('strong', null, `${mine}위`)) : null,
    tb.length >= 18 ? h('div', { class: 'hint' }, `강등: ${tb.slice(-3).map(r => (teamById(r.id) || {}).name).join(', ')}`) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { closeModal(); render(); } }, '확인'))), true);
}

// ================= 모드 선택 =================
function viewHome() {
  const w = h('div', { class: 'wrap stack', style: { gap: '18px' } });
  const nP = allTeams().reduce((a, t) => a + t.players.length, 0), nT = allTeams().length;
  w.append(h('div', null, h('h2', null, '모드 선택'), h('p', { class: 'hint', style: { margin: '4px 0 0' } }, `리그 모드와 친선 모드는 FC27 실제 선수 데이터베이스(${db.ref || '2026-09-12'} 기준, 구단 ${nT}개 · 선수 ${nP.toLocaleString()}명)를 함께 씁니다. 감독 모드는 커리어 저장이 따로 관리됩니다. 상단 모드 버튼이나 로고를 누르면 이 화면으로 돌아옵니다.`)));
  const se = curSeason();
  const lgCard = h('div', { class: 'card mode' },
    h('div', { class: 'mtag' }, 'LEAGUE'), h('h2', null, '리그 모드'),
    h('p', { class: 'hint' }, '리그 하나를 골라 한 시즌을 치릅니다. 내 팀 경기는 직접 보거나 결과만 보고, 나머지 경기는 같은 엔진으로 계산됩니다.'),
    h('ul', { class: 'mfeat' }, h('li', null, `FC27 수록 ${db.leagues.filter(l => !l.other).length}개 리그 (실제 선수)`), h('li', null, '순위표 · 득점 순위 · 이주의 팀 · 출전 정지'), h('li', null, '데이터베이스에서 선수·팀 직접 수정')),
    se ? h('div', { class: 'hint' }, `진행 중: ${se.leagueName} ${se.label} · ${se.cur}/${se.rounds.length} 라운드`) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => setMode('real', 'league') }, '리그 모드'), h('button', { class: 'btn', onclick: () => setMode('real', 'db') }, '데이터베이스')));
  const frCard = h('div', { class: 'card mode' },
    h('div', { class: 'mtag' }, 'FRIENDLY'), h('h2', null, '친선 모드'),
    h('p', { class: 'hint' }, '아무 두 팀이나 골라 한 경기를 치릅니다. 전술·선발·교체를 직접 정하고 3D/2D로 관전합니다.'),
    h('ul', { class: 'mfeat' }, h('li', null, '모든 리그와 기타 구단 중에서 선택'), h('li', null, '홈·원정·양 팀 지휘 또는 관전'), h('li', null, '날씨·잔디 상태, 하이라이트·리플레이')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => setMode('real', 'setup') }, '친선 모드'), h('button', { class: 'btn', onclick: () => setMode('real', 'tactics') }, '팀 · 전술')));
  const mgCard = h('div', { class: 'card mode virt' }, h('div', { class: 'mtag' }, 'MANAGER'), h('h2', null, '감독 모드'),
    h('p', { class: 'hint' }, '구단 하나를 맡아 여러 시즌을 운영합니다. 새 커리어를 만들 때 실축(FC27 실제 선수)과 가상(모든 선수 새로 생성) 중에서 고릅니다.'),
    h('ul', { class: 'mfeat' }, h('li', null, '승강제 리그 · 국내 컵 · 챔피언스리그·유로파리그·컨퍼런스리그'), h('li', null, '이적·임대·계약·유스·스카우트·스태프·이사회'), h('li', null, '선수 성장과 하락, 사기, 시즌 기록')),
    window.Manager ? Manager.homeCard() : h('p', { class: 'hint bad' }, '감독 모드 파일을 불러오지 못했습니다.'));
  w.append(h('div', { class: 'modes' }, lgCard, frCard, mgCard));
  return w;
}
// ================= 설정 =================
const LS_KEYS = [['draftxi.prefs.v1', '화면·경기 설정'], ['draftxi.tacpresets.v1', '저장한 전술']];
function lsSize(k) { try { const v = localStorage.getItem(k); return v ? v.length * 2 : 0; } catch (e) { return 0; } }
function fmtBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? Math.round(n / 1024) + 'KB' : n + 'B'; }
function viewSettings() {
  const w = h('div', { class: 'wrap stack', style: { gap: '16px' } });
  w.append(h('h2', null, '설정'));
  // 저장 데이터
  const tb = h('tbody');
  for (const [k, label] of LS_KEYS) tb.append(h('tr', null, h('td', null, label), h('td', { class: 'num' }, lsSize(k) ? fmtBytes(lsSize(k)) : '없음'), h('td', null, h('button', { class: 'btn sm danger', onclick: () => confirmBox(`'${label}'을(를) 초기화할까요? 되돌릴 수 없습니다.`, () => { try { localStorage.removeItem(k); } catch (e) { } location.reload(); }, '초기화') }, '초기화'))));
  const vrow = h('tr', null, h('td', null, '드래프트 대회 저장'), h('td', { class: 'num', id: 'vsize' }, window.Manager ? '확인 중' : '-'), h('td', null, window.Manager ? h('button', { class: 'btn sm danger', onclick: () => confirmBox('진행 중인 대회와 지난 대회 기록을 모두 삭제할까요? 되돌릴 수 없습니다.', async () => { await Manager.reset(); render(); toast('대회 저장을 삭제했습니다.'); }, '삭제') }, '삭제') : null));
  tb.append(vrow);
  if (window.Manager) Manager.storageInfo().then(i => { const e = $('#vsize'); if (e) e.textContent = i ? `${fmtBytes(i.bytes)}${i.where ? ' · ' + i.where : ''}` : '없음'; });
  w.append(h('div', { class: 'card stack' }, h('h3', null, '저장 데이터'),
    h('p', { class: 'hint', style: { margin: 0 } }, '모든 데이터는 이 브라우저에만 자동 저장됩니다. 브라우저의 사이트 데이터를 지우거나 다른 기기·브라우저에서 열면 보이지 않으니, 아래 백업 파일로 옮기거나 보관하세요. '),
    h('div', { class: 'plist', style: { maxHeight: 'none' } }, h('table', null, h('thead', null, h('tr', null, h('th', null, '항목'), h('th', null, '크기'), h('th', null, ''))), tb)),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: makeBackup }, '전체 백업 파일 만들기'), h('label', { class: 'btn', for: 'bkfile' }, '백업 파일 불러오기'), h('input', { type: 'file', id: 'bkfile', accept: '.json,.txt', hidden: true, onchange: e => { const f = e.target.files[0]; if (f) loadBackupFile(f); } })),
    h('p', { class: 'hint', style: { margin: 0 } }, '백업 파일 하나에 진행 중인 대회·지난 대회 기록·저장한 전술·화면 설정이 모두 들어갑니다.')));
  if (window.Sync) w.append(Sync.card());
  // 화면·경기 기본값
  const line = (label, ctl, hint) => h('div', { class: 'row' }, h('span', { class: 'lbl', style: { minWidth: '130px' } }, label), ctl, hint ? h('span', { class: 'hint' }, hint) : null);
  w.append(h('div', { class: 'card stack' }, h('h3', null, '경기 화면 기본값'),
    line('화면', seg([['3d', '3D'], ['2d', '2D 바둑알']], S.view, v => { S.view = v; savePrefs(); render(true); })),
    line('3D 선수 모델', seg([['human', '사람 모델'], ['simple', '단순 모델']], S.model, v => { S.model = v; savePrefs(); render(true); }), '사람 모델이 끊기면 단순 모델을 쓰세요.'),
    line('선수 이름 표시', seg([['none', '숨김'], ['carrier', '볼 보유자'], ['all', '모두']], S.names, v => { S.names = v; savePrefs(); render(true); })),
    line('골 자동 리플레이', seg([[true, '켜기'], [false, '끄기']], S.autoReplay, v => { S.autoReplay = v; savePrefs(); render(true); })),
    line('3D 공 크기', seg([[1, '실제 크기'], [1.4, '1.4배'], [1.8, '1.8배']], S.ballSize, v => { S.ballSize = v; savePrefs(); render(true); }), '실제 공은 지름 22cm라 먼 카메라에서는 작게 보입니다.'),
    hlControls(false)));
  const swatch = (c, on, label, f) => h('button', { class: 'swatch' + (on ? ' on' : ''), style: { background: c }, title: label, 'aria-label': label, 'aria-pressed': String(on), onclick: f });
  w.append(h('div', { class: 'card stack' }, h('h3', null, '색상'),
    line('강조색', h('div', { class: 'row', style: { gap: '6px' } }, ...ACCENTS.map(([c, n]) => swatch(c, S.uiAccent === c, n, () => { S.uiAccent = c; savePrefs(); applyTheme(); render(true); })), h('input', { type: 'color', id: 'acc', value: S.uiAccent, title: '직접 고르기', onchange: e => { S.uiAccent = e.target.value; savePrefs(); applyTheme(); render(true); } }))),
    line('배경 색', seg(Object.entries(UI_BG).map(([k, v]) => [k, v[0]]), S.uiBg, v => { S.uiBg = v; savePrefs(); applyTheme(); render(true); })),
    line('경기장 잔디', h('div', { class: 'row', style: { gap: '6px' } }, ...Object.entries(PITCHES).filter(([k]) => k !== 'custom').map(([k, [n, c]]) => swatch(c, S.pitchTheme === k, n, () => { S.pitchTheme = k; savePrefs(); render(true); })), h('input', { type: 'color', id: 'pcol', value: pitchStyle().c[0], title: '직접 고르기', onchange: e => { S.pitchTheme = 'custom'; S.pitchColor = e.target.value; savePrefs(); render(true); } }))),
    line('잔디 무늬', seg(PATTERNS, S.pitchPattern, v => { S.pitchPattern = v; savePrefs(); render(true); })),
    h('div', { class: 'pitchprev' }, (() => { const c = h('canvas', { width: 330, height: 214, 'aria-label': '경기장 미리보기' }); setTimeout(() => { try { const r2 = new Render2D(c); r2.c.width = 330; r2.c.height = 214; r2.draw({ players: [], ball: { x: 0, y: 0, z: 0 } }, () => null, { cam2d: 'full', pitch: pitchStyle() }); } catch (e) { } }, 0); return c; })()),
    h('p', { class: 'hint', style: { margin: 0 } }, '강조색과 배경 색은 모든 화면에, 잔디 색·무늬는 2D와 3D 경기 화면에 함께 적용됩니다.')));
  w.append(h('div', { class: 'card stack' }, h('h3', null, '정보'),
    h('p', { class: 'hint', style: { margin: 0 } }, `실축 데이터: 사용자가 제공한 FC27 선수 데이터베이스 (${db.ref || '2026-09-12'} 기준, 남자 선수 ${(window.FC27 && FC27.P.length || 0).toLocaleString()}명). 능력치·포지션·국적·생년월일·주발·약발·플레이스타일은 이 자료를 따르고, 키·몸무게는 자료가 없어 표시하지 않습니다(3D에서는 기본 체형). 감독 모드 실축의 시장 가치와 계약은 추정값입니다. 3D 사람 모델: three.js 예제 Xbot(MIT).`)));
  return w;
}
// 전체 저장 데이터 묶음 (백업 파일·기기 간 동기화 공통)
async function backupBundle() {
  const ls = {}; for (const [k] of LS_KEYS) { try { const v = localStorage.getItem(k); if (v) ls[k] = v; } catch (e) { } }
  let virtual = null; if (window.Manager) { try { virtual = await Manager.exportSave(); } catch (e) { toast('감독 모드 커리어를 읽지 못했습니다.'); } }
  return { app: 'touchline', v: 2, created: new Date().toISOString(), ls, virtual, realdb: dbCustom ? JSON.stringify(db) : null };
}
async function applyBundle(o) {
  for (const [k] of LS_KEYS) { try { if (o.ls && o.ls[k] != null) localStorage.setItem(k, o.ls[k]); else localStorage.removeItem(k); } catch (e) { } }
  if (window.Manager) { try { if (o.virtual) await Manager.importSave(o.virtual); else await Manager.reset(); } catch (e) { toast('감독 모드 커리어를 복원하지 못했습니다.'); } }
  try { if (o.realdb) await rdbPut(o.realdb); else await rdbDel(); } catch (e) { }
}
async function makeBackup() {
  const txt = JSON.stringify(await backupBundle());
  const name = `touchline-backup-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { }
  modal(h('div', { class: 'stack' }, h('h2', null, '백업 파일'), h('p', null, `${name} (${fmtBytes(txt.length)}) 다운로드를 시작했습니다.`), h('p', { class: 'hint', style: { margin: 0 } }, '다운로드가 막힌 환경이면 아래 버튼으로 내용을 복사해 텍스트 파일(.json)로 저장하세요.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('복사했습니다.'), () => toast('복사하지 못했습니다.')); } }, '내용 복사'), h('button', { class: 'btn primary', onclick: closeModal }, '확인'))), true);
}
function loadBackupFile(f) {
  const r = new FileReader();
  r.onload = () => restoreBackup(String(r.result));
  r.readAsText(f, 'utf-8');
}
function restoreBackup(txt) {
  let o; try { o = JSON.parse(txt); } catch (e) { return toast('백업 파일을 읽을 수 없습니다.'); }
  if (!o || o.app !== 'touchline') return toast('터치라인 백업 파일이 아닙니다.');
  confirmBox('현재 저장 데이터를 백업 파일 내용으로 바꿀까요? 지금 데이터는 사라집니다.', async () => {
    await applyBundle(o);
    location.reload();
  }, '복원');
}

// ================= 데이터베이스 =================
function viewDB() {
  if (!S.dbLeague || !db.leagues.some(l => l.id === S.dbLeague)) S.dbLeague = db.leagues[0].id;
  const lg = db.leagues.find(l => l.id === S.dbLeague);
  if (!S.dbTeam || !lg.teams.some(t => t.id === S.dbTeam)) S.dbTeam = lg.teams[0] && lg.teams[0].id;
  const team = lg.teams.find(t => t.id === S.dbTeam);
  const w = h('div', { class: 'wrap stack' });
  w.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h2', null, '데이터베이스'),
    h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: openImport }, '가져오기'), h('button', { class: 'btn sm', onclick: openExport }, '내보내기'), h('button', { class: 'btn sm danger', onclick: confirmReset }, '기본값으로 초기화'))));
  const g = h('div', { class: 'db' });
  g.append(h('div', { class: 'card stack' },
    sel(db.leagues.map(l => [l.id, l.name]), lg.id, v => { S.dbLeague = v; S.dbTeam = null; S.dbPlayer = null; render(); }, 'dblg'),
    h('div', { class: 'tlist' }, lg.teams.map(t => h('button', { 'aria-current': String(t.id === S.dbTeam), onclick: () => { S.dbTeam = t.id; S.dbPlayer = null; render(); } }, h('span', { class: 'kit sm', style: { background: t.color1, borderColor: t.color2 } }), h('span', { style: { flex: 1 } }, t.name), h('span', { class: 'num dim' }, t.players.length)))),
    h('div', { class: 'f stack', style: { gap: '4px' } }, h('label', { class: 'lbl', for: 'lgname' }, '리그 이름'), h('input', { type: 'text', id: 'lgname', value: lg.name, onchange: e => { lg.name = e.target.value.trim() || lg.name; saveDB(); render(); } })),
    h('button', { class: 'btn sm', onclick: () => addTeam(lg) }, '팀 추가'),
    h('button', { class: 'btn sm', onclick: addLeague }, '리그 추가')));
  const right = h('div', { class: 'stack' });
  if (team) {
    right.append(h('div', { class: 'card row' },
      h('div', { class: 'f stack', style: { gap: '4px' } }, h('label', { class: 'lbl', for: 'tname' }, '팀 이름'), h('input', { type: 'text', id: 'tname', value: team.name, onchange: e => { team.name = e.target.value.trim() || team.name; saveDB(); render(); } })),
      h('div', { class: 'f stack', style: { gap: '4px' } }, h('label', { class: 'lbl', for: 'tshort' }, '약칭'), h('input', { type: 'text', id: 'tshort', value: team.short, style: { width: '80px' }, maxlength: 4, onchange: e => { team.short = e.target.value.trim().toUpperCase() || team.short; saveDB(); render(); } })),
      h('div', { class: 'f stack', style: { gap: '4px' } }, h('label', { class: 'lbl', for: 'tc1' }, '주 색상'), h('input', { type: 'color', id: 'tc1', value: team.color1, onchange: e => { team.color1 = e.target.value; saveDB(); render(); } })),
      h('div', { class: 'f stack', style: { gap: '4px' } }, h('label', { class: 'lbl', for: 'tc2' }, '보조 색상'), h('input', { type: 'color', id: 'tc2', value: team.color2, onchange: e => { team.color2 = e.target.value; saveDB(); render(); } })),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn sm', onclick: () => addPlayer(team) }, '선수 추가'),
      h('button', { class: 'btn sm danger', onclick: () => confirmBox(`${team.name}을(를) 삭제할까요?`, () => { lg.teams.splice(lg.teams.indexOf(team), 1); delete S.setups[team.id]; saveDB(); saveSetups(); S.dbTeam = null; render(); }) }, '팀 삭제')));
    if (S.dbPlayer) { const p = team.players.find(q => q.id === S.dbPlayer); if (p) right.append(playerEditor(team, p)); }
    const tb = h('tbody');
    const sorted = team.players.slice().sort((a, b) => D.POSITIONS.indexOf(a.pos) - D.POSITIONS.indexOf(b.pos) || D.calcOvr(b.stats, b.pos) - D.calcOvr(a.stats, a.pos));
    for (const p of sorted) {
      const o = D.calcOvr(p.stats, p.pos); const s = p.stats;
      tb.append(h('tr', { class: 'pick' + (S.dbPlayer === p.id ? ' sel' : ''), onclick: () => { S.dbPlayer = p.id; render(); } }, h('td', null, h('span', { class: 'tag' }, posLabel(p.pos))), h('td', null, pl(p.name, p.id), p.gen ? h('span', { class: 'gen' }, '가상') : null), h('td', { class: 'num ' + ovrClass(o) }, o),
        ...(p.pos === 'GK' ? ['gkDiving', 'gkHandling', 'gkReflexes', 'gkPositioning', 'gkKicking', 'reactions'] : ['pace', 'finishing', 'shortPass', 'dribbling', 'standTackle', 'strength']).map(k => h('td', { class: 'num ' + ovrClass(s[k]) }, s[k]))));
    }
    right.append(h('div', { class: 'plist', style: { maxHeight: 'none' } }, h('table', null, h('thead', null, h('tr', null, ...['포지션', '이름', '종합', '주요 1', '주요 2', '주요 3', '주요 4', '주요 5', '주요 6'].map(x => h('th', null, x)))), tb)));
    right.append(h('p', { class: 'hint', style: { margin: 0 } }, '필드 선수의 주요 능력치는 속력 · 골 결정력 · 짧은 패스 · 드리블 · 태클 · 몸싸움, 골키퍼는 다이빙 · 핸들링 · 반응속도 · 위치선정 · 킥 · 반응 속도 순서입니다. "가상" 표시는 명단을 채우려고 자동 생성한 선수이며, 이름을 바꾸면 표시가 사라집니다.'));
  }
  g.append(right); w.append(g);
  return w;
}
function playerEditor(team, p) {
  const card = h('div', { class: 'card stack' });
  const o = D.calcOvr(p.stats, p.pos);
  card.append(h('div', { class: 'row' },
    h('div', { class: 'f stack', style: { gap: '4px', flex: '1 1 200px' } }, h('label', { class: 'lbl', for: 'pname' }, '이름'), h('input', { type: 'text', id: 'pname', value: p.name, onchange: e => { p.name = e.target.value.trim() || p.name; delete p.gen; saveDB(); render(); } })),
    h('div', { class: 'f stack', style: { gap: '4px' } }, h('label', { class: 'lbl', for: 'ppos' }, '포지션'), sel(D.POSITIONS.map(x => [x, posLabel(x)]), p.pos, v => { p.pos = v; saveDB(); render(); }, 'ppos')),
    h('div', { class: 'f stack', style: { gap: '4px' } }, h('span', { class: 'lbl' }, '종합'), h('span', { class: 'num ' + ovrClass(o), style: { fontSize: '26px', lineHeight: '30px' } }, o)),
    h('div', { class: 'f stack', style: { gap: '4px' } }, h('label', { class: 'lbl', for: 'pgen' }, '목표 종합으로 재생성'), h('div', { class: 'row', style: { gap: '6px' } }, h('input', { type: 'number', id: 'pgen', min: 40, max: 99, value: p.ovr || o, style: { width: '70px' } }), h('input', { type: 'text', id: 'ptr', value: p.traits || '', placeholder: '특성 SPTFAVDKE', style: { width: '120px' } }), h('button', { class: 'btn sm', onclick: () => { const ov = +$('#pgen').value || o; const tr = ($('#ptr').value || '').toUpperCase().replace(/[^SPTFAVDKE]/g, ''); p.ovr = ov; p.traits = tr; p.stats = D.genStats(p.name + '#' + Date.now(), p.pos, ov, tr); saveDB(); render(); } }, '재생성'))),
    h('span', { style: { flex: 1 } }),
    h('button', { class: 'btn sm', onclick: () => showPlayer(team, p) }, '프로필'),
    h('button', { class: 'btn sm danger', onclick: () => confirmBox(`${p.name}을(를) 삭제할까요?`, () => { team.players.splice(team.players.indexOf(p), 1); saveDB(); S.dbPlayer = null; render(); }) }, '삭제'),
    h('button', { class: 'btn sm ghost', onclick: () => { S.dbPlayer = null; render(); } }, '닫기')));
  const bio = D.bioOf(p, langOf(team)); const setBio = (k, v) => { const b = Object.assign({}, D.bioOf(p, langOf(team)), { [k]: v, est: false }); delete b.age; delete b.ageEst; delete b.by; p.bio = b; saveDB(); };
  card.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, '신상'),
    bio.height != null ? h('label', { class: 'row', style: { gap: '4px' } }, '키', h('input', { type: 'number', id: 'bio_h', value: bio.height, style: { width: '70px' }, onchange: e => setBio('height', +e.target.value) })) : null,
    bio.weight != null ? h('label', { class: 'row', style: { gap: '4px' } }, '몸무게', h('input', { type: 'number', id: 'bio_w', value: bio.weight, style: { width: '70px' }, onchange: e => setBio('weight', +e.target.value) })) : null,
    h('label', { class: 'row', style: { gap: '4px' } }, '주발', sel([['오른발', '오른발'], ['왼발', '왼발'], ['양발', '양발']], bio.foot, v => setBio('foot', v), 'bio_f')),
    h('label', { class: 'row', style: { gap: '4px' } }, '약발', sel([1, 2, 3, 4, 5].map(n => [String(n), '★'.repeat(n)]), String(bio.weak), v => setBio('weak', +v), 'bio_k')),
    h('label', { class: 'row', style: { gap: '4px' } }, '국적', h('input', { type: 'text', id: 'bio_n', value: bio.nat, placeholder: '예: 잉글랜드', style: { width: '110px' }, onchange: e => setBio('nat', e.target.value.trim()) })),
    bio.est ? h('span', { class: 'gen' }, '추정값') : null));
  card.append(h('p', { class: 'hint', style: { margin: 0 } }, '특성 문자: S 스피드 · P 피지컬 · T 테크닉 · F 결정력 · A 공중볼 · V 시야/패스 · D 수비 · K 킥 · E 체력. 아래 값은 바로 저장되며 다음 경기부터 적용됩니다.'));
  const grid = h('div', { class: 'sgrid' });
  for (const [gname, keys] of D.STAT_GROUPS) {
    const gdiv = h('div', { class: 'sg' }, h('h4', null, gname));
    for (const k of keys) {
      const num = h('input', { type: 'number', min: 1, max: 99, value: p.stats[k], id: 'sn_' + k, 'aria-label': D.STAT_LABELS[k] });
      const rng = h('input', { type: 'range', min: 1, max: 99, value: p.stats[k], 'aria-label': D.STAT_LABELS[k] });
      const set = v => { v = Math.max(1, Math.min(99, Math.round(+v || 1))); p.stats[k] = v; num.value = v; rng.value = v; saveDB(); };
      num.addEventListener('change', e => set(e.target.value)); rng.addEventListener('input', e => set(e.target.value));
      gdiv.append(h('div', { class: 'srow' }, h('label', { for: 'sn_' + k }, D.STAT_LABELS[k]), rng, num));
    }
    grid.append(gdiv);
  }
  card.append(grid);
  return card;
}
function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 8); }
function addPlayer(team) { const p = { id: uid(team.id), name: '새 선수', pos: 'CM', ovr: 70, traits: '', stats: D.genStats('새 선수' + Math.random(), 'CM', 70, '') }; team.players.push(p); S.dbPlayer = p.id; saveDB(); render(); }
function addTeam(lg) { let id; do { id = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase(); } while (teamById(id)); const t = { id, name: '새 팀', short: id.slice(0, 3), color1: '#3a6fd8', color2: '#ffffff', players: D.genSquad(id, 68, 'en') }; lg.teams.push(t); S.dbTeam = id; saveDB(); render(); toast('가상 선수로 구성된 새 팀을 만들었습니다. 이름과 능력치를 수정하세요.'); }
function addLeague() { const id = 'L' + Math.random().toString(36).slice(2, 6).toUpperCase(); db.leagues.push({ id, name: '새 리그', teams: [] }); S.dbLeague = id; addTeam(db.leagues[db.leagues.length - 1]); }
function confirmBox(msg, yes, label) { modal(h('div', { class: 'stack' }, h('h2', null, '확인'), h('p', null, msg), h('div', { class: 'row' }, h('button', { class: 'btn ' + (label ? 'primary' : 'danger'), onclick: () => { closeModal(); yes(); } }, label || '삭제'), h('button', { class: 'btn', onclick: closeModal }, '취소'))), true); }
function confirmReset() { modal(h('div', { class: 'stack' }, h('h2', null, '기본값으로 초기화'), h('p', null, '직접 수정·추가한 선수와 팀이 모두 기본 데이터로 돌아갑니다. 진행 중인 시즌의 팀 구성도 바뀔 수 있으니 먼저 내보내기로 백업해 두세요.'), h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: async () => { clearTimeout(dbSaveT); db = D.buildDefaultDB(); dbCustom = false; dbBytes = 0; posAvgCache = null; await rdbDel(); S.setups = {}; saveSetups(); closeModal(); render(); toast('초기화했습니다.'); } }, '초기화'), h('button', { class: 'btn', onclick: closeModal }, '취소'))), true); }
function dbToCSV() {
  const head = ['league', 'team', 'name', 'pos', 'traits', ...D.STAT_KEYS];
  const esc = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const lines = [head.join(',')];
  for (const l of db.leagues) for (const t of l.teams) for (const p of t.players) lines.push([l.name, t.name, p.name, p.pos, p.traits || '', ...D.STAT_KEYS.map(k => p.stats[k])].map(esc).join(','));
  return lines.join('\n');
}
function downloadText(txt, name, type) {
  try { const url = URL.createObjectURL(new Blob([txt], { type })); const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return true; } catch (e) { return false; }
}
function openExport() {
  const day = new Date().toISOString().slice(0, 10);
  const teamCSV = () => { const t = teamById(S.dbTeam); if (!t) return ''; const lg = leagueOf(t.id); const esc = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); return [['league', 'team', 'name', 'pos', 'traits', ...D.STAT_KEYS].join(','), ...t.players.map(p => [lg ? lg.name : '', t.name, p.name, p.pos, p.traits || '', ...D.STAT_KEYS.map(k => p.stats[k])].map(esc).join(','))].join('\n'); };
  const ta = h('textarea', { rows: 10, readonly: true, id: 'exta', 'aria-label': '현재 팀 CSV' }); ta.value = teamCSV();
  modal(h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, '내보내기'), h('button', { class: 'btn', onclick: closeModal }, '닫기')),
    h('p', { class: 'hint', style: { margin: 0 } }, `전체 데이터베이스는 구단 ${allTeams().length}개, 선수 ${allTeams().reduce((a, t) => a + t.players.length, 0).toLocaleString()}명이라 파일로 내려받습니다. 가져오기 화면에서 파일을 선택하면 그대로 복원됩니다.`),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { if (!downloadText(JSON.stringify(db), `touchline-db-${day}.json`, 'application/json')) toast('다운로드하지 못했습니다.'); } }, 'JSON 파일 (전체 백업)'), h('button', { class: 'btn', onclick: () => { if (!downloadText(dbToCSV(), `touchline-players-${day}.csv`, 'text/csv')) toast('다운로드하지 못했습니다.'); } }, 'CSV 파일 (전체 선수 표)')),
    h('div', { class: 'lbl' }, '현재 선택한 팀 CSV (복사용)'), ta,
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { const done = () => toast('복사했습니다.'); if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast('텍스트를 선택했습니다. Ctrl+C로 복사하세요.'); }); else ta.select(); } }, '복사'))), false);
}
function openImport() {
  const ta = h('textarea', { rows: 12, id: 'imta', placeholder: 'JSON 백업 또는 CSV를 붙여넣으세요', 'aria-label': '가져올 데이터' });
  const file = h('input', { type: 'file', accept: '.json,.csv,.txt', id: 'imfile', onchange: e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { ta.value = r.result; }; r.readAsText(f, 'utf-8'); } });
  let mode = 'merge';
  modal(h('div', { class: 'stack' }, h('div', { class: 'mhead' }, h('h2', { class: 'grow' }, '가져오기'), h('button', { class: 'btn', onclick: closeModal }, '닫기')),
    h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'imfile' }, '파일 선택'), file),
    ta,
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'CSV 처리 방식'), seg([['merge', '같은 이름은 갱신, 없으면 추가'], ['replace', '해당 팀 명단 교체']], mode, v => { mode = v; document.querySelectorAll('#modal .seg button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 ? 'merge' : 'replace') === v))); })),
    h('details', null, h('summary', { class: 'hint' }, 'CSV 형식 안내'), h('p', { class: 'hint' }, '첫 줄은 열 이름입니다. 필수: league, team, name, pos. 선택: ovr, traits, 그리고 능력치 열(영문 키 또는 한글 이름). 능력치 열이 비어 있으면 ovr·pos·traits로 자동 생성합니다.'), h('textarea', { rows: 4, readonly: true }, 'league,team,name,pos,ovr,traits,속력,골 결정력\n잉글랜드 프리미어리그,아스널,New Striker,ST,80,F,88,84')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { try { const msg = importText(ta.value, mode); closeModal(); render(); toast(msg); } catch (err) { toast('가져오기 실패: ' + err.message); } } }, '가져오기'))), false);
}
function importText(txt, mode) {
  txt = txt.trim(); if (!txt) throw new Error('내용이 비어 있습니다.');
  if (txt[0] === '{') {
    const o = JSON.parse(txt); if (!o.leagues || !Array.isArray(o.leagues)) throw new Error('leagues 항목이 없습니다.');
    for (const l of o.leagues) for (const t of l.teams) for (const p of t.players) { p.stats = Object.assign(D.genStats(p.name, p.pos, p.ovr || 70, p.traits || ''), p.stats || {}); if (!p.id) p.id = uid(t.id); }
    o.version = db.version; db = o; S.setups = {}; saveDB(); saveSetups(); return `JSON을 불러왔습니다. 팀 ${allTeams().length}개.`;
  }
  const rows = parseCSV(txt); const head = rows.shift().map(s => s.trim());
  const rev = {}; for (const k of D.STAT_KEYS) { rev[k.toLowerCase()] = k; rev[D.STAT_LABELS[k]] = k; }
  const col = n => head.findIndex(x => x.toLowerCase() === n);
  const ci = { league: col('league'), team: col('team'), name: col('name'), pos: col('pos'), ovr: col('ovr'), traits: col('traits') };
  if (ci.team < 0 || ci.name < 0 || ci.pos < 0) throw new Error('team, name, pos 열이 필요합니다.');
  let added = 0, updated = 0; const cleared = new Set();
  for (const r of rows) {
    if (!r.length || !r[ci.name]) continue;
    const lname = ci.league >= 0 ? r[ci.league].trim() : db.leagues[0].name;
    let lg = db.leagues.find(l => l.name === lname || l.id === lname); if (!lg) { lg = { id: 'L' + Math.random().toString(36).slice(2, 6).toUpperCase(), name: lname, teams: [] }; db.leagues.push(lg); }
    const tname = r[ci.team].trim(); let t = lg.teams.find(x => x.name === tname || x.id === tname);
    if (!t) { let id; do { id = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase(); } while (teamById(id)); t = { id, name: tname, short: tname.slice(0, 3).toUpperCase(), color1: '#3a6fd8', color2: '#ffffff', players: [] }; lg.teams.push(t); }
    if (mode === 'replace' && !cleared.has(t)) { t.players = []; cleared.add(t); delete S.setups[t.id]; }
    const pos = (r[ci.pos] || 'CM').trim().toUpperCase(); const name = r[ci.name].trim();
    const ovr = ci.ovr >= 0 ? +r[ci.ovr] || 70 : 70; const traits = ci.traits >= 0 ? (r[ci.traits] || '').toUpperCase() : '';
    const stats = D.genStats(name, D.POSITIONS.includes(pos) ? pos : 'CM', ovr, traits);
    head.forEach((hn, i) => { const k = rev[hn] || rev[hn.toLowerCase()]; if (k && r[i] !== '' && r[i] != null && !isNaN(+r[i])) stats[k] = Math.max(1, Math.min(99, Math.round(+r[i]))); });
    const p = t.players.find(x => x.name === name);
    if (p) { p.pos = pos; p.stats = stats; p.ovr = ovr; p.traits = traits; delete p.gen; updated++; }
    else { t.players.push({ id: uid(t.id), name, pos, ovr, traits, stats }); added++; }
  }
  saveDB(); saveSetups(); return `CSV: ${added}명 추가, ${updated}명 갱신`;
}
function parseCSV(s) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter(r => r.some(x => x.trim()));
}

// 첫 화면
if (!teamById(S.home)) S.home = teamById('ENG_ARS') ? 'ENG_ARS' : allTeams()[0].id; if (!teamById(S.away)) S.away = teamById('ENG_LIV') ? 'ENG_LIV' : allTeams()[1].id;
S.screen = 'home';
document.addEventListener('DOMContentLoaded', () => { applyTheme(); if (window.Manager && Manager.init) Manager.init(); render(); });
window.TL = { availSetup, unpackSetup, teamStrength, radarSVG, heatmapSVG, playerOf, get db() { return db; }, reviewPrebuilt, fluentOf, backupBundle, applyBundle, fold, openSearch, formArrow, rich, modalOver, modalLayer, closeAllModals, money, moneyIn, moneyOut, moneyUnit, mdec, posLabel, POS_FM, POS_KO, fluentList, famLevels, h, $, S, modal, closeModal, toast, seg, sel, starsEl, starsOf, pl, profileView, tacticsPanel, startMatch, go, render, ovrClass, ink, confirmBox, simJob, packSetup, fmtBytes, famPitch, shortName, scrollState, restoreScroll, kitColors, savePrefs, hlControls, get M() { return M; }, get R3() { return R3; } };
window.__touchline = { get M() { return M; }, get R3() { return R3; }, S, L, drawAt(ph, dt) { const F = frameAt(ph); if (F) drawFrame(F, dt || .05); }, get career() { return career; }, RUN, Pool };
})();
