// ===== 경기 엔진: 모든 판정은 능력치 기반 확률로 처리 =====
(function (G) {
const D = G.FMDATA;
const EN_K = .026;
const HM_W = 24, HM_H = 16;
const DT = 0.1, HL = 52.5, HW = 34, GW = 3.66, GH = 2.44, GRAV = 9.81, BR = 0.11;
const BOX_X = HL - 16.5, BOX_Y = 20.16, SIX_X = HL - 5.5;
const sig = x => 1 / (1 + Math.exp(-x));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = (a, b, c) => c === undefined ? Math.sqrt(a * a + b * b) : Math.sqrt(a * a + b * b + c * c);
function RNG(seed) {
  let s = (seed >>> 0) || 88172645;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  r.gauss = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  r.pick = a => a[Math.floor(r() * a.length)];
  return r;
}

// ---------- 역할 / 포메이션 ----------
// 공 소유 시 역할(ROLES)과 공 미소유 시 역할(DROLES)을 자리마다 따로 고름.
// g: 쓸 수 있는 포지션 그룹, d: 한 줄 설명, k: 주요 능력치, tr: 어울리는 플레이 성향. 나머지는 경기 엔진이 읽는 움직임·판단 계수
const ROLES = {
  gk: { n: '골키퍼', g: ['GK'], d: '위험한 패스를 피하고 안정적으로 볼을 처리합니다.', k: ['gkHandling', 'gkPositioning', 'reactions'], tr: '위험한 패스 자제' },
  bpg: { n: '볼 플레잉 골키퍼', g: ['GK'], gkd: 'short', d: '짧은 패스로 후방 빌드업의 출발점이 됩니다.', k: ['shortPass', 'ballControl', 'vision', 'gkKicking'], tr: '짧은 패스 위주 · 역습 시 빠른 스로인' },
  nng: { n: '노 넌센스 골키퍼', g: ['GK'], gkd: 'long', d: '압박을 받으면 길게 걷어냅니다.', k: ['gkKicking', 'longPass', 'strength'], tr: '위험한 패스 자제 · 멀리 차내기' },
  cd: { n: '중앙 수비수', g: ['CB'], d: '간결한 패스로 안정감을 줍니다.', k: ['shortPass', 'reactions', 'marking'] },
  bpd: { n: '볼 플레잉 수비수', g: ['CB'], risk: .5, carry: .3, d: '전방 침투 패스를 넣고 빌드업을 주도합니다.', k: ['shortPass', 'longPass', 'vision', 'dribbling', 'ballControl'], tr: '긴 패스 시도 · 공을 몰고 전진' },
  nnc: { n: '노 넌센스 센터백', g: ['CB'], risk: -.6, d: '빌드업을 생략하고 공을 멀리 걷어냅니다.', k: ['heading', 'jumping', 'strength'], tr: '위험한 패스 자제' },
  wcb: { n: '와이드 센터백', g: ['CB'], wide: 1.35, fwd: .04, carry: .3, d: '3백에서 측면으로 넓게 벌려 빌드업과 오버래핑을 돕습니다.', k: ['crossing', 'dribbling', 'pace', 'stamina'], tr: '측면으로 빠져나감 · 공을 몰고 전진' },
  lib: { n: '리베로', g: ['CB'], fwd: .12, carry: .4, risk: .4, d: '수비 라인에서 미드필드까지 전진해 수적 우위를 만듭니다.', k: ['shortPass', 'vision', 'stamina', 'reactions'], tr: '공을 몰고 전진 · 원투 패스 시도' },
  ocb: { n: '오버래핑 센터백', g: ['CB'], fwd: .2, wide: 1.6, cross: .4, d: '측면을 따라 최전방까지 오버래핑합니다.', k: ['positioning', 'pace', 'stamina', 'crossing'], tr: '기회 될 때마다 전진' },
  fb: { n: '풀백', g: ['FB', 'WB'], fwd: .07, d: '공격과 수비의 균형을 맞추는 안정적인 측면 수비수입니다.', k: ['shortPass', 'crossing', 'stamina', 'reactions'] },
  wb: { n: '윙백', g: ['FB', 'WB'], fwd: .2, cross: .5, wide: 1.05, d: '터치라인을 따라 높게 전진해 측면 공격에 가담합니다.', k: ['crossing', 'dribbling', 'pace', 'stamina'], tr: '터치라인을 따라 돌파' },
  cwb: { n: '완성형 윙백', g: ['WB', 'FB'], fwd: .28, cross: .6, drib: .4, wide: 1.08, d: '측면 공격을 주도하며 돌파와 크로스를 모두 맡습니다.', k: ['crossing', 'dribbling', 'pace', 'accel', 'stamina'], tr: '터치라인을 따라 돌파 · 기회 될 때마다 전진' },
  awb: { n: '어드밴스드 윙백', g: ['WB', 'FB'], fwd: .36, cross: .7, drib: .5, wide: 1.1, d: '거의 윙어처럼 높은 위치에서 뜁니다.', k: ['crossing', 'dribbling', 'pace', 'accel', 'positioning'], tr: '기회 될 때마다 전진' },
  ifb: { n: '인사이드 풀백', g: ['FB'], fwd: 0, hold: .02, inside: .6, d: '공격 시 중앙으로 좁혀 들어와 3백을 만듭니다.', k: ['shortPass', 'reactions', 'marking', 'interceptions'], tr: '중앙으로 파고듦' },
  iwb: { n: '인버티드 윙백', g: ['FB', 'WB'], fwd: .13, inside: .6, risk: .2, d: '측면에서 중앙 미드필드로 들어와 중원 수적 우위를 돕습니다.', k: ['shortPass', 'vision', 'ballControl', 'positioning'], tr: '중앙으로 파고듦 · 짧은 패스 위주' },
  pwb: { n: '플레이메이킹 윙백', g: ['WB', 'FB'], fwd: .16, inside: .25, pm: 1, risk: .5, d: '측면과 하프스페이스에서 창의적인 패스로 기회를 만듭니다.', k: ['vision', 'shortPass', 'agility', 'longPass'], tr: '킬패스 자주 시도' },
  dm: { n: '수비형 미드필더', g: ['DM'], d: '후방에서 볼을 순환시키는 기본 역할입니다.', k: ['shortPass', 'reactions', 'interceptions'] },
  dlp: { n: '딥라잉 플레이메이커', g: ['DM', 'CM'], pm: 1, risk: .5, d: '후방에서 넓은 시야와 패스로 템포를 조율합니다.', k: ['shortPass', 'longPass', 'vision', 'ballControl', 'reactions'], tr: '경기 템포 조절 · 긴 패스 시도' },
  hb: { n: '하프백', g: ['DM'], hold: .05, split: 1, d: '빌드업 때 두 센터백 사이로 내려와 3백을 만듭니다.', k: ['shortPass', 'reactions', 'marking', 'interceptions'], tr: '공을 받으러 깊숙이 내려옴' },
  anc: { n: '앵커', g: ['DM'], hold: .07, risk: -.3, d: '위치를 고수하며 후방의 안전한 패스 선택지가 됩니다.', k: ['reactions', 'shortPass', 'marking'], tr: '위험한 패스 자제 · 짧은 패스 위주' },
  reg: { n: '레지스타', g: ['DM'], pm: 1, risk: .7, roam: .25, d: '후방에서 자유롭게 움직이며 공격적인 패스로 경기를 지배합니다.', k: ['agility', 'vision', 'shortPass', 'longPass', 'positioning'], tr: '킬패스 자주 시도 · 공을 받으러 내려옴' },
  rpm: { n: '로밍 플레이메이커', g: ['DM', 'CM'], pm: 1, roam: .35, carry: .4, fwd: .06, d: '경기장 전역을 누비며 공을 받고 전진시킵니다.', k: ['stamina', 'positioning', 'shortPass', 'dribbling'], tr: '공을 몰고 전진' },
  vol: { n: '세군도 볼란테', g: ['DM'], fwd: .17, shoot: .3, d: '수비형 미드필더 자리에서 박스 안까지 늦게 침투합니다.', k: ['positioning', 'stamina', 'finishing', 'longShots', 'shortPass'], tr: '페널티 박스 안으로 침투' },
  cm: { n: '중앙 미드필더', g: ['CM'], d: '패스와 침투를 균형 있게 수행합니다.', k: ['shortPass', 'ballControl', 'reactions', 'stamina'] },
  b2b: { n: '박스 투 박스 미드필더', g: ['CM'], fwd: .12, shoot: .2, d: '빌드업부터 박스 침투까지 넓게 뜁니다.', k: ['stamina', 'positioning', 'shortPass', 'finishing', 'standTackle'], tr: '페널티 박스 안으로 침투' },
  mp: { n: '미드필드 플레이메이커', g: ['CM'], pm: 1, risk: .5, d: '중원에서 결정적인 패스를 찔러줍니다.', k: ['vision', 'shortPass', 'ballControl', 'agility'], tr: '킬패스 자주 시도' },
  ap: { n: '어드밴스드 플레이메이커', g: ['CM', 'AM'], pm: 1, risk: .6, roam: .3, fwd: .04, d: '상대 수비와 미드필드 사이에서 공격을 지휘합니다.', k: ['vision', 'shortPass', 'agility', 'ballControl', 'reactions'], tr: '킬패스 자주 시도 · 원투 패스 시도' },
  mez: { n: '채널 미드필더', g: ['CM', 'AM'], fwd: .12, out: .3, drib: .4, d: '풀백과 센터백 사이 하프스페이스로 빠져나갑니다.', k: ['positioning', 'dribbling', 'accel', 'shortPass', 'longShots'], tr: '측면으로 빠져나감 · 기회 될 때마다 전진' },
  car: { n: '카릴레로', g: ['CM'], out: .22, hold: .02, d: '중원과 측면 사이를 오가며 측면 오버래핑의 빈자리를 메웁니다.', k: ['stamina', 'shortPass', 'reactions', 'interceptions'] },
  am: { n: '공격형 미드필더', g: ['AM'], fwd: .05, shoot: .3, d: '최전방과 중원 사이에서 패스 연계와 중거리 슈팅을 맡습니다.', k: ['shortPass', 'longShots', 'ballControl', 'reactions'] },
  ss: { n: '섀도 스트라이커', g: ['AM'], fwd: .14, run: 1, shoot: .4, d: '공격수 뒤에서 박스 안으로 쇄도해 득점을 노립니다.', k: ['finishing', 'positioning', 'accel', 'reactions', 'ballControl'], tr: '페널티 박스 안으로 침투 · 오프사이드 트랩 깨기' },
  fr: { n: '프리 롤', g: ['AM'], roam: .45, pm: 1, risk: .6, drib: .4, d: '공격 진영 전역을 자유롭게 누비며 창의성을 발휘합니다.', k: ['agility', 'vision', 'positioning', 'dribbling'], tr: '빈 공간으로 이동 · 킬패스 자주 시도' },
  wng: { n: '윙어', g: ['W'], wide: 1.1, cross: .8, drib: .4, d: '터치라인을 따라 돌파한 뒤 크로스를 올립니다.', k: ['pace', 'accel', 'dribbling', 'crossing'], tr: '터치라인을 따라 돌파 · 크로스 자주 시도' },
  inw: { n: '인버티드 윙어', g: ['W'], inside: .6, risk: .4, drib: .3, d: '측면에서 중앙으로 치고 들어오며 패스와 슈팅을 연계합니다.', k: ['dribbling', 'shortPass', 'vision', 'accel', 'longShots'], tr: '안쪽으로 파고듦 (반대발 추천)' },
  inf: { n: '인사이드 포워드', g: ['W'], inside: .45, shoot: .6, drib: .5, run: .6, d: '대각선으로 박스 안을 파고들어 직접 득점을 노립니다.', k: ['finishing', 'positioning', 'dribbling', 'accel', 'reactions'], tr: '안쪽으로 파고듦 · 페널티 박스 안으로 침투' },
  wp: { n: '와이드 플레이메이커', g: ['W'], pm: 1, inside: .5, risk: .5, d: '측면에서 중앙으로 좁혀 들어와 경기를 조율합니다.', k: ['vision', 'shortPass', 'agility', 'ballControl'], tr: '킬패스 자주 시도 · 중앙으로 파고듦' },
  wtf: { n: '와이드 타깃 포워드', g: ['W'], target: 1, hold: .02, d: '측면에서 공중볼을 따내고 공을 지켜 연계합니다.', k: ['jumping', 'heading', 'strength', 'balance'], tr: '등지고 공을 지킴' },
  raum: { n: '라움도이터', g: ['W'], run: 1, inside: .35, shoot: .5, roam: .2, d: '수비의 빈 공간을 찾아 침투해 득점 기회를 잡습니다.', k: ['positioning', 'interceptions', 'finishing', 'reactions'], tr: '오프사이드 트랩 깨기 · 페널티 박스 안으로 침투' },
  af: { n: '어드밴스드 포워드', g: ['ST'], run: 1, shoot: .3, d: '최전방에서 뒷공간을 침투하며 공격의 선봉에 섭니다.', k: ['pace', 'accel', 'finishing', 'positioning', 'dribbling'], tr: '오프사이드 트랩 깨기' },
  cf: { n: '컴플리트 포워드', g: ['ST'], shoot: .3, target: .5, drop: .04, d: '피지컬·기술·연계·마무리를 모두 갖춘 올라운드 공격수입니다.', k: ['finishing', 'heading', 'dribbling', 'shortPass', 'strength', 'positioning'] },
  tm: { n: '타깃 포워드', g: ['ST'], target: 1, hold: .03, d: '피지컬과 제공권으로 공을 지켜내고 동료에게 연결합니다.', k: ['jumping', 'heading', 'strength', 'balance'], tr: '등지고 공을 지킴 · 공중볼 경합 선호' },
  dlf: { n: '딥라잉 포워드', g: ['ST'], drop: .1, pm: 1, risk: .2, d: '미드필드로 내려와 공을 받아주고 2선 침투를 돕습니다.', k: ['shortPass', 'vision', 'ballControl', 'strength'], tr: '공을 받으러 깊숙이 내려옴 · 원투 패스 시도' },
  poa: { n: '포처', g: ['ST'], run: 1, shoot: .6, d: '박스 안에서 오프사이드 라인을 깨뜨리며 마무리에만 집중합니다.', k: ['finishing', 'positioning', 'reactions', 'accel'], tr: '오프사이드 트랩 깨기 · 원터치 슛 선호' },
  f9: { n: '폴스 나인', g: ['ST'], drop: .14, pm: 1, risk: .4, d: '깊숙이 내려와 센터백을 끌어내고 2선 공간과 킬패스를 만듭니다.', k: ['vision', 'shortPass', 'dribbling', 'agility', 'reactions'], tr: '공을 받으러 깊숙이 내려옴 · 킬패스 자주 시도' },
  chf: { n: '채널 포워드', g: ['ST'], run: 1, out: .4, d: '중앙과 측면 사이 채널로 빠져나가 수비 간격을 벌립니다.', k: ['positioning', 'pace', 'accel', 'dribbling', 'crossing'], tr: '측면으로 빠져나감' },
  // 이전 버전 저장 파일 호환용 (목록에는 나오지 않음)
  sk: { n: '스위퍼 키퍼', g: ['GK'], sweep: 1, old: ['gk', 'swk'] }, stp: { n: '스토퍼', g: ['CB'], press: .6, old: ['cd', 'stc'] }, bwm: { n: '볼위닝 미드필더', g: ['DM', 'CM'], press: .8, old: ['cm', 'pcm'] },
  eng: { n: '엔간체', g: ['AM'], pm: 1, hold: .04, press: -.5, old: ['ap', 'oam'] }, wm: { n: '와이드 미드필더', g: ['W'], wide: 1, hold: .04, press: .3, old: ['wng', 'tw'] }, pf: { n: '프레싱 포워드', g: ['ST'], press: .9, old: ['af', 'pfw'] }
};
// 공 미소유 시 역할. press: 압박 적극성, up/back: 블록보다 앞/뒤에 머무는 정도, wcov: 공 쪽 측면으로 쏠려 커버, line: 수비 라인까지 내려옴, split: 측면으로 벌려 대기
const DROLES = {
  lhg: { n: '라인 홀딩 골키퍼', g: ['GK'], sweep: 0, d: '골문 안을 지키는 정통 스타일입니다.', k: ['gkReflexes', 'gkDiving', 'gkPositioning'] },
  swk: { n: '스위퍼 키퍼', g: ['GK'], sweep: 1, d: '수비 뒷공간을 적극적으로 커버합니다.', k: ['reactions', 'pace', 'accel', 'gkPositioning'], tr: '골문을 자주 비움' },
  cbd: { n: '센터백', g: ['CB'], d: '수비 라인을 지키며 자기 구역을 맡습니다.', k: ['marking', 'standTackle', 'heading'] },
  stc: { n: '스토핑 센터백', g: ['CB'], press: .6, up: .015, d: '라인 앞으로 튀어나가 상대 공격수를 강하게 저지합니다.', k: ['aggression', 'standTackle', 'strength', 'slideTackle'], tr: '태클 시 몸을 날림' },
  cvc: { n: '커버링 센터백', g: ['CB'], back: .025, press: -.3, d: '수비 라인 뒤 공간을 지키며 스루패스를 차단합니다.', k: ['pace', 'accel', 'interceptions', 'marking'], tr: '태클 시 서서 버팀' },
  hfb: { n: '홀딩 풀백', g: ['FB', 'WB'], press: -.2, d: '전진을 자제하고 수비 간격을 유지하며 측면을 지킵니다.', k: ['marking', 'interceptions', 'reactions'] },
  pfb: { n: '프레싱 풀백', g: ['FB', 'WB'], press: .6, up: .03, d: '높은 위치부터 상대 측면 자원을 강하게 압박합니다.', k: ['aggression', 'stamina', 'standTackle', 'accel'], tr: '상대를 강하게 압박' },
  twb: { n: '트래킹 윙백', g: ['WB', 'FB'], back: .05, d: '자기 진영 깊숙이 복귀해 측면 수비에 가담합니다.', k: ['stamina', 'interceptions', 'pace'] },
  sdm: { n: '스크리닝 수비형 미드필더', g: ['DM'], press: -.3, d: '위치를 지키며 패스 길목을 막고 수비진을 보호합니다.', k: ['marking', 'interceptions', 'reactions'] },
  pdm: { n: '프레싱 수비형 미드필더', g: ['DM'], press: .8, d: '중원에서 상대를 강하게 압박해 공을 빼앗습니다.', k: ['standTackle', 'aggression', 'stamina'], tr: '상대를 강하게 압박' },
  wdm: { n: '와이드 커버링 수비형 미드필더', g: ['DM'], wcov: .3, d: '풀백이 전진해 비운 측면 공간을 메웁니다.', k: ['pace', 'stamina', 'interceptions'] },
  ddm: { n: '드로핑 수비형 미드필더', g: ['DM'], line: 1, press: -.3, d: '센터백 라인으로 내려와 수비 숫자를 늘립니다.', k: ['heading', 'jumping', 'marking'] },
  scm: { n: '스크리닝 중앙 미드필더', g: ['CM'], press: -.2, d: '중원 간격을 유지하며 패스 경로를 차단합니다.', k: ['interceptions', 'marking', 'reactions'] },
  pcm: { n: '프레싱 중앙 미드필더', g: ['CM'], press: .8, d: '공 가진 상대를 집요하게 추격합니다.', k: ['stamina', 'aggression', 'standTackle'] },
  wcm: { n: '와이드 커버링 중앙 미드필더', g: ['CM'], wcov: .3, d: '측면 수비 뒷공간을 커버합니다.', k: ['stamina', 'pace', 'interceptions'] },
  tw: { n: '트래킹 윙어', g: ['W'], back: .1, d: '자기 진영 깊숙이 복귀해 풀백을 돕습니다.', k: ['stamina', 'marking', 'interceptions'] },
  pw: { n: '프레싱 윙어', g: ['W'], press: .7, up: .03, d: '상대 풀백과 센터백의 빌드업을 전방에서 압박합니다.', k: ['aggression', 'stamina', 'accel'] },
  ow: { n: '와이드 아웃렛 윙어', g: ['W'], up: .15, press: -.6, d: '수비 가담을 줄이고 전방 측면에 남아 역습 경로가 됩니다.', k: ['pace', 'accel', 'positioning'], tr: '역습 시 전방 대기' },
  iow: { n: '인사이드 아웃렛 윙어', g: ['W'], up: .15, press: -.6, narrow: .5, d: '수비 가담을 줄이고 전방 중앙 쪽에 남아 역습을 기다립니다.', k: ['pace', 'accel', 'positioning', 'finishing'], tr: '역습 시 전방 대기' },
  tam: { n: '트래킹 공격형 미드필더', g: ['AM'], back: .08, d: '중원까지 내려와 미드필드 수 싸움에 가담합니다.', k: ['stamina', 'interceptions', 'reactions'] },
  pam: { n: '프레싱 공격형 미드필더', g: ['AM'], press: .7, d: '상대 수비형 미드필더를 집중적으로 압박합니다.', k: ['aggression', 'stamina', 'interceptions'] },
  oam: { n: '중앙 아웃렛 공격형 미드필더', g: ['AM'], up: .12, press: -.6, d: '전방 중앙에 머물며 역습 때 볼을 배급합니다.', k: ['vision', 'shortPass', 'pace', 'positioning'] },
  tcf: { n: '트래킹 센터 포워드', g: ['ST'], back: .08, d: '중원 라인까지 내려와 수비 블록을 만듭니다.', k: ['stamina', 'reactions', 'interceptions'] },
  pfw: { n: '프레싱 포워드', g: ['ST'], press: .9, d: '최전방에서 상대 센터백과 골키퍼를 쉴 새 없이 압박합니다.', k: ['aggression', 'stamina', 'accel'], tr: '상대를 강하게 압박' },
  cof: { n: '중앙 아웃렛 포워드', g: ['ST'], up: .04, press: -.7, d: '최전방 중앙에 남아 역습 때 긴 패스를 받아 마무리합니다.', k: ['pace', 'accel', 'positioning', 'finishing'] },
  sof: { n: '측면 아웃렛 포워드', g: ['ST'], up: .04, press: -.7, split: .4, d: '풀백과 센터백 사이로 벌려 서서 역습 때 뒷공간을 노립니다.', k: ['pace', 'accel', 'dribbling', 'positioning'], tr: '측면으로 빠져나감' }
};
const DEFAULT_DROLE = { GK: 'lhg', CB: 'cbd', FB: 'hfb', WB: 'twb', DM: 'sdm', CM: 'scm', W: 'tw', AM: 'tam', ST: 'tcf' };
const SLOT_GROUP = { GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'WB', RWB: 'WB', DM: 'DM', CM: 'CM', AM: 'AM', LM: 'W', RM: 'W', LW: 'W', RW: 'W', ST: 'ST' };
const FORMATIONS = {
  '4-4-2': [['GK', .03, 0, 'gk'], ['LB', .22, -.8, 'fb'], ['CB', .18, -.28, 'cd'], ['CB', .18, .28, 'cd'], ['RB', .22, .8, 'fb'], ['LM', .5, -.8, 'wm'], ['CM', .45, -.22, 'b2b'], ['CM', .45, .22, 'cm'], ['RM', .5, .8, 'wng'], ['ST', .8, -.18, 'af'], ['ST', .8, .18, 'tm']],
  '4-3-3': [['GK', .03, 0, 'gk'], ['LB', .22, -.8, 'fb'], ['CB', .18, -.28, 'cd'], ['CB', .18, .28, 'cd'], ['RB', .22, .8, 'wb'], ['DM', .35, 0, 'anc'], ['CM', .5, -.38, 'b2b'], ['CM', .5, .38, 'mez'], ['LW', .76, -.72, 'inf'], ['ST', .84, 0, 'af'], ['RW', .76, .72, 'wng']],
  '4-2-3-1': [['GK', .03, 0, 'gk'], ['LB', .22, -.8, 'fb'], ['CB', .18, -.28, 'cd'], ['CB', .18, .28, 'cd'], ['RB', .22, .8, 'fb'], ['DM', .37, -.24, 'dlp'], ['DM', .37, .24, 'bwm'], ['LW', .66, -.72, 'inf'], ['AM', .65, 0, 'am'], ['RW', .66, .72, 'wng'], ['ST', .85, 0, 'af']],
  '4-1-2-1-2': [['GK', .03, 0, 'gk'], ['LB', .22, -.8, 'wb'], ['CB', .18, -.28, 'cd'], ['CB', .18, .28, 'cd'], ['RB', .22, .8, 'wb'], ['DM', .34, 0, 'anc'], ['CM', .48, -.4, 'b2b'], ['CM', .48, .4, 'mez'], ['AM', .64, 0, 'ap'], ['ST', .82, -.18, 'af'], ['ST', .82, .18, 'pf']],
  '4-5-1': [['GK', .03, 0, 'gk'], ['LB', .22, -.8, 'fb'], ['CB', .18, -.28, 'cd'], ['CB', .18, .28, 'cd'], ['RB', .22, .8, 'fb'], ['LM', .52, -.8, 'wm'], ['CM', .46, -.32, 'b2b'], ['DM', .38, 0, 'dlp'], ['CM', .46, .32, 'cm'], ['RM', .52, .8, 'wm'], ['ST', .82, 0, 'tm']],
  '3-5-2': [['GK', .03, 0, 'gk'], ['CB', .18, -.48, 'cd'], ['CB', .16, 0, 'cd'], ['CB', .18, .48, 'bpd'], ['LWB', .46, -.86, 'wb'], ['DM', .36, 0, 'dlp'], ['CM', .5, -.3, 'b2b'], ['CM', .5, .3, 'mez'], ['RWB', .46, .86, 'wb'], ['ST', .8, -.18, 'af'], ['ST', .8, .18, 'tm']],
  '3-4-3': [['GK', .03, 0, 'gk'], ['CB', .18, -.48, 'cd'], ['CB', .16, 0, 'cd'], ['CB', .18, .48, 'cd'], ['LWB', .46, -.86, 'wb'], ['CM', .44, -.22, 'b2b'], ['CM', .44, .22, 'dlp'], ['RWB', .46, .86, 'wb'], ['LW', .76, -.6, 'inf'], ['ST', .84, 0, 'af'], ['RW', .76, .6, 'inf']],
  '5-3-2': [['GK', .03, 0, 'gk'], ['LWB', .27, -.86, 'wb'], ['CB', .18, -.45, 'cd'], ['CB', .16, 0, 'cd'], ['CB', .18, .45, 'cd'], ['RWB', .27, .86, 'wb'], ['CM', .46, -.36, 'b2b'], ['DM', .4, 0, 'anc'], ['CM', .46, .36, 'cm'], ['ST', .8, -.18, 'af'], ['ST', .8, .18, 'tm']]
};
function rolesForSlot(code) { const g = SLOT_GROUP[code]; return Object.keys(ROLES).filter(k => !ROLES[k].old && ROLES[k].g.includes(g)); }
function drolesForSlot(code) { const g = SLOT_GROUP[code]; return Object.keys(DROLES).filter(k => DROLES[k].g.includes(g)); }
// 역할의 주요 능력치 평균 (추천 표시·AI 선택용)
function roleScore(d, R) { if (!d || !R || !R.k) return 0; let v = 0; for (const k of R.k) v += statOf(d, k); return v / R.k.length; }
// 공 미소유 시 배치: 없으면 공 소유 시 배치와 같음
function oopSlotsOf(setup) { return setup && setup.slotsOop && setup.slotsOop.length === 11 ? setup.slotsOop : slotsOf(setup); }
// 공 소유 시 배치의 각 선수를 미소유 포메이션의 가장 가까운 자리에 배정
function oopFrom(setup, name) {
  const ip = slotsOf(setup), pre = FORMATIONS[name]; if (!pre) return null; const out = new Array(11); const pairs = [];
  ip.forEach((a, i) => pre.forEach((b, j) => { if ((a[0] === 'GK') !== (b[0] === 'GK')) return; pairs.push([Math.hypot((a[1] - b[1]) * 1.5, (a[2] - b[2]) * .6), i, j]); }));
  pairs.sort((x, y) => x[0] - y[0]); const ui = new Set(), uj = new Set();
  for (const [, i, j] of pairs) { if (ui.has(i) || uj.has(j)) continue; out[i] = [pre[j][0], pre[j][1], pre[j][2]]; ui.add(i); uj.add(j); }
  for (let i = 0; i < 11; i++) if (!out[i]) out[i] = [ip[i][0], ip[i][1], ip[i][2]];
  return out;
}
// 역할 점검: 이전 버전 역할 이름을 새 체계로 옮기고, 자리에 맞지 않는 역할은 기본값으로
function normRoles(setup) {
  const sl = slotsOf(setup), ol = oopSlotsOf(setup); setup.roles = setup.roles || []; const had = Array.isArray(setup.rolesD); setup.rolesD = had ? setup.rolesD : [];
  for (let i = 0; i < 11; i++) {
    const r = ROLES[setup.roles[i]]; let dk = setup.rolesD[i];
    if (r && r.old) { const g = SLOT_GROUP[sl[i][0]]; setup.roles[i] = r.old[0] === 'cm' && g === 'DM' ? 'dm' : r.old[0]; if (!dk) dk = r.old[1] === 'pcm' && SLOT_GROUP[ol[i][0]] === 'DM' ? 'pdm' : r.old[1]; }
    if (!rolesForSlot(sl[i][0]).includes(setup.roles[i])) setup.roles[i] = DEFAULT_ROLE[sl[i][0]] || rolesForSlot(sl[i][0])[0];
    if (!drolesForSlot(ol[i][0]).includes(dk)) dk = DEFAULT_DROLE[SLOT_GROUP[ol[i][0]]];
    setup.rolesD[i] = dk;
  }
  return setup;
}
function posGroup(pos) { return pos === 'LB' || pos === 'RB' ? 'FB' : pos === 'LW' || pos === 'RW' ? 'W' : pos; }
const REL = { CB: { DM: .9, FB: .92 }, FB: { WB: 1, W: .88, CB: .9, DM: .82 }, DM: { CM: .96, CB: .9, FB: .82 }, CM: { DM: .96, AM: .95, W: .85 }, AM: { CM: .95, W: .92, ST: .9 }, W: { AM: .92, ST: .9, FB: .85, WB: .9 }, ST: { AM: .9, W: .9 } };
function familiarity(pos, slotCode) {
  const pg = posGroup(pos), sg = SLOT_GROUP[slotCode];
  if (pg === 'GK' || sg === 'GK') return pg === sg ? 1 : .35;
  if (pg === sg) {
    if ((pos === 'LB' && slotCode === 'RB') || (pos === 'RB' && slotCode === 'LB') || (pos === 'LW' && (slotCode === 'RW' || slotCode === 'RM')) || (pos === 'RW' && (slotCode === 'LW' || slotCode === 'LM'))) return .97;
    return 1;
  }
  if (sg === 'WB' && pg === 'FB') return 1;
  return (REL[pg] && REL[pg][sg]) || .8;
}
// 선수별 포지션 숙련도(가상 선수: d.fam = {포지션: 3 능숙 / 2 가능 / 1 미숙})가 있으면 그것을 우선 사용
const SLOT_POS = { LM: 'LW', RM: 'RW', LWB: 'LB', RWB: 'RB' };
// ---------- 위치별 능력치 · 숙련도 ----------
// 위치별 능력치 = 그 자리 기본 공식 50% + 가장 잘 맞는 성향 유형 50% (data.js rateT). 숙련도 = 최고 위치 능력치 대비 비율(능숙 ≥97% · 가능 ≥92% · 미숙 ≥85% · 그 아래 부적합)
// 데이터상 숙련도(FC 대체 포지션·훈련으로 익힌 자리)가 더 높으면 그것을 씀. 대표 포지션은 항상 능숙
const CODE_T = D.POS_T;
const TMPLS = D.TMPL_LIST;
const SKI = {}; (D.STAT_KEYS || []).forEach((k, i) => { SKI[k] = i; });
const SIDE = c => /^(LB|LWB|LM|LW)$/.test(c) ? 'L' : /^(RB|RWB|RM|RW)$/.test(c) ? 'R' : '';
function statOf(d, k) { return d.stats ? (d.stats[k] ?? 50) : d.s ? (d.s[SKI[k]] ?? 50) : 50; }
// 템플릿 10개의 능력치·성향 유형 점수 (능력치가 바뀌지 않았으면 캐시 사용)
const RCACHE = new WeakMap();
function tmplAll(d) {
  const src = d.s || d.stats; if (!src) return null;
  let sig = 0; if (d.s) { for (let i = 0; i < d.s.length; i++) sig += d.s[i] * (i + 7); } else { let i = 0; for (const k of D.STAT_KEYS) sig += (src[k] || 0) * (7 + i++); }
  const c = RCACHE.get(src); if (c && c.sig === sig) return c.m;
  const get = d.s ? D.getArr(d.s) : D.getObj(d.stats); const m = {}; for (const t of TMPLS) m[t] = D.rateT(get, t);
  RCACHE.set(src, { sig, m }); return m;
}
function tmplRating(d, t) { const m = tmplAll(d); return m ? m[t].r : 50; }
function archsOf(d, code) { const m = tmplAll(d); return m ? m[CODE_T[code] || 'CM'].archs : []; }
function posRating(d, code) { return Math.max(1, Math.round(tmplRating(d, CODE_T[code] || 'CM') - penOf(d, code))); }
function rawRating(d, code) { return Math.round(tmplRating(d, CODE_T[code] || 'CM')); }
function allRatings(d) { const o = {}; for (const c in CODE_T) o[c] = posRating(d, c); return o; }
function dataFam(d, code) { if (!d || !d.fam) return 0; return d.fam._ ? (d.fam[code] || 0) : Math.max(0, (d.fam[SLOT_POS[code] || code] || 0) - (SLOT_POS[code] ? 1 : 0)); }
// ---------- 포지션 익숙함(보정치) ----------
// 선수마다 자리별 보정치(감점)를 가짐: 위치 능력치 = 그 자리 능력치 공식 − 보정치.
// 보정치는 선수 고유값(ID로 고정된 무작위) — 경기장 거리 기반 기본값 × 개인 편차 × 선수 다재다능함.
// FC27 대체 포지션·가상 선수 보조 포지션(fam)은 작은 보정치로, 그 밖의 자리는 최소 7.5(미숙 이하).
// 숙련도: 보정치 0~2 능숙 · 3~6 가능 · 7~12 미숙 · 그 이상 부적합
const PF_CODES = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'LM', 'RM', 'AM', 'LW', 'RW', 'ST'];
const PFI = {}; PF_CODES.forEach((c, i) => { PFI[c] = i; });
const PXY = { GK: [0, 0], CB: [1, 0], LB: [1.2, -1], RB: [1.2, 1], LWB: [1.8, -1], RWB: [1.8, 1], DM: [2, 0], CM: [3, 0], LM: [3, -1], RM: [3, 1], AM: [4, 0], LW: [4.2, -1], RW: [4.2, 1], ST: [5, 0] };
function basePen(a, b) {
  if (a === b) return 0; if (a === 'GK' || b === 'GK') return 40;
  const A = PXY[a] || PXY.CM, B = PXY[b] || PXY.CM; const dy = Math.abs(A[0] - B[0]), dx = Math.abs(A[1] - B[1]);
  const wideBoth = A[1] !== 0 && B[1] !== 0;
  let c = dy * (wideBoth && dx === 0 ? 3.2 : 4.5) + (wideBoth && dx === 2 ? 5 : dx * 6); // 같은 측면 라인(DR-MR-AMR)은 오가기 쉬움
  if (a === 'CB' || b === 'CB') c *= 1.5; // 센터백은 다른 자리로 옮기기 어려움
  return c;
}
const PFC = new WeakMap();
const famSig = f => { if (!f) return ''; let s = ''; for (const k in f) s += k + f[k]; return s; };
function penArr(d) {
  if (d.pf && d.pf.length === PF_CODES.length) return d.pf;
  const key = d.pos + '|' + famSig(d.fam); const c = PFC.get(d); if (c && c.key === key) return c.a;
  const r = D.seeded(D.hash('pf#' + (d.id || d.name || '')));
  const g = () => (r() + r() + r() - 1.5) * 1.15;
  const V = Math.exp(g() * .45); // 선수 다재다능함 (작을수록 여러 자리에 익숙)
  const a = PF_CODES.map(cd => {
    if (cd === d.pos) return 0;
    let p = basePen(d.pos, cd) * Math.exp(g() * .55) * V; const lv = dataFam(d, cd);
    if (lv >= 3) p = Math.min(p, r() * 2.5); else if (lv === 2) p = Math.min(p, 3 + r() * 3.5); else if (lv === 1) p = Math.min(p, 7 + r() * 5); else p = Math.max(p, 7.5);
    return Math.round(Math.min(45, p) * 10) / 10;
  });
  PFC.set(d, { key, a }); return a;
}
function penOf(d, code) { return d && d.pos !== undefined ? penArr(d)[PFI[code] ?? PFI.CM] : 0; }
const levelOfPen = p => p <= 2 ? 3 : p <= 6 ? 2 : p <= 12 ? 1 : 0;
function famLevel(d, code) {
  if (!d) return 3;
  if (d.pos === code && !(d.pf && d.pf[PFI[code]] > 2)) return 3;
  if (!d.pos) return 3;
  return levelOfPen(penOf(d, code));
}
const FAM_MULT = [.82, .9, .96, 1];
// 경기 적용 배율: (자리 능력치 − 보정치) ÷ 자리 능력치
function famOf(d, code) {
  if (!d) return 1; const pen = penOf(d, code); if (!pen) return 1;
  const m = (d.stats || d.s) ? tmplAll(d) : null; const raw = m ? m[CODE_T[code] || 'CM'].r : 70;
  return Math.max(.55, Math.min(1, (raw - pen) / Math.max(30, raw)));
}
// 사용자 지정 위치(setup.slots)가 있으면 그것을, 없으면 프리셋 포메이션
function slotsOf(setup) { return (setup && setup.slots && setup.slots.length === 11) ? setup.slots : (FORMATIONS[setup && setup.formation] || FORMATIONS['4-3-3']); }
const DEFAULT_ROLE = { GK: 'gk', CB: 'cd', LB: 'fb', RB: 'fb', LWB: 'wb', RWB: 'wb', DM: 'dm', CM: 'cm', LM: 'wng', RM: 'wng', AM: 'am', LW: 'inf', RW: 'wng', ST: 'af' };
// 위치 좌표(깊이 y 0~1, 폭 x -1~1)로 포지션 코드 결정
function codeAt(y, x) {
  const w = Math.abs(x) > .55, L = x < 0;
  if (y < .1) return 'GK';
  if (y < .27) return w ? (L ? 'LB' : 'RB') : 'CB';
  if (y < .42) return w ? (L ? 'LWB' : 'RWB') : 'DM';
  if (y < .58) return w ? (L ? 'LM' : 'RM') : 'CM';
  if (y < .74) return w ? (L ? 'LW' : 'RW') : 'AM';
  return 'ST';
}
function formLabel(slots) {
  const n = c => slots.filter(s => c.includes(s[0])).length;
  return [n(['CB', 'LB', 'RB']), n(['DM']), n(['CM', 'LM', 'RM', 'LWB', 'RWB']), n(['AM', 'LW', 'RW']), n(['ST'])].filter(x => x > 0).join('-');
}
function refreshCodes(T) { const sl = slotsOf(T.setup); for (const p of T.players) { const s = sl[p.slot]; if (!s) continue; p.code = s[0]; p.fam = famOf(p.d, s[0]); } }
const DEFAULT_TACTICS = () => ({
  width: 1, passing: 1, tempo: 2, waste: 1, buildUp: true, focus: 'mixed', finalThird: 'mixed', cross: 'mixed', creative: 'normal',
  onLoss: 'neutral', onWin: 'neutral', gkMethod: 'mixed', gkTarget: 'any', gkTempo: 'normal',
  defLine: 2, engage: 2, press: 1, tackling: 'normal', trap: 'none', offsideTrap: false, corner: 'mixed',
  cornerBody: 'balanced', cornerDef: 'mixed', fkWide: 'auto', fkDirect: 'auto', throwLong: 'auto'
});
const DEFAULT_INSTR = () => ({ pass: 0, plen: 0, tempo: 0, shoot: 0, dribble: 0, dribDir: 'none', cross: 0, crossFrom: 'none', crossTarget: 'mixed', fwd: 0, width: 0, split: 0, free: 0, press: 0, mark: 'normal', markTarget: -1, tackle: 0, gkSpeed: 0, gkTarget: 'team', gkMethod: 'team' });
// 포지션(그룹)별로 쓸 수 있는 개인 지침. 목록에 없는 지침은 엔진에서 무시됨
const PI_DEF = ['press', 'tackle', 'mark', 'markTarget'];
const PI_ALLOWED = {
  GK: ['plen', 'gkSpeed', 'gkTarget', 'gkMethod', 'press', 'tackle'],
  CB: ['plen', 'pass', 'fwd', ...PI_DEF],
  FB: ['plen', 'pass', 'shoot', 'dribble', 'dribDir', 'cross', 'crossFrom', 'crossTarget', 'fwd', 'width', 'free', ...PI_DEF],
  WB: ['plen', 'pass', 'shoot', 'dribble', 'dribDir', 'cross', 'crossFrom', 'crossTarget', 'fwd', 'width', 'free', ...PI_DEF],
  DM: ['plen', 'pass', 'shoot', 'tempo', 'dribble', 'fwd', 'width', 'split', 'free', ...PI_DEF],
  CM: ['plen', 'pass', 'shoot', 'tempo', 'dribble', 'fwd', 'width', 'free', ...PI_DEF],
  W: ['plen', 'pass', 'shoot', 'dribble', 'dribDir', 'cross', 'crossFrom', 'crossTarget', 'fwd', 'width', 'free', ...PI_DEF],
  AM: ['plen', 'pass', 'shoot', 'tempo', 'dribble', 'fwd', 'width', 'free', ...PI_DEF],
  ST: ['plen', 'pass', 'shoot', 'tempo', 'dribble', 'width', 'free', ...PI_DEF]
};
const PI_SET = Object.fromEntries(Object.entries(PI_ALLOWED).map(([g, a]) => [g, Object.fromEntries(a.map(k => [k, 1]))]));
// 예전 저장 형식(move: stay/channels/roam) 호환
function iv(p, k) {
  const ins = instr(p); const g = SLOT_GROUP[p.code] || 'CM';
  let v = ins[k];
  if (v === undefined) { if (k === 'fwd' && ins.move === 'stay') v = -1; else if (k === 'free' && ins.move === 'roam') v = 1; else if (k === 'width' && ins.move === 'channels' && (g === 'ST' || g === 'AM')) v = 1; }
  if (!PI_SET[g][k] && k !== 'pass' && k !== 'shoot' && k !== 'dribble') return DI[k];
  return v === undefined ? DI[k] : v;
}
const DI = Object.freeze(DEFAULT_INSTR());

// 팀 자동 선발 (포메이션 슬롯별 최적 선수)
function autoPick(team, formation) {
  const slots = Array.isArray(formation) ? formation : (FORMATIONS[formation] || FORMATIONS['4-3-3']); const used = new Set(); const lineup = [];
  const res = new Array(slots.length);
  // 모든 (자리, 선수) 조합의 값 = 그 자리 능력치 × 숙련도 배율 (+ 대표 포지션 가산) → 큰 것부터 배정
  const pairs = [];
  slots.forEach((s, i) => { for (const p of team.players) { const c = s[0]; const v = posRating(p, c) + (p.pos === c ? 2 : SLOT_POS[c] === p.pos ? 1 : 0); pairs.push([v, i, p]); } });
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, i, p] of pairs) { if (res[i] != null || used.has(p.id)) continue; res[i] = p.id; used.add(p.id); }
  for (const r of res) lineup.push(r);
  const bench = team.players.filter(p => !used.has(p.id)).sort((a, b) => D.calcOvr(b.stats, b.pos) - D.calcOvr(a.stats, a.pos)).slice(0, 9).map(p => p.id);
  return { lineup, bench };
}
function makeSetup(team, formation) {
  formation = FORMATIONS[formation] ? formation : '4-3-3';
  const { lineup, bench } = autoPick(team, formation);
  const byId = id => team.players.find(p => p.id === id);
  const lp = lineup.map(byId);
  const best = (key) => lp.filter(p => p && p.pos !== 'GK').sort((a, b) => b.stats[key] - a.stats[key])[0];
  return normRoles({
    teamId: team.id, formation, lineup, bench,
    roles: FORMATIONS[formation].map(s => s[3]), instr: FORMATIONS[formation].map(() => DEFAULT_INSTR()),
    tactics: DEFAULT_TACTICS(),
    captain: lp.slice().sort((a, b) => b.ovr - a.ovr)[0].id,
    takers: { pen: best('penalties').id, fk: best('freeKick').id, corner: best('crossing').id }
  });
}

