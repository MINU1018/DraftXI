// ===== 3D 렌더러 (Three.js) =====
(function (G) {
const HL = 52.5, HW = 34;
const V = (x, y, z) => new THREE.Vector3(x, z, -y); // 엔진 좌표 → three 좌표
function canvasTex(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }
const SKIN = [0xf1c7a5, 0xd9a07a, 0xa86e4a, 0x7a4a2e, 0x5a3420];
const lin = (c) => new THREE.Color(c).convertSRGBToLinear();

// ---------- 사람 모델 (three.js 예제의 Xbot 리깅 모델 + idle/walk/run 모션) ----------
const LIBS = [['lib/GLTFLoader.js', () => THREE.GLTFLoader], ['lib/SkeletonUtils.js', () => THREE.SkeletonUtils], ['lib/xbot.js', () => G.XBOT_GLB_B64]];
let modelPromise = null;
// 골키퍼 다이빙 자세 (t초): 준비(무릎 굽힘) → 도약(옆으로 몸을 날림, 높은 공이면 더 높이) → 착지·눕기 → 천천히 일어남
function divePose(a, t) {
  const sd = (a === 4 || a === 11) ? 1 : -1, hi = a === 11 || a === 12; const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const tilt = hi ? 1.2 : 1.5;
  let k, py, kn, arm, armX = 0, lUp = 0, rUp = 0, sp = 0;
  if (t < .12) { const c = t / .12; k = 0; py = -.12 * c; kn = .55 * c; arm = .5 * c; }
  else if (t < .55) { const c = (t - .12) / .43; k = ease(c * 1.25); const air = Math.sin(Math.min(1, c) * Math.PI) * (hi ? .75 : .42); py = -.12 * (1 - c) + air + .18 * k; kn = .55 * (1 - c) + .15; arm = .5 + 2.2 * ease(c * 1.6); lUp = sd > 0 ? -.35 * k : .2 * k; rUp = sd > 0 ? .2 * k : -.35 * k; }
  else if (t < 1.0) { k = 1; py = .18; kn = .25; arm = 2.7 - .3 * ease((t - .55) / .45); lUp = sd > 0 ? -.3 : .2; rUp = sd > 0 ? .2 : -.3; }
  else { const g = ease((t - 1.0) / .9); k = 1 - g; py = .18 * (1 - g) + .1 * Math.sin(g * Math.PI); kn = .25 + .9 * Math.sin(g * Math.PI); arm = 2.4 * (1 - g); armX = -.6 * Math.sin(g * Math.PI); sp = .3 * Math.sin(g * Math.PI); lUp = -.5 * Math.sin(g * Math.PI); }
  return { rz: -sd * tilt * k, px: sd * .55 * k, py, kn, arm, armX, lUp, rUp, sp };
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
function loadHumanModel() {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    for (const [src, ok] of LIBS) if (!ok()) await loadScript(src);
    const bin = atob(G.XBOT_GLB_B64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().parse(u8.buffer, '', res, rej));
    const clips = {};
    for (const c of gltf.animations) {
      if (!['idle', 'walk', 'run'].includes(c.name)) continue;
      // 손가락·스케일 트랙은 제거(연산량 절감), 엉덩이 이동은 제자리로 고정(실제 이동은 엔진 좌표가 담당)
      c.tracks = c.tracks.filter(t => !/Hand(Thumb|Index|Middle|Ring|Pinky)|\.scale$|Eye|HeadTop/.test(t.name));
      for (const t of c.tracks) if (/Hips\.position$/.test(t.name)) { const v = t.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
      clips[c.name] = c;
    }
    if (!clips.idle || !clips.walk || !clips.run) throw new Error('clips');
    gltf.scene.traverse(o => { if (o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; } });
    return { scene: gltf.scene, clips };
  })();
  return modelPromise;
}
// 바인드 포즈(T자세) 좌표로 유니폼 영역을 칠하는 셰이더: 상의·하의·양말·축구화·피부·등번호
const KIT_GLSL = `
  vec3 P = vBind; float ax = abs(P.x); vec3 kc = uShirt; bool arm = ax > 0.215 && P.y > 1.2;
  if (P.y > 1.5 && !arm) { kc = uSkin; if (P.y > 1.735 || (P.y > 1.6 && P.z < -0.035) || (P.y > 1.66 && P.z < 0.02 && ax > 0.075)) kc = uHair; }
  else if (arm) { if (uGK > 0.5) kc = ax > 0.66 ? uGlove : uShirt; else kc = ax > 0.42 ? uSkin : uShirt; }
  else if (P.y > 0.96) kc = uShirt;
  else if (P.y > 0.6) kc = uShorts;
  else if (P.y > 0.49) kc = uSkin;
  else if (P.y > 0.085) kc = uSock;
  else kc = uBoot;
  if (!arm && P.z < -0.03 && P.y > 1.04 && P.y < 1.4 && ax < 0.17) { vec4 t = texture2D(uNum, vec2((0.17 - P.x) / 0.34, (P.y - 1.04) / 0.36)); kc = mix(kc, pow(t.rgb, vec3(2.2)), t.a); }
  if (!arm && P.z > 0.03 && P.y > 1.28 && P.y < 1.38 && P.x > 0.06 && P.x < 0.13) kc = mix(kc, uShorts, 0.85);
  diffuseColor.rgb = kc;`;
function kitMaterial(inf, numTex) {
  const gk = inf.gk;
  const U = {
    uShirt: { value: lin(gk ? inf.gkColor : inf.c1) }, uShorts: { value: lin(gk ? '#1b1f24' : inf.c2) }, uSock: { value: lin(gk ? inf.gkColor : inf.c1) },
    uSkin: { value: new THREE.Color(SKIN[inf.skin % SKIN.length]).convertSRGBToLinear() }, uBoot: { value: lin('#16181c') }, uHair: { value: lin(['#1a1410', '#2b1d14', '#4a3020', '#6b4a2a', '#c9a46a', '#0e0e10'][(inf.skin * 7 + (inf.num | 0)) % 6]) }, uGlove: { value: lin('#e9eef2') },
    uNum: { value: numTex }, uGK: { value: gk ? 1 : 0 }
  };
  const m = new THREE.MeshStandardMaterial({ roughness: .78, metalness: 0, skinning: true });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vBind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBind = position;');
    sh.fragmentShader = 'varying vec3 vBind; uniform vec3 uShirt, uShorts, uSock, uSkin, uBoot, uGlove, uHair; uniform sampler2D uNum; uniform float uGK;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + KIT_GLSL);
  };
  m.customProgramCacheKey = () => 'kit-v1';
  return m;
}
// ===== 사람 형태 몸체 =====
// 내장 모델(X Bot)은 허리가 잘록하고 관절이 구슬로 끊긴 마네킹이라, 뼈대와 애니메이션만 쓰고 겉모습은 직접 만든다.
// 뼈마다 그 부위(몸통·허벅지·정강이…)를 붙이며, 치수는 cm(뼈 로컬 단위). 실제 축구선수 비율: 어깨 폭 39, 허리 32, 골반 34, 머리 높이 22
const _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _qq = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _eu = new THREE.Euler();
const BOOTS = ['#16181c', '#f2f2f2', '#f5d21f', '#ff6a1f', '#27c4d9', '#e23b5a', '#16181c', '#2b3aa0'];
class BodyBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, m, color) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) { this.pos.push(p[i], p[i + 1], p[i + 2]); this.nor.push(n[i], n[i + 1], n[i + 2]); this.col.push(color.r, color.g, color.b); }
    if (g !== geo) g.dispose(); geo.dispose(); return this;
  }
  // a→b를 잇는 원뿔대. r0 = a쪽 반지름, r1 = b쪽 반지름, sx·sz = 단면을 타원으로 (몸통용)
  cyl(a, b, r0, r1, color, sx, sz) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _dir.length(); if (L < 1e-4) return this; _dir.divideScalar(L);
    const geo = new THREE.CylinderGeometry(r1, r0, L, 12, 1, true); geo.translate(0, L / 2, 0);
    _qq.setFromUnitVectors(_up, _dir); _m4.compose(_p3.set(a[0], a[1], a[2]), _qq, _s3.set(sx || 1, 1, sz || 1));
    return this.add(geo, _m4, color);
  }
  // 타원체. rotX = 앞뒤 기울임, th = 위에서부터 덮는 각(머리카락용 부분 구)
  ell(c, rx, ry, rz, color, rotX, th) {
    const geo = new THREE.SphereGeometry(1, 10, 7, 0, Math.PI * 2, 0, th || Math.PI);
    _qq.setFromEuler(_eu.set(rotX || 0, 0, 0)); _m4.compose(_p3.set(c[0], c[1], c[2]), _qq, _s3.set(rx, ry, rz));
    return this.add(geo, _m4, color);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.frustumCulled = false; return m;
  }
}
let bodyMat = null;
function buildBody(root, inf, numTex) {
  const bone = n => root.getObjectByName('mixamorig' + n) || root.getObjectByName('mixamorig:' + n);
  const need = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  const B = {}; for (const n of need) { B[n] = bone(n); if (!B[n]) throw new Error('bone ' + n); }
  const gk = inf.gk; const C = {
    shirt: lin(gk ? inf.gkColor : inf.c1), trim: lin(gk ? '#1b1f24' : inf.c2), shorts: lin(gk ? '#1b1f24' : inf.c2), sock: lin(gk ? inf.gkColor : inf.c1),
    skin: new THREE.Color(SKIN[inf.skin % SKIN.length]).convertSRGBToLinear(), hair: lin(['#1a1410', '#2b1d14', '#4a3020', '#6b4a2a', '#c9a46a', '#0e0e10'][(inf.skin * 7 + (inf.num | 0)) % 6]),
    boot: lin(BOOTS[((inf.pid | 0) * 5 + (inf.num | 0)) % BOOTS.length]), glove: lin('#e9eef2'), eye: lin('#15110e') };
  // 상의와 하의 색이 같으면 구분이 안 되므로 하의·깃을 살짝 어둡게
  if (C.shorts.getHex() === C.shirt.getHex()) { C.shorts = C.shorts.clone().multiplyScalar(.72); C.trim = C.shorts; }
  const arm = gk ? C.shirt : C.skin, hand = gk ? C.glove : C.skin;
  if (!bodyMat) bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: 0 });
  const put = (name, fn) => { const bb = new BodyBuilder(); fn(bb, B[name]); const m = bb.mesh(bodyMat); m.name = 'body_' + name; B[name].add(m); return m; };
  const kid = (b, re) => { const c = b.children.find(o => o.isBone && re.test(o.name)); if (!c) throw new Error('child of ' + b.name); return [c.position.x, c.position.y, c.position.z]; };
  const mul = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
  // 골반(하의)
  put('Hips', b => b.ell([0, -3, -.6], 17.4, 11.5, 10.9, C.shorts));
  // 몸통(상의): 허리 → 가슴 → 어깨. 폭(x)이 깊이(z)보다 넓은 타원 단면
  put('Spine', b => b.cyl([0, -9.5, .2], [0, 10.1, -1], 16.0, 16.2, C.shirt, 1, .67));
  put('Spine1', b => b.cyl([0, 0, 0], [0, 9.1, -1.4], 16.2, 17.6, C.shirt, 1, .66));
  const chest = put('Spine2', b => { b.cyl([0, 0, 0], [0, 10, -1.7], 17.6, 19.3, C.shirt, 1, .62); b.ell([0, 10, -1.9], 19.5, 6.3, 11.4, C.shirt); b.cyl([0, 14.3, -2.3], [0, 16.6, -2.5], 6.5, 6.1, C.trim); });
  // 등번호
  { const np = new THREE.Mesh(new THREE.PlaneGeometry(21, 21), new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false })); np.position.set(0, 3.2, -12.6); np.rotation.y = Math.PI; np.name = 'body_num'; B.Spine2.add(np); }
  put('Neck', b => b.cyl([0, -2, 0], [0, 9.6, 1.7], 5.3, 4.9, C.skin));
  put('Head', b => { b.ell([0, 8.6, 1.8], 8.4, 10.9, 9.6, C.skin); b.ell([0, 9.5, .7], 8.95, 11.25, 10.25, C.hair, -.4, Math.PI * .56);
    b.ell([0, 6.4, 11], 1.25, 1.7, 1.5, C.skin); b.ell([8.3, 7.6, 1.2], 1.2, 2.3, 1.6, C.skin); b.ell([-8.3, 7.6, 1.2], 1.2, 2.3, 1.6, C.skin);
    b.ell([3.1, 9.3, 10.55], 1.05, .7, .6, C.eye); b.ell([-3.1, 9.3, 10.55], 1.05, .7, .6, C.eye); });
  for (const S of ['Left', 'Right']) {
    // 팔: 어깨 → 반소매 → 팔뚝 → 손 (골키퍼는 긴소매 + 장갑)
    const tA = kid(B[S + 'Arm'], /ForeArm/), tF = kid(B[S + 'ForeArm'], /Hand/); const sg = Math.sign(tF[0]) || 1;
    put(S + 'Arm', b => { b.ell([0, 0, 0], 6.5, 6.3, 6.5, C.shirt); b.cyl([0, 0, 0], mul(tA, .52), 6.0, 5.4, C.shirt); b.cyl(mul(tA, .5), mul(tA, .56), 5.55, 5.5, gk ? C.shirt : C.trim); b.cyl(mul(tA, .5), tA, 4.6, 3.95, arm); });
    put(S + 'ForeArm', b => { b.ell([0, 0, 0], 4.05, 4.05, 4.05, arm); b.cyl([0, 0, 0], tF, 3.95, 3.05, arm); });
    put(S + 'Hand', b => { b.ell([0, 0, 0], 3.2, 3.2, 3.2, hand); b.ell([sg * (gk ? 7.5 : 6.2), -.4, .6], gk ? 7 : 5.3, gk ? 2.9 : 2.1, gk ? 5.2 : 3.9, hand); });
    // 다리: 하의 자락 → 허벅지 → 무릎 → 양말(종아리) → 축구화
    const tU = kid(B[S + 'UpLeg'], /Leg$/), tL = kid(B[S + 'Leg'], /Foot/);
    put(S + 'UpLeg', b => { b.ell([0, 0, 0], 8.9, 8.9, 9.3, C.shorts); b.cyl([0, 2, 0], mul(tU, .47), 9.1, 8.6, C.shorts); b.cyl(mul(tU, .4), tU, 7.6, 5.6, C.skin); });
    put(S + 'Leg', b => { b.ell([0, 0, 0], 5.7, 5.7, 5.7, C.skin); b.cyl([0, 0, 0], mul(tL, .12), 5.6, 5.4, C.skin); b.cyl(mul(tL, .1), mul(tL, .19), 5.6, 5.75, C.trim); b.cyl(mul(tL, .17), mul(tL, .42), 5.5, 5.8, C.sock); b.cyl(mul(tL, .42), tL, 5.8, 3.95, C.sock); });
    put(S + 'Foot', b => { b.ell([0, 0, 0], 4.15, 4.15, 4.15, C.sock); b.ell([0, -4.9, 7.2], 4.8, 3.55, 12.6, C.boot); });
  }
  void chest;
}
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _dq = new THREE.Quaternion();
// 캐릭터 기준 축으로 뼈를 추가 회전 (애니메이션 위에 킥·다이빙 등 동작을 얹음)
function rotBone(root, bone, axis, ang) {
  if (!bone || !ang) return;
  bone.parent.getWorldQuaternion(_q1); root.getWorldQuaternion(_q2);
  _v.copy(axis).applyQuaternion(_q2).applyQuaternion(_q1.invert()).normalize();
  _dq.setFromAxisAngle(_v, ang); bone.quaternion.premultiply(_dq); bone.updateMatrixWorld(true);
}

