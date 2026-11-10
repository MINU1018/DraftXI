// ===== DRAFT XI — 코어 로직 (화면 없음) =====
// 선수 풀 생성, 드래프트(셔플/스네이크/FC식), AI 감독, 대회(리그·토너먼트·조별리그·리그 페이즈), 경기 기록 집계.
// 브라우저 메인 스레드, 워커, Node 어디서나 같은 코드로 동작합니다.
// 멀티플레이 대비: 모든 상태 변화는 T(대회 객체)에 대한 순수 함수 호출(draftPick, applyResult, redraft …)로만 일어나고
// 난수는 T.seed에서만 나오므로, 같은 호출 순서를 다른 기기에서 재생하면 같은 상태가 됩니다. 감독은 ctrl('user'|'ai')과 uid를 가집니다.
(function (G) {
'use strict';
const D = G.FMDATA, E = G.FMEngine;
const W = () => G.FMWORLD;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hash = s => D.hash(String(s));
function rngOf(seed) { const r = D.seeded((seed >>> 0) || 1); for (let i = 0; i < 5; i++) r(); const f = () => r(); f.int = n => Math.floor(r() * n); f.pick = a => a[Math.floor(r() * a.length)]; f.gauss = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }; f.shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }; return f; }
// 대회의 n번째 난수 스트림 (호출 순서와 무관하게 재현 가능)
const sub = (T, tag) => rngOf(hash(T.seed + ':' + tag));

// ---------- 형식 ----------
const FORMATS = {
  league: { n: '리그', d: '모든 팀이 서로 맞붙어 승점으로 우승을 가립니다.', sizes: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20] },
  ko: { n: '토너먼트', d: '지면 탈락하는 단판 녹아웃. 비기면 연장·승부차기.', sizes: [2, 4, 8, 16, 32] },
  groups: { n: '조별리그 + 토너먼트', d: '4팀씩 조별리그 후 각 조 1·2위가 토너먼트에 진출합니다.', sizes: [8, 16, 32] },
  swiss: { n: '리그 페이즈 + 토너먼트', d: '한 순위표에서 정해진 경기 수만 치르고 상위 팀이 토너먼트에 오릅니다.', sizes: [8, 10, 12, 16, 18, 20, 24, 32, 36] }
};
const DRAFT_MODES = {
  shuffle: { n: '셔플 드래프트', d: '20명 세트에서 1명을 뽑고 세트를 옆 감독에게 넘깁니다. 모든 감독이 동시에 고릅니다.' },
  snake: { n: '스네이크 드래프트', d: '전체 선수 풀을 공개하고 순번대로 지명합니다. 라운드마다 순서가 뒤집힙니다.' },
  fc: { n: '포지션 5지선다', d: '포메이션을 정한 뒤, 자리마다 제시되는 후보 5명 중 1명을 고릅니다.' }
};
const POOL_PRESETS = [
  ['world', '월드 클래스', { ovrMin: 82, ovrMax: 99 }], ['top', '빅리그 주전급', { ovrMin: 76, ovrMax: 86 }], ['mid', '중위권', { ovrMin: 70, ovrMax: 79 }],
  ['low', '하부 리그', { ovrMin: 60, ovrMax: 70 }], ['wide', '전 범위', { ovrMin: 62, ovrMax: 99 }], ['kids', '유망주 (U21)', { ovrMin: 60, ovrMax: 99, ageMin: 15, ageMax: 21 }], ['vets', '베테랑 (32+)', { ovrMin: 68, ovrMax: 99, ageMin: 32, ageMax: 45 }]
];
const DEFAULT_CFG = () => ({
  name: '', format: 'league', n: 8, legs: 2, k: 6, q: 4, squad: 18, draftMode: 'shuffle', redrafts: 2, redraftMax: 3, timer: 0, susp: true, ai: 1,
  pool: { src: 'real', ovrMin: 76, ovrMax: 86, ageMin: 15, ageMax: 45, leagues: null, nats: null },
  me: { name: '나의 팀', short: 'MY', color1: '#f2c14e', color2: '#0b0d11', mgr: '감독', formation: '4-3-3' }
});

// ---------- AI 감독 ----------
const STYLES = {
  poss: { n: '점유형', forms: ['4-3-3', '4-2-3-1'], tac: { passing: 0, tempo: 1, width: 2, press: 2, defLine: 3, engage: 3, buildUp: true, finalThird: 'workIn' }, w: { shortPass: 1, vision: 1, ballControl: 1 } },
  counter: { n: '역습형', forms: ['4-4-2', '4-2-3-1', '5-3-2'], tac: { passing: 2, tempo: 3, defLine: 1, engage: 1, press: 1, onWin: 'counter', onLoss: 'regroup' }, w: { pace: 1.2, accel: .8, finishing: .5 } },
  press: { n: '압박형', forms: ['4-3-3', '4-1-2-1-2', '3-4-3'], tac: { press: 3, engage: 4, defLine: 3, tempo: 3, onLoss: 'counterpress', tackling: 'getStuckIn' }, w: { stamina: 1.2, aggression: .6, accel: .6 } },
  direct: { n: '직선형', forms: ['4-4-2', '3-5-2', '4-5-1'], tac: { passing: 3, tempo: 3, buildUp: false, cross: 'high', width: 2, gkMethod: 'kick', gkTarget: 'target' }, w: { strength: 1, heading: 1, jumping: .6 } },
  block: { n: '수비형', forms: ['5-3-2', '4-5-1', '4-1-2-1-2'], tac: { defLine: 0, engage: 1, press: 0, tempo: 1, onLoss: 'regroup', onWin: 'counter', tackling: 'stayOnFeet' }, w: { marking: 1, standTackle: 1, interceptions: 1 } },
  wing: { n: '측면 공략형', forms: ['4-4-2', '4-3-3', '3-4-3'], tac: { width: 3, cross: 'whipped', tempo: 2, passing: 1 }, w: { crossing: 1.2, pace: .8, heading: .4 } },
  bal: { n: '균형형', forms: ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2'], tac: {}, w: {} }
};
const CLUB_A = ['Northbridge', 'Castelmar', 'Vale Royal', 'Sankt Arden', 'Rivermouth', 'Montclair', 'Halvorsen', 'Porto Leste', 'Kingsmere', 'Altavia', 'Brenton', 'Solmar', 'Dunhaven', 'Falkenberg', 'Corvin', 'Marisol', 'Ostrava Nova', 'Lindholm', 'Tresco', 'Ashgrove', 'Valdoro', 'Wexley', 'Bellarosa', 'Grenfell', 'Serrano', 'Hartwick', 'Miravalle', 'Stonegate', 'Oakhurst', 'Lumière', 'Karsten', 'Redmoor', 'Villanova', 'Eskdale', 'Torvik', 'Almendra', 'Blackwater', 'Zorin', 'Calderon', 'Whitby'];
const CLUB_B = ['United', 'City', 'FC', 'Athletic', 'Rovers', 'SC', 'Town', 'Albion', 'CF', 'Wanderers', 'Sporting', '1909', 'AC', 'Rangers', 'Dynamo'];
const KITS = [['#d81e2c', '#ffffff'], ['#1e5bd8', '#ffffff'], ['#0f8a4b', '#ffffff'], ['#111318', '#f2c14e'], ['#7a1fa2', '#ffffff'], ['#f07b1a', '#111318'], ['#19b5c9', '#0b2530'], ['#ffffff', '#1b2a52'], ['#8c1c13', '#f4d58d'], ['#1b4332', '#d8f3dc'], ['#0b2545', '#8da9c4'], ['#e63973', '#ffffff'], ['#ffd400', '#111318'], ['#3a0ca3', '#f72585'], ['#6c757d', '#111318'], ['#2d6a4f', '#ffd166'], ['#9d0208', '#111318'], ['#00509d', '#fdc500'], ['#5f0f40', '#fb8b24'], ['#264653', '#e9c46a'], ['#bc4749', '#f2e8cf'], ['#22577a', '#80ed99'], ['#4a4e69', '#f2e9e4'], ['#b5179e', '#111318'], ['#606c38', '#fefae0'], ['#003049', '#f77f00'], ['#780000', '#fdf0d5'], ['#0077b6', '#caf0f8'], ['#283618', '#dda15e'], ['#e85d04', '#ffffff'], ['#343a40', '#74c69d'], ['#7209b7', '#f8f9fa'], ['#14213d', '#fca311'], ['#38b000', '#111318'], ['#c9184a', '#fff0f3'], ['#005f73', '#e9d8a6']];
function mgrName(r) {
  const Wd = W(); if (!Wd) return 'Coach ' + (1 + r.int(99));
  const langs = Object.keys(Wd.NAMES); const [F, L] = Wd.NAMES[r.pick(langs)];
  return r.pick(F) + ' ' + r.pick(L);
}
function makeManagers(T) {
  const cfg = T.cfg, r = sub(T, 'mgrs'); const out = [];
  out.push({ id: 0, ctrl: 'user', uid: 'local', name: cfg.me.mgr || '감독', style: 'user', formation: cfg.me.formation || '4-3-3', team: { id: 'DX0', name: cfg.me.name || '나의 팀', short: (cfg.me.short || 'MY').toUpperCase().slice(0, 4), color1: cfg.me.color1, color2: cfg.me.color2 } });
  const names = r.shuffle(CLUB_A.slice()), kits = r.shuffle(KITS.slice()), styles = Object.keys(STYLES); const usedShort = new Set([out[0].team.short]);
  for (let i = 1; i < cfg.n; i++) {
    const base = names[(i - 1) % names.length]; const sfx = r.pick(CLUB_B); const name = /^(FC|SC|AC|CF)$/.test(sfx) && r() < .5 ? sfx + ' ' + base : base + ' ' + sfx;
    let short = base.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), k = 0; while (usedShort.has(short)) short = base.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() + String.fromCharCode(65 + (k++ % 26)); usedShort.add(short);
    const style = styles[r.int(styles.length)]; const kit = kits[(i - 1) % kits.length];
    out.push({ id: i, ctrl: 'ai', uid: null, name: mgrName(r), style, formation: r.pick(STYLES[style].forms), team: { id: 'DX' + i, name, short, color1: kit[0], color2: kit[1] } });
  }
  return out;
}