// ---------- 매치 생성 ----------
function createMatch(opts) {
  const rng = RNG(opts.seed || (Date.now() & 0xffffffff));
  const xrng = RNG((opts.seed || 7) * 31 + 17); // xG 계산용 보조 난수 (본 경기 결과에 영향 없음)
  const M = {
    t: 0, half: 1, phase: 'dead', score: [0, 0], events: [], frames: null, rng, xrng,
    ball: { x: 0, y: 0, z: BR, vx: 0, vy: 0, vz: 0, owner: null, held: false, flight: null, last: null, spin: 0, spinDir: [0, 0], restT: 0 },
    restart: null, addTime: [0, 0], ended: false, tick: 0, pidList: [], goalsLog: [], passLog: [], shotLog: [], userSide: opts.userSide ?? 0,
    aiSides: opts.aiSides || [1], neutral: !!opts.neutral, seed: opts.seed || 1, big: !!opts.big, wx: wxOf(opts.weather)
  };
  M.teams = [0, 1].map(side => buildTeam(M, side, opts.teams[side]));
  M.teams[0].dir = 1; M.teams[1].dir = -1;
  M.addTime[0] = 120 + Math.floor(rng() * 4) * 60;
  M.addTime[1] = 240 + Math.floor(rng() * 5) * 60;
  initRecorder(M);
  setKickoff(M, 0, true);
  return M;
}
function buildTeam(M, side, cfg) {
  const T = {
    side, db: cfg.team, name: cfg.team.name, short: cfg.team.short, color1: cfg.team.color1, color2: cfg.team.color2,
    setup: JSON.parse(JSON.stringify(cfg.setup)), cond: cfg.condition || null, form: cfg.form || null, talks: [], usedIds: new Set(), players: [], bench: [], subsLeft: 5, subsUsed: 0, dir: 1,
    st: { poss: 0, shots: 0, sot: 0, xg: 0, passes: 0, passOk: 0, tackles: 0, tackleWon: 0, fouls: 0, corners: 0, offsides: 0, yellow: 0, red: 0, saves: 0, inter: 0 },
    lossT: -99, winT: -99, all: []
  };
  const find = id => cfg.team.players.find(p => p.id === id);
  T.setup.lineup.forEach((id, i) => { const d = find(id); if (d) T.players.push(mkPlayer(M, T, d, i)); });
  T.bench = T.setup.bench.map(find).filter(Boolean);
  // 리더십 특성 선수가 선발이면 팀 전체 능력 소폭 상승
  T.lead = T.players.some(p => p.tf && p.tf.lead); if (T.lead) for (const p of T.players) refreshMf(M, p);
  return T;
}
function mkPlayer(M, T, d, slotIdx) {
  const slot = slotsOf(T.setup)[slotIdx];
  const p = {
    pid: M.pidList.length, d, name: d.name, pos: d.pos, team: T, side: T.side, slot: slotIdx, code: slot[0],
    s: Object.assign({}, d.stats), fam: famOf(d, slot[0]),
    hb: T.side === 0 ? (M.neutral ? 1 : 1.0035) : (M.neutral ? 1 : .9985), x: 0, y: 0, vx: 0, vy: 0, face: 0, energy: (T.cond && T.cond[d.id] != null) ? T.cond[d.id] : 100, dist: 0, sx: 0, sy: 0, sn: 0, tx: 0, ty: 0, urg: .7,
    anim: 0, animT: 0, stun: 0, yc: 0, off: false, decT: 0, kickT: -9, reactT: 0, roamX: 0, roamY: 0, roamT: 0, supT: 0, supX: 0, supY: 0,
    r: { min: 0, pass: 0, passOk: 0, kp: 0, shots: 0, sot: 0, goals: 0, ast: 0, tkl: 0, tklW: 0, int: 0, sav: 0, foul: 0, drb: 0, rating: 6.0 },
    num: 0, form: 0, talkV: 0, talkUntil: 0, mf: 1
  };
  p.form = T.form && T.form[d.id] != null ? T.form[d.id] : formRoll(M.seed, d, p.energy);
  // 가상 모드 선수 특성(PTRAITS 번호) → 경기 행동 플래그
  const pt = d.pt || []; p.tf = { ls: pt.includes(0), dr: pt.includes(1), run: pt.includes(2), ovl: pt.includes(3), kp: pt.includes(4), one2: pt.includes(5), cu: pt.includes(6), hd: pt.includes(7), feet: pt.includes(8), sl: pt.includes(9), lt: pt.includes(10), fp: pt.includes(11), qr: pt.includes(12), bu: pt.includes(13), sk: pt.includes(14), lead: pt.includes(15), big: pt.includes(16) };
  refreshMf(M, p);
  p.num = d.num && !T.all.some(q => q.num === d.num) ? d.num : shirtNumber(T, d);
  M.pidList.push(p); T.all.push(p);
  return p;
}
function shirtNumber(T, d) {
  const idx = T.db.players.indexOf(d);
  const pref = { GK: [1, 13, 31], CB: [4, 5, 6, 15, 26], LB: [3, 12, 21], RB: [2, 22, 24], DM: [6, 16, 18], CM: [8, 14, 20, 23], AM: [10, 19, 25], LW: [11, 17, 27], RW: [7, 17, 28], ST: [9, 19, 29, 30] }[d.pos] || [30];
  const taken = new Set(T.all.map(p => p.num));
  for (const n of pref) if (!taken.has(n)) return n;
  let n = 32 + idx; while (taken.has(n)) n++; return n;
}

