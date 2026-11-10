// ===== 2D 바둑알 렌더러 =====
(function (G) {
const HL = 52.5, HW = 34;
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
    const R = Math.max(9, sc * 1.3);
    const order = F.players.map((p, i) => i).filter(i => !F.players[i].hidden);
    for (const i of order) {
      const p = F.players[i]; const inf = info(p.pid); if (!inf) continue;
      const [sx, sy] = P(p.x, p.y);
      x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.ellipse(sx + R * .15, sy + R * .25, R, R * .8, 0, 0, 7); x.fill();
      const body = inf.gk ? inf.gkColor : inf.c1;
      x.fillStyle = body; x.beginPath(); x.arc(sx, sy, R, 0, 7); x.fill();
      x.lineWidth = Math.max(1.5, R * .18); x.strokeStyle = inf.c2; x.stroke();
      if (opt.selected === p.pid) { x.lineWidth = 2.5; x.strokeStyle = '#f2b33d'; x.beginPath(); x.arc(sx, sy, R + 4, 0, 7); x.stroke(); }
      // 방향 표시
      const fa = vertical ? -p.face - Math.PI / 2 : -p.face; // 화면 각도
      const ang = vertical ? Math.atan2(-Math.cos(p.face), -Math.sin(p.face)) : Math.atan2(-Math.sin(p.face), Math.cos(p.face)); void fa;
      x.fillStyle = inf.c2; x.beginPath(); x.arc(sx + Math.cos(ang) * R * .78, sy + Math.sin(ang) * R * .78, R * .2, 0, 7); x.fill();
      x.fillStyle = inf.textColor; x.font = `600 ${Math.round(R * 1.0)}px "Barlow Condensed", system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(inf.num, sx, sy + R * .05);
      if (opt.names === 'all' || (opt.names === 'carrier' && opt.carrier === p.pid) || opt.selected === p.pid) {
        x.font = `500 ${Math.max(10, Math.round(R * .85))}px "IBM Plex Sans KR", system-ui, sans-serif`;
        const nm = inf.short; const tw = x.measureText(nm).width;
        x.fillStyle = 'rgba(8,14,11,.72)'; x.fillRect(sx - tw / 2 - 4, sy + R + 2, tw + 8, R * 1.1);
        x.fillStyle = '#e8efe9'; x.fillText(nm, sx, sy + R + 2 + R * .55);
      }
    }
    // 공
    const b = F.ball; const [bx, by] = P(b.x, b.y); const z = Math.max(0, b.z - .11);
    const br = Math.max(3.5, sc * .32) * (1 + z * .06);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.arc(bx + z * sc * .25, by + z * sc * .35, br * .9, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(bx, by - z * sc * .15, br, 0, 7); x.fill();
    x.lineWidth = 1.2; x.strokeStyle = '#1b2420'; x.stroke();
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