// ---------- 선수 풀 ----------
const SET_QUOTA = [['GK', 2], ['CB', 4], ['LB', 1], ['RB', 1], ['FB?', 1], ['DM', 2], ['CM', 3], ['AM', 1], ['LW', 1], ['RW', 1], ['AT?', 1], ['ST', 2]];
const NAT_W = 'BRA:8,FRA:8,ESP:8,ENG:8,GER:7,ITA:6,ARG:6,POR:5,NED:5,BEL:3,KOR:3,JPN:3,NGA:3,SEN:3,CIV:2,GHA:2,MAR:3,DEN:2,SWE:2,NOR:2,CRO:3,SRB:2,URU:3,COL:3,USA:3,MEX:2,CMR:2,ALG:2,SUI:2,AUT:2,POL:2,CZE:1,UKR:2,GRE:1,TUR:2,SCO:1,IRL:1,WAL:1,ECU:1,EGY:1';
const GEN_TR = { GK: '', CB: 'DAP', LB: 'SDE', RB: 'SDE', DM: 'DVE', CM: 'VTE', AM: 'TVK', LW: 'STF', RW: 'STK', ST: 'FAS' };
let natTable = null;
function pickNat(r) { if (!natTable) { natTable = []; for (const x of NAT_W.split(',')) { const [c, w] = x.split(':'); for (let i = 0; i < +w; i++) natTable.push(c); } } return r.pick(natTable); }
function fitOvr(st, pos, ovr) { for (let it = 0; it < 4; it++) { const d = D.calcOvr(st, pos) - ovr; if (Math.abs(d) < .5) break; for (const k in st) { if (pos === 'GK' ? (k.startsWith('gk') || k === 'reactions') : !k.startsWith('gk')) st[k] -= d; } } for (const k in st) st[k] = clamp(Math.round(st[k]), 8, 99); return st; }
function genVirtual(r, id, pos, ovr, ageMin, ageMax, used) {
  const Wd = W(); const nat = pickNat(r); const lang = Wd && Wd.NATIONS[nat] ? Wd.NATIONS[nat][1] : 'en'; const [F, L] = (Wd && (Wd.NAMES[lang] || Wd.NAMES.en)) || [['Alex'], ['Player']];
  let name, t = 0; do { name = r.pick(F) + ' ' + r.pick(L); } while (used.has(name) && t++ < 40); used.add(name);
  const trs = GEN_TR[pos] || ''; let tr = ''; if (trs && r() < .7) tr += trs.charAt(r.int(trs.length)); if (trs && r() < .25) { const c = trs.charAt(r.int(trs.length)); if (!tr.includes(c)) tr += c; }
  const stats = fitOvr(D.genStats(name + '#' + id, pos, ovr, tr), pos, ovr);
  const age = clamp(Math.round(ageMin + (ageMax - ageMin) * (r() + r()) / 2), 16, 40);
  const fam = { _: 1, [pos]: 3 }; const alt = { CB: ['DM'], LB: ['LWB', 'LM'], RB: ['RWB', 'RM'], DM: ['CM', 'CB'], CM: ['DM', 'AM'], AM: ['CM', 'LW', 'RW'], LW: ['LM', 'RW', 'ST'], RW: ['RM', 'LW', 'ST'], ST: ['LW', 'RW', 'AM'] }[pos] || [];
  alt.forEach((c, i) => { if (i === 0 ? r() < .75 : r() < .3) fam[c] = i === 0 ? 3 : 2; });
  const left = r() < ({ LB: .7, LW: .45, RW: .3 }[pos] || .2);
  return { id, name, pos, ovr, traits: tr, gen: true, stats, fam, pt: [], by: D.REAL_YEAR - age, age, o: ovr, club: null, clubName: '가상 선수', bio: { nat: Wd ? Wd.natName(nat) : nat, natCode: nat, foot: left ? '왼발' : '오른발', weak: clamp(Math.round(2.5 + r.gauss() * .8), 1, 5), height: null, weight: null, est: false } };
}
// 실존 선수 색인: db(app의 실축 데이터베이스) → 풀 후보 목록. 한 번만 계산해 캐시
let realCache = null, realCacheDb = null;
function realIndex(db) {
  if (realCache && realCacheDb === db) return realCache;
  const ref = D.fcRefDay(); const out = [];
  for (const lg of db.leagues) for (const t of lg.teams) for (const p of t.players) {
    if (p.gen) continue; const o = D.calcOvr(p.stats, p.pos);
    const age = p.dob != null && ref != null ? Math.floor((ref - p.dob) / 365.25) : (p.by ? D.REAL_YEAR - p.by : 26);
    out.push({ p, o, age, club: t.id, clubName: t.name, lg: lg.id, lgName: lg.name, tier: lg.tier || 9, nat: p.bio && p.bio.natCode });
  }
  realCache = out; realCacheDb = db; return out;
}
function leaguesOf(db) { return db.leagues.filter(l => !l.other).map(l => ({ id: l.id, name: l.name, tier: l.tier || 1 })); }
// 조건에 맞는 실존 후보 수 (설정 화면 미리보기)
function poolPreview(db, pc) { const c = { n: 0, by: {} }; for (const x of realIndex(db)) if (realOk(x, pc)) { c.n++; c.by[x.p.pos] = (c.by[x.p.pos] || 0) + 1; } return c; }
function realOk(x, pc) { return x.o >= pc.ovrMin && x.o <= pc.ovrMax && x.age >= pc.ageMin && x.age <= pc.ageMax && (!pc.leagues || !pc.leagues.length || pc.leagues.includes(x.lg)) && (!pc.nats || !pc.nats.length || pc.nats.includes(x.nat)); }
function cloneReal(x) { const p = x.p; return { id: p.id, name: p.name, pos: p.pos, ovr: x.o, traits: p.traits || '', stats: Object.assign({}, p.stats), fam: Object.assign({}, p.fam), pt: (p.pt || []).slice(), dob: p.dob, by: p.by, sm: p.sm, bio: Object.assign({}, p.bio), o: x.o, age: x.age, club: x.club, clubName: x.clubName, lgName: x.lgName }; }
// 풀 만들기: 세트(20명, 포지션 균형) × nSets + 여분(자유 계약). 반환 { players:{id:obj}, sets:[[id]], extra:[id], short: 부족해 가상으로 채운 수 }
function buildPool(T, db) {
  const cfg = T.cfg, pc = cfg.pool, r = sub(T, 'pool');
  const mult = cfg.draftMode === 'fc' ? 2 : 1; const nSets = cfg.n * mult; const nExtra = Math.max(12, cfg.n * 3);
  const by = {}; for (const pos of D.POSITIONS) by[pos] = [];
  if (pc.src !== 'virtual' && db) for (const x of realIndex(db)) if (realOk(x, pc) && by[x.p.pos]) by[x.p.pos].push(x);
  for (const pos in by) r.shuffle(by[pos]);
  const players = {}, used = new Set(); let vid = 0, short = 0, nReal = 0;
  const take = pos => {
    const wantReal = pc.src === 'real' || (pc.src === 'mixed' && r() < .5);
    if (wantReal || pc.src === 'real') { let x; while ((x = by[pos].pop())) { if (!players[x.p.id]) { const c = cloneReal(x); players[c.id] = c; used.add(c.name); nReal++; return c.id; } } if (pc.src === 'real') short++; }
    const lo = pc.ovrMin, hi = Math.min(pc.ovrMax, 94); const ovr = Math.round(lo + (hi - lo) * Math.pow(r(), 1.35));
    const v = genVirtual(r, 'v' + (vid++), pos, ovr, Math.max(16, pc.ageMin), Math.min(38, pc.ageMax), used); players[v.id] = v; return v.id;
  };
  const mkSet = () => { const ids = []; for (const [q, n] of SET_QUOTA) for (let i = 0; i < n; i++) { const pos = q === 'FB?' ? r.pick(['LB', 'RB']) : q === 'AT?' ? r.pick(['AM', 'LW', 'RW', 'ST', 'CM']) : q; ids.push(take(pos)); } return r.shuffle(ids); };
  const sets = []; for (let i = 0; i < nSets; i++) sets.push(mkSet());
  const extra = []; const cyc = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST']; for (let i = 0; i < nExtra; i++) extra.push(take(cyc[i % cyc.length]));
  return { players, sets, extra, short, nReal };
}