// ---------- 보조 함수 ----------
// 체력(energy 0~100)이 낮을수록 모든 능력치와 속도가 떨어짐: 70% → 약 -3.5%, 50% → -8%, 30% → -13%
const fatigue = p => { if (p._fe !== p.energy) { p._fe = p.energy; p._fv = 1 - .24 * Math.pow(1 - clamp(p.energy / 100, 0, 1), 1.6); } return p._fv; };
// 경기 사이 하루 회복량 (스태미너가 높을수록, 나이가 적을수록 빠름)
function recoverPerDay(stamina, age) { let r = 9 + (stamina - 50) * .26; if (age > 30) r *= Math.max(.7, 1 - (age - 30) * .04); return Math.max(6, r); }
// 능력치 영향도(SK): 1이면 원래 차이 그대로, 낮을수록 기준값 70 주변으로 압축되어 이변이 늘어남
let SK = .5;
// 체력 저하는 신체·수비 집중력 관련 능력치에 크게, 기술(슈팅·패스 등)에는 절반 정도로 적용
const FAT_FULL = { pace: 1, accel: 1, agility: 1, balance: 1, strength: 1, jumping: 1, stamina: 1, reactions: 1, marking: 1, standTackle: 1, slideTackle: 1, interceptions: 1, positioning: 1, aggression: 1 };
function E(p, k) { const f = fatigue(p); return (70 + (p.s[k] - 70) * SK) * p.fam * (FAT_FULL[k] ? f : (1 + f) / 2) * p.hb * p.mf; }
// ---------- 경기 컨디션 (12시 ~ 6시) ----------
// -2(6시, 최악) ~ +2(12시, 최상). 경기 전 정해지며 기복(consistency)이 큰 선수일수록 폭이 큼. 부상에서 막 돌아온 선수(rust)는 아래쪽으로 치우침
function hash32(a, b) { let h = (a ^ 0x9e3779b9) >>> 0; const s = String(b); for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 2654435761) >>> 0; h ^= h >>> 15; } h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; }
function formRoll(seed, d, energy) {
  const h1 = hash32(seed, d.id), h2 = hash32(seed + 7919, d.id);
  const u1 = (h1 + 1) / 4294967297, u2 = (h2 + 1) / 4294967297; const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const cons = d.per ? d.per[4] : 11; const sd = .55 + (20 - cons) * .035;
  const x = g * sd - (d.rust ? .6 : 0);
  return x < -1.5 ? -2 : x < -.5 ? -1 : x < .5 ? 0 : x < 1.5 ? 1 : 2;
}
const formMult = f => 1 + .025 * f;
function refreshMf(M, p) { p.mf = formMult(p.form) * (1 + (M.t < p.talkUntil ? p.talkV : 0)) * (p.tf && p.tf.big && M.big ? 1.025 : 1) * (p.team && p.team.lead ? 1.008 : 1) * (p.d && p.d.mor != null ? 1 + clamp((p.d.mor - 55) / 45, -1, 1) * .03 : 1); }
// ---------- 경기 중 선수단 대화 (효과 15분) ----------
const TALKS = {
  encourage: { n: '격려하기', d: '부담을 덜어 줍니다. 대부분 조금씩 좋아지며 부진한 선수에게 효과가 큽니다.' },
  praise: { n: '칭찬하기', d: '잘하고 있는 선수들은 더 힘을 얻지만, 부진한 선수나 크게 앞선 상황에서는 방심할 수 있습니다.' },
  focus: { n: '집중하라', d: '실수를 줄이도록 요구합니다. 효과는 작지만 안정적이며, 앞서고 있을 때 수비진에 효과적입니다.' },
  demand: { n: '분발을 요구', d: '지고 있을 때 투지가 강한 선수는 크게 반응하지만, 잘하는 선수나 마음이 여린 선수는 불만을 품을 수 있습니다.' },
  calm: { n: '침착하라', d: '흥분을 가라앉힙니다. 경고를 받은 선수나 다혈질 선수에게 효과적이고 나머지는 변화가 작습니다.' },
  fireup: { n: '밀어붙여라', d: '지고 있을 때 선수단 전체를 크게 끌어올릴 수 있지만, 앞서는 상황에서는 역효과가 납니다.' }
};
function applyTalk(M, T, kind) {
  const r = M.rng; const diff = M.score[T.side] - M.score[1 - T.side]; const out = [];
  const recent = T.talks.filter(x => x.kind === kind && M.t - x.t < 600).length; const fade = recent ? .45 : 1;
  for (const p of active(T)) {
    const per = p.d.per || [11, 11, 11, 9, 11, 11]; const det = per[2], pro = per[0], temp = per[5];
    const rt = p.r.rating; const def = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.code);
    let mu = 0, sd = .012;
    switch (kind) {
      case 'encourage': mu = .018 + (rt < 6.3 ? .012 : 0); break;
      case 'praise': mu = rt >= 6.8 ? .03 : rt < 6.2 ? -.012 : .01; if (diff >= 2 && pro < 11) mu -= .02; sd = .015; break;
      case 'focus': mu = .013 + (diff > 0 && def ? .01 : 0); sd = .008; break;
      case 'demand': mu = (diff < 0 ? .028 : diff === 0 ? .008 : -.008) + (det - 11) * .003 - (rt >= 7 ? .025 : 0); sd = .02; break;
      case 'calm': mu = .006 + (p.yc ? .02 : 0) + (temp < 9 ? .012 : 0); sd = .008; break;
      case 'fireup': mu = diff < 0 ? .034 : diff === 0 ? .014 : -.012; mu += (det - 11) * .002; sd = .025; break;
    }
    const v = clamp((mu * fade) + r.gauss() * sd, -.05, .06);
    p.talkV = v; p.talkUntil = M.t + 900; refreshMf(M, p);
    out.push({ pid: p.pid, v, re: v > .012 ? 1 : v < -.008 ? -1 : 0 });
  }
  T.talks.push({ kind, t: M.t, out });
  ev(M, 'talk', T.side, `${T.name} 감독: "${TALKS[kind].n}"`, { quiet: true, kind });
  return out;
}
const role = p => ROLES[p.team.setup.roles[p.slot]] || {};
const NOROLE = {};
const roleD = p => { const rd = p.team.setup.rolesD; return (rd && DROLES[rd[p.slot]]) || NOROLE; };
const instr = p => p.team.setup.instr[p.slot] || DEFAULT_INSTR();
const tac = T => T.setup.tactics;
const opp = (M, T) => M.teams[1 - T.side];
const active = T => T._act || (T._act = T.players.filter(p => !p.off));
const fwd = (T, x) => T.dir * x; // 공격 방향 좌표 (+HL = 상대 골문)
const tX = (T, x) => (T.dir * x + HL) / 105;
const tY = (T, y) => -T.dir * y / HW;
const wX = (T, tx) => T.dir * (tx * 105 - HL);
const wY = (T, ty) => -T.dir * ty * HW;
const maxSpd = p => (5.6 + E(p, 'pace') * .04);
const maxAcc = p => (2.5 + E(p, 'accel') * .045);
function minute(M) { const m = M.half === 1 ? Math.floor(M.t / 60) + 1 : Math.floor(M.t / 60) + 1; const lim = M.half === 1 ? 45 : 90; return m > lim ? lim + '+' + (m - lim) : '' + m; }
function ev(M, type, side, text, extra) { const e = Object.assign({ t: M.t, min: minute(M), type, side, text, frame: M.rec ? M.rec.n : 0 }, extra || {}); M.events.push(e); if (M.onEvent) M.onEvent(e); return e; }
function nearestOpp(M, p, x, y) { let best = null, bd = 1e9; for (const o of active(opp(M, p.team))) { const d = hyp(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } } return [best, bd]; }
function goalAngle(T, x, y) { const gx = T.dir * HL; const a1 = Math.atan2(GW - y, gx - x), a2 = Math.atan2(-GW - y, gx - x); let d = Math.abs(a1 - a2); if (d > Math.PI) d = 2 * Math.PI - d; return d; }
function xq(T, x, y) {
  const gx = T.dir * HL; const d = hyp(gx - x, y); const ang = goalAngle(T, x, y);
  return .75 * Math.exp(-.13 * Math.max(0, d - 5)) * clamp(ang / .64, 0, 1.3);
}
function threat(T, x, y) { const t = tX(T, x); return xq(T, x, y) * .85 + .03 * t * t; }
function inBoxOf(T, x, y) { return fwd(T, x) > BOX_X && Math.abs(y) < BOX_Y; } // T가 공격하는 쪽 박스
function offsideLine(M, T) {
  const O = opp(M, T); const v = active(O).map(p => fwd(T, p.x)).sort((a, b) => b - a);
  return Math.max(v[1] ?? -HL, 0, fwd(T, M.ball.x));
}

// ---------- 날씨·잔디 ----------
// 날씨: clear 맑음, cloudy 흐림, rain 비, heavy 폭우, snow 눈, hot 무더위, wind 강풍 / 잔디: good 좋음, wet 젖음, heavy 진흙, worn 패임, frozen 얼어붙음
const WEATHER = { clear: ['맑음', 0, 0, 0], cloudy: ['흐림', 0, 0, 0], rain: ['비', .55, 0, 0], heavy: ['폭우', 1, 0, .2], snow: ['눈', .4, 0, 0], hot: ['무더위', 0, 1, 0], wind: ['강풍', .1, 0, 1] };
const PITCH = { good: ['좋음', 0, 0], wet: ['젖음', .5, 0], heavy: ['진흙', .3, 1], worn: ['패임', 0, .5], frozen: ['얼어붙음', 0, .3] };
function wxOf(o) {
  const w = WEATHER[o && o.k] ? o.k : 'clear', pt = PITCH[o && o.pitch] ? o.pitch : 'good';
  const W = WEATHER[w], P = PITCH[pt];
  const wet = clamp(W[1] + P[1], 0, 1), slow = P[2], heat = W[2], windS = W[3] * (o && o.ws != null ? o.ws : 7);
  const wd = o && o.wd != null ? o.wd : 0;
  // 구름: 0 맑음 ~ 1 폭우 (렌더러용)
  return { k: w, pitch: pt, wet, slow, heat, wind: [Math.cos(wd) * windS, Math.sin(wd) * windS], label: W[0] + ' · 잔디 ' + P[0], temp: o && o.temp != null ? o.temp : (w === 'hot' ? 31 : w === 'snow' ? -1 : 14) };
}

// ---------- 볼 물리 ----------
let WX = null; // 현재 계산 중인 경기의 날씨 (step()에서 설정)
function stepBall(b, dt) {
  if (b.z > BR + .001 || b.vz > 0) {
    b.vz -= GRAV * dt;
    if (WX && (WX.wind[0] || WX.wind[1]) && b.z > 1.5) { b.vx += WX.wind[0] * .05 * dt; b.vy += WX.wind[1] * .05 * dt; }
    const sp = hyp(b.vx, b.vy, b.vz); const k = 1 - .012 * sp * dt;
    b.vx *= k; b.vy *= k; b.vz *= (1 - .012 * sp * dt);
    if (b.spin) { b.vx += b.spinDir[0] * b.spin * dt; b.vy += b.spinDir[1] * b.spin * dt; b.spin *= (1 - .6 * dt); }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z < BR) {
      b.z = BR;
      if (b.vz < -1.4) { b.vz = -b.vz * .48; b.vx *= .82; b.vy *= .82; } else b.vz = 0;
      b.spin = 0;
    }
  } else {
    const sp = hyp(b.vx, b.vy);
    if (sp > 0) { const fr = WX ? (1 - WX.wet * .16) * (1 + WX.slow * .4) : 1; const ns = Math.max(0, sp - (.9 + .028 * sp) * fr * dt); b.vx *= ns / sp; b.vy *= ns / sp; }
    if (b.spin) { b.vx += b.spinDir[0] * b.spin * dt * .4; b.vy += b.spinDir[1] * b.spin * dt * .4; b.spin *= (1 - 2 * dt); }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z = BR;
  }
}
function predict(M, steps) {
  const b = M.ball; const c = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, spin: b.spin, spinDir: b.spinDir };
  const out = [];
  for (let i = 0; i < steps; i++) { stepBall(c, DT); out.push({ x: c.x, y: c.y, z: c.z, t: (i + 1) * DT, sp: hyp(c.vx, c.vy) }); }
  return out;
}