class Render3D {
  constructor(canvas) {
    this.c = canvas;
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.outputEncoding = THREE.sRGBEncoding;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x070b14); this.scene.fog = new THREE.Fog(0x070b14, 170, 330);
    this.cam = new THREE.PerspectiveCamera(42, 1, .3, 700); this.cam.position.set(0, 30, 60);
    this.camPos = new THREE.Vector3(0, 30, 60); this.camLook = new THREE.Vector3();
    this.orbit = { theta: -.3, phi: .95, r: 85, target: new THREE.Vector3(), drag: null };
    this.players = new Map(); this.phase = {};
    this.time = 0; this.cheer = 0; this.dyn = [];
    this.buildStadium(); this.buildBall(); this.bindOrbit();
    this.mode = 'broadcast';
    this.modelKind = 'simple'; this.tpl = null; this.modelState = 'none';
  }
  // 'human' | 'simple'
  // kind: 'human'(사람 형태) | 'xbot'(내장 마네킹) | 'simple'
  setModel(kind, onState) {
    const st = kind === 'xbot' ? 'xbot' : 'body'; if (kind === 'xbot') kind = 'human'; if (st !== this.humanStyle) { this.humanStyle = st; if (this.tpl) this.clearPlayers(); }
    this.modelKind = kind;
    if (kind !== 'human') { if (this.tpl || this.modelState !== 'none') this.clearPlayers(); this.modelState = 'none'; return; }
    if (this.tpl) { this.clearPlayers(); this.modelState = 'ready'; return; }
    this.modelState = 'loading'; onState && onState('loading');
    loadHumanModel().then(t => { this.tpl = t; if (this.modelKind === 'human') { this.clearPlayers(); this.modelState = 'ready'; onState && onState('ready'); } })
      .catch(e => { console.warn('human model failed', e); this.modelState = 'failed'; this.modelKind = 'simple'; onState && onState('failed'); });
  }
  setKits(kits) {
    if (!kits || !this.crowd) return; this.kits = kits;
    const pal = [kits[0].c1, kits[0].c1, kits[0].c1, kits[0].c2, '#e8ecf0', '#2a2f38', '#1d2633', '#5d6673', '#8a7a66', '#3a4f6b'];
    const away = [kits[1].c1, kits[1].c1, kits[1].c2, '#e8ecf0', '#2a2f38'];
    const col = new THREE.Color();
    for (const cr of this.crowd) {
      let s = cr.seed;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < cr.mesh.count; i++) { const isAway = cr.awayFrom != null && cr.pos[i] >= cr.awayFrom; const P = isAway ? away : pal; col.set(P[(rnd() * P.length) | 0]).convertSRGBToLinear().multiplyScalar(.7 + rnd() * .4); cr.mesh.setColorAt(i, col); }
      cr.mesh.instanceColor.needsUpdate = true;
    }
    for (const m of this.seatMats || []) m.color.set(kits[0].c1).convertSRGBToLinear().multiplyScalar(.35);
  }
  resize() { const r = this.c.getBoundingClientRect(); this.renderer.setSize(r.width, r.height, false); this.cam.aspect = r.width / Math.max(1, r.height); this.cam.updateProjectionMatrix(); }
  buildStadium() {
    const S = this.scene;
    S.add(new THREE.HemisphereLight(0xcfe2ff, 0x1d3320, .5));
    const sun = new THREE.DirectionalLight(0xfff6e6, 1.0); sun.position.set(-40, 80, 30); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 200; sun.shadow.bias = -.0006;
    S.add(sun); this.sun = sun;
    const fill = new THREE.DirectionalLight(0xb9ccff, .32); fill.position.set(50, 45, -40); S.add(fill);
    const fill2 = new THREE.DirectionalLight(0xfff0d8, .18); fill2.position.set(0, 40, 70); S.add(fill2);
    const tex = this.grassTexture(this.pitchStyle || { c: ['#2f7a3f', '#296b37'], pattern: 'stripes' });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(115, 78), new THREE.MeshLambertMaterial({ map: tex }));
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; S.add(pitch); this.pitchMesh = pitch;
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(128, 90), new THREE.MeshLambertMaterial({ color: 0x245a31 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -.02; apron.receiveShadow = true; S.add(apron); this.apron = apron;
    this.buildStadiumRest();
  }
  // 잔디 텍스처 (색·무늬 + 라인). 설정에서 색과 무늬를 바꿀 수 있음
  grassTexture(ps) {
    const [c1, c2] = ps.c; const pat = ps.pattern || 'stripes';
    const tex = canvasTex(1150, 780, (g, w, h) => {
      const k = w / 115; const ox = (x) => (x + 57.5) * k, oy = (y) => (39 - y) * k;
      g.fillStyle = c2; g.fillRect(0, 0, w, h);
      if (pat === 'stripes') for (let i = 0; i < 23; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * w / 23, 0, w / 23 + 1, h); }
      else if (pat === 'checker') for (let i = 0; i < 23; i++) for (let j = 0; j < 14; j++) { g.fillStyle = (i + j) % 2 ? c1 : c2; g.fillRect(i * w / 23, j * h / 14, w / 23 + 1, h / 14 + 1); }
      else if (pat === 'rings') for (let r = 12; r >= 1; r--) { g.fillStyle = r % 2 ? c1 : c2; g.beginPath(); g.arc(w / 2, h / 2, r * 6 * k, 0, 7); g.fill(); }
      else { g.fillStyle = c1; g.fillRect(0, 0, w, h); }
      if (pat === 'stripes') for (let j = 0; j < 12; j++) { g.fillStyle = j % 2 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.03)'; g.fillRect(0, j * h / 12, w, h / 12 + 1); }
      const im = g.getImageData(0, 0, w, h); for (let i = 0; i < im.data.length; i += 4) { const n = (Math.random() - .5) * 10; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; } g.putImageData(im, 0, 0);
      // 골문 앞 마모
      for (const s of [-1, 1]) { const gr = g.createRadialGradient(ox(s * (HL - 3)), oy(0), 0, ox(s * (HL - 3)), oy(0), 7 * k); gr.addColorStop(0, 'rgba(120,105,70,.28)'); gr.addColorStop(1, 'rgba(120,105,70,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      g.strokeStyle = 'rgba(245,250,245,.92)'; g.lineWidth = .14 * k;
      const L = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(ox(p[0]), oy(p[1])) : g.moveTo(ox(p[0]), oy(p[1]))); g.stroke(); };
      L([[-HL, -HW], [HL, -HW], [HL, HW], [-HL, HW], [-HL, -HW]]); L([[0, -HW], [0, HW]]);
      g.beginPath(); g.arc(ox(0), oy(0), 9.15 * k, 0, 7); g.stroke();
      g.fillStyle = 'rgba(245,250,245,.92)'; g.beginPath(); g.arc(ox(0), oy(0), .25 * k, 0, 7); g.fill();
      for (const s of [-1, 1]) {
        L([[s * HL, -20.16], [s * (HL - 16.5), -20.16], [s * (HL - 16.5), 20.16], [s * HL, 20.16]]);
        L([[s * HL, -9.16], [s * (HL - 5.5), -9.16], [s * (HL - 5.5), 9.16], [s * HL, 9.16]]);
        g.beginPath(); g.arc(ox(s * (HL - 11)), oy(0), .22 * k, 0, 7); g.fill();
        const a0 = Math.acos(5.5 / 9.15); g.beginPath();
        if (s > 0) g.arc(ox(s * (HL - 11)), oy(0), 9.15 * k, Math.PI - a0, Math.PI + a0); else g.arc(ox(s * (HL - 11)), oy(0), 9.15 * k, -a0, a0);
        g.stroke();
        for (const t of [-1, 1]) { g.beginPath(); g.arc(ox(s * HL), oy(t * HW), 1 * k, 0, 7); g.stroke(); }
      }
    });
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  setPitch(ps) {
    const key = JSON.stringify(ps); if (key === this.pitchKey) return; this.pitchKey = key; this.pitchStyle = ps;
    if (!this.pitchMesh) return;
    const old = this.pitchMesh.material.map; this.pitchMesh.material.map = this.grassTexture(ps); this.pitchMesh.material.needsUpdate = true; if (old) old.dispose();
    this.apron.material.color.set(ps.c[1]).convertSRGBToLinear();
  }
  buildStadiumRest() {
    const S = this.scene;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x15191f }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.06; S.add(floor);
    // 골대
    const postM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .35 });
    const netM = new THREE.LineBasicMaterial({ color: 0xe8eef0, transparent: true, opacity: .38 });
    for (const s of [-1, 1]) {
      const gp = new THREE.Group();
      const post = (a, b, r = .06) => { const d = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), postM); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; gp.add(m); };
      const x0 = s * HL, x1 = s * (HL + 2);
      post(V(x0, -3.66, 0), V(x0, -3.66, 2.44)); post(V(x0, 3.66, 0), V(x0, 3.66, 2.44)); post(V(x0, -3.66, 2.44), V(x0, 3.66, 2.44));
      post(V(x0, -3.66, 2.44), V(x1, -3.66, 2.2), .025); post(V(x0, 3.66, 2.44), V(x1, 3.66, 2.2), .025); post(V(x1, -3.66, 2.2), V(x1, 3.66, 2.2), .025);
      const pts = [];
      for (let i = 0; i <= 24; i++) { const y = -3.66 + i * 7.32 / 24; pts.push(V(x0, y, 2.44), V(x1, y, 2.2), V(x1, y, 2.2), V(x1, y, 0)); }
      for (let j = 0; j <= 8; j++) { const z = j * 2.2 / 8; pts.push(V(x1, -3.66, z), V(x1, 3.66, z)); }
      for (let j = 0; j <= 6; j++) { const t = j / 6; const xx = x0 + (x1 - x0) * t; pts.push(V(xx, -3.66, 2.44 - .24 * t), V(xx, 3.66, 2.44 - .24 * t)); for (const yy of [-3.66, 3.66]) pts.push(V(xx, yy, 0), V(xx, yy, 2.44 - .24 * t)); }
      gp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), netM));
      S.add(gp);
    }
    // 코너 깃발
    const flagM = new THREE.MeshBasicMaterial({ color: 0xf2b33d, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.5, 6), postM); pole.position.copy(V(sx * HL, sy * HW, .75)); S.add(pole);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(.4, .3), flagM); fl.position.copy(V(sx * HL, sy * HW, 1.35)).add(new THREE.Vector3(.2, 0, 0)); S.add(fl);
    }
    this.buildStands();
    this.buildBoards();
    this.buildDugouts();
  }
  // 2층 관중석 + 지붕 + 조명 + 관중
  buildStands() {
    const S = this.scene;
    const concrete = new THREE.MeshLambertMaterial({ color: 0x3a414c });
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x5a1820 }); this.seatMats = [seatMat];
    const darkM = new THREE.MeshLambertMaterial({ color: 0x1b2028 });
    const roofTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3a414a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(i * w / 8, 0, w / 8, h); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * w / 8, 0, 2, h); } }); roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping; roofTex.repeat.set(12, 2);
    const roofM = new THREE.MeshLambertMaterial({ map: roofTex, color: 0x9098a4, side: THREE.DoubleSide });
    const roofUnder = new THREE.MeshLambertMaterial({ color: 0x9aa4b2, side: THREE.DoubleSide });
    const lightStrip = new THREE.MeshBasicMaterial({ color: 0xfff7e0 });
    const steelM = new THREE.MeshLambertMaterial({ color: 0x8c96a3 });
    const glassTex = canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#121a26'; g.fillRect(0, 0, w, h); for (let i = 0; i < 32; i++) { g.fillStyle = Math.random() < .7 ? `rgba(255,${200 + Math.random() * 40 | 0},${140 + Math.random() * 60 | 0},${.35 + Math.random() * .4})` : 'rgba(40,60,90,.6)'; g.fillRect(i * 16 + 1, 10, 14, 40); } });
    glassTex.wrapS = THREE.RepeatWrapping; glassTex.encoding = THREE.sRGBEncoding;
    const fasciaTex = canvasTex(1024, 64, (g, w, h) => { g.fillStyle = '#0a0f18'; g.fillRect(0, 0, w, h); g.font = '700 38px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle'; ['TOUCHLINE', '•', 'MATCHDAY', '•', 'TOUCHLINE', '•', 'MATCHDAY', '•'].forEach((t, i) => { g.fillStyle = t === '•' ? '#f2b33d' : '#dfe8f2'; g.fillText(t, 14 + i * 128, h / 2 + 2); }); });
    fasciaTex.wrapS = THREE.RepeatWrapping; fasciaTex.encoding = THREE.sRGBEncoding;
    // 사람 하나: 몸통 + 머리 (aPart=1 은 머리 → 피부색)
    const personGeo = (() => {
      const a = new THREE.BoxGeometry(.5, .6, .3).toNonIndexed(); a.translate(0, .64, 0);
      const b = new THREE.BoxGeometry(.22, .24, .22).toNonIndexed(); b.translate(0, 1.08, .01);
      const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3); pos.set(a.attributes.position.array); pos.set(b.attributes.position.array, a.attributes.position.array.length);
      const nor = new Float32Array(pos.length); nor.set(a.attributes.normal.array); nor.set(b.attributes.normal.array, a.attributes.normal.array.length);
      const n = pos.length / 3, na = a.attributes.position.count; const part = new Float32Array(n); for (let i = na; i < n; i++) part[i] = 1;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('aPart', new THREE.BufferAttribute(part, 1)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      return g;
    })();
    const crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } }; this.crowdU = crowdU;
    const crowdMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    crowdMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, crowdU);
      sh.vertexShader = 'attribute float aPart; uniform float uTime, uCheer;\n' + sh.vertexShader
        .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n float sk = fract(instanceColor.r * 17.31 + instanceColor.b * 5.7); vColor.xyz = mix(instanceColor.xyz, mix(vec3(0.62,0.4,0.28), vec3(0.16,0.09,0.05), sk * sk), aPart);\n#endif')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71 + instanceMatrix[3].y * 1.3;\n transformed.y += 0.025 * sin(uTime * 1.7 + ph * 3.0) + uCheer * abs(sin(uTime * 8.0 + ph * 2.0)) * 0.32 * step(0.35, fract(ph * 7.13));');
    };
    crowdMat.customProgramCacheKey = () => 'crowd-v1';
    this.crowd = [];
    let seedN = 1;
    const tierShape = (u0, v0, n, rd, rh, under) => {
      const sh = new THREE.Shape(); sh.moveTo(u0, under); sh.lineTo(u0, v0);
      for (let i = 0; i < n; i++) { sh.lineTo(u0 + (i + 1) * rd, v0 + i * rh); sh.lineTo(u0 + (i + 1) * rd, v0 + (i + 1) * rh); }
      sh.lineTo(u0 + n * rd, under); sh.lineTo(u0, under); return sh;
    };
    const extrude = (shape, len, mat) => { const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-len / 2, 0, 0); const m = new THREE.Mesh(g, mat); m.receiveShadow = false; return m; };
    const stand = (len, x, z, rotY, cfg) => {
      const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = rotY; S.add(grp);
      const tiers = [];
      // 아래층
      const t1 = { u0: 0, v0: 1.1, n: cfg.lower, rd: .82, rh: .42 }; tiers.push(t1);
      grp.add(extrude(tierShape(t1.u0, t1.v0, t1.n, t1.rd, t1.rh, 0), len, concrete));
      const u1 = t1.u0 + t1.n * t1.rd, h1 = t1.v0 + t1.n * t1.rh;
      // 귀빈석 유리 박스
      const club = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), new THREE.MeshBasicMaterial({ map: (() => { const t = glassTex.clone(); t.needsUpdate = true; t.repeat.set(len / 16, 1); return t; })() }));
      club.position.set(0, h1 + 1.6, -u1 - .3); grp.add(club);
      let top = h1 + 3.2, back = u1 + 1;
      if (cfg.upper) {
        const t2 = { u0: u1 - 4, v0: h1 + 4.6, n: cfg.upper, rd: .84, rh: .62 }; tiers.push(t2);
        grp.add(extrude(tierShape(t2.u0, t2.v0, t2.n, t2.rd, t2.rh, t2.v0 - 2.2), len, concrete));
        // 2층 앞 LED 띠
        const ft = fasciaTex.clone(); ft.needsUpdate = true; ft.repeat.set(len / 24, 1); this.dyn.push({ tex: ft, speed: -.012 });
        const fas = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.6), new THREE.MeshBasicMaterial({ map: ft })); fas.position.set(0, t2.v0 - .9, -t2.u0 + .02); grp.add(fas);
        top = t2.v0 + t2.n * t2.rh; back = t2.u0 + t2.n * t2.rd;
      }
      // 뒷벽 · 측벽
      const wallH = top + 5;
      const bw = new THREE.Mesh(new THREE.PlaneGeometry(len, wallH), darkM); bw.position.set(0, wallH / 2, -back - .2); grp.add(bw);
      for (const sx of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(back + 1, wallH), darkM); sw.rotation.y = Math.PI / 2; sw.position.set(sx * len / 2, wallH / 2, -(back + 1) / 2 + .5); sw.material = new THREE.MeshLambertMaterial({ color: 0x232a34, side: THREE.DoubleSide }); grp.add(sw); }
      // 지붕 (뒤에서 앞으로 살짝 기울어진 캔틸레버) + 앞쪽 조명 띠 + 트러스
      const rf = cfg.roofFront, rH0 = wallH + 1.5, rH1 = wallH + .3, rd = back + 1 + rf;
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(len + 2, rd), roofM); roof.rotation.x = -Math.PI / 2 + Math.atan2(rH0 - rH1, rd); roof.position.set(0, (rH0 + rH1) / 2, -(back + 1) + rd / 2); grp.add(roof);
      const under = new THREE.Mesh(new THREE.PlaneGeometry(len + 2, rd), roofUnder); under.rotation.copy(roof.rotation); under.position.copy(roof.position); under.position.y -= .35; grp.add(under);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, .35, .5), lightStrip); strip.position.set(0, rH1 - .45, rf - .4); grp.add(strip);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 1.1, .4), roofM); edge.position.set(0, rH1 + .1, rf); grp.add(edge);
      for (let i = 0; i <= Math.round(len / 18); i++) { const xx = -len / 2 + i * len / Math.round(len / 18); const tr = new THREE.Mesh(new THREE.BoxGeometry(.35, .35, rd), steelM); tr.position.set(xx, (rH0 + rH1) / 2 + .6, -(back + 1) + rd / 2); tr.rotation.x = Math.atan2(rH0 - rH1, rd); grp.add(tr); const col = new THREE.Mesh(new THREE.BoxGeometry(.5, wallH + 3, .5), steelM); col.position.set(xx, (wallH + 3) / 2, -back - .6); grp.add(col); }
      // 관중 (인스턴싱)
      const spots = [], posAlong = [];
      let s = 1234 + seedN * 777; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (const t of tiers) for (let r = 0; r < t.n; r++) {
        const y = t.v0 + r * t.rh, zz = -(t.u0 + (r + .55) * t.rd);
        for (let xx = -len / 2 + .5; xx < len / 2 - .4; xx += .52) { if (rnd() < cfg.fill) { spots.push(xx + (rnd() - .5) * .08, y, zz, (rnd() - .5) * .35, .9 + rnd() * .2); posAlong.push((xx + len / 2) / len); } }
      }
      const cnt = spots.length / 5; const mesh = new THREE.InstancedMesh(personGeo, crowdMat, cnt);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
      for (let i = 0; i < cnt; i++) { pp.set(spots[i * 5], spots[i * 5 + 1], spots[i * 5 + 2]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spots[i * 5 + 3]); const k = spots[i * 5 + 4]; sc.set(k, k, k); mtx.compose(pp, q, sc); mesh.setMatrixAt(i, mtx); mesh.setColorAt(i, new THREE.Color(0x888888)); }
      mesh.instanceMatrix.needsUpdate = true; grp.add(mesh);
      this.crowd.push({ mesh, seed: seedN++ * 99991, pos: posAlong, awayFrom: cfg.awayFrom });
      // 좌석 색 띠 (빈자리 사이로 보이는 좌석)
      for (const t of tiers) { const sm = new THREE.Mesh(new THREE.PlaneGeometry(len - .4, t.n * Math.hypot(t.rd, t.rh)), seatMat); sm.rotation.x = -Math.PI / 2 + Math.atan2(t.rh, t.rd); sm.position.set(0, t.v0 + t.n * t.rh / 2 + .05, -(t.u0 + t.n * t.rd / 2)); grp.add(sm); }
      // 입구 (보미토리)
      for (let i = 1; i < 5; i++) { const vm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), darkM); vm.rotation.x = -Math.PI / 2 + Math.atan2(t1.rh, t1.rd); vm.position.set(-len / 2 + i * len / 5, t1.v0 + 6 * t1.rh + .12, -(t1.u0 + 6.5 * t1.rd)); grp.add(vm); }
      return grp;
    };
    stand(150, 0, -43, 0, { lower: 18, upper: 16, roofFront: 2, fill: .9 });
    stand(150, 0, 43, Math.PI, { lower: 18, upper: 14, roofFront: 2, fill: .88 });
    stand(92, -61, 0, Math.PI / 2, { lower: 17, upper: 12, roofFront: 2, fill: .9 });
    stand(92, 61, 0, -Math.PI / 2, { lower: 17, upper: 12, roofFront: 2, fill: .86, awayFrom: .55 });
    // 코너 채움 + 조명탑
    const cornerM = new THREE.MeshLambertMaterial({ color: 0x1f252e });
    const headTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#20262e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { const gr = g.createRadialGradient(8 + i * 16, 8 + j * 16, 0, 8 + i * 16, 8 + j * 16, 8); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.6, '#fff4cc'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(i * 16, j * 16, 16, 16); } });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cb = new THREE.Mesh(new THREE.BoxGeometry(18, 24, 18), cornerM); cb.position.set(sx * 84, 12, sz * 66); S.add(cb);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.5, .9, 52, 8), steelMat()); pole.position.set(sx * 80, 26, sz * 62); S.add(pole);
      const head = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: headTex, side: THREE.DoubleSide })); head.position.set(sx * 80, 53, sz * 62); head.lookAt(0, 0, 0); S.add(head);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55 })); glow.position.copy(head.position); glow.lookAt(0, 20, 0); glow.position.lerp(new THREE.Vector3(0, 0, 0), .01); S.add(glow);
    }
    function steelMat() { return steelM; }
    function glowTex() { if (glowTex.t) return glowTex.t; glowTex.t = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,250,230,.9)'); gr.addColorStop(.35, 'rgba(255,240,200,.25)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); return glowTex.t; }
  }
  buildBoards() {
    const S = this.scene;
    const board = canvasTex(1024, 64, (g, w, h) => {
      const blocks = [['#0f1724', '#e8efe9', 'TOUCHLINE'], ['#f2b33d', '#141a22', 'MATCHDAY'], ['#123a6b', '#ffffff', 'FULL TIME'], ['#0f1724', '#f2b33d', 'KICK OFF']];
      blocks.forEach(([bg, fg, t], i) => { g.fillStyle = bg; g.fillRect(i * w / 4, 0, w / 4, h); g.fillStyle = fg; g.font = '700 36px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, i * w / 4 + w / 8, h / 2 + 2); });
    });
    board.encoding = THREE.sRGBEncoding;
    const frameM = new THREE.MeshLambertMaterial({ color: 0x111418 });
    for (const [x, z, ry, w] of [[0, -39.6, 0, 112], [0, 39.6, Math.PI, 112], [-58.2, 0, Math.PI / 2, 74], [58.2, 0, -Math.PI / 2, 74]]) {
      const t = board.clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(w / 44, 1); this.dyn.push({ tex: t, speed: .035 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, .95), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, .5, z); m.rotation.y = ry; S.add(m);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, 1, .25), frameM); back.position.set(x, .5, z); back.rotation.y = ry; back.translateZ(-.15); S.add(back);
    }
  }
  buildDugouts() {
    const S = this.scene;
    const shellM = new THREE.MeshStandardMaterial({ color: 0xbfd4e6, transparent: true, opacity: .35, roughness: .1, side: THREE.DoubleSide });
    const benchM = new THREE.MeshLambertMaterial({ color: 0x22303f });
    for (const sx of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sx * 11, 0, 37.2);
      const base = new THREE.Mesh(new THREE.BoxGeometry(9, .5, 1.6), benchM); base.position.y = .25; g.add(base);
      const seats = new THREE.Mesh(new THREE.BoxGeometry(8.6, .5, .6), new THREE.MeshLambertMaterial({ color: 0x8a1f2b })); seats.position.set(0, .75, .35); g.add(seats);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 9, 16, 1, true, 0, Math.PI), shellM); shell.rotation.z = Math.PI / 2; shell.rotation.y = Math.PI; shell.position.set(0, .6, .3); g.add(shell);
      S.add(g);
    }
    // 테크니컬 에어리어
    const ta = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .0 })); void ta;
  }
  // 공: 실제 축구공(깎은 정이십면체, 오각형 12 + 육각형 20 = 32조각)을 구면에 나눠 꼭짓점 색으로 칠함. 지름 22cm
  buildBall() {
    // 요즘 경기구 느낌: 흰 바탕에 굽은 띠 무늬 12개(짙은 보라 테두리 + 분홍→보라→청록 그라데이션, 하나 걸러 짙은 남색). 꼭짓점 색으로 칠해 회전이 보임
    const geo = new THREE.IcosahedronGeometry(1, 22);
    const t = (1 + Math.sqrt(5)) / 2;
    const ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => new THREE.Vector3(...v).normalize());
    const basis = ico.map(c => { const ref = Math.abs(c.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); const u = new THREE.Vector3().crossVectors(c, ref).normalize(); const w = new THREE.Vector3().crossVectors(c, u).normalize(); return [u, w]; });
    const K = h => new THREE.Color(h).convertSRGBToLinear();
    const WHITE = K('#f4f3ee'), EDGE = K('#2a1848'), NAVY = K('#1c1740'), PINK = K('#ff4f9a'), VIO = K('#7b5cf0'), CYAN = K('#27c9d6'), SEAM = K('#d9d8d2');
    const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3); const v = new THREE.Vector3(), cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize(); let d1 = 9, d2 = 9, k = 0;
      for (let j = 0; j < 12; j++) { const d = v.angleTo(ico[j]); if (d < d1) { d2 = d1; d1 = d; k = j; } else if (d < d2) d2 = d; }
      cc.copy(d2 - d1 < .02 ? SEAM : WHITE);
      let ph = Math.atan2(v.dot(basis[k][1]), v.dot(basis[k][0])) + k * 1.3; ph = Math.atan2(Math.sin(ph), Math.cos(ph));
      const SP = 1.95, a = Math.abs(ph);
      // 띠: 중심에서 0.27~0.5rad 떨어진 고리의 일부(약 220°), 끝은 둥글게
      const inArc = a <= SP ? (d1 > .27 && d1 < .5) : Math.hypot((a - SP) * .385, d1 - .385) < .115;
      if (inArc) {
        const edge = a <= SP ? Math.min(d1 - .27, .5 - d1) : .115 - Math.hypot((a - SP) * .385, d1 - .385);
        if (edge < .028) cc.copy(EDGE);
        else if (k % 2) { cc.copy(NAVY); if (edge > .05 && edge < .064) cc.copy(CYAN); }
        else { const g = (ph + SP) / (2 * SP); if (g < .5) cc.copy(PINK).lerp(VIO, Math.max(0, g) * 2); else cc.copy(VIO).lerp(CYAN, Math.min(1, (g - .5) * 2)); }
      }
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: 0 }));
    this.ball.castShadow = true; this.scene.add(this.ball); this.setBallSize(1);
  }
  // 공 크기 배율 (1 = 실제 크기 지름 22cm)
  setBallSize(k) { this.ballK = k; this.ball.scale.setScalar(.11 * k); }
  // 선수 체격 배율: 멀리서 잡는 중계 카메라에서도 사람 형태가 보이도록 조금 키우고 어깨·몸통을 두껍게 함
  setPlayerScale(k) { this.plK = k || 1; }
  numTexture(inf) {
    return canvasTex(64, 64, (c, w, h) => { c.fillStyle = inf.textColor; c.font = '700 46px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(inf.num, w / 2, h / 2 + 2); });
  }
  makePlayer(inf) {
    if (this.modelKind === 'human' && this.tpl) { try { return this.makeHuman(inf); } catch (e) { console.warn('human player failed', e); this.modelKind = 'simple'; } }
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color(inf.gk ? inf.gkColor : inf.c1), roughness: .7 });
    const shorts = new THREE.MeshStandardMaterial({ color: new THREE.Color(inf.gk ? '#1b1f24' : inf.c2), roughness: .8 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[inf.skin % SKIN.length], roughness: .8 });
    const sock = new THREE.MeshStandardMaterial({ color: new THREE.Color(inf.gk ? inf.gkColor : inf.c1), roughness: .8 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || body).add(m); return m; };
    const torso = add(new THREE.BoxGeometry(.44, .56, .24), shirt, 0, 1.24, 0);
    add(new THREE.BoxGeometry(.42, .2, .25), shorts, 0, .92, 0);
    add(new THREE.SphereGeometry(.12, 14, 10), skin, 0, 1.67, 0);
    add(new THREE.CylinderGeometry(.06, .07, .1, 8), skin, 0, 1.55, 0);
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * .11, .9, 0); body.add(hip);
      add(new THREE.CylinderGeometry(.075, .07, .3, 8), shorts, 0, -.12, 0, hip);
      add(new THREE.CylinderGeometry(.065, .055, .25, 8), skin, 0, -.38, 0, hip);
      add(new THREE.CylinderGeometry(.06, .05, .3, 8), sock, 0, -.62, 0, hip);
      add(new THREE.BoxGeometry(.1, .07, .24), boot, 0, -.82, .05, hip);
      legs.push(hip);
      const sh = new THREE.Group(); sh.position.set(s * .28, 1.47, 0); body.add(sh);
      add(new THREE.CylinderGeometry(.06, .055, .24, 8), shirt, 0, -.1, 0, sh);
      add(new THREE.CylinderGeometry(.05, .04, .36, 8), inf.gk ? shirt : skin, 0, -.38, 0, sh);
      arms.push(sh);
    }
    const np = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ map: this.numTexture(inf), transparent: true })); np.position.set(0, 1.27, -.125); np.rotation.y = Math.PI; body.add(np);
    this.addMarkers(g);
    g.userData = Object.assign(g.userData, { kind: 'simple', body, legs, arms, torso, pid: inf.pid });
    this.scene.add(g);
    return g;
  }
  addMarkers(g) {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.45, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; g.add(shadow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .7, 24), new THREE.MeshBasicMaterial({ color: 0xf2b33d, transparent: true, opacity: .9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .03; ring.visible = false; g.add(ring);
    g.userData.ring = ring;
  }
  makeHuman(inf) {
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const root = THREE.SkeletonUtils.clone(this.tpl.scene); body.add(root);
    let mat = null, built = false;
    // 기본: 직접 만든 사람 형태 몸체. 실패하거나 '마네킹'을 고르면 내장 모델에 유니폼 색만 입힘
    if (this.humanStyle !== 'xbot') { try { buildBody(root, inf, this.numTexture(inf)); built = true; root.traverse(o => { if (o.isSkinnedMesh) { o.visible = false; o.castShadow = false; } }); } catch (e) { console.warn('body build failed', e); root.traverse(o => { if (o.isMesh && /^body_/.test(o.name) && o.parent) o.parent.remove(o); }); } }
    if (!built) { mat = kitMaterial(inf, this.numTexture(inf)); root.traverse(o => { if (o.isSkinnedMesh) { o.visible = true; o.material = mat; o.castShadow = !/Joints/.test(o.name); o.frustumCulled = false; } }); }
    const bone = n => root.getObjectByName('mixamorig' + n) || root.getObjectByName('mixamorig:' + n);
    const B = {}; for (const n of ['Hips', 'Spine', 'Spine1', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Neck']) B[n] = bone(n);
    const mixer = new THREE.AnimationMixer(root);
    const acts = {}; for (const k of ['idle', 'walk', 'run']) { const a = mixer.clipAction(this.tpl.clips[k]); a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); acts[k] = a; }
    acts.idle.time = Math.random() * 2;
    this.addMarkers(g);
    g.userData = Object.assign(g.userData, { kind: 'human', body, root, mixer, acts, B, w: { idle: 1, walk: 0, run: 0 }, pid: inf.pid, mat, built });
    this.scene.add(g);
    return g;
  }
  bindOrbit() {
    const o = this.orbit, c = this.c;
    c.addEventListener('pointerdown', e => { if (this.mode !== 'free') return; o.drag = { x: e.clientX, y: e.clientY, b: e.button, th: o.theta, ph: o.phi, t: o.target.clone() }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!o.drag || this.mode !== 'free') return; const dx = e.clientX - o.drag.x, dy = e.clientY - o.drag.y;
      if (o.drag.b === 2 || e.shiftKey) { const k = o.r * .0016; const fw = new THREE.Vector3(Math.sin(o.theta), 0, Math.cos(o.theta)); const rt = new THREE.Vector3(fw.z, 0, -fw.x); o.target.copy(o.drag.t).addScaledVector(rt, -dx * k).addScaledVector(fw, -dy * k); }
      else { o.theta = o.drag.th - dx * .006; o.phi = Math.max(.15, Math.min(1.45, o.drag.ph - dy * .005)); }
    });
    c.addEventListener('pointerup', () => { o.drag = null; });
    c.addEventListener('contextmenu', e => { if (this.mode === 'free') e.preventDefault(); });
    c.addEventListener('wheel', e => { if (this.mode !== 'free') return; e.preventDefault(); o.r = Math.max(8, Math.min(220, o.r * (1 + Math.sign(e.deltaY) * .1))); }, { passive: false });
  }
  draw(F, info, opt, dt) {
    dt = dt || 0; const rate = opt.rate == null ? 1 : Math.min(4, opt.rate); const adt = dt * rate;
    this.time += dt; this.cheer = Math.max(0, this.cheer - dt * .12);
    if (this.crowdU) { this.crowdU.uTime.value = this.time; this.crowdU.uCheer.value = Math.min(1, this.cheer); }
    for (const d of this.dyn) d.tex.offset.x = (d.tex.offset.x + dt * d.speed) % 1;
    const seen = new Set();
    for (let k = 0; k < F.players.length; k++) {
      const p = F.players[k]; if (p.hidden) continue; const inf = info(p.pid); if (!inf) continue;
      let g = this.players.get(p.pid); if (!g) { g = this.makePlayer(inf); this.players.set(p.pid, g); }
      seen.add(p.pid); g.visible = true;
      g.position.copy(V(p.x, p.y, 0));
      const pk = this.plK || 1; if (g.userData.hs !== inf.h * 10 + pk) { g.userData.hs = inf.h * 10 + pk; const sy = (inf.h || 180) / 177 * pk, bmi = (inf.w || 75) / Math.pow((inf.h || 180) / 100, 2); const sx = g.userData.built ? sy * Math.max(.93, Math.min(1.12, Math.sqrt(bmi / 23))) : sy * Math.max(.98, Math.min(1.22, Math.sqrt(bmi / 23) * 1.1)); g.userData.body.scale.set(sx, sy, sx); }
      g.rotation.y = Math.atan2(Math.cos(p.face), -Math.sin(p.face));
      if (g.userData.kind === 'human') this.animateHuman(g, p, adt); else this.animate(g, p, adt);
      g.userData.ring.visible = opt.selected === p.pid;
    }
    for (const [pid, g] of this.players) if (!seen.has(pid)) g.visible = false;
    const b = F.ball; const br = .11 * (this.ballK || 1); this.ball.position.copy(V(b.x, b.y, Math.max(br, b.z - .11 + br)));
    // 굴러간 거리만큼 회전 (진행 방향 기준)
    if (this.lastBall) { const dx = b.x - this.lastBall.x, dy = b.y - this.lastBall.y; const d = Math.hypot(dx, dy); if (d > 0 && d < 5) { const axis = V(-dy, dx, 0).normalize(); this.ball.rotateOnWorldAxis(axis, d / br * .9); } }
    this.lastBall = { x: b.x, y: b.y };
    this.updateCamera(F, opt, dt);
    this.renderer.render(this.scene, this.cam);
  }
  animateHuman(g, p, dt) {
    const u = g.userData, body = u.body, B = u.B, root = u.root;
    const sp = p.speed || 0, t = p.animT, a = p.anim;
    // 이동 속도에 따라 idle/walk/run 가중치를 부드럽게 섞음
    const special = (a === 3 && t < 1.1) || ((a === 4 || a === 5 || a === 11 || a === 12) && t < 1.9) || (a === 13 && t < .7) || (a === 7 && t < 1.4) || a === 10;
    let wi = Math.max(0, 1 - sp / .9), wr = Math.min(1, Math.max(0, (sp - 2.6) / 2.2)), ww = Math.max(0, 1 - wi - wr);
    if (special) { wi = 1; ww = 0; wr = 0; }
    const s = 1 - Math.exp(-dt * 9);
    u.w.idle += (wi - u.w.idle) * s; u.w.walk += (ww - u.w.walk) * s; u.w.run += (wr - u.w.run) * s;
    const tot = u.w.idle + u.w.walk + u.w.run || 1;
    u.acts.idle.setEffectiveWeight(u.w.idle / tot); u.acts.walk.setEffectiveWeight(u.w.walk / tot); u.acts.run.setEffectiveWeight(u.w.run / tot);
    u.acts.walk.setEffectiveTimeScale(Math.max(.55, Math.min(1.5, sp / 1.45)));
    u.acts.run.setEffectiveTimeScale(Math.max(.75, Math.min(1.35, sp / 5.4)));
    // 믹서는 값이 바뀐 트랙만 다시 쓰므로, 지난 프레임에 얹은 동작을 먼저 되돌린 뒤 갱신
    if (u.dirty) { for (const [b, q] of u.base) b.quaternion.copy(q); u.dirty = false; }
    u.mixer.update(dt);
    body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
    let need = false; const P = { lUp: 0, rUp: 0, lKn: 0, rKn: 0, lArmX: 0, rArmX: 0, lArmZ: 0, rArmZ: 0, spine: 0 };
    switch (a) {
      case 1: if (t < .5) { const k = Math.sin(t / .5 * Math.PI), back = t < .2 ? 1 - t / .2 : 0; P.rUp = -1.25 * k + .55 * back; P.rKn = .9 * back + .15 * k; P.lArmZ = .55 * k; P.rArmZ = .35 * k; P.spine = -.12 * k; need = true; } break;
      case 2: if (t < .6) { const k = Math.sin(t / .6 * Math.PI); P.spine = .35 * k; P.rUp = -1.0 * k; P.lUp = .3 * k; P.lKn = .5 * k; need = true; } break;
      case 3: if (t < 1.1) { const k = Math.min(1, t / .2) * (t > .8 ? (1.1 - t) / .3 : 1); body.rotation.z = 1.2 * k; body.position.y = .3 * k; body.position.x = .5 * k; P.rUp = -1.2 * k; P.lUp = -.4 * k; P.lKn = .9 * k; P.lArmZ = 1.2 * k; need = true; } break;
      case 4: case 5: case 11: case 12: if (t < 1.9) {
        const D = divePose(a, t); body.rotation.z = D.rz; body.position.x = D.px; body.position.y = D.py;
        P.lArmZ = D.arm; P.rArmZ = D.arm; P.lArmX = D.armX; P.rArmX = D.armX; P.lUp = D.lUp; P.rUp = D.rUp; P.lKn = D.kn; P.rKn = D.kn * .7; P.spine = D.sp; need = true;
      } break;
      case 13: if (t < .7) { const k = Math.sin(Math.min(1, t / .7) * Math.PI); body.position.y = -.12 * k; P.lArmZ = 1.25 * k; P.rArmZ = 1.25 * k; P.lKn = .7 * k; P.rKn = .7 * k; P.lUp = -.35 * k; P.rUp = -.35 * k; P.spine = .2 * k; need = true; } break;
      case 6: if (t < .7) { const k = Math.sin(t / .7 * Math.PI); body.position.y = .55 * k; P.lArmZ = .9 * k; P.rArmZ = .9 * k; P.spine = -.25 * k; P.lKn = .9 * k; P.rKn = .6 * k; P.lUp = -.3 * k; need = true; } break;
      case 7: if (t < 1.4) { const k = Math.min(1, t / .3) * (t > 1 ? (1.4 - t) / .4 : 1); body.rotation.x = 1.35 * k; body.position.y = .2 * k; body.position.z = .6 * k; P.lArmX = -1.4 * k; P.rArmX = -1.4 * k; need = true; } break;
      case 8: { const k = Math.min(1, t / .3); P.lArmZ = 2.6 * k; P.rArmZ = 2.6 * k; body.position.y = Math.abs(Math.sin(t * 7)) * .25 * k; need = true; } break;
      case 9: if (t < .8) { const k = Math.sin(t / .8 * Math.PI); P.lArmX = -2.8 * k; P.rArmX = -2.8 * k; P.spine = -.2 * k; need = true; } break;
      case 10: P.lArmX = -1.15; P.rArmX = -1.15; P.lArmZ = -.25; P.rArmZ = -.25; P.spine = .1; need = true; break;
      // 14: 킥 준비(디딤발 딛고 차는 다리를 뒤로) / 15: 스텝오버(공 위로 다리를 번갈아 돌림)
      case 14: { const k = Math.min(1, t / .16); P.rUp = .8 * k; P.rKn = 1.1 * k; P.lKn = .25 * k; P.lArmZ = .6 * k; P.rArmZ = .3 * k; P.lArmX = -.4 * k; P.spine = .1 * k; need = true; } break;
      case 15: if (t < .75) { const w = Math.sin(t * 10), e = Math.sin(Math.min(1, t / .75) * Math.PI); P.rUp = -.75 * Math.max(0, w) * e; P.lUp = -.75 * Math.max(0, -w) * e; P.rKn = .5 * Math.max(0, w) * e; P.lKn = .5 * Math.max(0, -w) * e; P.lArmZ = .55 * e; P.rArmZ = .55 * e; P.spine = .16 * e; body.rotation.z = .14 * w * e; body.position.y = -.05 * e; need = true; } break;
    }
    if (!need) return;
    if (!u.base) u.base = new Map(['Spine', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm'].filter(n => B[n]).map(n => [B[n], new THREE.Quaternion()]));
    for (const [b, q] of u.base) q.copy(b.quaternion); u.dirty = true;
    g.updateMatrixWorld(true);
    rotBone(root, B.Spine, AX, P.spine);
    rotBone(root, B.LeftUpLeg, AX, P.lUp); rotBone(root, B.RightUpLeg, AX, P.rUp);
    rotBone(root, B.LeftLeg, AX, P.lKn); rotBone(root, B.RightLeg, AX, P.rKn);
    // 왼팔은 +x 쪽: +z축 회전이 팔을 옆으로 들어올림, 오른팔은 반대
    rotBone(root, B.LeftArm, AZ, P.lArmZ); rotBone(root, B.RightArm, AZ, -P.rArmZ);
    rotBone(root, B.LeftArm, AX, P.lArmX); rotBone(root, B.RightArm, AX, P.rArmX);
  }
  animate(g, p, dt) {
    const u = g.userData; const body = u.body; const [lL, lR] = u.legs; const [aL, aR] = u.arms;
    const ph = (this.phase[p.pid] || 0) + (dt || 0) * (2 + p.speed * 1.35); this.phase[p.pid] = ph;
    const amp = Math.min(.95, p.speed * .13);
    body.position.set(0, 0, 0); body.rotation.set(Math.min(.25, p.speed * .025), 0, 0);
    lL.rotation.set(Math.sin(ph) * amp, 0, 0); lR.rotation.set(-Math.sin(ph) * amp, 0, 0);
    aL.rotation.set(-Math.sin(ph) * amp * .8, 0, .08); aR.rotation.set(Math.sin(ph) * amp * .8, 0, -.08);
    body.position.y = Math.abs(Math.sin(ph)) * amp * .06;
    const t = p.animT;
    switch (p.anim) {
      case 1: if (t < .5) { const k = Math.sin(t / .5 * Math.PI); lR.rotation.x = -1.3 * k + (t < .2 ? .7 * (1 - t / .2) : 0); aL.rotation.z = .6 * k; aR.rotation.z = -.4 * k; body.rotation.x = -.1 * k; } break;
      case 2: if (t < .6) { const k = Math.sin(t / .6 * Math.PI); body.rotation.x = .35 * k; lR.rotation.x = -1.0 * k; lL.rotation.x = .3 * k; } break;
      case 3: if (t < 1.1) { const k = Math.min(1, t / .2) * (t > .8 ? (1.1 - t) / .3 : 1); body.rotation.z = 1.25 * k; body.position.y = .35 * k; body.position.x = .5 * k; lR.rotation.x = -1.2 * k; } break;
      case 4: case 5: case 11: case 12: if (t < 1.9) {
        const D = divePose(p.anim, t); body.rotation.z = D.rz; body.position.x = D.px; body.position.y = D.py;
        aL.rotation.z = D.arm * 1.05; aR.rotation.z = -D.arm * 1.05; lL.rotation.x = D.lUp; lR.rotation.x = D.rUp;
      } break;
      case 13: if (t < .7) { const k = Math.sin(Math.min(1, t / .7) * Math.PI); body.position.y = -.1 * k; aL.rotation.z = 1.3 * k; aR.rotation.z = -1.3 * k; lL.rotation.x = -.3 * k; lR.rotation.x = .3 * k; } break;
      case 6: if (t < .7) { const k = Math.sin(t / .7 * Math.PI); body.position.y = .55 * k; aL.rotation.z = .9 * k; aR.rotation.z = -.9 * k; body.rotation.x = -.25 * k; lL.rotation.x = .4 * k; lR.rotation.x = .2 * k; } break;
      case 7: if (t < 1.4) { const k = Math.min(1, t / .3) * (t > 1 ? (1.4 - t) / .4 : 1); body.rotation.x = 1.35 * k; body.position.y = .25 * k; body.position.z = .6 * k; aL.rotation.x = -1.4 * k; aR.rotation.x = -1.4 * k; } break;
      case 8: { const k = Math.min(1, t / .3); aL.rotation.z = 2.7 * k; aR.rotation.z = -2.7 * k; body.position.y += Math.abs(Math.sin(t * 7)) * .25 * k; } break;
      case 9: if (t < .8) { const k = Math.sin(t / .8 * Math.PI); aL.rotation.x = -2.9 * k; aR.rotation.x = -2.9 * k; body.rotation.x = -.2 * k; } break;
      case 10: aL.rotation.x = -1.2; aR.rotation.x = -1.2; aL.rotation.z = -.3; aR.rotation.z = .3; break;
      case 14: { const k = Math.min(1, t / .16); lR.rotation.x = .9 * k; aL.rotation.z = .6 * k; body.rotation.x = .1 * k; } break;
      case 15: if (t < .75) { const w = Math.sin(t * 10), e = Math.sin(Math.min(1, t / .75) * Math.PI); lR.rotation.x = -.8 * Math.max(0, w) * e; lL.rotation.x = -.8 * Math.max(0, -w) * e; body.rotation.z = .14 * w * e; aL.rotation.z = .5 * e; aR.rotation.z = -.5 * e; } break;
    }
    // 왼팔은 -x 쪽에 있으므로 좌우 회전 방향을 반전
    aL.rotation.z = -aL.rotation.z; aR.rotation.z = -aR.rotation.z;
  }
  updateCamera(F, opt, dt) {
    const b = F.ball; const mode = this.mode; const s = 1 - Math.exp(-(dt || .016) * 2.6);
    let pos, look;
    const sel = opt.selected != null ? F.players.find(p => p.pid === opt.selected && !p.hidden) : null;
    const focus = sel || (opt.carrier != null ? F.players.find(p => p.pid === opt.carrier && !p.hidden) : null);
    switch (mode) {
      case 'tactical': pos = new THREE.Vector3(b.x * .35, 92, 26); look = new THREE.Vector3(b.x * .35, 0, -2); break;
      case 'end': {
        const dir = opt.attackDir || 1;
        pos = new THREE.Vector3(b.x - dir * 30, 15, -b.y * .7); look = new THREE.Vector3(b.x + dir * 18, 0, -b.y * .9); break;
      }
      case 'player': {
        const p = focus || { x: b.x, y: b.y, face: 0 };
        const fx = Math.cos(p.face), fy = Math.sin(p.face);
        pos = V(p.x - fx * 8, p.y - fy * 8, 3.6); look = V(p.x + fx * 10, p.y + fy * 10, .5); break;
      }
      case 'ball': pos = V(b.x - 6, b.y - 14, 6.5); look = V(b.x, b.y, .5); break;
      case 'low': { // 터치라인 옆 낮은 카메라
        const cx = Math.max(-44, Math.min(44, b.x)); pos = V(cx, -HW - 2.2, 2.6); look = V(b.x, b.y * .6, 1); break; }
      case 'goal': { // 공과 가까운 쪽 골대 뒤 높은 카메라
        const s = b.x >= 0 ? 1 : -1; pos = V(s * (HL + 16), b.y * .25, 13); look = V(s * (HL - 22) + (b.x - s * (HL - 22)) * .4, b.y * .7, 0); break; }
      case 'drone': { // 공 위를 비스듬히 따라가는 높은 카메라
        pos = V(b.x - 14, b.y - 18, 34); look = V(b.x + 2, b.y, 0); break; }
      case 'wide': pos = new THREE.Vector3(0, 62, 74); look = new THREE.Vector3(0, 0, 2); break;
      case 'free': {
        const o = this.orbit; pos = new THREE.Vector3(o.target.x + o.r * Math.sin(o.phi) * Math.sin(o.theta), o.target.y + o.r * Math.cos(o.phi), o.target.z + o.r * Math.sin(o.phi) * Math.cos(o.theta)); look = o.target.clone();
        this.camPos.copy(pos); this.camLook.copy(look); this.cam.position.copy(pos); this.cam.lookAt(look); return;
      }
      default: { // 중계 화면
        const cx = Math.max(-36, Math.min(36, b.x * .85));
        pos = new THREE.Vector3(cx, 24, 58 + Math.max(0, -b.y) * .2); look = new THREE.Vector3(b.x * .92, 0, -b.y * .45);
      }
    }
    // 확대/축소: 바라보는 지점과의 거리를 조절 (자유 카메라는 휠 사용)
    const z = opt.zoom || 1; if (z !== 1) pos = look.clone().add(pos.clone().sub(look).multiplyScalar(1 / z));
    if (opt.snap) { this.camPos.copy(pos); this.camLook.copy(look); }
    this.camPos.lerp(pos, s); this.camLook.lerp(look, s * 1.3);
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook);
  }
  setMode(m) { this.mode = m; if (m === 'free') { this.orbit.target.copy(this.camLook); const d = new THREE.Vector3().subVectors(this.camPos, this.camLook); this.orbit.r = d.length(); this.orbit.phi = Math.acos(Math.max(-1, Math.min(1, d.y / this.orbit.r))); this.orbit.theta = Math.atan2(d.x, d.z); } }
  project(x, y, z) { const v = V(x, y, z).project(this.cam); const r = this.c.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z < 1]; }
  clearPlayers() {
    for (const g of this.players.values()) { this.scene.remove(g); if (g.userData.mixer) g.userData.mixer.stopAllAction(); g.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && o.geometry) o.geometry.dispose(); }); }
    this.players.clear(); this.phase = {};
  }
}
// 날씨: 비·눈 입자, 하늘·안개 색, 햇빛 세기, 젖은 잔디(광택·어둡게)
Render3D.prototype.setWeather = function (wx) {
  const k = wx ? wx.k : 'clear'; if (this.wxK === k + (wx ? wx.pitch : '')) return; this.wxK = k + (wx ? wx.pitch : '');
  if (this.wxPts) { this.scene.remove(this.wxPts); this.wxPts.geometry.dispose(); this.wxPts.material.dispose(); this.wxPts = null; }
  const dark = k === 'heavy' ? .45 : k === 'rain' ? .7 : k === 'cloudy' || k === 'snow' ? .82 : 1;
  if (this.sun) this.sun.intensity = 1.0 * dark;
  const bg = k === 'heavy' || k === 'rain' ? 0x0b1018 : k === 'snow' ? 0x1a1f28 : 0x070b14;
  this.scene.background = new THREE.Color(bg); this.scene.fog = new THREE.Fog(bg, k === 'heavy' ? 90 : k === 'rain' || k === 'snow' ? 130 : 170, k === 'heavy' ? 230 : 330);
  if (this.pitchMesh) { const m = this.pitchMesh.material; m.color = new THREE.Color(wx && wx.wet > .3 ? 0xb8c4bc : wx && wx.pitch === 'frozen' ? 0xe6eef2 : 0xffffff); if (wx && wx.pitch === 'heavy') m.color = new THREE.Color(0xb59f86); m.needsUpdate = true; }
  if (k === 'rain' || k === 'heavy' || k === 'snow') {
    const n = k === 'heavy' ? 9000 : k === 'rain' ? 5000 : 4000; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 140; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() - .5) * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: k === 'snow' ? 0xffffff : 0xaabbd0, size: k === 'snow' ? .22 : .09, transparent: true, opacity: k === 'snow' ? .85 : .55, depthWrite: false });
    this.wxPts = new THREE.Points(g, mat); this.wxPts.userData = { k, n }; this.scene.add(this.wxPts);
  }
};
const _draw3 = Render3D.prototype.draw;
Render3D.prototype.draw = function (F, info, opt, dt) {
  this.setWeather(opt && opt.wx);
  if (this.wxPts && dt) { const a = this.wxPts.geometry.attributes.position, arr = a.array, snow = this.wxPts.userData.k === 'snow'; const v = snow ? 1.6 : this.wxPts.userData.k === 'heavy' ? 26 : 20; const wxv = opt.wx && opt.wx.wind ? opt.wx.wind : [0, 0];
    for (let i = 0; i < arr.length; i += 3) { arr[i + 1] -= v * dt; arr[i] += (wxv[0] * .3 + (snow ? Math.sin(this.time + i) * .3 : 0)) * dt; arr[i + 2] -= wxv[1] * .3 * dt; if (arr[i + 1] < 0) { arr[i + 1] += 40; arr[i] = (Math.random() - .5) * 140; arr[i + 2] = (Math.random() - .5) * 100; } }
    a.needsUpdate = true; }
  return _draw3.call(this, F, info, opt, dt);
};
G.Render3D = Render3D;
})(window);