// ---------- 팀 / 전술 ----------
const NUM_PREF = { GK: [1, 13, 31, 41], CB: [4, 5, 6, 15, 26, 33], LB: [3, 12, 21, 35], RB: [2, 22, 24, 32], DM: [6, 16, 18, 36], CM: [8, 14, 20, 23], AM: [10, 19, 25, 27], LW: [11, 17, 27, 37], RW: [7, 17, 28, 38], ST: [9, 19, 29, 30, 39] };
const teamCache = new WeakMap();
function teamOf(T, m) {
  let c = teamCache.get(T); if (!c) { c = {}; teamCache.set(T, c); }
  const key = T.roster[m].join(','); const hit = c[m]; if (hit && hit.key === key) return hit.team;
  const mg = T.mgrs[m]; const team = Object.assign({ nation: 'ENG', mgr: mg.name }, mg.team, { players: T.roster[m].map(id => T.players[id]) });
  c[m] = { key, team }; return team;
}
// 지난 경기 다시 보기용: 그 경기 명단(선발+교체)으로 팀 구성
function teamFromIds(T, m, ids) { const mg = T.mgrs[m]; return Object.assign({ nation: 'ENG' }, mg.team, { players: ids.map(id => T.players[id]).filter(Boolean) }); }
function assignNumbers(T, m) {
  const taken = new Set(); const ps = T.roster[m].map(id => T.players[id]).sort((a, b) => b.o - a.o);
  for (const p of ps) if (p.num && !taken.has(p.num) && p.nm === m) taken.add(p.num); else p.num = 0;
  for (const p of ps) { if (p.num) continue; let n = (NUM_PREF[p.pos] || [30]).find(x => !taken.has(x)); if (!n) { n = 40; while (taken.has(n)) n++; } p.num = n; p.nm = m; taken.add(n); }
}
const GRP = pos => pos === 'LB' || pos === 'RB' ? 'FB' : pos === 'LW' || pos === 'RW' ? 'W' : pos;
const SLOT_G = c => { const g = E.SLOT_GROUP[c]; return g === 'WB' ? 'FB' : g; };
// 선발 11명의 자리 능력치 합 (빈자리는 38점). slots: 포메이션 슬롯 배열
function xiValue(players, slots) {
  const pairs = []; slots.forEach((s, i) => { for (const p of players) pairs.push([E.posRating(p, s[0]) + (p.pos === s[0] ? 1 : 0), i, p]); });
  pairs.sort((a, b) => b[0] - a[0]); const res = new Array(slots.length).fill(0); const used = new Set(); let n = 0;
  for (const [v, i, p] of pairs) { if (res[i] || used.has(p.id)) continue; res[i] = v; used.add(p.id); if (++n === slots.length) break; }
  let sum = 0; for (const v of res) sum += v || 38; return sum;
}
function bestRole(p, code) { const ok = E.rolesForSlot(code); const m = {}; for (const a of E.archsOf(p, code)) if (ok.includes(a.role) && (m[a.role] == null || a.v > m[a.role])) m[a.role] = a.v; const b = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return b ? b[0] : (E.DEFAULT_ROLE[code] || ok[0]); }
function aiSetup(T, m, unavail) {
  const mg = T.mgrs[m]; const team = teamOf(T, m); const un = unavail || new Set();
  const tp = Object.assign({}, team, { players: team.players.filter(p => !un.has(p.id)) });
  const form = E.FORMATIONS[mg.formation] ? mg.formation : '4-3-3'; const s = E.makeSetup(tp, form);
  const st = STYLES[mg.style] || STYLES.bal; Object.assign(s.tactics, st.tac);
  s.roles = s.lineup.map((id, i) => { const p = T.players[id]; const code = E.FORMATIONS[form][i][0]; return p ? bestRole(p, code) : E.FORMATIONS[form][i][3]; });
  return s;
}
// 사용자 전술 점검: 명단에 없는/출전 정지 선수를 가장 알맞은 선수로 교체. 바뀐 내용 목록 반환
function repairSetup(T, m, setup, unavail) {
  const team = teamOf(T, m); const un = unavail || new Set(); const ok = id => id && T.roster[m].includes(id) && !un.has(id);
  const slots = E.slotsOf(setup); const changes = []; const inXI = new Set(setup.lineup.filter(ok));
  setup.lineup = setup.lineup.map((id, i) => {
    if (ok(id)) return id;
    const cand = team.players.filter(p => !un.has(p.id) && !inXI.has(p.id)).sort((a, b) => E.posRating(b, slots[i][0]) - E.posRating(a, slots[i][0]))[0];
    if (!cand) return id; inXI.add(cand.id); changes.push({ slot: i, out: id, in: cand.id }); return cand.id;
  });
  setup.bench = team.players.filter(p => !inXI.has(p.id) && !un.has(p.id)).sort((a, b) => b.o - a.o).slice(0, 9).map(p => p.id);
  const xi = setup.lineup; for (const k of ['pen', 'fk', 'corner']) if (setup.takers && setup.takers[k] && !xi.includes(setup.takers[k])) setup.takers[k] = '';
  if (setup.captain && !xi.includes(setup.captain)) setup.captain = '';
  return changes;
}
function userSetup(T, m) {
  let s = T.setups[m]; const team = teamOf(T, m);
  if (!s || !s.lineup || s.lineup.length !== 11) { s = E.makeSetup(team, E.FORMATIONS[T.mgrs[m].formation] ? T.mgrs[m].formation : '4-3-3'); s.roles = s.lineup.map((id, i) => bestRole(T.players[id], E.slotsOf(s)[i][0])); T.setups[m] = s; }
  const def = E.DEFAULT_TACTICS(); for (const k in def) if (s.tactics[k] === undefined) s.tactics[k] = def[k];
  s.takers = s.takers || { pen: '', fk: '', corner: '' }; s.teamId = team.id;
  return s;
}
// 경기에 쓸 전술 (사용자: 저장된 전술을 점검해서, AI: 매 경기 새로 구성)
function matchSetup(T, m) { const un = suspendedSet(T, m); if (T.mgrs[m].ctrl === 'ai') return { setup: aiSetup(T, m, un), changes: [] }; const s = JSON.parse(JSON.stringify(userSetup(T, m))); const changes = repairSetup(T, m, s, un); return { setup: s, changes }; }
function teamRating(T, m) { const team = teamOf(T, m); const f = E.FORMATIONS[T.mgrs[m].formation] || E.FORMATIONS['4-3-3']; return Math.round(xiValue(team.players, f) / 11 * 10) / 10; }