// ---------- 킥 ----------
// 지점(px,py)으로 공을 보냄. kind: ground | lofted | cross | through | clear | throw
function kickTo(M, p, px, py, kind, acc, opts) {
  opts = opts || {}; const b = M.ball, r = M.rng;
  const pressure = pressureOn(M, p);
  let dx = px - b.x, dy = py - b.y; let d = hyp(dx, dy) || .1;
  const want = Math.atan2(dy, dx);
  let turn = Math.abs(angDiff(want, p.face));
  const bodyPen = turn > 1.8 ? 1.35 : turn > 1.1 ? 1.12 : 1;
  const wxk = M.wx ? 1 + M.wx.wet * .12 + M.wx.slow * .08 + hyp(M.wx.wind[0], M.wx.wind[1]) * (kind === 'ground' ? 0 : .012) : 1;
  const sigA = (.011 + (100 - acc) * .0008) * (1 + pressure * .5) * bodyPen * wxk;
  const sigP = (.03 + (100 - acc) * .0016) * (1 + pressure * .4) * wxk;
  const ang = want + r.gauss() * sigA;
  const dist = d * (1 + r.gauss() * sigP);
  const power = E(p, 'shotPower');
  const vmax = 21 + power * .12;
  b.owner = null; b.held = false; b.spin = 0;
  let vh, vz = 0;
  if (kind === 'ground' || kind === 'through' || kind === 'roll') {
    vh = kind === 'roll' ? clamp(7 + dist * .3, 8, 16) : kind === 'through' ? clamp(6.5 + dist * .27, 9, vmax * .8) : clamp(9 + dist * .36, 10.5, vmax * .9);
  } else {
    let apex;
    if (kind === 'cross') apex = opts.crossType === 'low' ? 1.0 : opts.crossType === 'whipped' ? 2.6 : opts.crossType === 'high' ? 6 : 3.6;
    else if (kind === 'clear') apex = 10 + r() * 8;
    else if (kind === 'throw') apex = 2.2;
    else apex = clamp(dist * .16, 3, 15);
    apex *= (1 + r.gauss() * sigP * .6);
    vz = Math.sqrt(2 * GRAV * Math.max(.4, apex - b.z));
    const tUp = vz / GRAV, tDown = Math.sqrt(2 * Math.max(.4, apex - BR) / GRAV);
    const T = tUp + tDown;
    vh = dist / T * 1.06;
    if (vh > vmax) { vh = vmax; }
    if (kind === 'throw') vh = Math.min(vh, 14);
  }
  b.vx = Math.cos(ang) * vh; b.vy = Math.sin(ang) * vh; b.vz = vz;
  if ((kind === 'cross' || kind === 'lofted') && E(p, 'curve') > 60) {
    const c = (E(p, 'curve') - 60) * .05 * (r() < .5 ? -1 : 1);
    b.spin = Math.abs(c); b.spinDir = [-Math.sin(ang) * Math.sign(c), Math.cos(ang) * Math.sign(c)];
  }
  p.kickT = M.t; p.face = want; setAnim(p, kind === 'throw' ? 9 : 1);
  b.last = p;
  const offs = (kind === 'throw' || opts.noOffside) ? [] : offsidePlayers(M, p);
  b.flight = { type: kind, from: p, target: opts.target || null, tpx: px, tpy: py, t0: M.t, tried: {}, offs, key: !!opts.key };
  if (kind !== 'clear') { const d = p.team.dir; M.passLog.push({ p: p.pid, s: p.side, x0: +(b.x * d).toFixed(1), y0: +(b.y * d).toFixed(1), x1: +(px * d).toFixed(1), y1: +(py * d).toFixed(1), k: kind, ok: 0, f: M.rec ? M.rec.n : 0 }); b.flight.logIdx = M.passLog.length - 1; }
  if (kind === 'cross') {
    const blk = active(opp(M, p.team)).find(o => { const dx = o.x - b.x, dy = o.y - b.y, dd = hyp(dx, dy); return o.code !== 'GK' && dd < 2.4 && (dx * Math.cos(ang) + dy * Math.sin(ang)) / (dd || 1) > .3; });
    if (blk && r() < .45 * (.6 + E(blk, 'marking') / 200)) {
      const T = p.team; b.vx = T.dir * (5 + r() * 7); b.vy = Math.sign(b.y || 1) * (1 + r() * 5); b.vz = 1 + r() * 4; b.spin = 0; b.last = blk; setAnim(blk, 2);
      b.flight = { type: 'loose', from: null, t0: M.t, tried: { [blk.pid]: M.t, [p.pid]: M.t }, offs: [] };
    }
  }
  if (M.dbg) M.dbg['k_' + kind] = (M.dbg['k_' + kind] || 0) + 1;
  M.lastPasser = p;
  resetReact(M);
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function diveAnim(p, dy, high) { const r = dy * Math.cos(p.face) > 0; return high ? (r ? 11 : 12) : (r ? 4 : 5); }
// 골키퍼 반응 계획: 공이 골키퍼 위치에 닿기 전에 몸을 날리도록 시작 시점과 방향을 정함
// 선방이면 공 쪽으로 정확히, 실점이면 조금 못 미치게 (결과는 sampleShot에서 이미 정해짐)
function planDive(M, gk, b, res, P) {
  const r = M.rng; const T = gk.team;
  const depth = Math.max(.2, Math.abs(P.gx - gk.x)); const shotLen = Math.max(1, hyp(P.gx - b.x, res.fy - b.y));
  const u = clamp(1 - depth / shotLen, 0, 1);
  const yAt = lerp(b.y, res.fy, u), zAt = lerp(b.z, res.fz, u);
  const tGk = Math.max(.08, (shotLen - depth) / P.speed);
  const react = clamp(.42 - E(gk, 'gkReflexes') * .0028 + (P.screened ? .1 : 0), .12, .5);
  let ty = yAt;
  if (res.outcome === 'goal') ty = yAt - Math.sign(yAt - gk.y || 1) * (.7 + r() * .9);
  else if (res.outcome === 'miss' || res.outcome === 'post') { if (Math.abs(res.fy) > GW + 1.2 || res.fz > GH + .8) ty = gk.y + clamp(yAt - gk.y, -1, 1) * .5; else ty = yAt - Math.sign(yAt - gk.y || 1) * .5; }
  else if (res.outcome === 'block') { gk.diveAt = null; return; }
  const dy = clamp(ty - gk.y, -3.4, 3.4);
  // 공이 금방 도착하면 반사적으로 (도착 직전에) 반응, 여유가 있으면 반응 시간 뒤 다이빙
  const start = tGk < .4 ? tGk * .35 : Math.min(react, tGk - .3);
  gk.diveAt = { t: M.t + Math.max(.04, start), dy, high: zAt > 1.55, low: zAt < .5, arrive: M.t + tGk };
}
function setAnim(p, a) { p.anim = a; p.animT = 0; }
// 상대 감독의 상대 선수 지시 (이 선수를 상대로 한 지시)
function oiOf(M, p) { const O = M.teams[1 - p.side]; const oi = O && O.setup && O.setup.oi; return oi ? oi[p.d.id] || null : null; }
function pressureOn(M, p) { const [, d] = nearestOpp(M, p, p.x, p.y); return clamp((3.2 - d) / 3.2, 0, 1); }
function offsidePlayers(M, p) {
  const T = p.team; const line = offsideLine(M, T); const out = [];
  for (const q of active(T)) if (q !== p && fwd(T, q.x) > line + .15) out.push(q.pid);
  return out;
}
function resetReact(M) { for (const p of M.pidList) if (!p.off) p.reactT = M.t + (.42 - E(p, 'reactions') * .003) + M.rng() * .08; }

// ---------- 슈팅 ----------
function shotParams(M, p, type) {
  const fin = E(p, 'finishing'), bal = E(p, 'balance'), ctl = E(p, 'ballControl'), rea = E(p, 'reactions');
  const b = M.ball; const T = p.team; const gx = T.dir * HL; const d = hyp(gx - b.x, b.y);
  let A, speed, fk = 0;
  const pw = E(p, 'shotPower');
  switch (type) {
    case 'header': A = .65 * E(p, 'heading') + .15 * E(p, 'jumping') + .1 * E(p, 'positioning') + .1 * E(p, 'strength'); speed = 9 + E(p, 'heading') * .07 + E(p, 'strength') * .03; break;
    case 'volley': A = .6 * E(p, 'volleys') + .15 * fin + .15 * bal + .1 * rea; speed = 13 + pw * .11; break;
    case 'long': A = .6 * E(p, 'longShots') + .2 * pw + .1 * bal + .1 * fin; speed = 14 + pw * .13; break;
    case 'finesse': A = .45 * E(p, 'curve') + .3 * (d > 17 ? E(p, 'longShots') : fin) + .1 * bal + .15 * ctl; speed = (14 + pw * .13) * .82; break;
    case 'penalty': A = .8 * E(p, 'penalties') + .2 * rea; speed = 14 + pw * .12; break;
    case 'freekick': A = .55 * E(p, 'freeKick') + .3 * E(p, 'curve') + .15 * pw; speed = (14 + pw * .13) * .85; fk = E(p, 'freeKick'); break;
    default: A = .6 * fin + .15 * ctl + .1 * bal + .15 * rea; speed = 13 + pw * .12;
  }
  const [, dp] = nearestOpp(M, p, b.x, b.y);
  const pressure = type === 'penalty' || type === 'freekick' ? 0 : clamp((5 - dp) / 4.5, 0, 1);
  A -= pressure * 26;
  { const oc = oiOf(M, p); if (oc && oc.foot && type !== 'penalty' && type !== 'freekick' && type !== 'header') A -= 3.5; }
  if (M.t - (p.gainT || 0) < .3 && type !== 'header') A -= 4;
  return { A, speed, d, pressure, gx, type, fk };
}
// 슈팅 결과 샘플링 (실제 판정과 xG 계산에 같은 함수 사용)
function sampleShot(M, p, P, r, gk, blockers) {
  const b = M.ball; const T = p.team;
  // 조준: 골키퍼 반대편 포스트 안쪽
  const side = gk ? (gk.y > b.y * .2 ? -1 : 1) : (r() < .5 ? -1 : 1);
  const margin = .75 + (100 - P.A) * .014 + r() * .55;
  let aimY = side * (GW - margin);
  if (P.type === 'penalty') aimY = (r() < .15 ? 0 : side) * (GW - .7);
  const aimZ = P.type === 'header' ? .4 + r() * .6 : P.type === 'freekick' ? 1.1 + r() * 1.0 : (r() < .55 ? .35 : 1.4 + r() * .6);
  const sg = (.57 + Math.max(0, 100 - P.A) * .042) * Math.pow(Math.max(P.d, 7) / 12, .8) * (P.type === 'header' ? 1.15 : P.type === 'freekick' ? .72 : 1);
  const fy = aimY + r.gauss() * sg, fz = Math.max(BR, aimZ + r.gauss() * sg * .6 + (P.type === 'long' ? .25 : 0));
  const res = { fy, fz, outcome: 'miss', save: null, blocker: null };
  // 근접 수비수의 몸 블록 (슈팅 방향 앞에 붙어 있는 경우)
  for (const q of blockers) {
    const dq = hyp(q.x - b.x, q.y - b.y); if (dq >= 1.6) continue;
    const gdx = P.gx - b.x, gdy = -b.y, gl = hyp(gdx, gdy) || 1; const front = ((q.x - b.x) * gdx + (q.y - b.y) * gdy) / (gl * (dq || .1));
    if (front < .1) continue;
    const pb = (.22 + front * .25) * (.7 + .3 * (E(q, 'marking') + E(q, 'reactions')) / 170);
    if (r() < pb) { res.outcome = 'block'; res.blocker = q; res.u = .05; return res; }
  }
  // 블록
  for (const q of blockers) {
    const dq = hyp(q.x - b.x, q.y - b.y); if (dq < 1.2 || dq > P.d - 2) continue;
    // 슈팅 경로에 대한 수직 거리
    const tx = P.gx, ty = fy; const lx = tx - b.x, ly = ty - b.y; const L = hyp(lx, ly);
    const u = ((q.x - b.x) * lx + (q.y - b.y) * ly) / (L * L); if (u <= 0 || u >= .92) continue;
    const perp = Math.abs((q.x - b.x) * ly - (q.y - b.y) * lx) / L;
    const zAt = lerp(b.z, fz, u) + (P.type === 'freekick' ? (1.1 + P.fk * .013) * Math.sin(Math.PI * u) : 0);
    const reach = 2.0 + E(q, 'jumping') * .004;
    if (perp > 1.1 || zAt > reach) continue;
    const react = clamp((dq - 1.5) / 10, 0, 1);
    const pb = (.62 - perp * .4) * (.75 + .25 * (E(q, 'marking') + E(q, 'reactions')) / 200) * (1 - react * .45);
    if (r() < pb) { res.outcome = 'block'; res.blocker = q; res.u = u; return res; }
  }
  // 골대 / 빗나감
  const inFrame = Math.abs(fy) < GW - BR && fz < GH - BR;
  if (!inFrame) {
    if ((Math.abs(fy) < GW + .12 && fz < GH + .12) && r() < .6) res.outcome = 'post';
    return res;
  }
  // 골키퍼 선방
  if (!gk) { res.outcome = 'goal'; return res; }
  const depth = Math.max(.2, Math.abs(P.gx - gk.x));
  const shotLen = hyp(P.gx - b.x, fy - b.y);
  const k = clamp(1 - depth / Math.max(shotLen, 1), .25, 1);
  const latAtGk = Math.abs(lerp(b.y, fy, 1 - depth / Math.max(shotLen, 1)) - gk.y);
  const zAtGk = lerp(b.z, fz, 1 - depth / Math.max(shotLen, 1));
  const L2 = hyp(latAtGk, Math.max(0, zAtGk - 1.1) * .8) + (zAtGk < .45 && latAtGk > 1.4 ? .2 : 0);
  const t = Math.max(.05, (shotLen - depth) / P.speed);
  // 프리킥은 벽에 가려 늦게 보고, 감기는 궤적 때문에 다이빙 범위가 줄어듦
  const fkw = P.type === 'freekick';
  const react = .42 - E(gk, 'gkReflexes') * .0028 + (P.screened || fkw ? .12 : 0);
  const dive = 2.6 + E(gk, 'gkDiving') * .045;
  const reach = 1.3 + clamp((t - react) * dive, 0, fkw ? 1.75 : 2.85);
  const margin2 = reach - L2;
  const ps = clamp(sig(margin2 * 2.4 - .7 + (E(gk, 'gkHandling') - 70) / 70), .02, .96);
  void k;
  if (r() < ps) {
    res.outcome = 'save';
    const catchP = clamp(.3 + (E(gk, 'gkHandling') - 60) * .012 - (P.speed - 20) * .03 - (L2 > 1.4 ? .3 : 0) - (M.wx ? M.wx.wet * .15 : 0), .05, .9);
    res.save = { caught: r() < catchP, t: t, depth };
  } else res.outcome = 'goal';
  return res;
}
function takeShot(M, p, type) {
  const b = M.ball, T = p.team, O = opp(M, T); const r = M.rng;
  const gk = active(O).find(q => q.code === 'GK');
  const blockers = active(O).filter(q => q !== gk);
  const P = shotParams(M, p, type);
  // 수비수가 시야를 가리면 골키퍼 반응 지연
  P.screened = blockers.some(q => { const dq = hyp(q.x - b.x, q.y - b.y); return dq > 3 && dq < P.d - 3 && Math.abs((q.y - b.y) - (0 - b.y) * (dq / P.d)) < 1; });
  // xG: 같은 모델을 보조 난수로 반복 실행
  let goals = 0; const N = 200;
  for (let i = 0; i < N; i++) if (sampleShot(M, p, P, M.xrng, gk, blockers).outcome === 'goal') goals++;
  const xg = goals / N;
  const res = sampleShot(M, p, P, r, gk, blockers);
  T.st.shots++; T.st.xg += xg; p.r.shots++;
  if (M.assist && M.assist.p && M.assist.p.team === T && M.assist.p !== p && M.t - M.assist.t < 8 && !M.assist.kpDone) { M.assist.p.r.kp++; M.assist.kpDone = true; }
  const onT = res.outcome === 'goal' || res.outcome === 'save';
  if (onT) { T.st.sot++; p.r.sot++; }
  // 공 궤적 설정
  const tx = P.gx + T.dir * (res.outcome === 'miss' ? 3 : .5), ty = res.fy;
  const dx = tx - b.x, dy = ty - b.y; const dist = hyp(dx, dy);
  const tt = dist / P.speed;
  b.owner = null; b.held = false;
  b.vx = dx / tt; b.vy = dy / tt;
  b.vz = (res.fz - b.z + .5 * GRAV * tt * tt) / tt;
  b.spin = 0;
  if (type === 'finesse' || type === 'freekick') {
    const cAmt = 4 + E(p, 'curve') * .05; const sgn = r() < .5 ? -1 : 1; const ang = Math.atan2(dy, dx);
    const lat = .5 * cAmt * tt * tt * .45;
    b.vx += -Math.sin(ang) * sgn * (-lat / tt); b.vy += Math.cos(ang) * sgn * (-lat / tt);
    b.spin = cAmt; b.spinDir = [-Math.sin(ang) * sgn, Math.cos(ang) * sgn];
  }
  // 공기저항 보정
  const drag = 1 + .006 * P.speed * tt; b.vx *= drag; b.vy *= drag;
  p.kickT = M.t; setAnim(p, type === 'header' ? 6 : 1); p.face = Math.atan2(dy, dx);
  b.last = p;
  b.flight = { type: 'shot', from: p, t0: M.t, res, xg, tt, shotType: type, tried: {}, offs: [], gk };
  if (gk) planDive(M, gk, b, res, P);
  M.lastShot = { side: T.side, xg, t: M.t };
  { const lr = M.lastRestart; let origin = 'open';
    if (lr && lr.side === T.side && M.t - lr.t < 10 && (lr.type === 'corner' || lr.type === 'freekick' || lr.type === 'throw')) origin = 'setpiece';
    else if (M.assist && M.assist.p && M.assist.p.team === T && M.t - M.assist.t < 6 && (M.assist.kind === 'cross' || M.assist.kind === 'through')) origin = M.assist.kind;
    else if (M.t - T.winT < 12 && (T.winX ?? 0) < -5) origin = 'counter';
    if (type === 'long' || (type === 'finesse' && P.d > 18)) origin = origin === 'open' ? 'long' : origin;
    M.shotLog.push({ s: T.side, p: p.pid, x: +(b.x * T.dir).toFixed(1), y: +(b.y * T.dir).toFixed(1), xg: +xg.toFixed(3), out: res.outcome, origin, type, f: M.rec ? M.rec.n : 0 }); }
  const tname = { header: '헤더', volley: '발리슛', long: '중거리 슛', finesse: '감아차기', penalty: '페널티킥', freekick: '프리킥' }[type] || '슈팅';
  ev(M, 'shot', T.side, `${p.name}의 ${tname}!`, { pid: p.pid, xg, quiet: true });
  resetReact(M);
}

// ---------- 포지셔닝 ----------
function computeTargets(M) {
  const b = M.ball;
  const possT = possessionTeam(M);
  for (const T of M.teams) {
    const tc = tac(T); const O = opp(M, T);
    const inPoss = possT === T; const bx = tX(T, b.x), by = tY(T, b.y);
    const recentlyLost = M.t - T.lossT < 5 && tc.onLoss === 'counterpress';
    const regroup = M.t - T.lossT < 6 && tc.onLoss === 'regroup';
    const counter = M.t - T.winT < 6 && tc.onWin === 'counter';
    const hold = M.t - T.winT < 6 && tc.onWin === 'holdShape';
    let back, front, wf;
    if (inPoss) {
      back = clamp(bx - .28 + (tc.defLine - 2) * .03, .14, .58);
      front = clamp(back + .48 + (counter ? .06 : 0) - (hold ? .04 : 0), .55, .93);
      wf = [.62, .78, .9, 1.0][tc.width];
    } else {
      const dl = [.2, .26, .32, .38, .45][tc.defLine] - (regroup ? .05 : 0);
      back = clamp(Math.min(dl + (bx - .45) * .3, bx - .05), .04, .42);
      // 볼 보유자가 압박받지 않으면 수비 라인이 뒷공간을 보호하며 내려섬
      const cr = b.owner && b.owner.team !== T ? b.owner : null;
      if (cr) { const [, pd] = nearestOpp(M, cr, cr.x, cr.y); if (pd > 4.5 && fwd(opp(M, T), cr.x) > -25) back = Math.max(.04, back - (tc.offsideTrap ? .02 : .055) * clamp((pd - 4.5) / 4, 0, 1)); }
      const eng = [.38, .46, .55, .64, .74][tc.engage] - (regroup ? .08 : 0);
      front = clamp(Math.min(eng, back + .44, bx + .14), back + .17, .82);
      wf = .7;
    }
    const slots = inPoss ? slotsOf(T.setup) : oopSlotsOf(T.setup);
    const ol = offsideLine(M, T);
    const carrier = b.owner;
    // 라볼피아나: 빌드업 때 DM이 센터백 사이로 내려오면 센터백은 넓게 벌림
    const splitDM = inPoss && bx < .5 ? active(T).find(q => SLOT_GROUP[q.code] === 'DM' && (iv(q, 'split') || role(q).split)) : null;
    for (const p of active(T)) {
      if (p === b.owner) continue;
      const sl = slots[p.slot]; const ro = role(p); const g0 = SLOT_GROUP[sl[0]];
      if (sl[0] === 'GK') { gkTarget(M, p); continue; }
      const f = clamp((sl[1] - .16) / (.84 - .16), 0, 1);
      let x = back + f * (front - back), y = sl[2];
      p.urg = .72;
      if (inPoss) {
        const fwdI = iv(p, 'fwd'), widI = iv(p, 'width'), freeI = iv(p, 'free');
        x += (fwdI < 0 ? 0 : (ro.fwd || 0) * .55) - (ro.hold || 0) - (ro.drop || 0) + fwdI * .055 + (p.tf.ovl && (g0 === 'FB' || g0 === 'WB') && fwdI >= 0 ? .05 : 0);
        let w = ro.wide || 1; if (ro.inside) w *= (1 - ro.inside);
        y = y * w * wf; if (ro.out) y = y + Math.sign(y || 1) * ro.out * .3;
        if (widI && !(widI > 0 && (g0 === 'ST' || g0 === 'AM'))) y *= 1 + widI * .2;
        if (widI > 0 && (g0 === 'ST' || g0 === 'AM')) y += (Math.sign(y) || (p.slot % 2 ? 1 : -1)) * .2; // 수비수 사이 채널로
        if (splitDM === p) { x = back - .03; y = 0; }
        else if (splitDM && g0 === 'CB') y *= 1.6;
        y += by * .18;
        if (tc.creative !== 'disciplined' && (freeI || ro.roam || tc.creative === 'express')) {
          if (M.t > p.roamT) { const amt = (freeI ? .14 : 0) + (ro.roam || 0) * .3 + (tc.creative === 'express' ? .05 : 0); p.roamX = (M.rng() - .5) * amt; p.roamY = (M.rng() - .5) * amt * 2; p.roamT = M.t + 4 + M.rng() * 4; }
          x += p.roamX; y += p.roamY;
        }
      } else {
        const rd = roleD(p);
        y = y * wf * (rd.narrow ? 1 - rd.narrow : 1) + by * (.35 + (rd.wcov || 0));
        if (rd.split) y += (Math.sign(y) || (p.slot % 2 ? 1 : -1)) * rd.split;
        x += (rd.up || 0) - (rd.back || 0);
        if (ro.hold) x -= ro.hold * .5;
        if (rd.line) x = Math.min(x, back + .02);
      }
      x = clamp(x, .03, .97); y = clamp(y, -.96, .96);
      let px = wX(T, x), py = wY(T, y);
      if (inPoss) {
        // 오프사이드 라인 유지
        const lim = ol - .6;
        const isRunner = (ro.run || p.tf.run || (iv(p, 'width') > 0 && (g0 === 'ST' || g0 === 'AM')) || (instr(p).move === 'channels')) && carrier && carrier.team === T;
        if (isRunner && carrier !== p) {
          const err = M.rng.gauss() * (100 - E(p, 'positioning')) * .007;
          const runX = ol - 1.3 + err;
          if (fwd(T, carrier.x) > -10 && hyp(carrier.x - p.x, carrier.y - p.y) < 40) { px = T.dir * Math.max(fwd(T, px), runX); p.urg = .95; }
        }
        if (fwd(T, px) > lim && !isRunner) px = T.dir * lim;
        if (fwd(T, p.x) > ol + .05 && carrier && carrier.team === T) { px = T.dir * Math.min(fwd(T, px), ol - 1.6); p.urg = .95; }
        // 크로스 상황 박스 침투
        if (carrier && carrier.team === T && fwd(T, carrier.x) > 28 && Math.abs(carrier.y) > 12) {
          const g = SLOT_GROUP[sl[0]];
          if (g === 'ST' || g === 'AM' || (g === 'W' && Math.sign(p.y) !== Math.sign(carrier.y)) || (ro.fwd > .1 && g === 'CM')) {
            const spots = [[HL - 6, -Math.sign(carrier.y) * -2.5], [HL - 11, 0], [HL - 7, Math.sign(carrier.y) * -5.5], [HL - 14, Math.sign(carrier.y) * -3]];
            const si = p.tf.fp ? 2 : (p.slot * 7) % spots.length; px = T.dir * spots[si][0]; py = spots[si][1] * 1; p.urg = .95;
          }
        }
        // 지원 움직임: 볼 보유자 근처에서 빈 공간 찾기
        if (carrier && carrier.team === T && hyp(p.x - carrier.x, p.y - carrier.y) < 25) {
          if (M.t > p.supT) {
            let best = null, bv = -1;
            for (let k = 0; k < 6; k++) {
              const cx = px + (M.rng() - .5) * 9, cy = py + (M.rng() - .5) * 9;
              const [, dd] = nearestOpp(M, p, cx, cy); if (dd > bv) { bv = dd; best = [cx, cy]; }
            }
            p.supX = best[0] - px; p.supY = best[1] - py; p.supT = M.t + 2.6 + M.rng() * 1.6;
          }
          px += p.supX; py += p.supY;
        }
      } else {
        // 대인 마크
        const g = SLOT_GROUP[sl[0]];
        let mt = null;
        const ins = instr(p);
        if (ins.markTarget >= 0) mt = active(O).find(q => q.slot === ins.markTarget) || null;
        const ownGoalX = -T.dir * HL;
        if (!mt && (g === 'CB' || g === 'FB' || g === 'WB' || g === 'DM' || g === 'CM')) {
          let bd = 13; for (const q of active(O)) { if (q.code === 'GK') continue; const dq = hyp(q.x - px, q.y - py); if (dq < bd) { bd = dq; mt = q; } }
        }
        if (mt) {
          const tight = ins.mark === 'tight' || ins.markTarget >= 0;
          const md = tight ? 1.3 : 2.4; const gxv = ownGoalX - mt.x, gyv = -mt.y; const gl = hyp(gxv, gyv) || 1;
          const mx = mt.x + gxv / gl * md, my = mt.y + gyv / gl * md;
          const w = ins.markTarget >= 0 ? .95 : tight ? .8 : .5 * (E(p, 'marking') / 85);
          px = lerp(px, mx, clamp(w, 0, .95)); py = lerp(py, my, clamp(w, 0, .95));
          p.urg = (fwd(O, mt.x) > fwd(O, p.x) - 2 || mt.vx * O.dir > 3) ? 1 : .85;
        }
        // 오프사이드 트랩 / 라인 통일
        if (g === 'CB' || g === 'FB' || g === 'WB') {
          const capOn = active(T).some(q => q.d.id === T.setup.captain) ? .7 : 1;
          const lineNoise = tc.offsideTrap ? 0 : (100 - E(p, 'marking')) * .02 * capOn * Math.sin(p.pid * 1.7 + M.t * .2);
          const lineX = wX(T, back);
          if (fwd(T, px) > fwd(T, lineX) + 1.5 && !mt) px = lineX;
          px += T.dir * lineNoise;
          if (tc.offsideTrap && carrier && carrier.team === O && fwd(O, carrier.x) > -20) px += T.dir * 2.2;
        }
      }
      p.tx = clamp(px, -HL + .5, HL - .5); p.ty = clamp(py, -HW + .5, HW - .5);
    }
    // 위험 지역 대인 마크: 우리 진영 깊숙이 들어온 상대 공격수를 1:1로 붙잡음
    if (!inPoss && bx < .4) {
      const gx0 = -T.dir * HL;
      const threats = active(O).filter(q => q.code !== 'GK' && q !== b.owner && hyp(q.x - gx0, q.y) < 30).sort((a1, a2) => hyp(a1.x - gx0, a1.y) - hyp(a2.x - gx0, a2.y));
      const free = active(T).filter(q => { const g = SLOT_GROUP[q.code]; return g === 'CB' || g === 'FB' || g === 'WB' || g === 'DM' || (g === 'CM' && threats.length > 4); });
      for (const at of threats) {
        let bi = -1, bd = 22; for (let i = 0; i < free.length; i++) { const dd = hyp(free[i].x - at.x, free[i].y - at.y); if (dd < bd) { bd = dd; bi = i; } }
        if (bi < 0) continue; const df = free.splice(bi, 1)[0];
        const vx = gx0 - at.x, vy = -at.y, l = hyp(vx, vy) || 1; const md = .9 + (100 - E(df, 'marking')) * .015;
        df.tx = at.x + vx / l * md + at.vx * .25; df.ty = at.y + vy / l * md + at.vy * .25; df.urg = 1;
      }
    }
    // 프레싱
    if (!inPoss) assignPress(M, T, recentlyLost, regroup);
  }
  assignChasers(M);
}
function gkTarget(M, p) {
  const T = p.team, b = M.ball, gx = -T.dir * HL; const d = hyp(b.x - gx, b.y);
  const rdk = roleD(p); const sweep = rdk.sweep != null ? rdk.sweep : (role(p).sweep || p.tf.sk ? 1 : 0);
  let depth = d > 35 ? 5 + sweep * 8 + tac(T).defLine : d < 18 ? clamp(d * .38, 1.5, 7) : 1 + Math.min(4.5, d * .11);
  const ang = Math.atan2(b.y, b.x - gx);
  const err = (100 - E(p, 'gkPositioning')) * .028 * Math.sin(M.t * .7 + p.pid);
  p.tx = gx + Math.cos(ang) * depth; p.ty = clamp(Math.sin(ang) * depth * .9 + err, -GW - 1, GW + 1);
  if (Math.sign(p.tx) !== Math.sign(gx) && d > 35) p.tx = gx + T.dir * depth;
  p.urg = d < 25 ? 1 : .6;
}
function possessionTeam(M) {
  const b = M.ball;
  if (b.owner) return b.owner.team;
  if (b.flight && b.flight.from && b.flight.type !== 'shot' && b.flight.type !== 'clear') return b.flight.from.team;
  return null;
}
function assignPress(M, T, counterpress, regroup) {
  const b = M.ball; const tc = tac(T); const c = b.owner;
  if (!c || c.team === T || b.held) return;
  const eng = [.38, .46, .55, .64, .74][tc.engage];
  const bxt = tX(T, b.x);
  const zone = bxt <= eng + .08 || counterpress;
  if (!zone && !counterpress) return;
  const nPress = regroup ? 1 : counterpress ? 3 : [1, 1, 2, 2][tc.press];
  const range = regroup ? 6 : counterpress ? 22 : [9, 15, 20, 26][tc.press];
  const cand = active(T).filter(p => p.code !== 'GK').map(p => {
    let d = hyp(p.x - c.x, p.y - c.y); d -= (instr(p).press + (role(p).press || 0) + (roleD(p).press || 0)) * 4; return [p, d];
  }).sort((a, b2) => a[1] - b2[1]);
  // 기본 수비: 골문 쪽에 선 가장 가까운 수비수가 볼 보유자를 막아섬 (압박 설정과 무관)
  if (bxt < .62) {
    const gx0 = -T.dir * HL;
    const dg = hyp(gx0 - c.x, c.y);
    const list = active(T).filter(p => p.code !== 'GK' && p.stun <= 0 && fwd(T, p.x) <= fwd(T, c.x) + 2).map(p => [p, hyp(p.x - c.x, p.y - c.y)]).filter(e => e[1] < 18).sort((a, z) => a[1] - z[1]);
    const nC = dg < 32 ? 2 : 1;
    for (let i = 0; i < Math.min(nC, list.length); i++) {
      const [cont, cd] = list[i]; const vx = gx0 - c.x, vy = -c.y; const l = hyp(vx, vy) || 1;
      const k = i === 0 ? (dg < 30 ? .6 : clamp(cd * .15, .7, 2)) : 3.5;
      cont.tx = c.x + vx / l * k + c.vx * .3; cont.ty = c.y + vy / l * k + c.vy * .3; cont.urg = 1; cont.pressing = M.t;
    }
  }
  for (let i = 0; i < Math.min(nPress, cand.length); i++) {
    const [p, d] = cand[i]; if (d > range && i > 0) break; if (d > range * 1.6) break;
    const gx = -T.dir * HL; const vx = gx - c.x, vy = -c.y; const l = hyp(vx, vy) || 1;
    let ox = vx / l * 1.0, oy = vy / l * 1.0;
    if (tc.trap === 'inside') oy += Math.sign(c.y) * 1.2; else if (tc.trap === 'outside') oy -= Math.sign(c.y) * 1.2;
    p.tx = c.x + ox + c.vx * .3; p.ty = c.y + oy + c.vy * .3; p.urg = 1; p.pressing = M.t;
  }
}
function assignChasers(M) {
  const b = M.ball; if (b.owner) return;
  if (b.flight && b.flight.type === 'shot') return;
  const pr = predict(M, 40);
  const f = b.flight;
  const arr = new Map();
  for (const p of M.pidList) {
    if (p.off || M.t - p.kickT < .3 || p.stun > 0) continue;
    if (p.code === 'GK' && !inOwnBox(p.team, pr[Math.min(15, pr.length - 1)])) continue;
    const delay = Math.max(0, p.reactT - M.t); const sp = maxSpd(p);
    let tBest = null;
    for (const q of pr) { if (q.z > 2.6) continue; const dist = Math.max(0, hyp(q.x - p.x, q.y - p.y) - .8); if (delay + dist / sp + .15 <= q.t) { tBest = q; break; } }
    arr.set(p, tBest ? { q: tBest, t: tBest.t } : { q: pr[pr.length - 1], t: Infinity });
  }
  const passT = f && f.target && !f.target.off && f.from && f.from.team === f.target.team ? f.target.team : null;
  let tRecv = Infinity;
  if (passT) { const a = arr.get(f.target); if (a) { f.target.tx = a.q.x; f.target.ty = a.q.y; f.target.urg = 1; tRecv = a.t; } }
  for (const T of M.teams) {
    const list = active(T).filter(p => arr.has(p)).map(p => [p, arr.get(p)]).sort((x, y) => x[1].t - y[1].t || hyp(x[1].q.x - x[0].x, x[1].q.y - x[0].y) - hyp(y[1].q.x - y[0].x, y[1].q.y - y[0].y));
    if (passT === T) { // 패스한 팀: 받는 선수 외 1명만 보조
      const sup = list.find(e => e[0] !== f.target && e[1].t < Infinity); if (sup && sup[1].t < tRecv - .3) { sup[0].tx = sup[1].q.x; sup[0].ty = sup[1].q.y; sup[0].urg = .95; }
      continue;
    }
    if (passT) { // 수비 팀: 받는 선수보다 먼저 닿을 수 있을 때만 끊으러 감
      const c = list[0]; if (c && c[1].t < tRecv + .1) { c[0].tx = c[1].q.x; c[0].ty = c[1].q.y; c[0].urg = 1; }
      continue;
    }
    for (let i = 0; i < Math.min(2, list.length); i++) { const [p, a] = list[i]; p.tx = a.q.x; p.ty = a.q.y; p.urg = 1; }
  }
}
function inOwnBox(T, q) { return q && -fwd(T, q.x) > BOX_X && Math.abs(q.y) < BOX_Y; }

// ---------- 이동 ----------
function movePlayers(M) {
  for (const T of M.teams) for (const p of active(T)) {
    if (p.stun > 0) { p.stun -= DT; p.animT += DT; const fr = p.diving && M.t - p.diving < .4 ? .93 : .8; p.vx *= fr; p.vy *= fr; p.x += p.vx * DT; p.y += p.vy * DT; p.dist += hyp(p.vx, p.vy) * DT; continue; }
    // 공과 먼 선수는 제자리에 멈춰 서 있지 않도록 목표 주변을 천천히 맴돎
    let wx = 0, wy = 0;
    if (M.phase === 'play' && p.code !== 'GK' && (p.urg || .7) < .85 && M.ball.owner !== p) { const ph = p.pid * 1.7; wx = Math.sin(M.t * .21 + ph) * 1.4; wy = Math.cos(M.t * .17 + ph * 1.3) * 1.6; }
    const dx = p.tx + wx - p.x, dy = p.ty + wy - p.y; const d = hyp(dx, dy);
    let ms = maxSpd(p) * fatigue(p);
    const own = M.ball.owner === p;
    if (own) {
      ms *= (.6 + E(p, 'dribbling') * .002);
      const fx = Math.cos(p.face), fy = Math.sin(p.face);
      for (const o of active(opp(M, T))) { if (o.stun > 0) continue; const ox = o.x - p.x, oy = o.y - p.y; const od = hyp(ox, oy); const fr = (ox * fx + oy * fy) / (od || 1); if (od < 1.4 && fr > .4) { ms *= .3 + E(p, 'agility') * .002; break; } if (od < 3.2 && fr > .5) { ms *= .55 + E(p, 'agility') * .002; break; } }
    }
    const urg = p.urg || .7; let want;
    if (own) want = d < .25 ? 0 : Math.min(ms, d * 1.8);
    else { // 급한 정도(urg)에 따라 걷기 → 조깅 → 전력 질주로 연속적으로 바뀜 (갑자기 뛰기 시작하는 느낌 완화)
      const u = clamp((urg - .6) / .4, 0, 1), us = u * u * (3 - 2 * u);
      const cap = ms * (.6 + .4 * us);
      const dz = p.code === 'GK' ? .3 : (us > .8 ? .25 : 1.0);
      want = d < dz ? 0 : Math.min(cap, .6 + (d - dz) * (.55 + 1.3 * us));
    }
    if (M.phase !== 'play') want = d < .6 ? 0 : Math.min(ms * .4, .8 + d * .25);
    const tvx = d > 0 ? dx / d * want : 0, tvy = d > 0 ? dy / d * want : 0;
    let ax = tvx - p.vx, ay = tvy - p.vy; const al = hyp(ax, ay); const am = maxAcc(p) * DT * (own ? .8 : 1);
    if (al > am) { ax *= am / al; ay *= am / al; }
    p.vx += ax; p.vy += ay; p.x += p.vx * DT; p.y += p.vy * DT; p.dist += hyp(p.vx, p.vy) * DT;
    if (M.phase === 'play') { p.sx += p.x * p.team.dir; p.sy += p.y * p.team.dir; p.sn++;
      // 히트맵: 공격 방향을 오른쪽으로 맞춘 24×16 칸에 0.5초마다 누적
      if (M.tick % 5 === 0) { const hm = p.hm || (p.hm = new Uint16Array(HM_W * HM_H)); const cx = clamp(Math.floor((p.x * p.team.dir + HL) / 105 * HM_W), 0, HM_W - 1), cy = clamp(Math.floor((p.y * p.team.dir + HW) / 68 * HM_H), 0, HM_H - 1); hm[cy * HM_W + cx]++; } }
    p.x = clamp(p.x, -HL - 3, HL + 3); p.y = clamp(p.y, -HW - 3, HW + 3);
    const sp = hyp(p.vx, p.vy);
    if (sp > .6 && !(p.anim >= 1 && p.anim <= 7 && p.animT < .5)) p.face = Math.atan2(p.vy, p.vx);
    else if (!own) { const bf = Math.atan2(M.ball.y - p.y, M.ball.x - p.x); p.face += angDiff(bf, p.face) * .2; }
    // 체력 소모
    // 체력 소모: 달린 거리·속도(전력 질주일수록 크게)와 스태미너에 비례. 90분 풀타임이면 보통 40~65%까지 떨어짐
    const sf = clamp(1.75 - p.s.stamina * .0125, .5, 1.3) * (M.wx ? 1 + M.wx.heat * .14 + M.wx.slow * .1 : 1);
    p.energy = clamp(p.energy - EN_K * (.25 + (sp / 6) * (sp / 6)) * sf * DT, 3, 100);
    p.animT += DT;
    if (p.anim && p.anim !== 10 && p.anim !== 8) { const dv = p.anim === 4 || p.anim === 5 || p.anim === 11 || p.anim === 12; if (p.animT > (dv ? 1.9 : 1.2)) p.anim = M.ball.owner === p && M.ball.held ? 10 : 0; }
  }
}

// ---------- 볼 보유자 의사결정 ----------
function decide(M, p) {
  const T = p.team, tc = tac(T), b = M.ball, r = M.rng; const ro = role(p), ins = instr(p);
  if (b.held) return gkDistribute(M, p);
  const O = opp(M, T);
  const pressure = pressureOn(M, p);
  const opts = [];
  // 1) 슈팅
  const dGoal = hyp(T.dir * HL - b.x, b.y);
  if (dGoal < 35 && fwd(T, b.x) > 10) {
    let q = xq(T, b.x, b.y) * (1 - .35 * pressure);
    const blockers = active(O).filter(o => o.code !== 'GK' && Math.abs(o.y - b.y * (1 - (fwd(T, o.x) - fwd(T, b.x)) / dGoal)) < 1.5 && fwd(T, o.x) > fwd(T, b.x) && fwd(T, o.x) - fwd(T, b.x) < dGoal).length;
    q *= Math.pow(.7, blockers);
    let mod = 1 + ins.shoot * .45 + (ro.shoot || 0) * .3 + (p.tf.ls && dGoal > 18 ? .25 : 0) + (tc.finalThird === 'shootOnSight' ? .4 : tc.finalThird === 'workIn' ? -.35 : 0);
    if (dGoal > 18) mod *= .8 + E(p, 'longShots') / 110; else mod *= .8 + E(p, 'finishing') / 220;
    if (p.code === 'GK') mod = 0;
    const thr = .017 * (tc.finalThird === 'shootOnSight' ? .6 : tc.finalThird === 'workIn' ? 1.4 : 1) * (1 - ins.shoot * .3) * (1 - (ro.shoot || 0) * .2);
    const longOk = dGoal > 18 && q > .018 && r() < .14 + (p.tf.ls ? .12 : 0) + ins.shoot * .12 + (ro.shoot || 0) * .08 + (E(p, 'longShots') - 65) / 120 + (tc.finalThird === 'shootOnSight' ? .12 : 0);
    if (q * (.7 + E(p, 'longShots') / 300) > thr || longOk) opts.push({ k: 'shoot', u: q * mod * 1.15 + (longOk ? .025 : 0) });
  }
  // 2) 패스
  const vis = E(p, 'vision');
  const seeRange = 18 + vis * .38;
  const lossCost = .02 + .1 * clamp(1 - tX(T, b.x), 0, 1) + (p.code === 'GK' ? .08 : 0);
  const riskTol = 1 + (p.tf.kp ? .25 : 0) + (p.tf.bu && fwd(T, b.x) < 0 ? -.15 : 0) + ins.pass * .35 + (ro.risk || 0) * .4 + (tc.passing - 1) * .2 + (tc.creative === 'express' ? .2 : tc.creative === 'disciplined' ? -.15 : 0);
  const curT = threat(T, b.x, b.y);
  const crI = iv(p, 'cross'), crFrom = iv(p, 'crossFrom'), crTgt = iv(p, 'crossTarget'), plen = iv(p, 'plen');
  const wide = Math.abs(b.y) > (crI > 0 ? 8 : 10.5) && fwd(T, b.x) > (crFrom === 'deep' ? 12 : 17);
  // 크로스 목표 지점 (개인 지침)
  const sgnY = Math.sign(b.y || 1);
  const crossSpot = crTgt === 'near' ? [HL - 6, sgnY * 2.5] : crTgt === 'center' ? [HL - 10, 0] : crTgt === 'far' ? [HL - 7.5, -sgnY * 4.5] : null;
  const tgtMan = crTgt === 'target' ? active(T).filter(a => a !== p && a.code !== 'GK').sort((a, c) => (E(c, 'heading') + E(c, 'jumping')) - (E(a, 'heading') + E(a, 'jumping')))[0] : null;
  const ol0 = offsideLine(M, T);
  for (const q of active(T)) {
    if (q === p || q.stun > 0) continue;
    const d0 = hyp(q.x - b.x, q.y - b.y);
    if (d0 < 4) continue;
    if (fwd(T, q.x) > ol0 + .2 && r() < .75 + vis / 330) continue; // 오프사이드 위치의 동료는 대부분 알아챔
    if (d0 > seeRange && r() > .25) continue; // 시야 밖 선수는 놓치기 쉬움
    const cands = [];
    const lead = Math.min(1.2, d0 / 20);
    cands.push([q.x + q.vx * lead, q.y + q.vy * lead, d0 > 45 ? 'lofted' : 'ground']);
    if (d0 > 22 && d0 <= 45) cands.push([q.x + q.vx * lead, q.y + q.vy * lead, 'lofted']);
    // 스루 패스
    const qr = role(q); const qi = instr(q);
    const runningOn = q.vx * T.dir > 2.5 || (qr.run && q.urg >= .95);
    if ((qr.run || qi.move === 'channels' || (iv(q, 'width') > 0 && (SLOT_GROUP[q.code] === 'ST' || SLOT_GROUP[q.code] === 'AM')) || SLOT_GROUP[q.code] === 'ST' || SLOT_GROUP[q.code] === 'W') && runningOn && fwd(T, q.x) > fwd(T, b.x) - 3 && (vis > 70 || ro.pm || p.tf.kp) && r() < .3 + vis / 400 + (p.tf.kp ? .2 : 0)) {
      const ol = ol0; if (fwd(T, q.x) <= ol + .1 && fwd(T, q.x) > ol - 5) {
        const tpx = T.dir * Math.min(HL - 7, fwd(T, q.x) + 4 + vis * .03), tpy = q.y * .9;
        cands.push([tpx, tpy, 'through']);
      }
    }
    if (wide && (SLOT_GROUP[q.code] === 'ST' || inBoxOf(T, q.x, q.y)) && (!tgtMan || q === tgtMan)) {
      if (crossSpot) cands.push([T.dir * crossSpot[0], crossSpot[1], 'cross']);
      else { cands.push([q.x, q.y, 'cross']); if (fwd(T, q.x) < HL - 13) cands.push([T.dir * (HL - 8 - r() * 4), (r() - .5) * 8, 'cross']); }
    }
    for (const [cx, cy, kind] of cands) {
      if (Math.abs(cy) > HW - 1 || Math.abs(cx) > HL - 1) continue;
      const d = hyp(cx - b.x, cy - b.y);
      let acc = kind === 'cross' ? E(p, 'crossing') * .8 + E(p, 'curve') * .2 : kind === 'through' ? (vis * .5 + E(p, 'shortPass') * .3 + E(p, 'longPass') * .2) - 6 : (d < 25 && kind !== 'lofted') ? E(p, 'shortPass') * .85 + vis * .15 : E(p, 'longPass') * .8 + vis * .2;
      const risk = passRisk(M, p, cx, cy, d, kind, acc, q);
      const [, od] = nearestOpp(M, q, cx, cy);
      const open = Math.pow(clamp(od / 6, .3, 1.1), 1.5);
      let val = threat(T, cx, cy) * open;
      if (kind === 'cross') {
        const att = active(T).filter(a => inBoxOf(T, a.x, a.y)).length; const def = active(O).filter(a => inBoxOf(T, a.x, a.y)).length;
        val = (.15 + .065 * att / (1 + def * .25) * (1 + (ro.cross || 0)) * (tc.cross === 'low' ? 1.1 : 1)) * (1 + crI * .6);
        if (crFrom === 'byline') val *= fwd(T, b.x) > HL - 14 ? 1.3 : .72;
        else if (crFrom === 'deep') val *= fwd(T, b.x) < HL - 20 ? 1.3 : .9;
      }
      // 패스 길이 지침
      if (plen < 0 && d > 25 && kind !== 'cross') val *= .7; else if (plen > 0 && d > 25) val *= 1.18; else if (plen > 0 && d < 10) val *= .85;
      const prog = (fwd(T, cx) - fwd(T, b.x)) / 105;
      let u = (1 - risk) * val + prog * .05 * (1 + tc.passing * .4) * riskTol - risk * lossCost / Math.max(.5, riskTol);
      if (tc.passing === 0 && d > 25) u -= .03;
      if (tc.focus !== 'mixed') { const fy = tY(T, cy); if ((tc.focus === 'left' && fy < -.35) || (tc.focus === 'right' && fy > .35) || (tc.focus === 'center' && Math.abs(fy) < .35)) u += .012; }
      if ((p.code === 'GK' || SLOT_GROUP[p.code] === 'CB') && !tc.buildUp && d > 30) u += .02;
      if ((p.code === 'GK' || SLOT_GROUP[p.code] === 'CB') && tc.buildUp && d < 25) u += .01;
      if (role(q).pm && fwd(T, b.x) < 0) u += .008;
      opts.push({ k: 'pass', u, q, cx, cy, kind, acc, key: val > curT * 1.3, risk });
    }
  }
  // 3) 드리블 / 전진
  const ang = Math.atan2(-b.y * .25 * T.dir, T.dir) ;
  const dDir = iv(p, 'dribDir');
  const aheadX = T.dir * Math.min(fwd(T, b.x) + 6, HL - (dDir === 'wide' || crFrom === 'byline' ? 3 : 7));
  const aheadY = dDir === 'inside' ? b.y * .4 : dDir === 'wide' || crFrom === 'byline' ? sgnY * Math.min(HW - 2.5, Math.abs(b.y) + 4) : fwd(T, b.x) > 25 ? b.y * .7 : b.y * .9;
  const [, oAhead] = nearestOpp(M, p, aheadX, aheadY);
  const [nOpp, oNear] = nearestOpp(M, p, b.x, b.y);
  const dribSkill = (E(p, 'dribbling') + E(p, 'agility') + E(p, 'ballControl')) / 3;
  let dribMod = 1 + ins.dribble * .4 + (ro.drib || 0) * .4 + (ro.carry || 0) * .3 + (p.tf.dr ? .35 : 0) - (p.tf.qr ? .2 : 0);
  // 드리블 유지 확률: 주변 수비수의 태클 능력 vs 드리블 능력
  let pKeep = 1;
  { const cx = aheadX - b.x, cy = aheadY - b.y, cl = hyp(cx, cy) || 1;
    for (const o of active(O)) { if (o.stun > 0) continue; const ox = o.x - b.x, oy = o.y - b.y, od = hyp(ox, oy); if (od > 10) continue;
      const a = (ox * cx + oy * cy) / (cl * (od || 1)); const w = clamp((9 - od) / 9, 0, 1) * (a > .2 ? 1 : a > -.3 ? .55 : .25);
      const defSkill = (E(o, 'standTackle') + E(o, 'marking') + E(o, 'reactions')) / 3;
      pKeep *= 1 - w * sig((defSkill - dribSkill) / 20 + .5) * .95; } }
  const takeOn = pKeep;
  const aheadPress = clamp((4 - oAhead) / 4, 0, 1);
  let crowd = 0; for (const o of active(O)) if (hyp(o.x - aheadX, o.y - aheadY) < 6.5) crowd++;
  dribMod *= Math.pow(.62, crowd);
  let du = (pKeep * threat(T, aheadX, aheadY) * (1 - .5 * aheadPress) * .7 - (1 - pKeep) * lossCost) * dribMod;
  if (fwd(T, b.x) > HL - 9 && !(crFrom === 'byline' && Math.abs(b.y) > 12)) du *= .3;
  if (crFrom === 'byline' && Math.abs(b.y) > 12 && fwd(T, b.x) < HL - 14) du += .007;
  if (p.code === 'GK') du = -1;
  if (SLOT_GROUP[p.code] === 'CB' && !(ro.carry)) du *= .6;
  opts.push({ k: 'dribble', u: du + .004, tx: aheadX, ty: aheadY, ang });
  // 4) 보유 / 시간 지연
  const waste = (tc.waste === 2 && M.score[T.side] > M.score[1 - T.side] && M.t > 4800);
  opts.push({ k: 'hold', u: curT * .7 - pressure * .06 + (waste ? .03 : 0) });
  // 5) 걷어내기
  if (-fwd(T, b.x) > 30 && pressure > .5) opts.push({ k: 'clear', u: .02 + pressure * .03 * (tc.buildUp ? .6 : 1.3) });
  // 선택: 시야/창조성에 따른 온도
  const temp = .0045 * (1.25 - vis / 160) * (tc.creative === 'express' ? 1.4 : tc.creative === 'disciplined' ? .75 : 1);
  let mx = -1e9; for (const o of opts) mx = Math.max(mx, o.u);
  let sum = 0; for (const o of opts) { o.w = Math.exp((o.u - mx) / temp); sum += o.w; }
  let pick = r() * sum, ch = opts[0]; for (const o of opts) { pick -= o.w; if (pick <= 0) { ch = o; break; } }
  if (M.dbg) { M.dbg[ch.k] = (M.dbg[ch.k] || 0) + 1; const bp = opts.filter(o => o.k === 'pass').sort((x, y) => y.u - x.u)[0]; const dr = opts.find(o => o.k === 'dribble'); M.dbg.n = (M.dbg.n || 0) + 1; M.dbg.bp = (M.dbg.bp || 0) + (bp ? bp.u : 0); M.dbg.dr = (M.dbg.dr || 0) + dr.u; M.dbg.np = (M.dbg.np || 0) + opts.filter(o => o.k === 'pass').length; if (bp) { M.dbg.risk = (M.dbg.risk || 0) + bp.risk; } }
  const tmpI = iv(p, 'tempo');
  const tempo = [1.9, 1.5, 1.15, .92, .72][tc.tempo] * (waste ? 1.6 : 1) * (tmpI > 0 ? .72 : tmpI < 0 ? 1.4 : 1) * (p.tf.qr ? .75 : 1);
  switch (ch.k) {
    case 'shoot': {
      const d = dGoal; let type = 'normal';
      if (b.z > 1.2) type = 'header'; else if (b.z > .35) type = 'volley';
      else if (d > 19) type = (E(p, 'curve') > 74 && r() < E(p, 'curve') / 180 + (p.tf.cu ? .25 : 0)) ? 'finesse' : 'long';
      else if (E(p, 'curve') > 76 && Math.abs(b.y) > 6 && r() < .35 + (p.tf.cu ? .3 : 0)) type = 'finesse';
      takeShot(M, p, type); break;
    }
    case 'pass': {
      const kind = ch.kind; T.st.passes++; p.r.pass++;
      // 크로스: 바로 앞을 막은 수비수에게 맞으면 대개 골라인 쪽으로 굴절 (코너킥의 주된 원인)
      if (kind === 'cross') { const bl = active(O).find(o => o.code !== 'GK' && o.stun <= 0 && hyp(o.x - b.x, o.y - b.y) < 3 && ((o.x - b.x) * (ch.cx - b.x) + (o.y - b.y) * (ch.cy - b.y)) > 0);
        if (bl && r() < .42 * (1 - hyp(bl.x - b.x, bl.y - b.y) / 3) + .14) { T.st.crossBlk = (T.st.crossBlk || 0) + 1; p.kickT = M.t; setAnim(p, 1); setAnim(bl, 2); deflect(M, bl, 8 + r() * 7, Math.atan2(Math.sign(b.y || 1) * (r() * .3), T.dir), .25); ev(M, 'block', bl.team.side, `${bl.name}가 크로스를 막아냅니다.`, { pid: bl.pid, quiet: true }); break; } }
      kickTo(M, p, ch.cx, ch.cy, kind, ch.acc, { target: ch.q, crossType: tc.cross === 'mixed' ? r.pick(['low', 'high', 'whipped', 'normal']) : tc.cross, key: ch.key });
      if (p.tf.one2 && kind === 'ground' && hyp(ch.cx - p.x, ch.cy - p.y) < 18) { p.supX = T.dir * 7; p.supY = 0; p.supT = M.t + 2.2; }
      break;
    }
    case 'dribble': {
      p.tx = ch.tx; p.ty = ch.ty; p.urg = 1; p.decT = tempo * (.5 + r() * .5); p.dribbling = true;
      if (oNear < 2.2 && nOpp) p.takeOn = M.t;
      return;
    }
    case 'hold': { p.tx = p.x - T.dir * .5; p.ty = p.y; p.urg = .4; p.decT = tempo * (.4 + r() * .5); return; }
    case 'clear': {
      const tx = T.dir * (10 + r() * 25), ty = (r() - .5) * 50;
      kickTo(M, p, tx, ty, 'clear', E(p, 'longPass') * .6 + 20, {}); ev(M, 'clear', T.side, `${p.name} 걷어냅니다.`, { quiet: true });
      break;
    }
  }
}
function passRisk(M, p, cx, cy, d, kind, acc, q) {
  const O = opp(M, p.team), b = M.ball;
  const lofted = kind === 'lofted' || kind === 'cross';
  const vavg = lofted ? 15 : 15;
  const dRecv = q ? hyp(q.x - cx, q.y - cy) : 3;
  const lx = cx - b.x, ly = cy - b.y; const L2 = lx * lx + ly * ly || 1;
  let surv = 1;
  for (const o of active(O)) {
    let u = ((o.x - b.x) * lx + (o.y - b.y) * ly) / L2;
    if (u < -.05 || u > 1.15) continue;
    u = clamp(u, 0, 1);
    const px = b.x + lx * u, py = b.y + ly * u; const dl = hyp(o.x - px, o.y - py);
    let ri;
    if (u > .85) {
      // 받는 지점 근처: 수비수가 받는 선수보다 먼저 도달하는지
      const dTo = hyp(o.x - cx, o.y - cy);
      ri = lofted ? sig((dRecv + 2.5 + (d / 16) * 4.2 - dTo) * .8) * .85 : sig((dRecv + 1.2 - dTo) * 1.3) * .55;
    } else {
      if (lofted) continue;
      const tb = u * d / vavg + .05; const to = Math.max(0, dl - .8) / 6.5 + .38;
      ri = sig((tb - to) * 4.5) * .7 * clamp(u * 3, .25, 1);
      // 패스 길목에 몸이 서 있으면 공이 몸에 맞으므로 위험이 매우 큼
      if (dl < .7 && u > .03) ri = Math.max(ri, .9 * (1 - dl / .7));
    }
    surv *= (1 - ri);
  }
  const accRisk = clamp(d * (100 - acc) / 5000 * (lofted ? 1.4 : 1) + (lofted ? .15 : 0), 0, .7);
  const oq = q && oiOf(M, q); if (oq && oq.mark) surv *= .9;
  return clamp(1 - surv * (1 - accRisk), 0, .98);
}
function gkDistribute(M, p) {
  const T = p.team, tc = tac(T), r = M.rng;
  const outfield = active(T).filter(q => q !== p);
  // 개인 지침(배급 방식·대상·패스 길이)이 있으면 팀 지침보다 우선
  const pm = iv(p, 'gkMethod'), pt = iv(p, 'gkTarget'), pl = iv(p, 'plen');
  const gkd = role(p).gkd; let method = pm !== 'team' ? pm : gkd === 'short' && tc.gkMethod !== 'kick' ? r.pick(['roll', 'roll', 'pass', 'throw']) : gkd === 'long' ? 'kick' : tc.gkMethod;
  if (method === 'mixed') method = r.pick(pl < 0 ? ['roll', 'roll', 'throw', 'pass'] : pl > 0 ? ['kick', 'kick', 'kick', 'throw'] : tc.buildUp ? ['roll', 'roll', 'throw', 'kick'] : ['kick', 'kick', 'throw']);
  const grp = q => SLOT_GROUP[q.code];
  const tgt = pt !== 'team' ? pt : tc.gkTarget;
  if (tgt === 'behind') {
    // 상대 수비진 뒤 공간으로 길게
    const O = opp(M, T); const ol = Math.max(...active(O).filter(o => o.code !== 'GK').map(o => fwd(T, o.x)));
    const st = outfield.filter(q => grp(q) === 'ST' || grp(q) === 'W').sort((a, c) => fwd(T, c.x) - fwd(T, a.x))[0] || outfield[0];
    M.ball.held = false; T.st.passes++; p.r.pass++;
    return kickTo(M, p, T.dir * Math.min(HL - 12, ol + 6), st.y * .8, 'lofted', E(p, 'gkKicking'), { target: st });
  }
  const pref = { cb: q => grp(q) === 'CB', fb: q => grp(q) === 'FB' || grp(q) === 'WB', cm: q => grp(q) === 'CM' || grp(q) === 'DM', playmaker: q => role(q).pm, target: q => role(q).target || grp(q) === 'ST', wing: q => grp(q) === 'W', any: () => true }[tgt] || (() => true);
  let pool = outfield.filter(pref);
  if (method === 'roll' || method === 'throw' || method === 'pass') pool = pool.filter(q => hyp(q.x - p.x, q.y - p.y) < (method === 'roll' ? 30 : 40));
  if (method === 'kick') pool = pool.filter(q => hyp(q.x - p.x, q.y - p.y) > 25);
  if (!pool.length) pool = outfield;
  pool.sort((a, b) => nearestOpp(M, b, b.x, b.y)[1] - nearestOpp(M, a, a.x, a.y)[1]);
  const q = pool[Math.floor(r() * Math.min(3, pool.length))];
  M.ball.held = false;
  T.st.passes++; p.r.pass++;
  const acc = E(p, 'gkKicking');
  if (method === 'kick') kickTo(M, p, q.x + T.dir * 3, q.y, 'lofted', acc, { target: q });
  else if (method === 'throw') kickTo(M, p, q.x, q.y, 'throw', acc + 10, { target: q, noOffside: true });
  else if (method === 'pass') kickTo(M, p, q.x, q.y, 'ground', acc + 6, { target: q });
  else kickTo(M, p, q.x, q.y, 'roll', acc + 12, { target: q });
}

// ---------- 볼 접촉 / 경합 ----------
function ballContacts(M) {
  const b = M.ball; const f = b.flight; const r = M.rng;
  if (b.owner) return;
  if (f && f.type === 'shot') return shotProgress(M);
  const sp = hyp(b.vx, b.vy);
  // 공중볼 경합
  if (b.z > 1.15 && b.z < 3.1) {
    const cands = [];
    for (const p of M.pidList) {
      if (p.off || p.stun > 0 || M.t - p.kickT < .4) continue;
      const d = hyp(p.x - b.x, p.y - b.y);
      const isGK = p.code === 'GK' && inOwnBox(p.team, b);
      const reach = isGK ? 2.4 + E(p, 'jumping') * .004 + .6 : 1.9 + E(p, 'jumping') * .009;
      if (d < (isGK ? 1.8 : 1.5) && b.z < reach && !(f && f.tried[p.pid] > M.t - .6)) cands.push(p);
    }
    // 상대 경합이 없으면 떨어지는 공을 가슴/발로 받도록 기다림
    const solo = cands.length && f && f.from && cands.every(p => p.team === f.from.team) && b.vz < 0 && b.z < 2.3;
    if (cands.length && !solo) {
      for (const p of cands) if (f) f.tried[p.pid] = M.t;
      const w = cands.map(p => {
        const isGK = p.code === 'GK';
        let s = isGK ? (E(p, 'gkHandling') * .5 + E(p, 'jumping') * .2 + E(p, 'gkPositioning') * .3 + 18) : (E(p, 'jumping') * .4 + E(p, 'heading') * .35 + E(p, 'strength') * .25);
        if (!isGK && f && f.target === p) s += 12 + E(p, 'positioning') * .06;
        if (!isGK && p.tf.hd) s += 4;
        if (!isGK && f && f.from && f.from.team !== p.team && p.code !== 'GK' && SLOT_GROUP[p.code] === 'CB') s += 3;
        if (!isGK && p.zone && f && f.from && f.from.team !== p.team && M.t - (M.lastRestart ? M.lastRestart.t : -99) < 4) s += 3;
        return Math.exp(s / 14);
      });
      let tot = w.reduce((a, c) => a + c, 0); let pk = r() * tot; let win = cands[0];
      for (let i = 0; i < cands.length; i++) { pk -= w[i]; if (pk <= 0) { win = cands[i]; break; } }
      for (const p of cands) setAnim(p, 6);
      // 경합 없이 혼자인 경우 헤더 성공률
      if (cands.length === 1 && win.code !== 'GK' && r() > sig((E(win, 'heading') - 35) / 12)) { deflect(M, win, 3); return; }
      if (cands.length > 1) for (const p of cands) if (p !== win && r() < .15) p.stun = .4;
      return aerialWin(M, win);
    }
  }
  if (b.z > 1.15) return;
  // 지상 / 낮은 볼
  const cands = [];
  for (const p of M.pidList) {
    if (p.off || p.stun > 0 || M.t - p.kickT < .28) continue;
    const reach = p.code === 'GK' && inOwnBox(p.team, b) ? 1.6 : 1.0;
    const d = hyp(p.x - b.x, p.y - b.y);
    if (d < reach && !(f && f.tried[p.pid] > M.t - .5) && !(b.restT > M.t)) cands.push([p, d]);
  }
  if (!cands.length) { bodyHit(M); return; }
  cands.sort((a, c) => a[1] - c[1]);
  // 양 팀이 동시에 닿는 루즈볼 → 경합
  if (cands.length > 1 && cands[0][0].team !== cands[1][0].team && sp < 8) {
    const a = cands[0][0], c = cands[1][0];
    const sa = E(a, 'reactions') * .35 + E(a, 'agility') * .2 + E(a, 'strength') * .25 + E(a, 'aggression') * .2 + (cands[1][1] - cands[0][1]) * 8;
    const sc = E(c, 'reactions') * .35 + E(c, 'agility') * .2 + E(c, 'strength') * .25 + E(c, 'aggression') * .2;
    if (r() > sig((sa - sc) / 15)) { cands[0] = cands[1]; }
  }
  for (const [p] of cands) {
    if (f) f.tried[p.pid] = M.t;
    const pT = p.team; const isTeammate = f && f.from && f.from.team === pT;
    const isTarget = f && f.target === p;
    const isGK = p.code === 'GK' && inOwnBox(pT, b) && !isTeammate;
    const press = pressureOn(M, p);
    const ctl = E(p, 'ballControl') * .7 + E(p, 'reactions') * .15 + E(p, 'agility') * .15;
    if (isGK) {
      const s = E(p, 'gkHandling') * .6 + E(p, 'gkReflexes') * .2 + E(p, 'gkPositioning') * .2;
      if (r() < sig((s - 18 - sp * 1.6 - (M.wx ? M.wx.wet * 6 : 0)) / 10)) return gkCatch(M, p);
      deflect(M, p, 5); return;
    }
    // 오프사이드 판정
    if (isTeammate && f.offs.includes(p.pid) && M.t - f.t0 < 6 && r() > .03) {
      p.team.st.offsides++;
      ev(M, 'offside', pT.side, `오프사이드! ${p.name}의 위치가 앞서 있었습니다.`, { pid: p.pid });
      return setRestart(M, 'freekick', opp(M, pT), p.x, p.y, { offside: true });
    }
    if (isTeammate || !f || !f.from || f.type === 'clear' || f.type === 'header') {
      if (!isTeammate) pT.st.recov = (pT.st.recov || 0) + 1;
      const oiA = oiOf(M, p); const diff = (isTarget ? 9 : 17) + sp * 1.7 + (b.z > .5 ? 12 : 0) + press * 10 + (M.wx ? M.wx.wet * 5 + M.wx.slow * 3 : 0) + (oiA && oiA.mark ? 6 : 0);
      if (r() < sig((ctl - diff) / 13)) {
        // 박스 안 원터치 마무리
        const fwdPos = fwd(pT, p.x);
        const dGoal = hyp(pT.dir * HL - p.x, p.y);
        if (f && isTeammate && dGoal < 16 && fwdPos > 30 && (f.type === 'cross' || f.type === 'through' || f.key) && r() < .55 + instr(p).shoot * .1) {
          gain(M, p, false, true);
          if (f && f.from) M.assist = { p: f.from, t: M.t, kind: f.type };
          takeShot(M, p, b.z > 1.15 ? 'header' : b.z > .35 ? 'volley' : 'normal'); return;
        }
        return gain(M, p, isTeammate);
      }
      if (M.dbg) M.dbg.ctlFail = (M.dbg.ctlFail || 0) + 1;
      deflect(M, p, 2 + sp * .12); return;
    }
    // 상대 패스 가로채기
    const intc = E(p, 'interceptions') * .6 + E(p, 'reactions') * .25 + E(p, 'agility') * .15;
    const diff = 48 + sp * 2.1 + (b.z > .5 ? 10 : 0);
    if (r() < sig((intc - diff) / 13)) {
      if (M.dbg) M.dbg.inter = (M.dbg.inter || 0) + 1;
      if (r() < sig((ctl - 30 - sp * 1.5) / 12)) { p.r.int++; pT.st.inter++; return gain(M, p, false); }
      deflect(M, p, 3 + sp * .25, Math.atan2(-pT.dir * 0 + (b.vy * -.2), pT.dir), 1.2); return;
    }
  }
}
// 빠른 공이 한 틱 사이에 선수 몸을 지나쳐 버리는 경우(판정 누락) 몸에 맞고 굴절되게 처리
function bodyHit(M) {
  const b = M.ball, f = b.flight; if (!f || b.px == null || b.z > 1.5 || b.restT > M.t) return;
  const sx = b.x - b.px, sy = b.y - b.py, L2 = sx * sx + sy * sy; if (L2 < .25) return;
  for (const p of M.pidList) {
    if (p.off || p.stun > 0 || M.t - p.kickT < .35 || p.code === 'GK') continue;
    if (f && (f.target === p || (f.from && f.from.team === p.team))) continue;
    const u = clamp(((p.x - b.px) * sx + (p.y - b.py) * sy) / L2, 0, 1); const qx = b.px + sx * u, qy = b.py + sy * u;
    if (hyp(p.x - qx, p.y - qy) > .32) continue;
    if (f && f.tried[p.pid] > M.t - .5) continue;
    if (f) f.tried[p.pid] = M.t;
    b.x = qx; b.y = qy;
    if (M.dbg) { M.dbg.body = (M.dbg.body || 0) + 1; const k = 'body_' + f.type + (f.from && f.from.team !== p.team ? '_opp' : '') + '_u' + (u < .5 ? 'near' : 'far'); M.dbg[k] = (M.dbg[k] || 0) + 1; }
    return deflect(M, p, 2 + hyp(b.vx, b.vy) * .25);
  }
}
function aerialWin(M, p) {
  const b = M.ball, T = p.team, r = M.rng; const f = b.flight;
  if (p.code === 'GK' && inOwnBox(T, b)) { if (r() < sig((E(p, 'gkHandling') - 45) / 12)) return gkCatch(M, p); deflect(M, p, 8); return; }
  const dGoal = hyp(T.dir * HL - b.x, b.y);
  const attacking = f && f.from && f.from.team === T;
  if (attacking && f.offs.includes(p.pid) && r() > .03) {
    T.st.offsides++; ev(M, 'offside', T.side, `오프사이드! ${p.name}`, { pid: p.pid });
    return setRestart(M, 'freekick', opp(M, T), p.x, p.y, { offside: true });
  }
  if (attacking && dGoal < 15 && fwd(T, b.x) > 35) { if (f.from) M.assist = { p: f.from, t: M.t, kind: f.type }; markPossession(M, T); return takeShot(M, p, 'header'); }
  markPossession(M, T);
  const defensive = -fwd(T, b.x) > 15;
  if (defensive) { const ty = b.y + (r() - .5) * 30;
    // 크로스를 골라인 밖으로 걷어내는 헤더 (코너킥)
    if (-fwd(T, b.x) > 38 && f && (f.type === 'cross' || f.type === 'lofted') && r() < .5) { header(M, p, -T.dir * (HL + 4), b.y + Math.sign(b.y || 1) * (2 + r() * 9), 3); b.flight.target = null; return; }
    if (-fwd(T, b.x) > 40 && r() < .3) { header(M, p, b.x - T.dir * 8, b.y + Math.sign(b.y || 1) * (6 + r() * 12), 4); b.flight.target = null; return; } header(M, p, b.x + T.dir * (15 + r() * 15), ty, 7); return; }
  // 동료에게 헤딩 패스
  const mates = active(T).filter(q => q !== p && hyp(q.x - p.x, q.y - p.y) < 18 && hyp(q.x - p.x, q.y - p.y) > 4);
  if (mates.length && r() < .2 + E(p, 'heading') / 200) { const q = r.pick(mates); header(M, p, q.x, q.y, 3.5, q); }
  else header(M, p, b.x + T.dir * (6 + r() * 10), b.y + (r() - .5) * 16, 4);
}
function header(M, p, tx, ty, apex, target) {
  const b = M.ball; const acc = E(p, 'heading');
  const ang = Math.atan2(ty - b.y, tx - b.x) + M.rng.gauss() * (.05 + (100 - acc) * .004);
  const d = hyp(tx - b.x, ty - b.y);
  b.vz = Math.sqrt(2 * GRAV * Math.max(.3, apex - Math.min(b.z, apex - .3)));
  const T = 2 * b.vz / GRAV; const vh = Math.min(16, d / Math.max(.4, T));
  b.vx = Math.cos(ang) * vh; b.vy = Math.sin(ang) * vh; b.owner = null; b.spin = 0;
  p.kickT = M.t; setAnim(p, 6); b.last = p;
  b.flight = { type: 'header', from: p, target: target || null, t0: M.t, tried: {}, offs: target ? offsidePlayers(M, p) : [] };
  resetReact(M);
}
function deflect(M, p, power, base, spread) {
  const b = M.ball, r = M.rng; const a = base === undefined ? r() * Math.PI * 2 : base + r.gauss() * (spread || 1);
  const sp = hyp(b.vx, b.vy) * .3;
  let ang = a;
  if (base === undefined && p && -fwd(p.team, b.x) > HL - 25) {
    // 자기 진영 깊은 곳: 대부분 앞으로 걷어내지만, 측면에서는 일부가 골라인 밖으로 나가 코너킥이 됨
    if (Math.abs(b.y) > 3 && -fwd(p.team, b.x) > HL - 18 && r() < .5) ang = Math.atan2(Math.sign(b.y) * (.5 + r() * .7) * 1, -p.team.dir);
    else { const away = Math.atan2(0, p.team.dir); if (Math.abs(angDiff(ang, away)) > 1.4) ang = away + r.gauss() * 1.0; } }
  b.vx = b.vx * .25 + Math.cos(ang) * (power + sp); b.vy = b.vy * .25 + Math.sin(ang) * (power + sp);
  b.vz = Math.max(b.vz * .2, r() * power * .5); b.owner = null; b.spin = 0; b.last = p;
  b.flight = { type: 'loose', from: null, t0: M.t, tried: { [p.pid]: M.t }, offs: [] };
  p.kickT = M.t - .1;
  resetReact(M);
}
function gain(M, p, keepPossTeam, silent) {
  const b = M.ball; const T = p.team; const f = b.flight;
  const prevTeam = f && f.from ? f.from.team : (b.last ? b.last.team : null);
  if (M.dbg && f && f.from && f.from.team === T && f.from !== p) M.dbg['ok_' + f.type] = (M.dbg['ok_' + f.type] || 0) + 1;
  if (f && f.logIdx != null && f.from && f.from.team === T && f.from !== p) M.passLog[f.logIdx].ok = 1;
  if (f && f.from && f.from.team === T && f.from !== p && f.type !== 'throw') { T.st.passOk++; f.from.r.passOk++; }
  b.owner = p; b.held = false; b.flight = null; b.vx = b.vy = b.vz = 0; b.spin = 0; b.last = p; p.gainT = M.t;
  p.decT = (.35 + M.rng() * .5 * (1.4 - tac(T).tempo * .2)) * (iv(p, 'tempo') > 0 ? .75 : iv(p, 'tempo') < 0 ? 1.3 : 1); p.dribbling = false;
  if (prevTeam && prevTeam !== T) { T.winT = M.t; T.winX = fwd(T, b.x); prevTeam.lossT = M.t; M.assist = null; }
  else if (f && f.from && f.from.team === T && f.from !== p) M.assist = { p: f.from, t: M.t, kind: f.type };
}
function markPossession(M, T) { const pt = M.ball.last ? M.ball.last.team : null; if (pt && pt !== T) { T.winT = M.t; T.winX = fwd(T, M.ball.x); pt.lossT = M.t; } }
function gkCatch(M, p) {
  const b = M.ball; gain(M, p, false); b.held = true; const gs = iv(p, 'gkSpeed'); p.decT = (gs > 0 ? 1.2 : gs < 0 ? 4.8 : { slow: 4.5, normal: 2.8, fast: 1.4 }[tac(p.team).gkTempo]) + M.rng() * 1.5;
  const dv = (p.anim === 4 || p.anim === 5 || p.anim === 11 || p.anim === 12) && p.animT < 1.9; if (!dv) setAnim(p, 10);
  if (tac(p.team).waste === 2 && M.score[p.team.side] > M.score[1 - p.team.side]) p.decT += 3;
}
// 슈팅 진행 중 판정 (블록 / 선방 / 골대)
function shotProgress(M) {
  const b = M.ball, f = b.flight, res = f.res, p = f.from, T = p.team, O = opp(M, T), r = M.rng;
  const el = M.t - f.t0;
  if (res.outcome === 'block' && !f.done) {
    const q = res.blocker; if (hyp(b.x - q.x, b.y - q.y) < 1.4 || el > f.tt * res.u + .05) {
      f.done = true; setAnim(q, 2);
      // 박스 안에서 팔에 맞는 경우 (핸드볼 페널티)
      if (inOwnBox(q.team, q) && r() < .03) { q.team.st.fouls++; q.r.foul++; ev(M, 'foul', q.team.side, `핸드볼! ${q.name}의 팔에 맞았습니다.`, { pid: q.pid }); if (r() < .3) card(M, q, 1); b.owner = null; b.flight = null; b.vx = b.vy = 0; return setRestart(M, 'penalty', T, T.dir * (HL - 11), 0); }
      ev(M, 'block', O.side, `${q.name}가 몸을 던져 막아냅니다!`, { pid: q.pid });
      const t = q.team; markPossession(M, t);
      if (r() < .55) deflect(M, q, 6 + r() * 6, Math.atan2(Math.sign(b.y || 1) * .6, T.dir), .45); else deflect(M, q, 4 + r() * 6, Math.atan2(-b.vy, -b.vx), 1.1); M.ball.last = q; M.ball.flight.blockedShot = true; M.ball.flight.deflOf = T.side; return;
    }
  }
  if (res.outcome === 'save' && !f.done) {
    const gk = f.gk;
    if (Math.abs(b.x - gk.x) < 1.3 || fwd(T, b.x) >= fwd(T, gk.x) - .3 || fwd(T, b.x) > HL - 2.5) {
      f.done = true; gk.diveAt = null;
      const diving = (gk.anim === 4 || gk.anim === 5 || gk.anim === 11 || gk.anim === 12) && gk.animT < 1.2;
      // 손이 닿는 거리(몸 옆 약 1.3m) 밖이면 골키퍼를 공 쪽으로 살짝 붙임
      const off = b.y - gk.y; if (Math.abs(off) > 1.3) gk.y += off - Math.sign(off) * 1.3;
      if (!diving) setAnim(gk, Math.abs(off) > 1.0 ? diveAnim(gk, off, b.z > 1.55) : (res.save.caught ? 10 : 13));
      O.st.saves++; gk.r.sav++;
      if (res.save.caught) { ev(M, 'save', O.side, `${gk.name} 선방! 공을 잡아냅니다.`, { pid: gk.pid }); gkCatch(M, gk); return; }
      // 쳐내기
      const out = r() < .72;
      const a = out ? Math.atan2(Math.sign(res.fy || 1), -T.dir * .2) : Math.atan2((r() - .5) * 2, -T.dir);
      const pw = 5 + r() * 7;
      b.vx = Math.cos(a) * pw * (out ? .3 : 1) - T.dir * (out ? 0 : 0); b.vy = Math.sin(a) * pw; b.vz = 1 + r() * 3;
      if (out) { b.vx = T.dir * (1.5 + r() * 2); b.vy = Math.sign(res.fy || 1) * (4 + r() * 3); b.vz = 3 + r() * 3; }
      b.last = gk; b.flight = { type: 'loose', from: null, t0: M.t, tried: { [gk.pid]: M.t }, offs: [], parried: true };
      gk.kickT = M.t;
      ev(M, 'save', O.side, `${gk.name}의 선방! 공을 쳐냅니다.`, { pid: gk.pid });
      resetReact(M); return;
    }
  }
  if (res.outcome === 'post' && !f.done && fwd(T, b.x) > HL - 2.4) {
    f.done = true; b.vx = -b.vx * .4; b.vy = b.vy * .5 + (r() - .5) * 6; b.vz = Math.abs(b.vz) * .3;
    ev(M, 'post', T.side, `골대를 맞고 나옵니다! ${p.name}`, { pid: p.pid });
    b.flight = { type: 'loose', from: null, t0: M.t, tried: {}, offs: [] }; resetReact(M);
  }
  if (el > f.tt + 1.5 && !f.done) { b.flight = { type: 'loose', from: null, t0: M.t, tried: {}, offs: [] }; }
}

// ---------- 태클 / 몸싸움 ----------
function duels(M) {
  const b = M.ball, c = b.owner, r = M.rng; if (!c || b.held) return;
  const T = c.team, O = opp(M, T);
  for (const d of active(O)) {
    if (d.stun > 0) continue;
    if (d.code === 'GK') { if (hyp(d.x - c.x, d.y - c.y) < 1.6 && inOwnBox(d.team, c) && M.rng() < 1.4 * DT) return gkSmother(M, c, d); continue; }
    const dist = hyp(d.x - c.x, d.y - c.y); if (dist > 2.4) continue;
    const tc = tac(O); const ins = instr(d); const oc = oiOf(M, c);
    const tackleStyle = (tc.tackling === 'getStuckIn' ? .3 : tc.tackling === 'stayOnFeet' ? -.3 : 0) + ins.tackle * .2 + (d.tf.feet ? -.25 : 0) + (d.tf.sl ? .15 : 0) + (oc && oc.tackle ? oc.tackle * .35 : 0);
    const rate = (dist < 1.5 ? (.1 + E(d, 'aggression') * .0012) : (.03 + E(d, 'aggression') * .0008)) * (1 + tackleStyle) * (d.pressing === undefined || M.t - d.pressing > 1 ? .5 : 1) * (oc && oc.press ? (oc.press > 0 ? 1.45 : .6) : 1);
    // 몸싸움 (나란히 달리는 상황)
    const csp = hyp(c.vx, c.vy);
    if (dist < 1.3 && csp > 3.5 && r() < .25 * DT) { shoulder(M, c, d); return; }
    // 진로를 막은 수비수와 부딪히면 즉시 경합
    const fx = Math.cos(c.face), fy = Math.sin(c.face); const dot = ((d.x - c.x) * fx + (d.y - c.y) * fy) / (dist || 1);
    if (dist < 1.2 && dot > .6 && csp > 2.5 && r() < .05) { const slide0 = false; return tackle(M, c, d, slide0); }
    if (dist > 1.9 || r() > rate * DT) continue;
    const slide = dist > 1.2 && r() < clamp(.12 + tackleStyle * .4 + (E(d, 'aggression') - 60) * .004 + (d.tf.sl ? .2 : 0) - (d.tf.feet ? .1 : 0), .02, .7);
    return tackle(M, c, d, slide);
  }
}
function tackle(M, c, d, slide) {
  const r = M.rng, T = c.team, O = d.team, b = M.ball; const tc = tac(O);
  const shield = hyp(c.vx, c.vy) < 2.5;
  const att = E(c, 'dribbling') * .38 + E(c, 'agility') * .2 + E(c, 'balance') * .17 + E(c, 'ballControl') * .15 + E(c, 'strength') * (shield ? .25 : .1);
  const def = (slide ? E(d, 'slideTackle') : E(d, 'standTackle')) * .5 + E(d, 'marking') * .2 + E(d, 'reactions') * .15 + (slide ? E(d, 'accel') : E(d, 'strength')) * .15;
  if (M.dbg) { M.dbg.tkl = (M.dbg.tkl || 0) + 1; M.dbg.tklHold = (M.dbg.tklHold || 0) + (c.decT > 0 && !c.dribbling ? 1 : 0); M.dbg.tklRecv = (M.dbg.tklRecv || 0) + (M.t - (c.gainT || 0) < .8 ? 1 : 0); }
  const pDef = sig((def - att) / 20 + .8 + (c.takeOn && M.t - c.takeOn < 1 ? -.2 : 0));
  O.st.tackles++; d.r.tkl++;
  setAnim(d, slide ? 3 : 2);
  const won = r() < pDef;
  const oc = oiOf(M, c); const style = (tc.tackling === 'getStuckIn' ? .06 : tc.tackling === 'stayOnFeet' ? -.05 : 0) + instr(d).tackle * .04 + (oc && oc.tackle ? oc.tackle * .05 : 0);
  const foulP = won ? .06 + (slide ? .06 : 0) + style * .4 : .15 + E(d, 'aggression') * .0012 + (slide ? .1 : 0) + style * .8;
  if (r() < clamp(foulP * (inBoxOf(T, c.x, c.y) ? .8 : 1) * (d.yc ? .5 : 1), .005, .6)) return foul(M, d, c, slide);
  if (won) {
    O.st.tackleWon++; d.r.tklW++;
    if (!slide && r() < .6 + E(d, 'standTackle') * .003) { gain(M, d, false); markPossession(M, O); }
    else { M.ball.last = d; markPossession(M, O); deflect(M, d, 3 + r() * 4); }
    c.stun = .35;
  } else {
    c.r.drb++; d.r.beaten = (d.r.beaten || 0) + 1; d.stun = slide ? 1.2 : .4;
    c.vx *= 1.1; c.vy *= 1.1;
    if (slide) setAnim(d, 3);
  }
}
function gkSmother(M, c, gk) {
  const r = M.rng;
  const att = E(c, 'dribbling') * .4 + E(c, 'agility') * .3 + E(c, 'ballControl') * .3;
  const def = E(gk, 'gkDiving') * .35 + E(gk, 'gkReflexes') * .35 + E(gk, 'gkPositioning') * .3;
  setAnim(gk, diveAnim(gk, c.y - gk.y));
  if (r() < sig((def - att) / 14 + .2)) { gk.team.st.saves++; gk.r.sav++; ev(M, 'save', gk.team.side, `${gk.name}가 뛰쳐나와 공을 덮칩니다!`, { pid: gk.pid }); gkCatch(M, gk); markPossession(M, gk.team); c.stun = .5; }
  else if (r() < .12) { foul(M, gk, c, true); }
  else { gk.stun = 1.0; c.r.drb++; }
}
function shoulder(M, c, d) {
  const r = M.rng;
  const sc = E(c, 'strength') * .55 + E(c, 'balance') * .35 + E(c, 'aggression') * .1;
  const sd = E(d, 'strength') * .55 + E(d, 'balance') * .35 + E(d, 'aggression') * .1;
  if (r() < sig((sd - sc) / 16)) {
    if (r() < .06) return foul(M, d, c, false);
    c.stun = .5; setAnim(c, 7);
    if (r() < .5) { gain(M, d, false); markPossession(M, d.team); } else { M.ball.last = d; markPossession(M, d.team); deflect(M, d, 3); }
  } else { d.stun = .45; }
}
function foul(M, d, c, slide) {
  const r = M.rng, O = d.team, T = c.team; O.st.fouls++; d.r.foul++;
  const b = M.ball;
  const lastMan = fwd(T, c.x) > 15 && active(O).filter(q => q.code !== 'GK' && fwd(T, q.x) > fwd(T, c.x)).length === 0;
  ev(M, 'foul', O.side, `${d.name}의 파울. ${c.name}가 넘어집니다.`, { pid: d.pid, quiet: true });
  setAnim(c, 7); c.stun = 1;
  let yc = .13 + (slide ? .11 : 0) + (lastMan ? .3 : 0) + E(d, 'aggression') * .001 + (tac(O).tackling === 'getStuckIn' ? .05 : 0);
  const red = (lastMan && fwd(T, c.x) > 25 && Math.abs(c.y) < 22 && inBoxOf(T, c.x, c.y) === false && r() < .1) || r() < (slide ? .004 : .0008);
  if (red) card(M, d, 2); else if (r() < yc * (d.yc ? .55 : 1)) card(M, d, 1);
  b.owner = null; b.flight = null; b.vx = b.vy = 0;
  if (inBoxOf(T, c.x, c.y)) setRestart(M, 'penalty', T, T.dir * (HL - 11), 0);
  else setRestart(M, 'freekick', T, c.x, c.y);
  if (r() < .1) { M.restart.timer += 35 + r() * 60; ev(M, 'injury', T.side, `${c.name}가 치료를 받습니다.`, { pid: c.pid, quiet: true }); }
}
function card(M, p, kind) {
  const T = p.team;
  if (kind === 1) {
    p.yc++; T.st.yellow++;
    if (p.yc >= 2) { ev(M, 'red', T.side, `${p.name} 경고 누적으로 퇴장!`, { pid: p.pid }); sendOff(M, p); return; }
    ev(M, 'yellow', T.side, `${p.name} 옐로카드.`, { pid: p.pid });
  } else { ev(M, 'red', T.side, `${p.name} 다이렉트 레드카드!`, { pid: p.pid }); sendOff(M, p); }
}
function sendOff(M, p) { p.team.st.red++; p.off = true; p.team._act = null; p.sentOff = true; p.r.rating -= 1.5; p.x = p.team.dir * -10; p.y = -HW - 6; if (M.ball.owner === p) M.ball.owner = null; }

// ---------- 세트피스 / 재시작 ----------
function setRestart(M, type, T, x, y, opt) {
  M.outPend = null;
  const b = M.ball; b.owner = null; b.flight = null; b.vx = b.vy = b.vz = 0; b.spin = 0; b.held = false;
  M.phase = 'dead';
  let wait = { throw: 21, goalkick: 29, corner: 40, freekick: 32, penalty: 75, kickoff: 6 }[type] * (.75 + M.rng() * .5);
  if (type === 'freekick' && fwd(T, x) > 15) wait += 12;
  if (type === 'kickoff' && opt && opt.afterGoal) wait += 18;
  const tc = tac(T); if (tc.waste === 2 && M.score[T.side] > M.score[1 - T.side]) wait *= 1.8; if (tc.waste === 0) wait *= .8;
  M.restart = { type, T, x, y, timer: wait, opt: opt || {} };
  M.rc = M.rc || {}; M.rc[type] = (M.rc[type] || 0) + 1;
  if (type === 'corner') { T.st.corners++; ev(M, 'corner', T.side, `${T.name} 코너킥.`, { quiet: true }); }
  // 공 위치 고정
  b.x = x; b.y = y; b.z = BR;
  placeForRestart(M);
}
function placeForRestart(M) {
  const R = M.restart; const T = R.T, O = opp(M, T); const r = M.rng;
  // 기본: 각 선수는 현재 목표로 이동, 세트피스 상황은 특수 배치
  const taker = pickTaker(M, R);
  R.taker = taker;
  for (const p of M.pidList) { if (p.off) continue; p.tx = p.x; p.ty = p.y; p.urg = .6; }
  computeTargets(M);
  if (R.type === 'corner' || (R.type === 'freekick' && fwd(T, R.x) > 25 && !R.opt.offside)) {
    const att = active(T).filter(p => p !== taker && p.code !== 'GK');
    const sorted = att.slice().sort((a, b) => (E(b, 'heading') + E(b, 'jumping')) - (E(a, 'heading') + E(a, 'jumping')));
    const tcA = tac(T), tcD = tac(O);
    // 공격 인원: 공격적 7명 / 균형 5명 / 안전 4명 (나머지는 박스 밖·후방 대비)
    const nBox = tcA.cornerBody === 'attack' ? 7 : tcA.cornerBody === 'safe' ? 4 : 5, nEdge = tcA.cornerBody === 'safe' ? 1 : 2;
    const spots = [[HL - 6, -2], [HL - 7, 3.5], [HL - 11, 0], [HL - 8, -5.5], [HL - 13, 4], [HL - 9, 6.5], [HL - 5, 0], [HL - 17, -6]];
    sorted.forEach((p, i) => { if (i < nBox) { const s = spots[i]; p.tx = T.dir * s[0] + r.gauss() * .5; p.ty = s[1] * Math.sign(R.y || 1) * -1; } else if (i < nBox + nEdge) { p.tx = T.dir * (HL - (R.type === 'corner' && tcA.corner === 'edge' && i === nBox ? 17.5 : 25)); p.ty = (i - nBox - (nEdge - 1) / 2) * 14; if (R.type === 'corner' && tcA.corner === 'edge' && i === nBox) { p.ty = -Math.sign(R.y || 1) * 2; R.edgeP = p; } } else { p.tx = T.dir * 5; p.ty = (i - nBox - nEdge - .5) * 15; } });
    const defs = active(O).filter(p => p.code !== 'GK');
    const zonal = R.type === 'corner' && (tcD.cornerDef === 'zonal' || (tcD.cornerDef === 'mixed' && true));
    const ZS = [[HL - 5.5, -2.5], [HL - 5.5, 2.5], [HL - 5.5, 0], [HL - 8.5, -4], [HL - 8.5, 4], [HL - 11, 0]];
    if (R.type === 'corner' && tcD.cornerDef === 'zonal') defs.forEach((d, i) => { if (i < 6) { const z = ZS[i]; d.tx = T.dir * z[0]; d.ty = z[1]; d.zone = 1; } else if (i < 8) { d.tx = T.dir * (HL - 16); d.ty = (i - 6.5) * 10; } else { d.tx = T.dir * (HL - 40); d.ty = 0; } });
    else if (R.type === 'corner' && tcD.cornerDef === 'mixed' && zonal) defs.forEach((d, i) => { const m = sorted[i]; if (i < 3) { const z = ZS[i]; d.tx = T.dir * z[0]; d.ty = z[1]; d.zone = 1; } else if (m && i < 3 + nBox) { const mm = sorted[i - 3]; d.tx = mm.tx - T.dir * .9; d.ty = mm.ty + .3; } else { d.tx = T.dir * (HL - 18 - 12 * (i - 3 - nBox)); d.ty = (i % 2 ? 1 : -1) * 9; } });
    else defs.forEach((d, i) => { const m = sorted[i]; if (m && i < nBox + 2) { d.tx = m.tx - T.dir * .9; d.ty = m.ty + .3; } else { d.tx = T.dir * (HL - 30 * (i - nBox - 1)); d.ty = (i % 2 ? 1 : -1) * 10; } });
    if (R.type === 'freekick' && wallNeeded(M, R)) {
      // 벽
      const gx = T.dir * HL; const ang = Math.atan2(0 - R.y, gx - R.x); const n = Math.min(5, Math.max(2, Math.round(5 - (HL - fwd(T, R.x) - 16) / 5)));
      defs.slice(-n).forEach((d, i) => { const off = (i - (n - 1) / 2) * .7; d.tx = R.x + Math.cos(ang) * 9.15 - Math.sin(ang) * off; d.ty = R.y + Math.sin(ang) * 9.15 + Math.cos(ang) * off; d.wall = true; });
    }
  }
  if (R.type === 'penalty') {
    for (const p of M.pidList) { if (p.off || p === taker || p.code === 'GK') continue; p.tx = T.dir * (HL - 20) + (r() - .5) * 4; p.ty = (p.pid % 9 - 4) * 3.5; }
  }
  if (R.type === 'kickoff') {
    for (const Tm of M.teams) for (const p of active(Tm)) {
      const sl = slotsOf(Tm.setup)[p.slot];
      p.tx = wX(Tm, Math.min(.49, sl[1] * .55)); p.ty = wY(Tm, sl[2] * .75);
      if (sl[0] === 'GK') { p.tx = -Tm.dir * (HL - 1); p.ty = 0; }
    }
    taker.tx = -T.dir * .3; taker.ty = 0;
    const O2 = opp(M, T); for (const p of active(O2)) if (Math.abs(fwd(O2, p.tx)) < 9.5 && hyp(p.tx, p.ty) < 9.5) p.tx = -O2.dir * 10;
  }
  if (taker) { taker.tx = R.x - Math.cos(Math.atan2(-R.y, T.dir * HL - R.x)) * .7; taker.ty = R.y - Math.sin(Math.atan2(-R.y, T.dir * HL - R.x)) * .7; taker.urg = 1; }
  // 재시작 시 상대는 공에서 떨어짐
  for (const p of active(O)) { const d = hyp(p.tx - R.x, p.ty - R.y); if (d < 9 && R.type !== 'throw' && !p.wall) { const a = Math.atan2(p.ty - R.y, p.tx - R.x); p.tx = R.x + Math.cos(a) * 9.2; p.ty = R.y + Math.sin(a) * 9.2; } }
}
// 재시작 규정 위치: 페널티킥은 박스·아크 밖, 그 외 재시작은 상대가 공에서 9.15m 이상
function enforceRestartZones(M) {
  const R = M.restart; if (!R) return; const T = R.T;
  if (R.type === 'penalty') {
    const spotX = T.dir * (HL - 11);
    for (const p of M.pidList) {
      if (p.off || p === R.taker) continue;
      if (p.code === 'GK' && p.team !== T) { p.tx = T.dir * (HL - .2); p.ty = 0; continue; }
      let fx = fwd(T, p.tx); let ty = p.ty;
      if (fx > BOX_X - 1 || hyp(p.tx - spotX, ty) < 10) { fx = Math.min(fx, BOX_X - 2.5); if (hyp(T.dir * fx - spotX, ty) < 10) fx = Math.min(fx, HL - 11 - Math.sqrt(Math.max(0, 100 - ty * ty))); }
      if (p.code === 'GK') { fx = Math.min(fx, -20); }
      p.tx = T.dir * fx;
    }
    return;
  }
  if (R.type === 'throw') return;
  for (const p of active(opp(M, T))) { if (p.wall) continue; const d = hyp(p.tx - R.x, p.ty - R.y); if (d < 9.3) { const a = Math.atan2(p.ty - R.y, p.tx - R.x) || 0; p.tx = R.x + Math.cos(a) * 9.4; p.ty = R.y + Math.sin(a) * 9.4; } }
}
function wallNeeded(M, R) { const T = R.T; const d = hyp(T.dir * HL - R.x, R.y); return d < 32 && Math.abs(R.y) < 25; }
function pickTaker(M, R) {
  const T = R.T; const s = T.setup; const act = active(T);
  const by = id => act.find(p => p.d.id === id);
  if (R.type === 'goalkick') return act.find(p => p.code === 'GK');
  if (R.type === 'penalty') return by(s.takers.pen) || bestOf(act, 'penalties');
  if (R.type === 'corner') return by(s.takers.corner) || bestOf(act, 'crossing');
  if (R.type === 'freekick' && wallNeeded(M, R)) return by(s.takers.fk) || bestOf(act, 'freeKick');
  if (R.type === 'kickoff') { const st = act.filter(p => SLOT_GROUP[p.code] === 'ST' || SLOT_GROUP[p.code] === 'AM'); return st[0] || act[act.length - 1]; }
  if (R.type === 'freekick' && R.opt.offside || R.type === 'freekick' && -fwd(T, R.x) > 35) { const gk = act.find(p => p.code === 'GK'); if (gk && -fwd(T, R.x) > 38) return gk; }
  let best = null, bd = 1e9; for (const p of act) { if (p.code === 'GK') continue; const d = hyp(p.x - R.x, p.y - R.y); if (d < bd) { bd = d; best = p; } } return best;
}
function bestOf(arr, k) { return arr.filter(p => p.code !== 'GK').sort((a, b) => b.s[k] - a.s[k])[0]; }
function executeRestart(M) {
  const R = M.restart, T = R.T, p = R.taker, r = M.rng, b = M.ball, tc = tac(T);
  M.lastRestart = { type: R.type, t: M.t, side: T.side };
  if (R.type === 'corner' || (R.type === 'freekick' && wallNeeded(M, R) && !R.opt.offside)) ev(M, 'setpiece', T.side, R.type === 'corner' ? `${T.name} 코너킥 진행.` : `${T.name} 위험 지역 프리킥.`, { quiet: true });
  M.phase = 'play'; const edgeP = R.edgeP; M.restart = null;
  for (const q of M.pidList) { q.wall = false; q.zone = 0; }
  if (!p || p.off) { return; }
  p.x = R.x - Math.cos(Math.atan2(-R.y, T.dir * HL - R.x)) * .6; p.y = R.y - Math.sin(Math.atan2(-R.y, T.dir * HL - R.x)) * .6;
  b.x = R.x; b.y = R.y; b.z = BR;
  b.last = p; b.owner = p; b.held = false;
  switch (R.type) {
    case 'kickoff': {
      const mates = active(T).filter(q => q !== p && fwd(T, q.x) < -3).sort((a, c) => hyp(a.x - p.x, a.y - p.y) - hyp(c.x - p.x, c.y - p.y));
      const q = mates[0]; T.st.passes++; p.r.pass++; kickTo(M, p, q.x, q.y, 'ground', E(p, 'shortPass') + 10, { target: q, noOffside: true }); break;
    }
    case 'throw': {
      const mates = active(T).filter(q => q !== p && q.code !== 'GK').map(q => [q, hyp(q.x - p.x, q.y - p.y), nearestOpp(M, q, q.x, q.y)[1]]).filter(e => e[1] < 25);
      mates.sort((a, c) => (c[2] - c[1] * .15) - (a[2] - a[1] * .15));
      const q = (mates[0] || [active(T).find(x => x !== p)])[0];
      // 롱 스로인 특성: 상대 박스 근처면 박스 안으로 길게 던짐
      const lt = tc.throwLong === 'short' ? null : (active(T).find(x => x.tf.lt && hyp(x.x - p.x, x.y - p.y) < 30) || (tc.throwLong === 'long' ? active(T).filter(x => x.code !== 'GK' && hyp(x.x - p.x, x.y - p.y) < 30).sort((a, c) => E(c, 'strength') - E(a, 'strength'))[0] : null));
      if (lt && fwd(T, R.x) > HL - 32) { const tq = active(T).filter(x => x !== lt && x.code !== 'GK').sort((a, c) => (E(c, 'heading') + E(c, 'jumping')) - (E(a, 'heading') + E(a, 'jumping')))[0]; lt.x = R.x; lt.y = R.y; b.last = lt; b.owner = lt; kickTo(M, lt, T.dir * (HL - 7), Math.sign(R.y) * 3, 'cross', 70, { target: tq, crossType: 'normal', noOffside: true }); break; }
      kickTo(M, p, q.x, q.y, 'throw', 75, { target: q, noOffside: true }); break;
    }
    case 'goalkick': { b.held = true; p.decT = 0; b.owner = p; M.ball.held = true; gkDistribute(M, p); break; }
    case 'corner': {
      let kind = tc.corner; if (kind === 'mixed') kind = r.pick(['near', 'far', 'near', 'far', 'short']);
      if (kind === 'edge' && edgeP && !edgeP.off) { const q = edgeP; T.st.passes++; p.r.pass++; kickTo(M, p, q.x + T.dir * .5, q.y, 'ground', E(p, 'shortPass') * .5 + E(p, 'crossing') * .5, { target: q, noOffside: true, key: true }); break; }
      if (kind === 'edge') kind = 'near';
      if (kind === 'short') { const q = active(T).filter(q => q !== p).sort((a, c) => hyp(a.x - p.x, a.y - p.y) - hyp(c.x - p.x, c.y - p.y))[0]; q.tx = p.x - T.dir * 5; q.ty = p.y * .8; kickTo(M, p, p.x - T.dir * 6, p.y * .82, 'ground', 80, { target: q, noOffside: true }); }
      else { const ty = kind === 'near' ? Math.sign(R.y) * 2.5 : -Math.sign(R.y) * 4.5; const tx = T.dir * (HL - (kind === 'near' ? 5.5 : 7.5)); kickTo(M, p, tx, ty, 'cross', E(p, 'crossing') * .7 + E(p, 'curve') * .3, { crossType: tc.cross === 'low' ? 'normal' : 'high', noOffside: true }); }
      break;
    }
    case 'penalty': return penalty(M, p);
    case 'freekick': {
      if (wallNeeded(M, R) && !R.opt.offside) {
        const d = hyp(T.dir * HL - R.x, R.y);
        const directP = clamp(clamp(.9 - (d - 18) * .035, .15, .85) * (E(p, 'freeKick') > 70 ? 1 : .6) * (tc.fkDirect === 'shoot' ? 1.6 : tc.fkDirect === 'cross' ? .25 : 1), 0, .95);
        if (r() < directP) { takeShot(M, p, 'freekick'); return; }
        T.st.passes++; kickTo(M, p, T.dir * (HL - 9), (r() - .5) * 10, 'cross', E(p, 'crossing') * .6 + E(p, 'freeKick') * .4, { crossType: 'high', noOffside: false });
      } else if (fwd(T, R.x) > 25 && !R.opt.offside && tc.fkWide !== 'auto') {
        if (tc.fkWide === 'cross') { T.st.passes++; p.r.pass++; kickTo(M, p, T.dir * (HL - 8 - r() * 3), (r() - .5) * 9, 'cross', E(p, 'crossing') * .6 + E(p, 'freeKick') * .4, { crossType: 'high' }); }
        else { const q = active(T).filter(q => q !== p && q.code !== 'GK').sort((a, c) => hyp(a.x - p.x, a.y - p.y) - hyp(c.x - p.x, c.y - p.y))[0]; if (q) { T.st.passes++; p.r.pass++; kickTo(M, p, q.x, q.y, 'ground', E(p, 'shortPass') + 8, { target: q }); } else p.decT = .1; }
      } else { p.decT = .1; }
      break;
    }
  }
}
function penalty(M, p) {
  const T = p.team, O = opp(M, T), r = M.rng; const gk = active(O).find(q => q.code === 'GK');
  const b = M.ball; b.x = T.dir * (HL - 11); b.y = 0;
  takeShotPenalty(M, p, gk);
}
function takeShotPenalty(M, p, gk) {
  const T = p.team, r = M.rng, b = M.ball;
  const q = E(p, 'penalties') * .85 + E(p, 'shotPower') * .15 + r.gauss() * 6;
  const side = r() < .12 ? 0 : (r() < .5 ? -1 : 1);
  const miss = r() < clamp(.035 + (85 - E(p, 'penalties')) * .003, .01, .2);
  let outcome;
  let gkSide = r() < .1 ? 0 : (r() < .5 ? -1 : 1);
  const gkRead = gk ? (E(gk, 'gkReflexes') + E(gk, 'gkDiving') + E(gk, 'gkPositioning')) / 3 : 30;
  if (gk && r() < .08 + (gkRead - 70) * .004) gkSide = side; // 읽기
  if (miss) outcome = 'miss';
  else if (!gk) outcome = 'goal';
  else if (gkSide === side) outcome = r() < sig((gkRead - q) / 12 - .2 + (side === 0 ? 1.5 : 0)) ? 'save' : 'goal';
  else outcome = 'goal';
  const fy = side === 0 ? (r() - .5) * .8 : side * (GW - .5 - r() * .9) * (miss ? 1.35 : 1);
  const fz = miss ? (r() < .5 ? 2.9 : .3) : .3 + r() * 1.5;
  const P = { speed: 17 + E(p, 'shotPower') * .12 };
  const res = { outcome, fy, fz, save: outcome === 'save' ? { caught: r() < .3 } : null };
  T.st.shots++; p.r.shots++; if (outcome !== 'miss') { T.st.sot++; p.r.sot++; } T.st.xg += .76;
  const tx = T.dir * (HL + .5), dx = tx - b.x, dy = fy - b.y, dist = hyp(dx, dy), tt = dist / P.speed;
  b.owner = null; b.vx = dx / tt; b.vy = dy / tt; b.vz = (fz - b.z + .5 * GRAV * tt * tt) / tt;
  if (outcome === 'miss' && Math.abs(fy) < GW && fz < GH) res.fz = 2.9;
  p.kickT = M.t; setAnim(p, 1); b.last = p;
  b.flight = { type: 'shot', from: p, t0: M.t, res, xg: .76, tt, shotType: 'penalty', tried: {}, offs: [], gk };
  if (gk) gk.diveAt = { t: M.t + .08, dy: gkSide === 0 ? 0 : gkSide * 2.6 - gk.y, high: fz > 1.6, arrive: M.t + tt };
  M.lastShot = { side: T.side, xg: .76, t: M.t };
  M.shotLog.push({ s: T.side, p: p.pid, x: +(b.x * T.dir).toFixed(1), y: 0, xg: .76, out: outcome, origin: 'penalty', type: 'penalty', f: M.rec ? M.rec.n : 0 });
  ev(M, 'shot', T.side, `${p.name}의 페널티킥!`, { pid: p.pid, xg: .76, quiet: true });
}

// ---------- 경계 / 골 ----------
function checkBounds(M) {
  const b = M.ball; if (b.owner) return;
  const f = b.flight;
  if (Math.abs(b.x) > HL + BR) {
    const s = Math.sign(b.x);
    const defT = M.teams.find(T => -T.dir === s); const attT = opp(M, defT);
    if (Math.abs(b.y) < GW && b.z < GH) { // 골
      const shot = f && f.type === 'shot' && f.res.outcome === 'goal';
      if (shot || !f || f.type !== 'shot') return goal(M, attT, f);
    }
    if (f && f.type === 'shot' && f.res.outcome === 'goal' && Math.abs(b.y) < GW + .5) return goal(M, attT, f);
    const lt = b.last ? b.last.team : attT;
    const shot = f && f.type === 'shot';
    if (lt === defT || (f && f.blockedShot)) return ballOut(M, 'corner', attT, s * (HL - .3), Math.sign(b.y || 1) * (HW - .3), null, shot);
    if (shot) ev(M, 'miss', attT.side, `${f.from.name}의 슈팅이 골문을 벗어납니다.`, { pid: f.from.pid });
    return ballOut(M, 'goalkick', defT, s * (HL - 5.5), Math.sign(b.y || 1) * 6, null, shot);
  }
  if (Math.abs(b.y) > HW + BR) {
    if (M.dbg) M.dbg.throwOut = (M.dbg.throwOut || 0) + 1;
    const lt = b.last ? b.last.team : M.teams[0];
    return ballOut(M, 'throw', opp(M, lt), clamp(b.x, -HL + 1, HL - 1), Math.sign(b.y) * (HW + .1), null, false);
  }
}
// 공이 라인을 벗어나면 바로 재시작 위치로 옮기지 않고, 날아가던 궤적대로 경기장 밖까지 보여준 뒤 재시작
function ballOut(M, type, T, x, y, opt, shot) {
  const b = M.ball; if (M.dbg) { const k = 'out_' + type + '_' + (b.flight ? b.flight.type : 'none') + (b.last && b.last.team === T ? '_att' : '_def'); M.dbg[k] = (M.dbg[k] || 0) + 1; } b.owner = null; b.held = false; b.flight = null;
  M.phase = 'out'; M.outPend = { type, T, x, y, opt, timer: (shot ? 2.2 : 1.5) + M.rng() * .6 };
  for (const p of M.pidList) if (!p.off) { p.tx = p.x + p.vx * .5; p.ty = p.y + p.vy * .5; p.urg = .6; }
}
// 경기장 밖 공: 광고판(라인 밖 약 4~5m)에 맞으면 멈춤
function stepBallOut(b) {
  stepBall(b, DT);
  // 광고판(높이 1m) 아래로 오면 튕기고, 위로 넘어가면 관중석 앞에서 멈춤
  const bx = HL + 5.4, by = HW + 5.3, sx = HL + 11, sy = HW + 10;
  if (Math.abs(b.x) > bx && Math.abs(b.x) - Math.abs(b.vx) * DT <= bx && b.z < 1) { b.x = Math.sign(b.x) * bx; b.vx *= -.25; b.vy *= .6; }
  if (Math.abs(b.y) > by && Math.abs(b.y) - Math.abs(b.vy) * DT <= by && b.z < 1) { b.y = Math.sign(b.y) * by; b.vy *= -.25; b.vx *= .6; }
  if (Math.abs(b.x) > sx) { b.x = Math.sign(b.x) * sx; b.vx = 0; b.vy *= .3; }
  if (Math.abs(b.y) > sy) { b.y = Math.sign(b.y) * sy; b.vy = 0; b.vx *= .3; }
}
function goal(M, T, f) {
  const b = M.ball; M.score[T.side]++;
  let scorer = f && f.from ? f.from : b.last; const own = scorer && scorer.team !== T;
  let txt;
  if (own) txt = `자책골! ${scorer.name}의 몸에 맞고 들어갑니다.`;
  else {
    scorer.r.goals++; scorer.r.rating += 1.0;
    let ast = M.assist && M.assist.p !== scorer && M.assist.p.team === T && M.t - M.assist.t < 12 ? M.assist.p : null;
    if (ast) { ast.r.ast++; ast.r.rating += .6; M._astId = ast.d.id; } else M._astId = null;
    txt = `골! ${scorer.name}${ast ? ` (도움: ${ast.name})` : ''}`;
    M.goalsLog.push({ side: T.side, name: scorer.name, min: minute(M), own: false, pid: scorer.pid });
  }
  if (own) M.goalsLog.push({ side: T.side, name: scorer.name + ' (자책)', min: minute(M), own: true, pid: scorer.pid });
  const gk = active(opp(M, T)).find(p => p.code === 'GK'); if (gk) gk.r.rating -= .25;
  const lr = M.lastRestart; const sp = lr && lr.side === T.side && M.t - lr.t < 10 && lr.type !== 'kickoff' && lr.type !== 'goalkick' ? lr.type : null;
  ev(M, 'goal', T.side, txt, { pid: scorer ? scorer.pid : -1, score: M.score.slice(), sp, own, astId: own ? null : M._astId });
  b.flight = null; b.owner = null; b.vx *= .1; b.vy *= .1; b.vz = 0; b.x = clamp(b.x, -HL - 1.6, HL + 1.6);
  M.phase = 'goal'; M.goalT = 30 + M.rng() * 15; M.goalTeam = T; M.assist = null;
  if (scorer && !own) { setAnim(scorer, 8); scorer.celebrate = M.t; }
}
function setKickoff(M, side, teleport, afterGoal) {
  const T = M.teams[side]; const b = M.ball; b.x = 0; b.y = 0; b.z = BR; b.vx = b.vy = b.vz = 0; b.owner = null; b.flight = null; b.held = false; b.last = null;
  setRestart(M, 'kickoff', T, 0, 0, afterGoal ? { afterGoal: true } : null);
  if (teleport) for (const p of M.pidList) if (!p.off) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; p.face = Math.atan2(0, -p.team.dir * -1); p.face = p.team.dir > 0 ? 0 : Math.PI; p.anim = 0; }
}

