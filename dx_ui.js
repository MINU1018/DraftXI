// ===== DRAFT XI — 화면 1: 저장, 공용 부품, 홈(대회 없음), 새 대회 설정, 드래프트 룸 =====
(function (G) {
'use strict';
const TL = G.TL, C = G.DXC, D = G.FMDATA, E = G.FMEngine;
if (!TL || !C) return;
const { h, $, S, modal, closeModal, toast, seg, sel, ovrClass, ink, confirmBox } = TL;
const ME = 0;
const LOGO = G.TC_LOGOPACK || {}, FLAG = G.TC_FLAGS || {};
const U = G.DXU = { ME, cfg: null, d: { pos: '', q: '', sort: 'o', team: ME, feed: [], fast: false, tab: 'opt', page: 0 }, fixDay: null, statKey: 'g', statTab: 'player', sqTeam: ME, tblTab: 'table', run: null };
let SAVE = { v: 1, cur: null, archive: [] }, loaded = false;
const T = () => SAVE.cur;

// ---------- 저장 (IndexedDB, 안 되면 localStorage) ----------
const IDB = 'draftxi-save';
function idb() { return new Promise((res, rej) => { try { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
async function idbGet(k) { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction('kv', 'readonly').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(k, v) { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); }
const ser = () => JSON.stringify(SAVE, (k, v) => k === '_stats' ? undefined : v);
let saveT = null, where = 'idb';
function persist() { clearTimeout(saveT); saveT = setTimeout(async () => { const txt = ser(); try { await idbPut('save', txt); where = 'idb'; } catch (e) { try { localStorage.setItem('draftxi.save.v1', txt); where = 'ls'; } catch (e2) { toast('저장하지 못했습니다. 설정에서 백업 파일을 만들어 두세요.'); } } }, 350); }
async function load() { let txt = null; try { txt = await idbGet('save'); } catch (e) { } if (!txt) try { txt = localStorage.getItem('draftxi.save.v1'); } catch (e) { } if (txt) try { const o = JSON.parse(txt); if (o && o.v === 1) SAVE = o; } catch (e) { } loaded = true; }

// ---------- 공용 부품 ----------
const GRPCOL = { GK: 'gk', CB: 'df', FB: 'df', DM: 'mf', CM: 'mf', AM: 'mf', W: 'fw', ST: 'fw' };
const posTag = pos => h('span', { class: 'dx-pos ' + (GRPCOL[C.GRP(pos)] || 'mf') }, TL.posLabel(pos));
const ovrB = (o, big) => h('span', { class: 'dx-ovr ' + (o >= 85 ? 'o5' : o >= 80 ? 'o4' : o >= 74 ? 'o3' : o >= 67 ? 'o2' : 'o1') + (big ? ' big' : '') }, o);
const flag = code => FLAG[code] ? h('img', { class: 'dx-flag', src: FLAG[code], alt: '', loading: 'lazy' }) : h('span', { class: 'dx-flag none' });
const crest = (id, cls) => LOGO[id] ? h('img', { class: 'dx-crest ' + (cls || ''), src: LOGO[id], alt: '', loading: 'lazy' }) : null;
function badge(team, cls) { if (team.club && LOGO[team.club]) return h('span', { class: 'dx-badge img ' + (cls || '') }, h('img', { src: LOGO[team.club], alt: '' })); return h('span', { class: 'dx-badge ' + (cls || ''), style: { background: `linear-gradient(135deg, ${team.color1} 0 58%, ${team.color2} 58% 100%)`, color: ink(team.color1) } }, h('span', null, team.short)); }
const rtCls = v => v >= 8 ? 'r9' : v >= 7 ? 'r7' : v >= 6 ? 'r6' : v > 0 ? 'r5' : 'r0';
const rt = v => h('span', { class: 'dx-rt ' + rtCls(v || 0) }, v ? v.toFixed(1) : '-');
function faces(p) {
  const s = p.stats, a = (...k) => Math.round(k.reduce((x, y) => x + s[y], 0) / k.length);
  return p.pos === 'GK' ? [['DIV', s.gkDiving], ['HAN', s.gkHandling], ['KIC', s.gkKicking], ['REF', s.gkReflexes], ['POS', s.gkPositioning], ['SPD', a('pace', 'accel')]]
    : [['PAC', a('pace', 'accel')], ['SHO', a('finishing', 'shotPower', 'longShots')], ['PAS', a('shortPass', 'longPass', 'vision', 'crossing')], ['DRI', a('dribbling', 'ballControl', 'agility')], ['DEF', a('marking', 'standTackle', 'interceptions')], ['PHY', a('strength', 'stamina', 'jumping')]];
}
const archName = p => { const a = E.archsOf(p, p.pos)[0]; return a ? a.n : ''; };
const altPos = p => TL.fluentOf(p).split(', ').filter(x => x !== TL.posLabel(p.pos)).join(' ');
const pname = (p, cls) => TL.pl(p.name, p.id, cls);
const teamName = m => T().mgrs[m].team.name;
function panel(title, right, ...body) { return h('section', { class: 'dx-panel' }, title || right ? h('div', { class: 'dx-ph' }, h('h3', null, title || ''), right || null) : null, h('div', { class: 'dx-pb' }, ...body)); }
function playerMeta(p) { return h('span', { class: 'dx-meta' }, flag(p.bio && p.bio.natCode), p.age != null ? `${p.age}세` : '', p.club ? crest(p.club, 'sm') : null, h('span', { class: 'dim' }, p.gen ? '가상' : (p.clubName || ''))); }

// ---------- 홈 (진행 중인 대회 없음) ----------
function viewLanding() {
  const w = h('div', { class: 'wrap dx-home' });
  w.append(h('div', { class: 'dx-hero' },
    h('div', null, h('div', { class: 'lbl' }, 'TOUCHLINE × ROAD TO LEGEND'), h('h1', null, 'DRAFT ', h('em', null, 'XI')),
      h('p', null, '선수 풀을 정하고, 드래프트로 팀을 꾸리고, 전술을 짜서 대회를 치릅니다. 복잡한 시즌 운영 없이 팀 빌딩과 경기만 남겼습니다.'),
      h('div', { class: 'row', style: { marginTop: '20px' } }, h('button', { class: 'btn primary lg', onclick: () => TL.go('m_new') }, '새 대회 만들기'))),
    h('div', { class: 'dx-feat' },
      ...[['드래프트 3종', '셔플(세트 넘기기) · 스네이크 · 포지션 5지선다'], ['대회 4종', '리그 · 토너먼트 · 조별리그 · 리그 페이즈'], ['선수 풀 설정', '실존(FC27) · 가상 · 혼합, 능력치·나이·리그 범위'], ['경기 엔진', '능력치 기반 확률 판정, 3D/2D 관전, FM식 전술·세트피스'], ['기록', '경기별 슈팅맵·xG·평점, 대회 개인/팀 순위'], ['재드래프트', '대회 도중 선수 교체로 약점 보완']].map(([a, b]) => h('div', { class: 'f' }, h('b', null, a), h('span', null, b))))));
  if (SAVE.archive.length) w.append(panel('지난 대회', null, archiveList()));
  return w;
}
function archiveList() {
  return h('div', { class: 'dx-tscroll' }, h('table', { class: 'dx-table' }, h('thead', null, h('tr', null, ...['대회', '형식', '우승', '내 성적', '득점왕', 'MVP', ''].map(x => h('th', null, x)))),
    h('tbody', null, ...SAVE.archive.map((a, i) => h('tr', null, h('td', null, h('b', null, a.name), h('div', { class: 'dim' }, new Date(a.ended).toLocaleDateString('ko-KR'))), h('td', null, `${C.FORMATS[a.format].n} · ${a.n}팀`), h('td', null, a.champMine ? h('span', { class: 'dx-chip gold' }, '🏆 ' + a.champion) : a.champion),
      h('td', { class: 'num' }, `${a.rec[0]}승 ${a.rec[1]}무 ${a.rec[2]}패${a.place ? ` · ${a.place}위` : ''}`), h('td', null, a.scorer ? `${a.scorer.name} (${a.scorer.g}골)` : '-'), h('td', null, a.mvp ? `${a.mvp.name} (${a.mvp.avg})` : '-'),
      h('td', null, h('button', { class: 'btn sm ghost', title: '기록 삭제', onclick: () => confirmBox('이 대회 기록을 삭제할까요?', () => { SAVE.archive.splice(i, 1); persist(); TL.render(); }) }, '삭제')))))));
}

// ---------- 새 대회 설정 ----------
const TOP5 = ['ENG1', 'ESP1', 'ITA1', 'GER1', 'FRA1'];
function cfgNow() { if (!U.cfg) { let last = null; try { last = JSON.parse(localStorage.getItem('draftxi.lastcfg') || 'null'); } catch (e) { } const def = C.DEFAULT_CFG(); U.cfg = last ? Object.assign(def, last, { pool: Object.assign(def.pool, last.pool || {}), me: Object.assign(def.me, last.me || {}) }) : def; } return U.cfg; }
function viewNew() {
  const cfg = cfgNow(), pc = cfg.pool; const rr = () => TL.render(true);
  const w = h('div', { class: 'wrap dx-new' });
  w.append(h('div', { class: 'dx-title' }, h('h1', null, '새 대회'), h('p', { class: 'hint' }, '형식 → 선수 풀 → 드래프트 방식 → 내 팀 순서로 정하면 바로 드래프트가 시작됩니다.')));
  const optCards = (opts, cur, on) => h('div', { class: 'dx-opts' }, ...opts.map(([k, o]) => h('button', { type: 'button', class: cur === k ? 'on' : '', 'aria-pressed': String(cur === k), onclick: () => on(k) }, h('b', null, o.n), h('span', null, o.d))));
  const line = (label, ctl, hint) => h('div', { class: 'dx-line' }, h('span', { class: 'lbl' }, label), h('div', { class: 'ctl' }, ctl, hint ? h('span', { class: 'hint' }, hint) : null));
  // 1. 형식
  const F = C.FORMATS[cfg.format]; if (!F.sizes.includes(cfg.n)) cfg.n = F.sizes.includes(8) ? 8 : F.sizes[0];
  const ai = cfg.n - 1; const body1 = [optCards(Object.entries(C.FORMATS), cfg.format, k => { cfg.format = k; rr(); }),
    line('감독 수', sel(F.sizes.map(n => [n, `${n}명 (나 + AI 감독 ${n - 1}명)`]), cfg.n, v => { cfg.n = +v; rr(); }, 'dx_n'), `상대 AI 감독 ${ai}명`)];
  if (cfg.format === 'league' || cfg.format === 'groups') body1.push(line('맞대결 횟수', seg([[1, '1번씩'], [2, '홈·원정 2번씩']], cfg.legs, v => { cfg.legs = v; rr(); })));
  if (cfg.format === 'swiss') { const ks = [3, 4, 5, 6, 8].filter(k => k < cfg.n); if (!ks.includes(cfg.k)) cfg.k = ks[ks.length - 1]; const qs = [2, 4, 8, 16].filter(q => q < cfg.n); if (!qs.includes(cfg.q)) cfg.q = qs[qs.length - 1];
    body1.push(line('팀당 경기 수', seg(ks.map(k => [k, `${k}경기`]), cfg.k, v => { cfg.k = v; rr(); })), line('토너먼트 진출', seg(qs.map(q => [q, `상위 ${q}팀`]), cfg.q, v => { cfg.q = v; rr(); }))); }
  const nMatch = cfg.format === 'league' ? (cfg.n - 1) * cfg.legs + (cfg.n % 2 ? cfg.legs : 0) : cfg.format === 'ko' ? Math.log2(cfg.n) : cfg.format === 'groups' ? 3 * cfg.legs + Math.log2(cfg.n / 2) : cfg.k + Math.log2(cfg.q);
  body1.push(h('p', { class: 'hint' }, `진행: 최대 ${Math.round(nMatch)}라운드. 토너먼트 경기는 단판이며 비기면 연장전·승부차기로 이어집니다.`));
  w.append(panel('1 · 대회 형식', null, ...body1));
  // 2. 선수 풀
  const prev = pc.src !== 'virtual' ? C.poolPreview(TL.db, pc) : null; const need = cfg.n * 20 * (cfg.draftMode === 'fc' ? 2 : 1) + Math.max(12, cfg.n * 3);
  const numIn = (v, on, mn, mx) => h('input', { type: 'number', class: 'dx-num', min: mn, max: mx, value: v, onchange: e => { on(Math.max(mn, Math.min(mx, +e.target.value || mn))); rr(); } });
  const lgs = C.leaguesOf(TL.db); const lgOn = id => pc.leagues && pc.leagues.includes(id);
  const lgBox = h('div', { class: 'dx-chips' }, h('button', { class: 'dx-chipbtn' + (!pc.leagues ? ' on' : ''), onclick: () => { pc.leagues = null; rr(); } }, '모든 리그'), h('button', { class: 'dx-chipbtn' + (pc.leagues && pc.leagues.length === 5 && TOP5.every(lgOn) ? ' on' : ''), onclick: () => { pc.leagues = TOP5.slice(); rr(); } }, '5대 리그'),
    ...lgs.map(l => h('button', { class: 'dx-chipbtn' + (lgOn(l.id) ? ' on' : ''), onclick: () => { const a = pc.leagues ? pc.leagues.slice() : []; const i = a.indexOf(l.id); if (i >= 0) a.splice(i, 1); else a.push(l.id); pc.leagues = a.length ? a : null; rr(); } }, l.name)));
  const body2 = [line('선수 종류', seg([['real', '실존 선수 (FC27)'], ['virtual', '가상 선수'], ['mixed', '혼합']], pc.src, v => { pc.src = v; rr(); }), pc.src === 'virtual' ? '이름·능력치를 새로 만든 선수만 나옵니다.' : pc.src === 'mixed' ? '실존과 가상이 절반씩 섞입니다.' : null),
    line('능력치 범위', h('div', { class: 'row' }, numIn(pc.ovrMin, v => pc.ovrMin = v, 40, 99), h('span', { class: 'dim' }, '~'), numIn(pc.ovrMax, v => pc.ovrMax = v, 40, 99), h('span', { class: 'hint' }, '종합 능력치(OVR)')),),
    h('div', { class: 'dx-chips' }, ...C.POOL_PRESETS.map(([k, n, o]) => h('button', { class: 'dx-chipbtn' + (pc.ovrMin === o.ovrMin && pc.ovrMax === o.ovrMax && pc.ageMin === (o.ageMin || 15) && pc.ageMax === (o.ageMax || 45) ? ' on' : ''), onclick: () => { Object.assign(pc, { ageMin: 15, ageMax: 45 }, o); rr(); } }, `${n} ${o.ovrMin}–${o.ovrMax}`))),
    line('나이 범위', h('div', { class: 'row' }, numIn(pc.ageMin, v => pc.ageMin = v, 15, 45), h('span', { class: 'dim' }, '~'), numIn(pc.ageMax, v => pc.ageMax = v, 15, 45), h('span', { class: 'hint' }, '세')))];
  if (pc.src !== 'virtual') { body2.push(h('div', { class: 'dx-line' }, h('span', { class: 'lbl' }, '리그'), h('div', { class: 'ctl' }, h('details', { class: 'dx-det', open: !!pc.leagues }, h('summary', null, pc.leagues ? `${pc.leagues.length}개 리그 선택` : '모든 리그 (눌러서 고르기)'), lgBox))));
    const minPos = Math.min(...['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].map(k => (prev.by[k] || 0) / ({ GK: 2, CB: 4, LB: 1.5, RB: 1.5, DM: 2, CM: 3, AM: 1.2, LW: 1.2, RW: 1.2, ST: 2.2 }[k] * need / 20)));
    const shortMsg = pc.src === 'real' && (prev.n < need || minPos < 1);
    body2.push(h('div', { class: 'dx-preview' + (shortMsg ? ' warn' : '') }, h('b', { class: 'num' }, prev.n.toLocaleString()), h('span', null, `명의 실존 선수가 조건에 맞습니다 · 필요한 풀 ${need}명`), h('span', { class: 'dim' }, ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].map(k => `${TL.posLabel(k)} ${prev.by[k] || 0}`).join(' · ')),
      shortMsg ? h('span', { class: 'bad' }, '일부 포지션의 실존 선수가 부족합니다. 모자란 자리는 같은 능력치 범위의 가상 선수로 채워집니다. 범위를 넓히면 실존 선수만으로 채울 수 있습니다.') : null)); }
  w.append(panel('2 · 선수 풀', null, ...body2));
  // 3. 드래프트
  w.append(panel('3 · 드래프트', null, optCards(Object.entries(C.DRAFT_MODES), cfg.draftMode, k => { cfg.draftMode = k; rr(); }),
    cfg.draftMode === 'shuffle' ? line('세트 구성', seg([['tier', '비슷한 능력치끼리'], ['random', '완전 무작위']], cfg.setMode, v => { cfg.setMode = v; rr(); }), cfg.setMode === 'tier' ? '한 세트 안의 선수는 능력치 차이가 4 이내입니다. 높은 세트와 낮은 세트가 모든 감독에게 차례로 돌아갑니다.' : '세트마다 풀 전체 범위의 선수가 섞여 나옵니다.') : cfg.draftMode === 'snake' ? h('p', { class: 'hint' }, '스네이크는 풀 전체가 공개되므로, 선수 간 격차는 위 2번의 능력치 범위로 조절합니다.') : null,
    line('스쿼드 크기', seg([14, 16, 18, 20].map(n => [n, `${n}명`]), cfg.squad, v => { cfg.squad = v; rr(); }), cfg.squad <= 14 ? '선발 11 + 교체 3. 포지션 공백이 없도록 신중히.' : '교체 선수는 경기당 최대 9명까지 벤치에 앉습니다.'),
    line('지명 제한 시간', seg([[0, '없음'], [30, '30초'], [60, '60초'], [90, '90초']], cfg.timer, v => { cfg.timer = v; rr(); }), '시간이 지나면 가장 알맞은 선수가 자동 지명됩니다.'),
    line('재드래프트', seg([0, 1, 2, 3, 5].map(n => [n, n ? `${n}회` : '없음']), cfg.redrafts, v => { cfg.redrafts = v; rr(); }), `라운드 사이에 한 번에 최대 ${cfg.redraftMax}명까지 자유 계약 선수와 교체합니다.`),
    line('AI 감독 지명 수준', seg([[0, '느슨하게'], [1, '보통'], [2, '날카롭게']], cfg.ai, v => { cfg.ai = v; rr(); }))));
  // 4. 팀
  const me = cfg.me; const txt = (v, on, ph, mx, wd) => h('input', { type: 'text', value: v, placeholder: ph, maxlength: mx, style: { width: wd || '220px' }, oninput: e => on(e.target.value) });
  if (U.meReal == null) U.meReal = true;
  const real = cfg.teamMode === 'real'; const CI = C.clubIndex(TL.db); const cById = id => CI.find(c => c.id === id); const allLg = TL.db.leagues.map(l => [l.id, l.name]);
  const fitIds = new Set(C.clubsFor(TL.db, cfg).map(c => c.id));
  const clubPick = (key, onPick, exclude, cur) => { const curC = cur && cById(cur); const lg = U[key] || (curC && curC.lg) || (pc.leagues && pc.leagues[0]) || 'ENG1'; const cl = CI.filter(c => c.lg === lg && !(exclude && exclude.has(c.id))).sort((a, b) => b.str - a.str);
    return h('div', { class: 'row' }, sel(allLg, lg, v => { U[key] = v; rr(); }, 'dx_' + key), sel([['', '구단 선택']].concat(cl.map(c => [c.id, `${c.name} · ${c.str}${fitIds.has(c.id) ? '' : ' (범위 밖)'}`])), curC && curC.lg === lg ? cur : '', v => { if (v) onPick(v); }, 'dx_' + key + 'c')); };
  const mc = real && me.club ? cById(me.club) : null; if (real && me.club && !mc) me.club = null;
  const teamBody = [line('팀 방식', seg([['real', '실제 구단'], ['virtual', '가상 구단']], cfg.teamMode, v => { cfg.teamMode = v; rr(); }), real ? '구단의 이름·색·엠블럼만 빌려 옵니다. 선수단은 드래프트로 새로 꾸립니다.' : '모든 팀이 가상의 이름과 색을 씁니다.')];
  if (real) teamBody.push(line('내 팀', seg([[true, '실제 구단 고르기'], [false, '직접 만들기']], !!me.club || !!U.meReal, v => { U.meReal = v; if (!v) me.club = null; rr(); })));
  if (real && (me.club || U.meReal)) teamBody.push(h('div', { class: 'dx-me' }, mc ? badge({ club: mc.id, short: mc.short, color1: mc.color1, color2: mc.color2 }, 'xl') : h('span', { class: 'dx-badge xl', style: { background: 'var(--panel3)' } }),
    h('div', { class: 'stack', style: { flex: 1, minWidth: '260px' } }, line('구단', clubPick('meLg', v => { me.club = v; rr(); }, null, me.club), mc ? `${mc.name} · ${mc.lgName} · 실제 전력 ${mc.str}` : '리그를 고른 뒤 구단을 선택하세요.'))));
  else teamBody.push(h('div', { class: 'dx-me' }, badge({ short: (me.short || 'MY').toUpperCase().slice(0, 4), color1: me.color1, color2: me.color2 }, 'xl'),
    h('div', { class: 'stack', style: { flex: 1, minWidth: '260px' } },
      line('팀 이름', txt(me.name, v => me.name = v, '팀 이름', 24)), line('약칭', txt(me.short, v => me.short = v, 'MY', 4, '90px'), '전광판에 표시 (영문 2~4자)'),
      line('유니폼 색', h('div', { class: 'row' }, h('input', { type: 'color', value: me.color1, onchange: e => { me.color1 = e.target.value; rr(); } }), h('input', { type: 'color', value: me.color2, onchange: e => { me.color2 = e.target.value; rr(); } }))))));
  if (real) { const need = cfg.n - 1; cfg.aiClubs = (cfg.aiClubs || []).filter(id => cById(id) && id !== me.club).slice(0, need); const ex = new Set(cfg.aiClubs.concat(me.club ? [me.club] : []));
    teamBody.push(line('상대 팀', seg([['auto', '자동 선택'], ['manual', '직접 지정']], cfg.aiPick, v => { cfg.aiPick = v; rr(); }), cfg.aiPick === 'auto' ? `능력치 범위(${pc.ovrMin}–${pc.ovrMax})에 맞는 실제 전력의 구단 ${fitIds.size}곳 중에서 무작위로 ${need}팀을 뽑습니다${pc.leagues ? ' (선택한 리그 안에서)' : ''}.` : `${cfg.aiClubs.length} / ${need}팀 지정 · 남는 자리는 자동으로 채워집니다.`));
    if (cfg.aiPick === 'manual') teamBody.push(line('구단 추가', cfg.aiClubs.length < need ? clubPick('aiLg', v => { cfg.aiClubs.push(v); rr(); }, ex) : h('span', { class: 'hint' }, '모든 자리를 지정했습니다.')),
      h('div', { class: 'dx-chips' }, ...cfg.aiClubs.map(id => { const c = cById(id); return h('button', { class: 'dx-chipbtn on', title: '눌러서 빼기', onclick: () => { cfg.aiClubs = cfg.aiClubs.filter(x => x !== id); rr(); } }, `${c.name} ${c.str} ✕`); }), cfg.aiClubs.length ? h('button', { class: 'dx-chipbtn', onclick: () => { cfg.aiClubs = []; rr(); } }, '모두 지우기') : null)); }
  teamBody.push(line('감독 이름', txt(me.mgr, v => me.mgr = v, '감독', 20)),
    line('기본 포메이션', sel(Object.keys(E.FORMATIONS).map(f => [f, f]), me.formation, v => { me.formation = v; rr(); }, 'dx_form'), '자동 지명과 5지선다의 자리 순서 기준입니다. 드래프트 후 전술 화면에서 자유롭게 바꿀 수 있습니다.'),
    line('대회 이름', txt(cfg.name, v => cfg.name = v, `${F.n} ${cfg.n}팀`, 30)),
    line('출전 정지', seg([[true, '적용'], [false, '없음']], cfg.susp, v => { cfg.susp = v; rr(); }), '퇴장 1경기, 경고 3장 누적 1경기'));
  w.append(panel('4 · 팀', null, ...teamBody));
  w.append(h('div', { class: 'dx-foot' }, T() ? h('span', { class: 'hint bad' }, '진행 중인 대회가 있습니다. 새로 시작하면 지금 대회는 사라집니다.') : h('span'), h('div', { class: 'row' }, T() ? h('button', { class: 'btn', onclick: () => TL.go('m_home') }, '취소') : null,
    h('button', { class: 'btn primary lg', onclick: () => { if (cfg.teamMode === 'real' && U.meReal && !cfg.me.club) return toast('내 구단을 선택하거나 \'직접 만들기\'로 바꿔 주세요.'); const go = () => startNew(cfg); if (T() && T().phase !== 'done') confirmBox('진행 중인 대회를 버리고 새 대회를 시작할까요?', go, '새 대회 시작'); else go(); } }, '드래프트 시작'))));
  return w;
}
function startNew(cfg) {
  try { localStorage.setItem('draftxi.lastcfg', JSON.stringify(cfg)); } catch (e) { }
  if (T() && T().phase === 'done') archiveCur();
  SAVE.cur = C.newTournament(cfg, TL.db);
  U.d = { pos: '', q: '', sort: 'o', team: ME, feed: [], fast: false, tab: 'opt', page: 0 }; U.fixDay = null; U.sqTeam = ME;
  persist(); TL.go('m_draft');
}
function archiveCur() { const t = T(); if (!t) return; if (t.phase === 'done' && !SAVE.archive.some(a => a.id === t.id)) { SAVE.archive.unshift(C.archiveOf(t)); if (SAVE.archive.length > 40) SAVE.archive.length = 40; } SAVE.cur = null; persist(); }

// ---------- 드래프트 룸 ----------
let aiTimer = null, pickTimer = null;
function pushFeed(picks) { for (const pk of picks || []) U.d.feed.unshift(pk); if (U.d.feed.length > 80) U.d.feed.length = 80; }
function afterUserPick() {
  const t = T(); const d = t.draft; clearInterval(pickTimer); U.d.deadline = null; U.d.page = 0;
  if (d.mode !== 'snake') pushFeed(C.draftAdvance(t)); else if (d.picks.length >= d.total) C.draftAdvance(t);
  persist(); if (t.draft.done) return draftDone(); TL.render(true);
}
function userPick(pid) { const t = T(); const pk = C.draftPick(t, ME, pid); if (!pk) return toast('지금은 이 선수를 지명할 수 없습니다.'); pushFeed([pk]); U.d.lastMine = pid; afterUserPick(); }
function autoPick() { const t = T(); const pk = C.draftAuto(t, ME); if (pk) { pushFeed([pk]); U.d.lastMine = pk.pid; afterUserPick(); } }
function aiTick() {
  clearTimeout(aiTimer); aiTimer = null; const t = T(); if (!t || t.phase !== 'draft' || t.draft.mode !== 'snake' || S.screen !== 'm_draft') return;
  if (t.draft.done || C.snakeWho(t) === ME) return;
  aiTimer = setTimeout(() => { aiTimer = null; const t2 = T(); if (!t2 || t2.phase !== 'draft' || S.screen !== 'm_draft') return; if (document.querySelector('.modal')) return aiTick(); pushFeed(C.draftAdvance(t2, U.d.fast ? 6 : 1)); persist(); if (t2.draft.done) return draftDone(); TL.render(true); }, U.d.fast ? 70 : 420);
}
function autoAll() {
  const t = T(); modal(h('div', { class: 'stack' }, h('h2', null, '자동 드래프트 진행 중'), h('div', { class: 'meter' }, h('i', { id: 'dxbar', style: { width: '0%' } }))), true);
  clearTimeout(aiTimer); clearInterval(pickTimer);
  const chunk = () => { const t0 = performance.now(); while (!t.draft.done && performance.now() - t0 < 40) { pushFeed(C.draftAdvance(t, 8)); if (t.draft.done) break; if (C.draftOptions(t, ME).length) { const pk = C.draftAuto(t, ME); if (pk) pushFeed([pk]); if (t.draft.mode !== 'snake' || t.draft.picks.length >= t.draft.total) pushFeed(C.draftAdvance(t, 8)); } }
    const b = $('#dxbar'); if (b) b.style.width = (t.draft.picks.length / t.draft.total * 100) + '%'; if (t.draft.done) { closeModal(); persist(); draftDone(); } else setTimeout(chunk, 0); };
  setTimeout(chunk, 20);
}
function draftDone() {
  const t = T(); clearTimeout(aiTimer); clearInterval(pickTimer); persist();
  const gr = C.draftGrades(t); const order = t.mgrs.map((m, i) => ({ i, r: C.teamRating(t, i), g: gr[i] })).sort((a, b) => b.r - a.r); const myRank = order.findIndex(x => x.i === ME) + 1;
  TL.go('m_home');
  modal(h('div', { class: 'stack dx-done' }, h('div', { class: 'lbl' }, 'DRAFT COMPLETE'), h('h2', null, '드래프트 완료'),
    h('p', null, `${t.cfg.n}명의 감독이 ${t.cfg.squad}명씩 지명을 마쳤습니다. 내 팀 선발 전력은 `, h('b', null, `${order.find(x => x.i === ME).r}`), ` — ${t.cfg.n}팀 중 ${myRank}위입니다.`),
    h('div', { class: 'dx-tscroll', style: { maxHeight: '300px' } }, h('table', { class: 'dx-table' }, h('thead', null, h('tr', null, ...['#', '팀', '감독', '전술 성향', '선발 전력', '최고의 지명'].map(x => h('th', null, x)))),
      h('tbody', null, ...order.map((o, k) => { const m = t.mgrs[o.i]; const b = o.g.best && t.players[o.g.best.pid]; return h('tr', { class: o.i === ME ? 'me' : '' }, h('td', { class: 'num' }, k + 1), h('td', null, h('span', { class: 'dx-team' }, badge(m.team, 'sm'), m.team.name)), h('td', null, m.name), h('td', null, m.ctrl === 'ai' ? `${C.STYLES[m.style].n} · ${m.formation}` : '나'), h('td', { class: 'num' }, o.r), h('td', null, b ? `${b.name} (${o.g.best.n + 1}번째, OVR ${b.o})` : '-')); })))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { closeModal(); TL.go('m_tactics'); } }, '전술 짜러 가기'), h('button', { class: 'btn', onclick: () => { closeModal(); TL.go('m_board'); } }, '드래프트 보드 보기'), h('button', { class: 'btn', onclick: closeModal }, '닫기'))), false, 'dxdone');
}
function pcard(p, opt) {
  opt = opt || {}; const bm = T().draft.bookmarks.includes(p.id);
  return h('div', { class: 'dx-pcard' + (opt.need ? ' need' : '') + (bm ? ' bm' : '') + (opt.flash ? ' flash' : '') },
    h('div', { class: 'hd' }, ovrB(p.o, true), h('div', { class: 'id' }, h('div', { class: 'nm' }, pname(p)), h('div', { class: 'sub' }, posTag(p.pos), altPos(p) ? h('span', { class: 'dim alt' }, altPos(p)) : null, opt.need ? h('span', { class: 'dx-chip gold' }, '필요 포지션') : null)), p.club ? crest(p.club) : null),
    playerMeta(p),
    h('div', { class: 'faces' }, ...faces(p).map(([k, v]) => h('div', null, h('span', { class: 'k' }, k), h('span', { class: 'v num ' + ovrClass(v) }, v)))),
    h('div', { class: 'arch dim' }, archName(p)),
    opt.pick ? h('div', { class: 'acts' }, h('button', { class: 'btn primary sm grow', onclick: () => opt.pick(p.id) }, '지명'), h('button', { class: 'btn sm' + (bm ? ' on' : ''), title: '관심 선수 표시', 'aria-pressed': String(bm), onclick: () => { const b = T().draft.bookmarks; const i = b.indexOf(p.id); if (i >= 0) b.splice(i, 1); else b.push(p.id); persist(); TL.render(true); } }, bm ? '★' : '☆')) : null);
}
function miniPitch(t, m, opt) {
  const mg = t.mgrs[m]; const slots = (opt && opt.slots) || E.FORMATIONS[mg.formation] || E.FORMATIONS['4-3-3']; const team = C.teamOf(t, m);
  const pick = E.autoPick(Object.assign({}, team, { players: team.players }), slots); const el = h('div', { class: 'dx-pitch' });
  slots.forEach((s, i) => { const p = team.players.find(x => x.id === pick.lineup[i]); const good = p && E.famLevel(p, s[0]) >= 2;
    el.append(h('div', { class: 'sl' + (p ? '' : ' empty') + (p && !good ? ' off' : '') + (opt && opt.hi === i ? ' hi' : ''), style: { left: (50 + s[2] * 42) + '%', top: (94 - s[1] * 92) + '%' } }, h('span', { class: 'c' }, p ? E.posRating(p, s[0]) : TL.posLabel(s[0])), h('span', { class: 'n' }, p ? TL.shortName(p.name) : '')));
  });
  return el;
}
function rosterList(t, m) {
  const ps = t.roster[m].map(id => t.players[id]); const ORD = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST']; ps.sort((a, b) => ORD.indexOf(a.pos) - ORD.indexOf(b.pos) || b.o - a.o);
  return h('div', { class: 'dx-rlist' }, ...ps.map(p => h('div', { class: 'r' }, posTag(p.pos), h('span', { class: 'n' }, pname(p)), flag(p.bio && p.bio.natCode), ovrB(p.o))), !ps.length ? h('div', { class: 'dim', style: { padding: '8px' } }, '아직 지명한 선수가 없습니다.') : null);
}
function viewDraft() {
  const t = T(); if (!t) return viewLanding(); if (t.phase !== 'draft') return G.DXU.viewBoard();
  const d = t.draft, cfg = t.cfg; const opts = C.draftOptions(t, ME); const myTurn = opts.length > 0; const N = C.needs(t, ME);
  const w = h('div', { class: 'wrap dx-draft' });
  const who = d.mode === 'snake' ? C.snakeWho(t) : null;
  const status = d.mode === 'snake' ? (myTurn ? '내 차례입니다' : `${t.mgrs[who].team.name} 지명 중…`) : d.mode === 'fc' ? `${TL.posLabel(C.fcOffer(t, ME).code)} 자리 후보 중 1명을 고르세요` : '세트에서 1명을 지명하세요';
  w.append(h('div', { class: 'dx-dhead' },
    h('div', null, h('div', { class: 'lbl' }, `${C.DRAFT_MODES[d.mode].n} · ${t.name}`), h('h2', null, d.mode === 'snake' ? `${Math.floor(d.turn / cfg.n) + 1}라운드 · 전체 ${d.picks.length + 1}번째 지명` : `${Math.min(cfg.squad, t.roster[ME].length + 1)} / ${cfg.squad} 라운드`), h('div', { class: 'st' + (myTurn ? ' on' : '') }, status)),
    h('div', { class: 'row' }, cfg.timer ? h('span', { class: 'dx-timer num', id: 'dxtimer' }, '') : null,
      d.mode === 'snake' ? h('label', { class: 'dx-check' }, h('input', { type: 'checkbox', checked: U.d.fast, onchange: e => { U.d.fast = e.target.checked; } }), ' AI 지명 빠르게') : null,
      h('button', { class: 'btn', disabled: !myTurn, onclick: autoPick, title: '팀 구성에 가장 알맞은 선수를 대신 지명' }, '자동 지명'),
      h('button', { class: 'btn', onclick: () => confirmBox('남은 지명을 모두 자동으로 진행할까요?', autoAll, '모두 자동') }, '남은 지명 모두 자동'))));
  const prog = h('div', { class: 'dx-prog' }, h('i', { style: { width: (d.picks.length / d.total * 100) + '%' } })); w.append(prog);
  // 왼쪽: 내 팀
  const fsel = sel(Object.keys(E.FORMATIONS).map(f => [f, f]), t.mgrs[ME].formation, v => { if (d.mode === 'fc' && t.roster[ME].length) return toast('5지선다 드래프트는 시작 후 포메이션을 바꿀 수 없습니다.'); t.mgrs[ME].formation = v; if (d.offer) delete d.offer[ME]; persist(); TL.render(true); }, 'dx_dform');
  const needChips = Object.keys(N.xi).map(g => { const hv = N.have[g] || 0; return h('span', { class: 'dx-chip ' + (hv < N.xi[g] ? 'bad' : hv >= N.target[g] ? 'good' : '') }, `${{ GK: 'GK', CB: 'CB', FB: '풀백', DM: 'DM', CM: 'CM', AM: 'AM', W: '윙', ST: 'ST' }[g] || g} ${hv}/${N.target[g]}`); });
  const left = panel('내 팀', h('span', { class: 'row' }, h('span', { class: 'dim' }, `${t.roster[ME].length}/${cfg.squad}`), fsel), miniPitch(t, ME, d.mode === 'fc' && myTurn ? { hi: t.roster[ME].length < 11 ? t.roster[ME].length : -1 } : null), h('div', { class: 'dx-chips', style: { margin: '10px 0' } }, ...needChips), rosterList(t, ME));
  // 가운데: 후보
  let mid;
  const needOf = p => t.roster[ME].length >= 6 && (N.have[C.GRP(p.pos)] || 0) < (N.xi[C.GRP(p.pos)] || 0);
  if (d.mode === 'snake') {
    const all = d.pool.map(id => t.players[id]); const f = U.d; const q = TL.fold(f.q || '');
    let list = all.filter(p => (!f.pos || (f.pos === '★' ? d.bookmarks.includes(p.id) : C.GRP(p.pos) === f.pos || p.pos === f.pos)) && (!q || TL.fold(p.name).includes(q) || TL.fold(p.clubName || '').includes(q)));
    list.sort((a, b) => f.sort === 'age' ? a.age - b.age : f.sort === 'o' ? b.o - a.o : (b.stats[f.sort] || 0) - (a.stats[f.sort] || 0));
    const per = 24, pages = Math.max(1, Math.ceil(list.length / per)); f.page = Math.min(f.page, pages - 1);
    mid = panel(`선수 풀 · ${all.length}명 남음`, h('div', { class: 'row' }, h('input', { type: 'search', placeholder: '이름·구단 검색', value: f.q, style: { width: '150px' }, onchange: e => { f.q = e.target.value; f.page = 0; TL.render(true); } }), sel([['o', '능력치순'], ['age', '어린 순'], ['pace', '속력'], ['finishing', '골 결정력'], ['shortPass', '패스'], ['dribbling', '드리블'], ['standTackle', '태클'], ['strength', '몸싸움']], f.sort, v => { f.sort = v; f.page = 0; TL.render(true); }, 'dx_sort')),
      h('div', { class: 'dx-chips' }, ...[['', '전체'], ['GK', 'GK'], ['CB', 'CB'], ['FB', '풀백'], ['DM', 'DM'], ['CM', 'CM'], ['AM', 'AM'], ['W', '윙'], ['ST', 'ST'], ['★', '★ 관심']].map(([k, l]) => h('button', { class: 'dx-chipbtn' + (f.pos === k ? ' on' : ''), onclick: () => { f.pos = k; f.page = 0; TL.render(true); } }, l))),
      h('div', { class: 'dx-cards' }, ...list.slice(f.page * per, f.page * per + per).map(p => pcard(p, { pick: myTurn ? userPick : null, need: needOf(p) }))),
      !list.length ? h('p', { class: 'dim' }, '조건에 맞는 선수가 없습니다.') : null,
      pages > 1 ? h('div', { class: 'row dx-pager' }, h('button', { class: 'btn sm', disabled: f.page === 0, onclick: () => { f.page--; TL.render(true); } }, '이전'), h('span', { class: 'dim num' }, `${f.page + 1} / ${pages}`), h('button', { class: 'btn sm', disabled: f.page >= pages - 1, onclick: () => { f.page++; TL.render(true); } }, '다음')) : null);
  } else {
    const ps = opts.map(id => t.players[id]).sort((a, b) => (d.bookmarks.includes(b.id) - d.bookmarks.includes(a.id)) || b.o - a.o);
    const os = ps.map(p => p.o); const title = d.mode === 'fc' ? `${TL.posLabel(C.fcOffer(t, ME).code)} 후보 ${ps.length}명` : `세트 ${C.setIdx(t, ME) + 1} · 능력치 ${Math.min(...os)}–${Math.max(...os)} · ${ps.length}명 남음`;
    mid = panel(title, d.mode === 'shuffle' ? h('span', { class: 'hint' }, `지명 후 세트는 ${t.mgrs[(ME + 1) % cfg.n].team.short}에게 넘어가고, ${t.mgrs[(ME - 1 + cfg.n) % cfg.n].team.short}의 세트를 받습니다.`) : null,
      h('div', { class: 'dx-cards' + (d.mode === 'fc' ? ' five' : '') }, ...ps.map(p => pcard(p, { pick: userPick, need: needOf(p), flash: true }))));
  }
  // 오른쪽: 지명 현황
  const feed = h('div', { class: 'dx-feed' }, ...U.d.feed.slice(0, 40).map(pk => { const p = t.players[pk.pid], m = t.mgrs[pk.m]; return p ? h('div', { class: 'f' + (pk.m === ME ? ' me' : '') }, h('span', { class: 'no num' }, pk.n + 1), badge(m.team, 'xs'), h('span', { class: 'n' }, pname(p), h('span', { class: 'dim' }, ` ${m.team.short}`)), posTag(p.pos), ovrB(p.o)) : null; }), !U.d.feed.length ? h('div', { class: 'dim', style: { padding: '8px' } }, '아직 지명 기록이 없습니다.') : null);
  const tv = U.d.team; const others = sel(t.mgrs.map(m => [m.id, `${m.team.name}${m.id === ME ? ' (나)' : ''} · ${t.roster[m.id].length}명`]), tv, v => { U.d.team = +v; TL.render(true); }, 'dx_tv');
  const right = h('div', { class: 'stack' },
    panel('지명 현황', h('div', { class: 'seg' }, ...[['feed', '최근 지명'], ['teams', '팀별 명단']].map(([k, l]) => h('button', { 'aria-pressed': String((U.d.rt || 'feed') === k), onclick: () => { U.d.rt = k; TL.render(true); } }, l))),
      (U.d.rt || 'feed') === 'feed' ? feed : h('div', { class: 'stack' }, others, h('div', { class: 'hint' }, t.mgrs[tv].ctrl === 'ai' ? `${t.mgrs[tv].name} 감독 · ${C.STYLES[t.mgrs[tv].style].n} · ${t.mgrs[tv].formation}` : '내 팀'), rosterList(t, tv))),
    d.mode === 'snake' ? panel('지명 순서', null, h('div', { class: 'dx-order' }, ...(() => { const out = []; for (let k = 0; k < Math.min(cfg.n + 2, d.total - d.turn); k++) { const tt = d.turn + k, rd = Math.floor(tt / cfg.n), i = tt % cfg.n; const m = d.order[rd % 2 ? cfg.n - 1 - i : i]; out.push(h('span', { class: 'o' + (m === ME ? ' me' : '') + (k === 0 ? ' now' : '') }, t.mgrs[m].team.short)); } return out; })())) : null);
  w.append(h('div', { class: 'dx-dgrid' }, left, mid, right));
  // 타이머
  clearInterval(pickTimer);
  if (cfg.timer && myTurn) { if (!U.d.deadline) U.d.deadline = Date.now() + cfg.timer * 1000; const tick = () => { const e = $('#dxtimer'); const left2 = Math.max(0, Math.ceil((U.d.deadline - Date.now()) / 1000)); if (e) { e.textContent = `⏱ ${left2}초`; e.classList.toggle('low', left2 <= 10); } if (left2 <= 0) { clearInterval(pickTimer); if (S.screen === 'm_draft' && !document.querySelector('.modal')) autoPick(); else U.d.deadline = Date.now() + 5000; } }; pickTimer = setInterval(tick, 250); setTimeout(tick, 0); }
  if (d.mode === 'snake' && !myTurn) setTimeout(aiTick, 0);
  return w;
}

Object.assign(U, { T, SAVE: () => SAVE, setSave: s => { SAVE = s; }, persist, load, isLoaded: () => loaded, where: () => where, ser, posTag, ovrB, flag, crest, badge, rt, rtCls, faces, archName, altPos, pname, teamName, panel, playerMeta, viewLanding, viewNew, viewDraft, archiveCur, archiveList, miniPitch, rosterList, pcard });
})(window);