// ---------- 드래프트 ----------
const BENCH_SEQ = ['GK', 'CB', 'CM', 'ST', 'W?', 'FB?', 'DM', 'AM', 'CB'];
function fcSeq(T, m) { const f = E.FORMATIONS[T.mgrs[m].formation] || E.FORMATIONS['4-3-3']; const seq = f.map(s => s[0]); for (let i = 0; seq.length < T.cfg.squad; i++) seq.push(BENCH_SEQ[i % BENCH_SEQ.length]); return seq.slice(0, T.cfg.squad); }
function draftInit(T, pool) {
  const cfg = T.cfg, r = sub(T, 'draft');
  T.players = pool.players; T.roster = T.mgrs.map(() => []); T.free = [];
  const d = T.draft = { mode: cfg.draftMode, round: 0, turn: 0, picks: [], done: false, total: cfg.n * cfg.squad, bookmarks: [] };
  if (d.mode === 'shuffle') { d.sets = pool.sets.map(s => s.slice()); d.extra = pool.extra.slice(); d.picked = T.mgrs.map(() => false); }
  else { d.pool = [].concat(...pool.sets, pool.extra); if (d.mode === 'snake') d.order = r.shuffle(T.mgrs.map(m => m.id)); else { d.picked = T.mgrs.map(() => false); d.offer = {}; } }
  return d;
}
const snakeWho = (T) => { const d = T.draft, n = T.cfg.n; const rd = Math.floor(d.turn / n), i = d.turn % n; return d.order[rd % 2 ? n - 1 - i : i]; };
const setIdx = (T, m) => { const n = T.draft.sets.length; return ((m - T.draft.round) % n + n) % n; };
function fcCode(T, m) { const c = fcSeq(T, m)[T.roster[m].length]; return c === 'W?' ? (hash(T.seed + 'w' + m + T.roster[m].length) % 2 ? 'LW' : 'RW') : c === 'FB?' ? (hash(T.seed + 'f' + m + T.roster[m].length) % 2 ? 'LB' : 'RB') : c; }
function fcOffer(T, m) {
  const d = T.draft; const key = m + ':' + T.roster[m].length; if (d.offer[m] && d.offer[m].key === key) return d.offer[m];
  const code = fcCode(T, m); const r = sub(T, 'fc' + key); const reserved = new Set(); for (const k in d.offer) if (+k !== m && d.offer[k] && T.mgrs[k].ctrl !== 'ai') for (const id of d.offer[k].ids) reserved.add(id);
  const av = d.pool.filter(id => !reserved.has(id)); const exact = [], grp = [], rest = []; const side = E.SLOT_POS[code] || code;
  for (const id of av) { const p = T.players[id]; if (p.pos === side || p.pos === code) exact.push(id); else if (GRP(p.pos) === SLOT_G(code) || E.famLevel(p, code) >= 3) grp.push(id); else rest.push(id); }
  r.shuffle(exact); r.shuffle(grp); r.shuffle(rest); const ids = exact.concat(grp).slice(0, 5); if (ids.length < 5 && code !== 'GK') ids.push(...rest.filter(id => T.players[id].pos !== 'GK').slice(0, 5 - ids.length)); if (!ids.length) ids.push(...rest.slice(0, 5));
  return (d.offer[m] = { key, code, ids });
}
// 지금 이 감독이 고를 수 있는 선수 id 목록 (차례가 아니면 빈 배열)
function draftOptions(T, m) {
  const d = T.draft; if (!d || d.done) return [];
  if (d.mode === 'shuffle') return d.picked[m] ? [] : d.sets[setIdx(T, m)].slice();
  if (d.mode === 'snake') return snakeWho(T) === m ? d.pool.slice() : [];
  return d.picked[m] ? [] : fcOffer(T, m).ids.slice();
}
// 팀 구성 필요도: 포지션 그룹별 선발 필요 수·보유 수
function needs(T, m) {
  const f = E.FORMATIONS[T.mgrs[m].formation] || E.FORMATIONS['4-3-3']; const xi = {}, have = {};
  for (const s of f) { const g = SLOT_G(s[0]); xi[g] = (xi[g] || 0) + 1; }
  for (const id of T.roster[m]) { const g = GRP(T.players[id].pos); have[g] = (have[g] || 0) + 1; }
  const sq = T.cfg.squad; const target = {}; for (const g in xi) target[g] = g === 'GK' ? (sq >= 16 ? 2 : 1) : Math.max(xi[g], Math.round(xi[g] * (sq - (sq >= 16 ? 2 : 1)) / 10));
  let missing = 0; for (const g in xi) missing += Math.max(0, xi[g] - (have[g] || 0));
  return { xi, have, target, missing, left: sq - T.roster[m].length, slots: f };
}
// 선수 가치 평가 (AI 지명·자동 지명 공용). skill 0~1: 높을수록 판단이 정확
function aiChoose(T, m, options, skill) {
  if (!options.length) return null;
  const mg = T.mgrs[m]; const N = needs(T, m); const st = STYLES[mg.style] || STYLES.bal; const r = sub(T, 'ai' + m + ':' + T.roster[m].length);
  const must = N.missing >= N.left; const roster = T.roster[m].map(id => T.players[id]);
  const scored = options.map(id => {
    const p = T.players[id]; const g = GRP(p.pos); const have = N.have[g] || 0, xi = N.xi[g] || 0, tg = N.target[g] || 0;
    let v = 0; for (const s of N.slots) { const x = E.posRating(p, s[0]); if (x > v) v = x; }
    if (!xi) v -= 6; // 포메이션에 없는 포지션
    if (have < xi) v += must ? 40 : 6 + Math.max(0, 6 - N.left) * 2; else if (have >= tg) v -= 7 * (have - tg + 1);
    if (g === 'GK' && have >= (N.target.GK || 1)) v -= 40;
    if (g === 'GK' && have < (N.target.GK || 1) && have >= 1 && N.left <= 4) v += 22;
    if (must && have >= xi) v -= 30;
    let sb = 0; for (const k in st.w) sb += st.w[k] * ((p.stats[k] || 50) - 70) / 30; v += sb * 1.2;
    if (p.age != null) v -= Math.max(0, p.age - 33) * .3;
    return { id, p, v: v + r.gauss() * (2.4 - 2 * (skill == null ? .6 : skill)) };
  }).sort((a, b) => b.v - a.v);
  const base = xiValue(roster, N.slots);
  for (const s of scored.slice(0, 8)) s.v += .5 * Math.min(45, xiValue(roster.concat(s.p), N.slots) - base);
  scored.sort((a, b) => b.v - a.v); return scored[0].id;
}
const AI_SKILL = [.3, .6, .92];
function applyPick(T, m, pid) {
  const d = T.draft; const pk = { m, pid, r: T.roster[m].length, n: d.picks.length };
  T.roster[m].push(pid); d.picks.push(pk);
  if (d.mode === 'shuffle') { const s = d.sets[setIdx(T, m)]; s.splice(s.indexOf(pid), 1); d.picked[m] = true; }
  else { d.pool.splice(d.pool.indexOf(pid), 1); if (d.mode === 'snake') d.turn++; else { d.picked[m] = true; delete d.offer[m]; } }
  return pk;
}
// 사람 감독의 지명. 실패 시 null
function draftPick(T, m, pid) { if (!draftOptions(T, m).includes(pid)) return null; const pk = applyPick(T, m, pid); return pk; }
// 사람 입력이 필요해질 때까지 AI 지명을 진행. 반환: 이번에 이뤄진 AI 지명 목록
function draftAdvance(T, limit) {
  const d = T.draft; const made = []; const skill = AI_SKILL[T.cfg.ai] ?? .6; let guard = 0;
  while (!d.done && guard++ < 5000) {
    if (d.picks.length >= d.total) { finishDraft(T); break; }
    if (d.mode === 'snake') { const m = snakeWho(T); if (T.mgrs[m].ctrl !== 'ai') break; made.push(applyPick(T, m, aiChoose(T, m, d.pool, skill))); if (limit && made.length >= limit) break; continue; }
    if (T.mgrs.some((mg, i) => mg.ctrl !== 'ai' && !d.picked[i])) break;
    for (const mg of T.mgrs) if (mg.ctrl === 'ai' && !d.picked[mg.id]) { const opts = draftOptions(T, mg.id); const id = aiChoose(T, mg.id, opts, skill); if (id) made.push(applyPick(T, mg.id, id)); else d.picked[mg.id] = true; }
    d.round++; d.picked = T.mgrs.map(() => false); if (d.mode === 'fc') d.offer = {};
    if (d.picks.length >= d.total || d.round >= T.cfg.squad) { finishDraft(T); break; }
  }
  return made;
}
// 사람 감독 자동 지명 (시간 초과·자동 선택 버튼)
function draftAuto(T, m) { const opts = draftOptions(T, m); if (!opts.length) return null; const mg = T.mgrs[m]; const keep = mg.style; mg.style = 'bal'; const id = aiChoose(T, m, opts, 1); mg.style = keep; return draftPick(T, m, id); }
function finishDraft(T) {
  const d = T.draft; d.done = true;
  T.free = d.mode === 'shuffle' ? [].concat(...d.sets, d.extra) : d.pool.slice();
  delete d.sets; delete d.pool; delete d.offer; delete d.extra;
  // 쓰이지 않은 선수 데이터는 여유분(자유 계약 60명 + 팀당 2명)만 남기고 정리
  const keepN = 60 + T.cfg.n * 2; if (T.free.length > keepN) { const r = sub(T, 'trim'); const by = {}; for (const id of T.free) (by[T.players[id].pos] = by[T.players[id].pos] || []).push(id); const keep = []; let go = true; while (keep.length < keepN && go) { go = false; for (const pos in by) { const a = by[pos]; if (a.length) { keep.push(a.splice(r.int(a.length), 1)[0]); go = true; } } } const ks = new Set(keep); for (const id of T.free) if (!ks.has(id)) delete T.players[id]; T.free = keep; }
  T.mgrs.forEach((mg, i) => assignNumbers(T, i));
  T.rd = T.mgrs.map(() => T.cfg.redrafts);
  T.phase = 'play'; compInit(T);
  news(T, 'draft', '드래프트가 끝났습니다. 대회가 시작됩니다.');
}
// 드래프트 평가: 지명 순번 대비 능력치 (스틸/리치)
function draftGrades(T) {
  const picks = T.draft.picks; const sorted = picks.map(p => T.players[p.pid] ? T.players[p.pid].o : 0).sort((a, b) => b - a);
  const out = T.mgrs.map(() => ({ sum: 0, n: 0, best: null }));
  for (const pk of picks) { const p = T.players[pk.pid]; if (!p) continue; const exp = sorted[pk.n] || 0; const dv = p.o - exp; const o = out[pk.m]; o.sum += dv; o.n++; if (!o.best || dv > o.best.dv) o.best = { pid: pk.pid, dv, n: pk.n }; }
  return out.map(o => ({ avg: o.n ? o.sum / o.n : 0, best: o.best }));
}