// ---------- AI 감독 ----------
// AI 감독의 실시간 대응: 지난 구간에 드러난 약점(실점 위험 유형, 공격 부진, 점수 상황)을 보고 지침을 조금씩 고침
function aiAdapt(M, T) {
  const min = M.t / 60; if (min < 14 || (T.adT != null && M.t - T.adT < 540)) return; T.adT = M.t;
  const tc = tac(T); const from = T.adI || 0; T.adI = M.shotLog.length; const seg = M.shotLog.slice(from);
  const ag = seg.filter(x => x.s !== T.side), my = seg.filter(x => x.s === T.side); const xg = (a, o) => a.filter(x => !o || x.origin === o).reduce((v, x) => v + x.xg, 0);
  const diff = M.score[T.side] - M.score[1 - T.side]; const say = t => ev(M, 'tactic', T.side, `${T.name} 벤치: ${t}`, { quiet: true }); let n = 0; const cap = 2;
  const bump = (k, d, lo, hi) => { const v = clamp((tc[k] ?? 2) + d, lo, hi); if (v === tc[k]) return false; tc[k] = v; return true; };
  if (n < cap && xg(ag, 'through') >= .32 && (bump('defLine', -1, 0, 4) | (tc.offsideTrap ? (tc.offsideTrap = false, 1) : 0))) { say('뒷공간이 뚫리자 수비 라인을 내립니다.'); n++; }
  if (n < cap && xg(ag, 'cross') >= .3) { let ch = false; if (tc.trap === 'inside') { tc.trap = 'none'; ch = true; } const rd = T.setup.rolesD; if (rd) for (const p of active(T)) { const g = SLOT_GROUP[p.code]; if ((g === 'FB' || g === 'WB') && rd[p.slot] !== 'pfb') { rd[p.slot] = 'pfb'; ch = true; } } if (ch) { say('크로스를 계속 허용하자 측면 수비를 앞으로 붙입니다.'); n++; } }
  if (n < cap && xg(ag, 'counter') >= .3) { let ch = bump('width', -1, 0, 3); if (tc.onLoss !== 'regroup' && tc.press < 2) { tc.onLoss = 'regroup'; ch = true; } else if (tc.onLoss === 'neutral') { tc.onLoss = 'counterpress'; ch = true; } if (ch) { say('역습에 흔들리자 공을 잃은 뒤의 대응을 바꿉니다.'); n++; } }
  if (n < cap && ag.filter(x => x.origin === 'long').length >= 3 && bump('engage', 1, 0, 4)) { say('중거리 슈팅을 막으려 압박 기준선을 올립니다.'); n++; }
  if (n < cap && xg(ag) >= .9 && diff >= 0 && bump('press', 1, 0, 3)) { say('밀리는 흐름을 끊으려 압박 강도를 높입니다.'); n++; }
  // 공격이 막힐 때: 전개 방식을 바꿔 봄
  if (n < cap && min > 25 && diff <= 0 && xg(my) < .15 && (T.adA || 0) < 3) { T.adA = (T.adA || 0) + 1;
    const r = M.rng(); let t = '';
    if (r < .34 && bump('tempo', 1, 0, 4)) t = '공격이 풀리지 않자 템포를 올립니다.';
    else if (r < .67 && tc.width !== 3 && bump('width', 1, 0, 3)) t = '중앙이 막히자 공격 폭을 넓힙니다.';
    else if (tc.finalThird !== 'shootOnSight') { tc.finalThird = tc.finalThird === 'workIn' ? 'mixed' : 'shootOnSight'; t = '슈팅 기회가 없자 더 과감한 마무리를 주문합니다.'; }
    else if (bump('passing', tc.passing >= 2 ? -1 : 1, 0, 3)) t = '패스 길이를 바꿔 다른 길을 찾습니다.';
    if (t) { say(t); n++; }
  }
  // 점수 상황: 앞서면 조금씩 잠그고, 뒤지면 조금씩 올림
  const want = diff >= 2 && min > 55 ? -1 : diff === 1 && min > 68 ? -1 : diff < 0 && min > 50 ? 1 : 0; const cur = T.adM || 0;
  if (n < cap && want !== cur && !T.aiPush && !T.aiHold) { const d = want - cur; bump('defLine', d, 0, 4); bump('engage', d, 0, 4); bump('tempo', d, 0, 4); if (want < 0) tc.waste = 2; else if (cur < 0) tc.waste = 1; T.adM = want;
    const rd = T.setup.rolesD; if (rd && want > 0) for (const p of active(T)) if (SLOT_GROUP[p.code] === 'ST' && rd[p.slot] !== 'pfw') rd[p.slot] = 'pfw';
    say(want < 0 ? '리드를 지키기 위해 라인을 조금 내리고 템포를 늦춥니다.' : want > 0 ? '동점을 노리고 라인과 템포를 올립니다.' : '다시 기본 운영으로 돌아갑니다.'); }
}
function aiManage(M, T) {
  if (M.phase !== 'dead' && M.phase !== 'goal') return;
  aiAdapt(M, T);
  const min = M.t / 60; const tc = tac(T);
  if (T.subsLeft > 0 && min > 55 && (!T.lastAi || M.t - T.lastAi > 240)) {
    T.lastAi = M.t;
    const tired = active(T).filter(p => p.code !== 'GK' && !p.subbedIn).sort((a, b) => (a.energy + a.r.rating * 4) - (b.energy + b.r.rating * 4));
    const p = tired[0];
    if (p && (p.energy < 64 || (min > 70 && M.rng() < .5))) {
      const g = posGroup(p.pos);
      const cand = T.bench.filter(d => !T.usedIds.has(d.id) && d.pos !== 'GK').sort((a, b) => (posGroup(b.pos) === g ? 10 : 0) + b.ovr - ((posGroup(a.pos) === g ? 10 : 0) + a.ovr));
      if (cand[0]) substitute(M, T, p, cand[0]);
    }
  }
  const diff = M.score[T.side] - M.score[1 - T.side];
  if (min > 70 && diff < 0 && !T.aiPush) { T.aiPush = true; tc.engage = Math.min(4, tc.engage + 1); tc.tempo = Math.min(4, tc.tempo + 1); tc.defLine = Math.min(4, tc.defLine + 1); tc.passing = Math.min(3, tc.passing + 1); ev(M, 'tactic', T.side, `${T.name} 공격적으로 전술을 변경합니다.`, { quiet: true }); }
  if (min > 78 && diff > 0 && !T.aiHold) { T.aiHold = true; tc.waste = 2; tc.defLine = Math.max(0, tc.defLine - 1); tc.engage = Math.max(0, tc.engage - 1); ev(M, 'tactic', T.side, `${T.name} 리드를 지키기 위해 라인을 내립니다.`, { quiet: true }); }
}
function substitute(M, T, outP, inD) {
  if (T.subsLeft <= 0 || outP.off || T.usedIds.has(inD.id)) return false;
  const p = mkPlayer(M, T, inD, outP.slot);
  p.x = outP.x; p.y = -T.dir * 0 + Math.sign(outP.y || 1) * (HW + .5); p.x = 0; p.subbedIn = true;
  if (!(T.cond && T.cond[inD.id] != null)) p.energy = 100;
  outP.off = true; outP.subbedOff = true; outP.x = 0; outP.y = HW + 6; T._act = null;
  if (M.ball.owner === outP) M.ball.owner = null;
  const i = T.players.indexOf(outP); T.players[i] = p;
  T.setup.lineup[outP.slot] = inD.id;
  T.usedIds.add(inD.id); T.subsLeft--; T.subsUsed++;
  ev(M, 'sub', T.side, `교체: ${outP.name} ↔ ${inD.name}`, { pid: p.pid, outPid: outP.pid });
  if (M.restart) M.restart.timer += 32; else if (M.phase === 'goal') M.goalT += 20;
  return true;
}
// 포메이션 변경 시 슬롯 유지
function changeFormation(M, T, formation, newRoles) {
  T.setup.formation = formation; delete T.setup.slots; delete T.setup.slotsOop; delete T.setup.rolesD; T.setup.roles = newRoles || FORMATIONS[formation].map(s => s[3]);
  for (const p of T.players) { const sl = FORMATIONS[formation][p.slot]; p.code = sl[0]; p.fam = famOf(p.d, sl[0]); }
}
function swapSlots(M, T, a, b) {
  const pa = T.players.find(p => p.slot === a), pb = T.players.find(p => p.slot === b);
  if (pa) pa.slot = b; if (pb) pb.slot = a;
  const f = slotsOf(T.setup);
  for (const p of [pa, pb]) if (p) { p.code = f[p.slot][0]; p.fam = famOf(p.d, p.code); }
  const l = T.setup.lineup; [l[a], l[b]] = [l[b], l[a]];
}

