// ===== 2D 바둑알 렌더러 =====
(function (G) {
const HL = 52.5, HW = 34;
const SKIN = ['#f0d2b4', '#e2b890', '#c99870', '#9a6a48', '#6e4a32', '#e8c4a2'];
class Render2D {
  constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext('2d'); this.mode = 'full'; this.view = { cx: 0, cy: 0, z: 1 }; }
  resize() { const r = this.c.getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1); this.c.width = Math.max(10, r.width * d); this.c.height = Math.max(10, r.height * d); this.dpr = d; }
  draw(F, info, opt) {
    const c = this.c, x = this.ctx; if (!c.width) this.resize();
    const W = c.width, H = c.height;
    const vertical = H > W * 1.15; // 세로 화면이면 경기장을 회전
    const pw = vertical ? 76 : 113, ph = vertical ? 113 : 76;
    let sc = Math.min(W / pw, H / ph);
    let cx = 0, cy = 0;
    if (opt.cam2d === 'follow') { sc *= 2.1; const tx = F.ball.x, ty = F.ball.y; this.view.cx += (tx - this.view.cx) * .12; this.view.cy += (ty - this.view.cy) * .12; cx = this.view.cx; cy = this.view.cy; const lx = HL + 3 - (vertical ? H : W) / sc / 2, ly = HW + 3 - (vertical ? W : H) / sc / 2; cx = Math.max(-Math.max(0, lx), Math.min(Math.max(0, lx), cx)); cy = Math.max(-Math.max(0, ly), Math.min(Math.max(0, ly), cy)); }
    const P = (px, py) => vertical ? [W / 2 + (-(py - cy)) * sc, H / 2 - (px - cx) * sc] : [W / 2 + (px - cx) * sc, H / 2 - (py - cy) * sc];
    // 잔디
    const pc = (opt.pitch && opt.pitch.c) || ['#2f6b3c', '#2a6136'], pat = (opt.pitch && opt.pitch.pattern) || 'stripes';
    x.fillStyle = '#0e1a14'; x.fillRect(0, 0, W, H);
    { const a = P(-HL - 3, HW + 3), b = P(HL + 3, -HW - 3); x.fillStyle = pc[1]; x.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
    const rect = (x0, y0, x1, y1, col) => { const a = P(x0, y0), b = P(x1, y1); x.fillStyle = col; x.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]) + .5, Math.abs(b[1] - a[1]) + .5); };
    if (pat === 'plain') rect(-HL, HW, HL, -HW, pc[0]);
    else if (pat === 'checker') { for (let i = 0; i < 14; i++) for (let j = 0; j < 9; j++) rect(-HL + i * 7.5, -HW + j * 68 / 9, -HL + (i + 1) * 7.5, -HW + (j + 1) * 68 / 9, (i + j) % 2 ? pc[0] : pc[1]); }
    else if (pat === 'rings') { rect(-HL, HW, HL, -HW, pc[1]); const c0 = P(0, 0); for (let k = 9; k >= 1; k--) { x.fillStyle = k % 2 ? pc[0] : pc[1]; x.beginPath(); x.arc(c0[0], c0[1], k * 7 * sc, 0, 7); x.fill(); } x.save(); }
    else for (let i = 0; i < 14; i++) rect(-HL + i * 7.5, HW, -HL + (i + 1) * 7.5, -HW, i % 2 ? pc[0] : pc[1]);
    if (pat === 'rings') { x.restore(); x.fillStyle = '#0e1a14'; const a = P(-HL - 3, HW + 3), b = P(HL + 3, -HW - 3); const L0 = Math.min(a[0], b[0]), T0 = Math.min(a[1], b[1]), R0 = Math.max(a[0], b[0]), B0 = Math.max(a[1], b[1]); x.fillRect(0, 0, W, T0); x.fillRect(0, B0, W, H - B0); x.fillRect(0, 0, L0, H); x.fillRect(R0, 0, W - R0, H); }
    x.strokeStyle = 'rgba(240,245,240,.85)'; x.lineWidth = Math.max(1, sc * .12);
    const line = pts => { x.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.stroke(); };
    line([[-HL, -HW], [HL, -HW], [HL, HW], [-HL, HW], [-HL, -HW]]);
    line([[0, -HW], [0, HW]]);
    for (const s of [-1, 1]) {
      line([[s * HL, -20.16], [s * (HL - 16.5), -20.16], [s * (HL - 16.5), 20.16], [s * HL, 20.16]]);
      line([[s * HL, -9.16], [s * (HL - 5.5), -9.16], [s * (HL - 5.5), 9.16], [s * HL, 9.16]]);
      const ps = P(s * (HL - 11), 0); x.fillStyle = 'rgba(240,245,240,.85)'; x.beginPath(); x.arc(ps[0], ps[1], Math.max(1.5, sc * .2), 0, 7); x.fill();
      // 아크
      x.beginPath(); const cA = P(s * (HL - 11), 0); const a0 = Math.acos(5.5 / 9.15);
      for (let k = 0; k <= 20; k++) { const t = -a0 + (2 * a0) * k / 20; const px = s * (HL - 11) - s * Math.cos(t) * 9.15, py = Math.sin(t) * 9.15; const q = P(px, py); k ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }
      x.stroke(); void cA;
      // 골대
      x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(2, sc * .25);
      line([[s * HL, -3.66], [s * (HL + 1.8), -3.66], [s * (HL + 1.8), 3.66], [s * HL, 3.66]]);
      x.strokeStyle = 'rgba(240,245,240,.85)'; x.lineWidth = Math.max(1, sc * .12);
    }
    { const q = P(0, 0); x.beginPath(); x.arc(q[0], q[1], 9.15 * sc, 0, 7); x.stroke(); }
    // 선수
    const R = Math.max(9, sc * 1.3); const now = performance.now(); this.dtv = Math.min(.05, (now - (this.lastT || now)) / 1000) * (opt.rate == null ? 1 : Math.min(4, opt.rate)); this.lastT = now; this.ph = this.ph || {};
    const order = F.players.map((p, i) => i).filter(i => !F.players[i].hidden);
    for (const i of order) {
      const p = F.players[i]; const inf = info(p.pid); if (!inf) continue;
      const [sx, sy] = P(p.x, p.y);
      x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.ellipse(sx + R * .15, sy + R * .25, R, R * .8, 0, 0, 7); x.fill();
      const body = inf.gk ? inf.gkColor : inf.c1;
      const ang = vertical ? Math.atan2(-Math.cos(p.face), -Math.sin(p.face)) : Math.atan2(-Math.sin(p.face), Math.cos(p.face));
      // 위에서 본 사람 형태: 어깨(몸통) + 머리 + 두 발. 발은 속도에 맞춰 번갈아 나가고, 킥·준비 동작·스텝오버·태클이 보임
      const spd = p.speed || 0, a = p.anim, t = p.animT || 0;
      const ph = (this.ph[p.pid] = (this.ph[p.pid] || p.pid) + (this.dtv || .016) * (3 + spd * 1.9));
      const st = Math.min(1, spd / 5.5) * R * .78;
      let fl = Math.sin(ph) * st, fr = -Math.sin(ph) * st, ll = -R * .42, lr = R * .42, lean = 0, long = 1, wide = 1;
      if (a === 14) { fr = -R * 1.0 * Math.min(1, t / .16); fl = R * .3; }
      else if (a === 1 && t < .45) { const k = Math.sin(t / .45 * Math.PI); fr = R * 1.5 * k; fl = -R * .2 * k; }
      else if (a === 15 && t < .75) { const w = t * 10; fr = R * (.55 + .5 * Math.cos(w)); lr = R * (.2 + .55 * Math.sin(w)); fl = R * (.55 - .5 * Math.cos(w)) * .6; ll = -R * (.2 + .45 * Math.sin(w + 1.6)); lean = Math.sin(w) * .25; }
      else if (a === 3 && t < 1.1) { long = 1.9; wide = .7; fr = R * 1.9; fl = R * 1.2; }
      else if ((a === 4 || a === 5 || a === 11 || a === 12) && t < 1.9) { wide = 1.7; long = .75; }
      else if (a === 2 && t < .6) { fr = R * 1.1; wide = 1.25; }
      else if (a === 6 && t < .7) { long = 1.15; wide = 1.15; }
      else if (a === 7 && t < 1.4) { long = 1.8; wide = .8; }
      x.save(); x.translate(sx, sy); x.rotate(ang + lean);
      x.fillStyle = '#16191b'; x.beginPath(); x.ellipse(fl, ll, R * .36, R * .2, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(fr, lr, R * .36, R * .2, 0, 0, 7); x.fill();
      if (a === 8) { x.strokeStyle = body; x.lineWidth = R * .3; x.beginPath(); x.moveTo(0, -R * .9); x.lineTo(R * .5, -R * 1.5); x.moveTo(0, R * .9); x.lineTo(R * .5, R * 1.5); x.stroke(); }
      x.fillStyle = body; x.beginPath(); x.ellipse(long > 1 ? R * (long - 1) * .5 : 0, 0, R * .74 * long, R * wide, 0, 0, 7); x.fill();
      x.lineWidth = Math.max(1.5, R * .18); x.strokeStyle = inf.c2; x.stroke();
      x.fillStyle = SKIN[p.pid % SKIN.length]; x.beginPath(); x.arc(R * .5, 0, R * .34, 0, 7); x.fill(); x.lineWidth = 1; x.strokeStyle = 'rgba(0,0,0,.45)'; x.stroke();
      x.restore();
      if (opt.selected === p.pid) { x.lineWidth = 2.5; x.strokeStyle = '#f2b33d'; x.beginPath(); x.arc(sx, sy, R + 5, 0, 7); x.stroke(); }
      x.fillStyle = inf.textColor; x.font = `600 ${Math.round(R * 1.0)}px "Barlow Condensed", system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(inf.num, sx - Math.cos(ang) * R * .22, sy - Math.sin(ang) * R * .22 + R * .05);
      if (opt.names === 'all' || (opt.names === 'carrier' && opt.carrier === p.pid) || opt.selected === p.pid) {
        x.font = `500 ${Math.max(10, Math.round(R * .85))}px "IBM Plex Sans KR", system-ui, sans-serif`;
        const nm = inf.short; const tw = x.measureText(nm).width;
        const two = opt.posLbl && inf.pos; const bw = Math.max(tw, two ? x.measureText(inf.pos).width : 0);
        x.fillStyle = 'rgba(8,14,11,.72)'; x.fillRect(sx - bw / 2 - 4, sy + R + 2, bw + 8, R * (two ? 2.05 : 1.1));
        x.fillStyle = '#e8efe9'; x.fillText(nm, sx, sy + R + 2 + R * .55);
        if (two) { x.fillStyle = '#f2c14e'; x.fillText(inf.pos, sx, sy + R + 2 + R * 1.5); }
      }
    }
    // 공
    const b = F.ball; const [bx, by] = P(b.x, b.y); const z = Math.max(0, b.z - .11);
    const br = Math.max(3.5, sc * .32) * (1 + z * .06);
    // 빠른 공은 잔상을 남겨 속도와 휘는 궤적이 보이게 함
    { const tr = this.trail || (this.trail = []); const lp = tr[tr.length - 1]; if (lp && Math.hypot(lp[0] - b.x, lp[1] - b.y) > 12) tr.length = 0; tr.push([b.x, b.y]); if (tr.length > 9) tr.shift();
      const f0 = tr[0]; if (tr.length > 3 && Math.hypot(f0[0] - b.x, f0[1] - b.y) > 2.2) { x.lineCap = 'round'; for (let i = 1; i < tr.length; i++) { const q0 = P(tr[i - 1][0], tr[i - 1][1]), q1 = P(tr[i][0], tr[i][1]); x.strokeStyle = `rgba(255,255,255,${(.05 + .3 * i / tr.length).toFixed(2)})`; x.lineWidth = br * (.5 + .9 * i / tr.length); x.beginPath(); x.moveTo(q0[0], q0[1]); x.lineTo(q1[0], q1[1]); x.stroke(); } } }
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.arc(bx + z * sc * .25, by + z * sc * .35, br * .9, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(bx, by - z * sc * .15, br, 0, 7); x.fill();
    x.lineWidth = 1.2; x.strokeStyle = '#1b2420'; x.stroke();
    // 공 무늬: 굴러간 거리만큼 도는 굽은 띠 3개
    if (br >= 4) { const cy = by - z * sc * .15; const rot = (b.x + b.y) * 1.6; const cs = ['#ff4f9a', '#2a1848', '#27c9d6']; x.save(); x.beginPath(); x.arc(bx, cy, br - .6, 0, 7); x.clip(); x.lineCap = 'round'; x.lineWidth = Math.max(1.2, br * .28);
      for (let i = 0; i < 3; i++) { const a0 = rot + i * 2.094; x.strokeStyle = cs[i]; x.beginPath(); x.arc(bx + Math.cos(a0) * br * .55, cy + Math.sin(a0) * br * .55, br * .42, a0 + .6, a0 + 3.4); x.stroke(); } x.restore(); }
  }
}
// 날씨 오버레이 (비·눈·무더위 색조)
const _draw2 = Render2D.prototype.draw;
Render2D.prototype.draw = function (F, info, opt) {
  _draw2.call(this, F, info, opt);
  const wx = opt && opt.wx; if (!wx || wx.k === 'clear' || wx.k === 'cloudy' && !wx.wet) return;
  const x = this.ctx, W = this.c.width, H = this.c.height, t = performance.now() / 1000;
  if (!this.wxp || this.wxp.k !== wx.k) { const n = wx.k === 'heavy' ? 260 : wx.k === 'rain' ? 140 : wx.k === 'snow' ? 120 : 0; this.wxp = { k: wx.k, pts: Array.from({ length: n }, () => [Math.random(), Math.random(), .6 + Math.random() * .8]) }; }
  x.save();
  if (wx.k === 'heavy' || wx.k === 'rain') { x.fillStyle = wx.k === 'heavy' ? 'rgba(20,30,45,.22)' : 'rgba(30,40,55,.12)'; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(200,215,235,.35)'; x.lineWidth = Math.max(1, W / 900); x.beginPath();
    const sp = wx.k === 'heavy' ? 1.6 : 1.1, len = H * .025; for (const p of this.wxp.pts) { const yy = ((p[1] + t * sp * p[2]) % 1) * H, xx = ((p[0] + t * .08) % 1) * W; x.moveTo(xx, yy); x.lineTo(xx - len * .25, yy + len); } x.stroke(); }
  else if (wx.k === 'snow') { x.fillStyle = 'rgba(235,240,255,.12)'; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(255,255,255,.75)'; for (const p of this.wxp.pts) { const yy = ((p[1] + t * .12 * p[2]) % 1) * H, xx = ((p[0] + Math.sin(t + p[2] * 9) * .01) % 1) * W; x.beginPath(); x.arc(xx, yy, Math.max(1, W / 500) * p[2], 0, 7); x.fill(); } }
  else if (wx.k === 'hot') { x.fillStyle = 'rgba(255,170,60,.07)'; x.fillRect(0, 0, W, H); }
  x.restore();
};
G.Render2D = Render2D;
})(window);