// ---------- 재드래프트 ----------
function canRedraft(T, m) { return T.phase === 'play' && T.rd && T.rd[m] > 0 && !dayStarted(T); }
function redraft(T, m, outs, ins) {
  if (!canRedraft(T, m) || outs.length !== ins.length || !outs.length || outs.length > T.cfg.redraftMax) return false;
  if (!outs.every(id => T.roster[m].includes(id)) || !ins.every(id => T.free.includes(id))) return false;
  const after = T.roster[m].filter(id => !outs.includes(id)).concat(ins); if (!after.some(id => T.players[id].pos === 'GK')) return false;
  T.roster[m] = after; T.free = T.free.filter(id => !ins.includes(id)).concat(outs); T.rd[m]--;
  for (const id of outs) { delete T.players[id].nm; }
  assignNumbers(T, m); (T.rdLog = T.rdLog || []).push({ m, day: T.day, outs: outs.slice(), ins: ins.slice() });
  news(T, 'redraft', `${T.mgrs[m].team.name} 재드래프트: ${ins.map(id => T.players[id].name).join(', ')} 영입 · ${outs.map(id => T.players[id].name).join(', ')} 방출`);
  return true;
}
function aiRedraft(T) {
  if (!T.rd) return; const r = sub(T, 'rd' + T.day);
  for (const mg of T.mgrs) {
    if (mg.ctrl !== 'ai' || T.rd[mg.id] <= 0 || r() > .5) continue; const m = mg.id; const f = E.FORMATIONS[mg.formation] || E.FORMATIONS['4-3-3'];
    const roster = T.roster[m].map(id => T.players[id]); const base = xiValue(roster, f); let best = null;
    for (const fid of T.free) { const fp = T.players[fid]; for (const w of roster) { if (GRP(w.pos) !== GRP(fp.pos) || fp.o <= w.o) continue; const g = xiValue(roster.filter(p => p !== w).concat(fp), f) - base + (fp.o - w.o) * .15; if (g >= 2 && (!best || g > best.g)) best = { g, out: w.id, in: fid }; } }
    if (best) redraft(T, m, [best.out], [best.in]);
  }
}