// ---------- 녹화 (리플레이) ----------
const FR = 22 * 7 + 5;
function initRecorder(M) { M.rec = { chunks: [], n: 0, cap: 0, every: 2, slots: [], snaps: [] }; }
function record(M) {
  const R = M.rec; if (R.n >= R.cap) { R.chunks.push(new Int16Array(FR * 1000)); R.cap += 1000; }
  const a = R.chunks[R.chunks.length - 1]; let o = (R.n % 1000) * FR;
  for (let s = 0; s < 2; s++) {
    const T = M.teams[s];
    for (let i = 0; i < 11; i++) {
      const p = T.players.find(q => q.slot === i && !q.off) || null;
      if (!p) { a[o++] = -32000; a[o++] = 0; a[o++] = 0; a[o++] = 0; a[o++] = 0; a[o++] = -1; a[o++] = 0; continue; }
      a[o++] = Math.round(p.x * 50); a[o++] = Math.round(p.y * 50); a[o++] = Math.round(p.face * 1000);
      a[o++] = p.anim; a[o++] = Math.round(Math.min(p.animT, 30) * 100); a[o++] = p.pid; a[o++] = Math.round(hyp(p.vx, p.vy) * 100);
    }
  }
  a[o++] = Math.round(M.ball.x * 50); a[o++] = Math.round(M.ball.y * 50); a[o++] = Math.round(M.ball.z * 100); a[o++] = Math.round(M.t * 5); a[o++] = (M.phase === 'play' ? 0 : M.phase === 'goal' ? 2 : M.phase === 'out' ? 3 : 1) + (M.half === 2 ? 4 : 0);
  if (R.n % 25 === 0) R.snaps.push({ n: R.n, st: M.teams.map(T => Object.assign({}, T.st)), score: M.score.slice() });
  R.n++;
}
function readFrame(M, i, out) {
  const R = M.rec; i = clamp(i, 0, R.n - 1); const a = R.chunks[Math.floor(i / 1000)]; let o = (i % 1000) * FR;
  out = out || { players: [], ball: {} };
  out.players.length = 22;
  for (let k = 0; k < 22; k++) {
    const pl = out.players[k] || (out.players[k] = {});
    const x = a[o++]; pl.hidden = x === -32000; pl.x = x / 50; pl.y = a[o++] / 50; pl.face = a[o++] / 1000; pl.anim = a[o++]; pl.animT = a[o++] / 100; pl.pid = a[o++]; pl.speed = a[o++] / 100; pl.side = k < 11 ? 0 : 1;
  }
  out.ball.x = a[o++] / 50; out.ball.y = a[o++] / 50; out.ball.z = a[o++] / 100; out.t = a[o++] / 5; const ph = a[o++]; out.phase = ph & 3; out.half = ph & 4 ? 2 : 1;
  return out;
}
function liveFrame(M, out) {
  out = out || { players: [], ball: {} }; out.players.length = 22;
  for (let s = 0; s < 2; s++) for (let i = 0; i < 11; i++) {
    const k = s * 11 + i; const pl = out.players[k] || (out.players[k] = {});
    const p = M.teams[s].players.find(q => q.slot === i && !q.off);
    if (!p) { pl.hidden = true; continue; }
    pl.hidden = false; pl.x = p.x; pl.y = p.y; pl.face = p.face; pl.anim = p.anim; pl.animT = p.animT; pl.pid = p.pid; pl.speed = hyp(p.vx, p.vy); pl.side = s;
  }
  out.ball.x = M.ball.x; out.ball.y = M.ball.y; out.ball.z = M.ball.z; out.t = M.t; out.phase = M.phase === 'play' ? 0 : M.phase === 'goal' ? 2 : M.phase === 'out' ? 3 : 1; out.half = M.half;
  return out;
}