// ---------- 대회 ----------
function roundRobin(ids, legs, r) {
  const a = r.shuffle(ids.slice()); if (a.length % 2) a.push(null); const n = a.length, rounds = [];
  for (let k = 0; k < n - 1; k++) { const ms = []; for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x == null || y == null) continue; ms.push((i === 0 ? k % 2 : (i + k) % 2) ? [y, x] : [x, y]); } rounds.push(ms); a.splice(1, 0, a.pop()); }
  if (legs === 2) { const m = rounds.length; for (let k = 0; k < m; k++) rounds.push(rounds[k].map(([h, a2]) => [a2, h])); }
  return rounds;
}
function seedOrder(n) { let o = [1]; while (o.length < n) { const m = o.length * 2 + 1; o = [].concat(...o.map(x => [x, m - x])); } return o; }
const KO_NAME = n => n === 2 ? '결승' : n === 4 ? '준결승' : n === 8 ? '8강' : `${n}강`;
function addDay(T, label, list, st, extra) { const day = T.days.length; const ids = []; for (const [h, a] of list) { const f = Object.assign({ i: T.fx.length, st, day, h, a, r: null }, extra || {}); T.fx.push(f); ids.push(f.i); } T.days.push({ label, fx: ids, st }); return ids; }
function compInit(T) {
  const cfg = T.cfg, r = sub(T, 'comp'); const ids = T.mgrs.map(m => m.id); T.fx = []; T.days = []; T.day = 0; T.ko = null; T.groups = null; T.champion = null; T.susp = {}; T.ycAcc = {};
  if (cfg.format === 'league') roundRobin(ids, cfg.legs, r).forEach((ms, k) => addDay(T, `${k + 1}라운드`, ms, 'L'));
  else if (cfg.format === 'swiss') roundRobin(ids, 1, r).slice(0, Math.min(cfg.k, cfg.n - 1)).forEach((ms, k) => addDay(T, `리그 페이즈 ${k + 1}차전`, ms, 'L'));
  else if (cfg.format === 'groups') {
    const sh = r.shuffle(ids.slice()); const G2 = cfg.n / 4; T.groups = []; for (let g = 0; g < G2; g++) T.groups.push(sh.slice(g * 4, g * 4 + 4));
    const per = T.groups.map(g => roundRobin(g, cfg.legs, r)); const nd = per[0].length;
    for (let k = 0; k < nd; k++) { const day = T.days.length; const idsF = []; per.forEach((rs, g) => { for (const [h, a] of rs[k]) { const f = { i: T.fx.length, st: 'G', day, g, h, a, r: null }; T.fx.push(f); idsF.push(f.i); } }); T.days.push({ label: `조별리그 ${k + 1}차전`, fx: idsF, st: 'G' }); }
  } else koStart(T, r.shuffle(ids.slice()));
}
function koStart(T, order) { T.ko = { size: order.length, rounds: [] }; koRound(T, order); }
function koRound(T, order) { const n = order.length; const ms = []; for (let i = 0; i < n; i += 2) ms.push([order[i], order[i + 1]]); const ids = addDay(T, KO_NAME(n), ms, 'K', { ko: 1, kr: T.ko.rounds.length, n: n === 2 ? 1 : 0 }); T.ko.rounds.push(ids); }
const GL = i => String.fromCharCode(65 + i);
function tableOf(T, ids, filt) {
  const row = {}; for (const id of ids) row[id] = { m: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [], xgf: 0, xga: 0 };
  for (const f of T.fx) { if (!f.r || f.ko || (filt && !filt(f)) || !row[f.h] || !row[f.a]) continue; const H = row[f.h], A = row[f.a], hs = f.r.score[0], as = f.r.score[1];
    H.p++; A.p++; H.gf += hs; H.ga += as; A.gf += as; A.ga += hs; H.xgf += f.r.xg[0]; H.xga += f.r.xg[1]; A.xgf += f.r.xg[1]; A.xga += f.r.xg[0];
    if (hs > as) { H.w++; A.l++; H.pts += 3; H.form.push('W'); A.form.push('L'); } else if (hs < as) { A.w++; H.l++; A.pts += 3; H.form.push('L'); A.form.push('W'); } else { H.d++; A.d++; H.pts++; A.pts++; H.form.push('D'); A.form.push('D'); } }
  return Object.values(row).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || (hash(T.seed + 'tb' + a.m) - hash(T.seed + 'tb' + b.m)));
}
function standings(T) { if (T.groups) return T.groups.map((g, i) => ({ name: GL(i) + '조', rows: tableOf(T, g, f => f.st === 'G' && f.g === i) })); if (T.cfg.format === 'ko') return []; return [{ name: T.cfg.format === 'swiss' ? '리그 페이즈' : '리그', rows: tableOf(T, T.mgrs.map(m => m.id), f => f.st === 'L') }]; }
function qualLine(T) { return T.cfg.format === 'swiss' ? Math.min(T.cfg.q, T.cfg.n) : T.cfg.format === 'groups' ? 2 : 0; }
function dayStarted(T) { const d = T.days[T.day]; return !!d && d.fx.some(i => T.fx[i].r); }
function dayDone(T) { const d = T.days[T.day]; return !d || d.fx.every(i => T.fx[i].r); }
function nextFixtureOf(T, m) { const d = T.days[T.day]; if (!d) return null; for (const i of d.fx) { const f = T.fx[i]; if (!f.r && (f.h === m || f.a === m)) return f; } return null; }
const winnerOf = f => f.r ? (f.r.w === 0 ? f.h : f.r.w === 1 ? f.a : null) : null;
// 하루(라운드)가 끝나면 다음 단계로. 반환: 'next' | 'ko'(토너먼트 대진 생성) | 'done'
function advance(T) {
  if (!dayDone(T) || T.phase !== 'play') return null;
  const cur = T.days[T.day]; T.day++; aiRedraft(T);
  if (T.day < T.days.length) return 'next';
  const cfg = T.cfg;
  if (cur.st === 'L' && cfg.format === 'league') return finish(T, standings(T)[0].rows[0].m);
  if (cur.st === 'L') { const rows = standings(T)[0].rows.slice(0, qualLine(T)).map(x => x.m); const so = seedOrder(rows.length); koStart(T, so.map(s => rows[s - 1])); news(T, 'ko', `리그 페이즈 종료 — 상위 ${rows.length}팀이 토너먼트에 진출했습니다.`); return 'ko'; }
  if (cur.st === 'G') { const st = standings(T); const G2 = st.length; const order = []; for (let g = 0; g < G2; g += 2) order.push(st[g].rows[0].m, st[g + 1].rows[1].m); for (let g = 0; g < G2; g += 2) order.push(st[g + 1].rows[0].m, st[g].rows[1].m); koStart(T, order); news(T, 'ko', '조별리그 종료 — 각 조 1·2위가 토너먼트에 진출했습니다.'); return 'ko'; }
  const ws = cur.fx.map(i => winnerOf(T.fx[i])); if (ws.length === 1) return finish(T, ws[0]);
  koRound(T, ws); return 'ko';
}
function finish(T, m) { T.champion = m; T.phase = 'done'; T.ended = Date.now(); news(T, 'champ', `${T.mgrs[m].team.name} 우승!`); return 'done'; }
function news(T, type, text) { (T.news = T.news || []).unshift({ type, text, day: T.day || 0 }); if (T.news.length > 60) T.news.length = 60; }
function alive(T, m) { if (T.phase === 'done') return T.champion === m; if (!T.ko) return true; const last = T.ko.rounds[T.ko.rounds.length - 1]; return last.some(i => { const f = T.fx[i]; return (f.h === m || f.a === m) && (!f.r || winnerOf(f) === m); }); }