// ---------- 메인 스텝 ----------
function step(M) {
  WX = M.wx || null;
  if (M.ended) return;
  M.tick++;
  const b = M.ball;
  if (M.phase === 'goal') {
    M.goalT -= DT;
    for (const p of M.pidList) if (!p.off) { if (p.celebrate && M.t - p.celebrate < 4) { p.tx = p.x + p.vx * .3; p.ty = p.y + p.vy * .3; } else { p.tx = p.x; p.ty = p.y; } }
    movePlayers(M);
    if (M.goalT <= 0) { for (const T of M.teams) if (M.aiSides.includes(T.side)) aiManage(M, T); setKickoff(M, 1 - M.goalTeam.side, false, true); }
  } else if (M.phase === 'out') {
    const P = M.outPend; P.timer -= DT;
    stepBallOut(b);
    for (const p of M.pidList) if (!p.off) { p.tx = p.x + p.vx * .35; p.ty = p.y + p.vy * .35; }
    movePlayers(M);
    if (P.timer <= 0 && (hyp(b.vx, b.vy) < 4 && b.z < .6 || P.timer < -1.5)) setRestart(M, P.type, P.T, P.x, P.y, P.opt);
  } else if (M.phase === 'dead') {
    const R = M.restart; R.timer -= DT;
    // 데드볼 동안 선수들이 제자리 근처를 천천히 걸으며 위치를 다시 잡음
    if (M.tick % 10 === 0) for (const p of M.pidList) { if (p.off || p === R.taker || p.wall || p.code === 'GK') continue; if (M.rng() < .25) { p.tx = clamp(p.tx + (M.rng() - .5) * 6, -HL + 1, HL - 1); p.ty = clamp(p.ty + (M.rng() - .5) * 6, -HW + 1, HW - 1); } }
    if (R.taker && !R.taker.off) { R.taker.urg = 1; }
    enforceRestartZones(M);
    movePlayers(M);
    if (R.timer <= 0) { for (const T of M.teams) if (M.aiSides.includes(T.side)) aiManage(M, T); executeRestart(M); }
  } else if (M.phase === 'play') {
    computeTargets(M);
    const c = b.owner;
    if (c) {
      if (c.off) b.owner = null;
      else {
        if (!b.held) c.decT -= DT; else c.decT -= DT;
        if (c.decT <= 0) decide(M, c);
        if (b.owner === c && c.dribbling) { /* 드리블 목표 유지 */ }
      }
    }
    if (b.owner) { const o = b.owner; if (!o.dribbling && !b.held) { /* 보유 중 기본 이동 */ } }
    duels(M);
    if (M.phase !== 'play') movePlayers(M);
    else {
    M.bip = (M.bip || 0) + DT;
    movePlayers(M);
    if (b.owner) {
      const o = b.owner; if (b.held) o.face = o.team.dir > 0 ? 0 : Math.PI;
      b.x = clamp(o.x + Math.cos(o.face) * (b.held ? .3 : .55), -HL + .2, HL - .2); b.y = clamp(o.y + Math.sin(o.face) * (b.held ? .3 : .55), -HW + .2, HW - .2); b.z = b.held ? 1.1 : BR; b.vx = o.vx; b.vy = o.vy; b.vz = 0;
      if (o.dribbling && hyp(o.tx - o.x, o.ty - o.y) < 1) { o.dribbling = false; }
    } else {
      b.px = b.x; b.py = b.y;
      stepBall(b, DT);
      ballContacts(M);
    }
    if (M.phase === 'play') checkBounds(M);
    // 점유율 집계
    const pt = possessionTeam(M); if (pt) pt.st.poss += DT;
    // GK 다이빙 애니메이션 트리거
    for (const T of M.teams) for (const p of active(T)) if (p.diveAt && M.t >= p.diveAt.t) {
      const D0 = p.diveAt; const dy = D0.dy;
      if (Math.abs(dy) > 1.0) { setAnim(p, diveAnim(p, dy, D0.high)); p.vy = clamp(dy / .63, -5.4, 5.4); p.vx *= .3; p.stun = Math.max(p.stun, 1.7); p.diving = M.t; }
      else { setAnim(p, D0.high ? 9 : 13); p.vy = dy * 2; p.vx *= .3; p.stun = Math.max(p.stun, .6); }
      p.diveAt = null; }
    }
  }
  M.t += DT;
  for (const p of M.pidList) if (!p.off) p.r.min += DT / 60;
  if (M.tick % 50 === 0) for (const p of M.pidList) if (p.talkUntil && M.t >= p.talkUntil) { p.talkUntil = 0; p.talkV = 0; refreshMf(M, p); }
  // 전/후반 종료
  const halfEnd = M.half === 1 ? 2700 + M.addTime[0] : 5400 + M.addTime[1];
  if (M.t >= halfEnd && (M.phase !== 'play' || !b.flight || b.flight.type !== 'shot')) {
    if (M.half === 1) {
      M.half = 2; ev(M, 'half', -1, `전반 종료 ${M.score[0]} - ${M.score[1]}`);
      M.t = 2700;
      for (const T of M.teams) { T.dir *= -1; for (const p of active(T)) p.energy = Math.min(100, p.energy + 4); }
      for (const T of M.teams) if (M.aiSides.includes(T.side)) { T.lastAi = -999; }
      setKickoff(M, 1, true);
      M.halftimePause = true;
      // AI 감독의 하프타임 대화
      for (const T of M.teams) if (M.aiSides.includes(T.side)) { const df = M.score[T.side] - M.score[1 - T.side]; applyTalk(M, T, df < 0 ? 'demand' : df > 0 ? 'focus' : 'encourage'); }
    } else { M.ended = true; M.phase = 'end'; finalizeRatings(M); ev(M, 'end', -1, `경기 종료 ${M.score[0]} - ${M.score[1]}`); }
  }
  if (M.tick % M.rec.every === 0) record(M);
}
function ratingOf(M, p) {
  const r = p.r; if (r.min < 1) return 6;
  let rt = 6.1 + r.goals * 1.0 + r.ast * .6 + r.sot * .1 + r.kp * .2 + Math.min(.4, r.tklW * .03) + Math.min(.3, r.int * .02) + r.sav * .3 + Math.min(.3, r.drb * .03) - r.foul * .05 - p.yc * .3;
  if (r.pass > 8) rt += (r.passOk / r.pass - .78) * 1.6;
  const conc = M.score[1 - p.side]; const g = SLOT_GROUP[p.code];
  if (p.code === 'GK' || g === 'CB' || g === 'FB' || g === 'WB') rt -= conc * .25;
  if (conc === 0 && r.min > 60 && (p.code === 'GK' || g === 'CB' || g === 'FB' || g === 'WB')) rt += .5;
  rt += (M.score[p.side] > M.score[1 - p.side] ? .2 : M.score[p.side] < M.score[1 - p.side] ? -.2 : 0) * Math.min(1, r.min / 60);
  if (p.sentOff) rt -= 1.5;
  return Math.round(clamp(rt, 3, 10) * 10) / 10;
}
function finalizeRatings(M) { for (const p of M.pidList) p.r.rating = ratingOf(M, p); }
function liveRating(M, p) { const save = p.r.rating; finalizeRatings(M); const v = p.r.rating; return v; }
// 리그 기록용 요약 (워커와 메인 스레드 공용)
function summary(M) {
  return {
    score: M.score.slice(), wx: M.wx ? { k: M.wx.k, pitch: M.wx.pitch, label: M.wx.label } : null, xg: M.teams.map(T => +T.st.xg.toFixed(2)), st: M.teams.map(T => Object.assign({}, T.st)),
    goals: M.events.filter(e => e.type === 'goal').map(e => { const p = M.pidList[e.pid]; let sh = null; if (!e.own) for (const x of M.shotLog) if (x.p === e.pid && x.f <= e.frame) sh = x; return { side: e.side, min: e.min, id: p ? p.d.id : null, name: p ? p.name : '', own: !!e.own, sp: e.sp || null, ast: e.astId || null, xg: sh ? sh.xg : null, st: sh ? sh.type : null, dist: sh ? +Math.hypot(52.5 - sh.x, sh.y).toFixed(1) : null, org: sh ? sh.origin : null }; }),
    cards: M.events.filter(e => e.type === 'yellow' || e.type === 'red').map(e => { const p = M.pidList[e.pid]; return { side: e.side, min: e.min, id: p ? p.d.id : null, name: p ? p.name : '', type: e.type, direct: e.type === 'red' && !/누적/.test(e.text) }; }),
    players: M.pidList.filter(p => p.r.min > 0).map(p => ({ id: p.d.id, side: p.side, code: p.code, min: Math.round(p.r.min), goals: p.r.goals, ast: p.r.ast, yc: p.yc, red: !!p.sentOff, rating: p.r.rating, energy: Math.round(p.energy), dist: +(p.dist / 1000).toFixed(1), start: !p.subbedIn }))
  };
}
// 경기 중 감독 조작 기록을 같은 시점에 다시 적용 (하이라이트 재계산용)
function applyOp(M, o) {
  const T = M.teams[o.side];
  if (o.op === 'form') changeFormation(M, T, o.f);
  else if (o.op === 'swap') swapSlots(M, T, o.a, o.b);
  else if (o.op === 'sub') { const outP = T.players.find(p => !p.off && p.d.id === o.out); const inD = T.bench.find(d => d.id === o.in); if (outP && inD) substitute(M, T, outP, inD); }
  else if (o.op === 'talk') applyTalk(M, T, o.kind);
  else if (o.op === 'setup') { const keep = T.setup.lineup; T.setup = JSON.parse(JSON.stringify(o.s)); T.setup.lineup = keep; refreshCodes(T); }
}
function replayToEnd(M, ops, onChunk) { let i = 0; ops = ops || []; let guard = 0; while (!M.ended && guard++ < 90000) { while (i < ops.length && ops[i].t <= M.tick) applyOp(M, ops[i++]); M.halftimePause = false; step(M); } }
function simulateToEnd(M) { let guard = 0; while (!M.ended && guard++ < 80000) step(M); }

G.FMEngine = { DROLES, DEFAULT_DROLE, drolesForSlot, roleScore, oopSlotsOf, oopFrom, normRoles, WEATHER, PITCH, wxOf, HM_W, HM_H, PI_ALLOWED, applyOp, replayToEnd, summary, ratingOf, _t: { sampleShot: (...a) => sampleShot(...a), shotParams: (...a) => shotParams(...a), RNG }, DT, HL, HW, GW, GH, BR, ROLES, FORMATIONS, SLOT_GROUP, DEFAULT_TACTICS, DEFAULT_INSTR, rolesForSlot, familiarity, famOf, famLevel, posRating, rawRating, penArr, penOf, basePen, levelOfPen, PF_CODES, PFI, allRatings, archsOf, CODE_T, recoverPerDay, fatigue, formRoll, TALKS, applyTalk, SLOT_POS, slotsOf, codeAt, formLabel, refreshCodes, DEFAULT_ROLE, makeSetup, autoPick, createMatch, step, simulateToEnd, substitute, changeFormation, swapSlots, readFrame, liveFrame, finalizeRatings, E, active, minute };
})(typeof window !== 'undefined' ? window : globalThis);