// ---------- 경기 ----------
function suspendedSet(T, m) { const s = new Set(); if (!T.susp) return s; for (const id of T.roster[m]) if (T.susp[id] > 0) s.add(id); return s; }
function fxSeed(T, f) { return (hash(T.seed + ':fx:' + f.i) ^ 0x5bd1e995) >>> 0; }
// 엔진에 넘길 경기 작업 (워커·메인 공용). 사용자 전술 변경 사항은 changes로 함께 반환
function buildJob(T, f) {
  const H = matchSetup(T, f.h), A = matchSetup(T, f.a);
  return { job: { seed: fxSeed(T, f), neutral: !!f.n, big: !!f.ko, home: teamOf(T, f.h), away: teamOf(T, f.a), hs: H.setup, as: A.setup }, changes: [H.changes, A.changes] };
}
function poisson(r, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
// 토너먼트 무승부 → 연장전(통계 모델) → 승부차기
function resolveKO(T, f, res) {
  const r = sub(T, 'ko' + f.i); res.w = res.score[0] > res.score[1] ? 0 : res.score[0] < res.score[1] ? 1 : -1; if (res.w >= 0) return res;
  const on = s => res.players.filter(p => p.side === s && !p.off && !p.red).map(p => T.players[p.id]).filter(Boolean);
  const et = [0, 0]; for (const s of [0, 1]) { const lam = clamp(res.xg[s] / 90 * 30 * .95, .12, 1.1); et[s] = poisson(r, lam); }
  res.s90 = res.score.slice(); res.et = et; res.score = [res.score[0] + et[0], res.score[1] + et[1]];
  for (const s of [0, 1]) { const ps = on(s).filter(p => p.pos !== 'GK'); for (let k = 0; k < et[s]; k++) { const wts = ps.map(p => Math.pow(Math.max(20, p.stats.finishing + p.stats.positioning) / 100, 4)); let x = r() * wts.reduce((a, b) => a + b, 0), sc = ps[0]; for (let i = 0; i < ps.length; i++) { x -= wts[i]; if (x <= 0) { sc = ps[i]; break; } } if (!sc) continue; res.goals.push({ side: s, min: String(91 + r.int(30)), id: sc.id, name: sc.name, own: false, et: 1, ast: null, xg: null }); const pr = res.players.find(p => p.id === sc.id); if (pr) pr.g++; } }
  res.goals.sort((a, b) => parseInt(a.min) - parseInt(b.min));
  if (res.score[0] !== res.score[1]) { res.w = res.score[0] > res.score[1] ? 0 : 1; return res; }
  const tk = s => on(s).sort((a, b) => b.stats.penalties - a.stats.penalties); const gk = s => { const g = on(s).find(p => p.pos === 'GK'); return g ? (g.stats.gkDiving + g.stats.gkReflexes) / 2 : 60; };
  const T2 = [tk(0), tk(1)], K = [gk(1), gk(0)]; const pen = [0, 0], log = []; let i = 0;
  const kick = s => { const p = T2[s][i % Math.max(1, T2[s].length)]; const pr = clamp(.76 + ((p ? p.stats.penalties : 60) - 70) * .004 - (K[s] - 75) * .004, .5, .93); const ok = r() < pr; if (ok) pen[s]++; log.push({ s, id: p ? p.id : null, name: p ? p.name : '', ok }); };
  for (; i < 5; i++) { kick(0); if (pen[0] + (4 - i) < pen[1] || pen[1] + (5 - i) < pen[0]) break; kick(1); if (pen[1] + (4 - i) < pen[0] || pen[0] + (4 - i) < pen[1]) break; }
  i = 5; while (pen[0] === pen[1] && i < 40) { kick(0); kick(1); i++; }
  if (pen[0] === pen[1]) pen[r.int(2)]++;
  res.pen = pen; res.penLog = log; res.w = pen[0] > pen[1] ? 0 : 1; return res;
}
// 경기 결과 기록. res: fullSummary 결과. rp: 다시 보기용 { hs, as, ops }
function applyResult(T, f, res, rp) {
  if (f.r) return f.r; res = JSON.parse(JSON.stringify(res));
  if (f.ko) resolveKO(T, f, res); else res.w = res.score[0] > res.score[1] ? 0 : res.score[0] < res.score[1] ? 1 : -1;
  if (rp) res.rp = rp;
  // 출전 정지: 이 경기에 걸려 있던 정지는 소화, 새 퇴장·경고 누적 반영
  if (T.cfg.susp) { for (const m of [f.h, f.a]) for (const id of T.roster[m]) if (T.susp[id] > 0) { T.susp[id]--; if (!T.susp[id]) delete T.susp[id]; }
    for (const p of res.players) { if (p.red) T.susp[p.id] = (T.susp[p.id] || 0) + 1; else if (p.yc) { T.ycAcc[p.id] = (T.ycAcc[p.id] || 0) + p.yc; if (T.ycAcc[p.id] >= 3) { T.ycAcc[p.id] -= 3; T.susp[p.id] = (T.susp[p.id] || 0) + 1; } } } }
  f.r = res; T._stats = null; return res;
}
function resultText(T, f) { const r = f.r; if (!r) return ''; return `${T.mgrs[f.h].team.name} ${r.score[0]}-${r.score[1]} ${T.mgrs[f.a].team.name}${r.et ? ' (연장)' : ''}${r.pen ? ` · 승부차기 ${r.pen[0]}-${r.pen[1]}` : ''}`; }

// 경기 전체 기록 요약 (엔진 경기 객체 M → 저장용). 워커와 메인 스레드 공용
function fullSummary(M) {
  const base = E.summary(M); const idOf = pid => { const p = M.pidList[pid]; return p ? p.d.id : null; };
  const xgBy = {}; for (const s of M.shotLog) { const id = idOf(s.p); xgBy[id] = (xgBy[id] || 0) + s.xg; }
  const evs = M.events; const minAt = f => { let m = ''; for (const e of evs) { if (e.frame > f + 40) break; m = e.min; } return m; };
  const tot = Math.max(1, M.teams[0].st.poss + M.teams[1].st.poss);
  const players = M.pidList.filter(p => p.r.min > 0).map(p => ({ id: p.d.id, side: p.side, code: p.code, num: p.num, start: !p.subbedIn, off: !!p.subbedOff, min: Math.min(p.subbedIn || p.subbedOff || p.sentOff ? 120 : 90, Math.round(p.r.min)), g: p.r.goals, a: p.r.ast, sh: p.r.shots, sot: p.r.sot, xg: +(xgBy[p.d.id] || 0).toFixed(2), kp: p.r.kp, ps: p.r.pass, pk: Math.min(p.r.pass, p.r.passOk), tkl: p.r.tkl, tkw: p.r.tklW, int: p.r.int, sav: p.r.sav, fl: p.r.foul, drb: p.r.drb, yc: p.yc, red: !!p.sentOff, rt: p.r.rating, dist: +(p.dist / 1000).toFixed(1) }));
  const motm = players.filter(p => p.min > 10).sort((a, b) => b.rt - a.rt)[0];
  return {
    score: base.score, xg: base.xg, poss: Math.round(M.teams[0].st.poss / tot * 100),
    st: M.teams.map(T => { const s = T.st; return { sh: s.shots, sot: s.sot, ps: s.passes, pk: s.passOk, tkl: s.tackles, tkw: s.tackleWon, fl: s.fouls, co: s.corners, off: s.offsides, yc: s.yellow, rc: s.red, sav: s.saves, int: s.inter }; }),
    goals: base.goals.map(g => ({ side: g.side, min: g.min, id: g.id, name: g.name, own: g.own, sp: g.sp, ast: g.ast, xg: g.xg, st: g.st, dist: g.dist })),
    cards: base.cards.map(c => ({ side: c.side, min: c.min, id: c.id, name: c.name, type: c.type })),
    subs: evs.filter(e => e.type === 'sub').map(e => ({ side: e.side, min: e.min, in: idOf(e.pid), out: idOf(e.outPid) })),
    shots: M.shotLog.map(s => ({ s: s.s, p: idOf(s.p), x: +s.x.toFixed(1), y: +s.y.toFixed(1), xg: +s.xg.toFixed(2), o: s.out, t: s.type, m: minAt(s.f) })),
    players, motm: motm ? motm.id : null,
    form: M.teams.map(T => E.formLabel(E.slotsOf(T.setup))), xi: M.teams.map(T => T.all.filter(p => !p.subbedIn).sort((a, b) => a.slot - b.slot).map(p => [p.d.id, p.slot]))
  };
}

// ---------- 기록 집계 ----------
const PKEYS = ['min', 'g', 'a', 'sh', 'sot', 'xg', 'kp', 'ps', 'pk', 'tkl', 'tkw', 'int', 'sav', 'fl', 'drb', 'yc', 'dist'];
function stats(T) {
  if (T._stats) return T._stats;
  const P = {}, TM = T.mgrs.map(m => ({ m: m.id, p: 0, gf: 0, ga: 0, xg: 0, xga: 0, sh: 0, sot: 0, ps: 0, pk: 0, poss: 0, tkl: 0, tkw: 0, int: 0, fl: 0, co: 0, off: 0, yc: 0, rc: 0, cs: 0, sav: 0 }));
  for (const f of T.fx) { const r = f.r; if (!r) continue;
    [f.h, f.a].forEach((m, s) => { const t = TM[m], st = r.st[s]; t.p++; t.gf += r.score[s]; t.ga += r.score[1 - s]; t.xg += r.xg[s]; t.xga += r.xg[1 - s]; t.poss += s === 0 ? r.poss : 100 - r.poss; for (const k of ['sh', 'sot', 'ps', 'pk', 'tkl', 'tkw', 'int', 'fl', 'co', 'off', 'yc', 'rc', 'sav']) t[k] += st[k] || 0; if (!r.score[1 - s]) t.cs++; });
    for (const p of r.players) { const m = p.side === 0 ? f.h : f.a; const o = P[p.id] || (P[p.id] = { id: p.id, m, apps: 0, sub: 0, rs: 0, rn: 0, motm: 0, rc: 0, cs: 0, best: 0, log: [] }); for (const k of PKEYS) o[k] = (o[k] || 0) + (p[k] || 0); if (p.start) o.apps++; else o.sub++; if (p.red) o.rc++; if (p.min >= 10) { o.rs += p.rt; o.rn++; } if (p.rt > o.best) o.best = p.rt; if (r.motm === p.id) o.motm++; if (p.code === 'GK' && p.min >= 60 && !r.score[1 - p.side]) o.cs++; o.m = m; o.log.push([f.i, p]); }
  }
  for (const id in P) { const o = P[id]; o.avg = o.rn ? o.rs / o.rn : 0; o.gp = o.apps + o.sub; }
  return (T._stats = { P, TM });
}
// 라운드 베스트 11 (4-3-3)
const TOTW_SHAPE = [['GK', ['GK'], 1], ['DEF', ['CB', 'LB', 'RB', 'LWB', 'RWB'], 4], ['MID', ['DM', 'CM', 'AM', 'LM', 'RM'], 3], ['ATT', ['LW', 'RW', 'ST'], 3]];
function bestXI(T, dayIdx) {
  const rows = []; if (dayIdx == null) { const S2 = stats(T).P; const minApps = Math.max(1, Math.floor(Math.max(...Object.values(S2).map(o => o.gp), 1) * .5)); for (const id in S2) { const o = S2[id], p = T.players[id]; if (!p || o.rn < minApps) continue; rows.push({ id, m: o.m, rt: o.avg, code: p.pos }); } }
  else for (const i of T.days[dayIdx].fx) { const f = T.fx[i]; if (!f.r) continue; for (const p of f.r.players) if (p.min >= 45) rows.push({ id: p.id, m: p.side === 0 ? f.h : f.a, rt: p.rt, code: p.code, g: p.g, a: p.a }); }
  const used = new Set(); const out = [];
  for (const [line, codes, n] of TOTW_SHAPE) { const c = rows.filter(x => codes.includes(x.code) && !used.has(x.id)).sort((a, b) => b.rt - a.rt).slice(0, n); for (const x of c) { used.add(x.id); out.push(Object.assign({ line }, x)); } }
  return out;
}
function awards(T) {
  const S2 = stats(T).P; const arr = Object.values(S2).filter(o => T.players[o.id]); const top = (f, min) => arr.filter(o => !min || o.rn >= min).sort((a, b) => f(b) - f(a))[0] || null;
  const mx = Math.max(1, ...arr.map(o => o.gp)); const need = Math.max(1, Math.floor(mx * .5));
  return { scorer: top(o => o.g * 1000 + o.a - o.min / 1e4), assist: top(o => o.a * 1000 + o.g), mvp: top(o => o.avg, need), keeper: top(o => (T.players[o.id].pos === 'GK' ? 1 : -1) * (o.cs * 100 + o.avg), need), xi: bestXI(T, null) };
}

// ---------- 새 대회 ----------
function newTournament(cfg, db, seed) {
  cfg = JSON.parse(JSON.stringify(cfg)); const F = FORMATS[cfg.format];
  if (!F.sizes.includes(cfg.n)) cfg.n = F.sizes.reduce((b, x) => Math.abs(x - cfg.n) < Math.abs(b - cfg.n) ? x : b, F.sizes[0]);
  if (cfg.format === 'swiss') { cfg.k = clamp(cfg.k, 2, cfg.n - 1); const qs = [2, 4, 8, 16].filter(q => q < cfg.n); cfg.q = qs.includes(cfg.q) ? cfg.q : qs[qs.length - 1]; }
  cfg.squad = clamp(cfg.squad, 14, 20); if (cfg.pool.ovrMin > cfg.pool.ovrMax) [cfg.pool.ovrMin, cfg.pool.ovrMax] = [cfg.pool.ovrMax, cfg.pool.ovrMin];
  const T = { v: 1, id: 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), seed: seed || ((Math.random() * 2 ** 31) | 0), created: Date.now(), cfg, name: cfg.name || `${F.n} ${cfg.n}팀`, phase: 'draft', setups: {}, news: [], fx: [], days: [], day: 0 };
  T.mgrs = makeManagers(T);
  const pool = buildPool(T, db); T.poolInfo = { short: pool.short, real: pool.nReal, total: Object.keys(pool.players).length };
  draftInit(T, pool);
  return T;
}
// 지난 대회 보관용 요약
function archiveOf(T) {
  const aw = awards(T); const nm = o => o && T.players[o.id] ? { name: T.players[o.id].name, team: T.mgrs[o.m].team.short, g: o.g, a: o.a, avg: +o.avg.toFixed(2), cs: o.cs } : null;
  const st = standings(T); const me = T.mgrs.findIndex(m => m.ctrl !== 'ai'); let place = null; if (st.length === 1 && T.cfg.format === 'league') place = st[0].rows.findIndex(x => x.m === me) + 1;
  const mine = T.fx.filter(f => f.r && (f.h === me || f.a === me)); let w = 0, d = 0, l = 0; for (const f of mine) { const s = f.h === me ? 0 : 1; if (f.r.score[s] > f.r.score[1 - s] || (f.r.pen && f.r.w === s)) w++; else if (f.r.score[s] === f.r.score[1 - s] && !f.r.pen) d++; else l++; }
  return { id: T.id, name: T.name, format: T.cfg.format, n: T.cfg.n, draftMode: T.cfg.draftMode, ended: T.ended || Date.now(), champion: T.mgrs[T.champion].team.name, champMine: T.champion === me, myTeam: T.mgrs[me].team.name, place, rec: [w, d, l], scorer: nm(aw.scorer), assist: nm(aw.assist), mvp: nm(aw.mvp) };
}

G.DXC = { FORMATS, DRAFT_MODES, POOL_PRESETS, DEFAULT_CFG, STYLES, GL, KO_NAME, GRP, SLOT_G, rngOf, realIndex, leaguesOf, poolPreview, buildPool, newTournament, makeManagers, teamOf, teamFromIds, assignNumbers, xiValue, bestRole, aiSetup, repairSetup, userSetup, matchSetup, teamRating, draftInit, draftOptions, draftPick, draftAdvance, draftAuto, draftGrades, needs, fcOffer, fcCode, fcSeq, snakeWho, setIdx, canRedraft, redraft, aiRedraft, compInit, standings, tableOf, qualLine, dayStarted, dayDone, nextFixtureOf, winnerOf, advance, alive, suspendedSet, fxSeed, buildJob, applyResult, resolveKO, resultText, fullSummary, stats, bestXI, awards, archiveOf, news };
})(typeof window !== 'undefined' ? window : globalThis);
