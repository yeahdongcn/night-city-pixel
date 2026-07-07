'use strict';
// ============ Military-projection layer (v3 — Commandos-style fake 3D) ============
// v1's sim is a flat world-pixel plane (TILE=16). We keep ALL of it and only change
// how (x,y) maps to the screen: the plan rotated 45° with NO foreshortening (the
// classic Commandos "impossible camera", det=1 → world px == screen px), heights
// rise straight up. The whole ground — realistic asphalt, curbs, crosswalks, baked
// long shadows, neon spill — is PRE-RENDERED once in plan space and rotate-blitted
// per frame. Buildings, actors and cars draw per frame, depth-sorted by wx+wy.
const MIL_R = Math.SQRT1_2;             // 0.70710678 — pure 45° rotation
const MIL_ZK = 1.0;                     // screen px risen per world-px of height
const MIL_SH = { x: 0.92, y: 0.55 };    // baked key light from NW → shadows drape SE
// texture densities: everything is drawn in logical coords but baked N× denser, then
// smooth-sampled — this is what kills the chunky-pixel look. (Ground halves on small screens.)
const MIL_BK = ((window.innerWidth || 1280) * (window.devicePixelRatio || 1)) >= 900 ? 2 : 1;
const MIL_FK = 2;                       // facade / roof textures
const MIL_AS = 3;                       // actor sprites

function milRR(c, x, y, w, h, r) {
  if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  else { c.beginPath(); c.rect(x, y, w, h); }
}

// frame screen offset (set each frame in step/render). _ox/_oy stable (mouse), _shx/_shy add shake (draw)
function isoSetOffsets() {
  G._ox = VIEW_W / 2 - (G.cam.x - G.cam.y) * MIL_R;
  G._oy = VIEW_H / 2 - (G.cam.x + G.cam.y) * MIL_R;
}
function proj(wx, wy, wz) {
  return { x: (wx - wy) * MIL_R + G._ox + (G._shx || 0), y: (wx + wy) * MIL_R - (wz || 0) * MIL_ZK + G._oy + (G._shy || 0) };
}
// screen → world ground point (wz=0). uses the shake-free offsets.
function invProj(sx, sy) {
  const rx = (sx - G._ox) / MIL_R, ry = (sy - G._oy) / MIL_R;
  return { x: (ry + rx) / 2, y: (ry - rx) / 2 };
}
function isoDepth(x, y) { return x + y; }
function isoVisible(x, y, m) {
  const s = proj(x, y, 0); m = m || 60;
  return s.x > -m && s.x < VIEW_W + m && s.y > -m && s.y < VIEW_H + m + 50;
}

// ---- small colour helpers ----
function milHex(col) { const n = parseInt(col.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function milMix(a, b, f) {
  const A = milHex(a), B = milHex(b);
  const q = v => Math.round(v).toString(16).padStart(2, '0');
  return '#' + q(A[0] + (B[0] - A[0]) * f) + q(A[1] + (B[1] - A[1]) * f) + q(A[2] + (B[2] - A[2]) * f);
}
function milRgba(col, a) { const A = milHex(col); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }

// =====================================================================
// MILG: everything baked at first frame (needs WORLD, so lazy — not at load)
// =====================================================================
const MILG = { cv: null, ctx: null, bld: [], mtnPk: null };

function milEnsure() {
  if (MILG.cv) return;
  milExtractBuildings();
  milBakeGround();
  milBakeBuildings();
  milBakeActors();
}

// outer frame (beyond the road grid): water on the W/S coast, badlands mountains on the N/E
function milBorderTile(tx, ty) { return tx < 6 || ty < 6 || tx > 117 || ty > 117; }
function milBorderKind(tx, ty) { return (tx < 6 || ty > 117) ? 'water' : 'mountain'; }
function milMtnHeight(tx, ty) {
  const n = Math.sin(tx * 0.7) * Math.cos(ty * 0.6) + Math.sin((tx + ty) * 0.35);
  const edge = Math.max(0, 5 - Math.min(tx, ty, WORLD.W - 1 - tx, WORLD.H - 1 - ty));
  return 40 + edge * 9 + (n + 2) * 14;
}

// ---- building list: real rects with per-building height / palette / linked roof fade ----
const MIL_WALLS = ['#3a3d46', '#41404a', '#383e44', '#443e46', '#3d4148'];
function milExtractBuildings() {
  MILG.bld = WORLD.bldgs.map(b => {
    const rng = mulberry32(b.x * 977 + b.y * 131);
    const hgt = b.ent ? 26 + (rng() * 8 | 0) : 32 + (rng() * 5 | 0) * 6;      // shops stay low, blocks 32..56
    const wall = b.ent ? milMix(MIL_WALLS[(rng() * 5) | 0], b.roof, 0.25) : MIL_WALLS[(rng() * 5) | 0];
    let roofIdx = null;
    if (b.ent) { const i = WORLD.roofs.findIndex(r => r.tx0 === b.x && r.ty0 === b.y); if (i >= 0) roofIdx = i; }
    return {
      b, hgt, wall, roofIdx,
      x0: b.x * TILE, y0: b.y * TILE, x1: (b.x + b.w) * TILE, y1: (b.y + b.h) * TILE,
      seed: b.x * 7451 + b.y * 977,
      fS: null, fE: null, roofCv: null, ant: null,
    };
  });
  // neon signs mount at the top of their building's facade
  for (const sg of WORLD.signs) {
    const bb = MILG.bld.find(B => sg.x >= B.x0 && sg.x <= B.x1 && sg.y >= B.y0 - 4 && sg.y <= B.y1 + 4);
    sg._mh = bb ? bb.hgt : 26;
  }
}
function milBldAt(x, y) {
  for (const B of MILG.bld) if (x >= B.x0 && x < B.x1 && y >= B.y0 && y < B.y1) return B;
  return null;
}

// =====================================================================
// GROUND BAKE — realistic plan-space city, light & shadow burnt in
// =====================================================================
function milBakeGround() {
  const W = WORLD.W, H = WORLD.H, T = WORLD.t;
  const cv = mkCanvas(W * TILE * MIL_BK, H * TILE * MIL_BK), c = cv.getContext('2d');
  MILG.cv = cv; MILG.ctx = c;
  // the plan-space transform STAYS on this ctx forever, so live decals
  // (bloodStain / tire tracks via worldCtx()) keep writing in world coords
  c.setTransform(MIL_BK, 0, 0, MIL_BK, 0, 0);
  c.imageSmoothingEnabled = true;
  const road = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && T[ty * W + tx] === WT.ROAD;

  // ---- per-tile base coats ----
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const v = T[ty * W + tx], px = tx * TILE, py = ty * TILE;
    const r = mulberry32(tx * 1733 + ty * 89);
    if (milBorderTile(tx, ty)) {
      if (milBorderKind(tx, ty) === 'water') {
        const deep = Math.min(1, Math.max(6 - tx, ty - 117, 0) / 6 + 0.25);
        c.fillStyle = milMix('#0b1c26', '#050c14', deep); c.fillRect(px, py, TILE, TILE);
        if (r() < 0.5) { c.fillStyle = 'rgba(120,180,210,0.05)'; c.fillRect(px + r() * 12, py + r() * 14, 3 + r() * 5, 1); }
      } else {
        c.fillStyle = ['#171410', '#1a1712', '#151310'][r() * 3 | 0]; c.fillRect(px, py, TILE, TILE);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(px + r() * 11, py + r() * 11, 2 + r() * 4, 1 + r() * 2);
        c.fillStyle = 'rgba(255,220,170,0.03)'; c.fillRect(px + r() * 12, py + r() * 12, 2, 1);
      }
      continue;
    }
    if (v === WT.ROAD) {
      c.fillStyle = '#191a20'; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.10)';
      c.beginPath(); c.ellipse(px + r() * 16, py + r() * 16, 5 + r() * 7, 3 + r() * 5, r() * 3, 0, 7); c.fill();
      for (let k = 0; k < 3; k++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.14)'; c.fillRect(px + r() * 15, py + r() * 15, 1, 1); }
      if (r() < 0.04) { c.fillStyle = 'rgba(6,6,10,0.5)'; c.beginPath(); c.ellipse(px + 8, py + 8, 4 + r() * 4, 3 + r() * 3, r() * 3, 0, 7); c.fill(); }
    } else if (v === WT.WALK) {
      c.fillStyle = '#2a2d37'; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = 'rgba(10,12,16,0.55)'; c.fillRect(px, py, TILE, 1);
      if ((tx & 1) === 0) c.fillRect(px, py, 1, TILE);
      for (let k = 0; k < 2; k++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.14)'; c.fillRect(px + r() * 15, py + r() * 15, 1 + r() * 2, 1); }
      if (r() < 0.06) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(px + 8, py + 9, 5, 3, 0, 0, 7); c.fill(); }
    } else if (v === WT.PLAZA) {
      c.fillStyle = '#25262e'; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = 'rgba(0,0,0,0.16)';
      c.fillRect(px, py, TILE, 1); c.fillRect(px, py + 8, TILE, 1); c.fillRect(px, py, 1, TILE); c.fillRect(px + 8, py, 1, TILE);
      c.fillStyle = 'rgba(255,255,255,0.02)'; c.fillRect(px + r() * 12, py + r() * 12, 3, 1);
      if (r() < 0.05) { c.fillStyle = '#101116'; c.fillRect(px + 4, py + 4, 8, 8); c.fillStyle = 'rgba(255,255,255,0.05)'; for (let g = 0; g < 4; g++) c.fillRect(px + 5, py + 5 + g * 2, 6, 1); }
    } else if (v === WT.PARK) {
      c.fillStyle = '#1a2620'; c.fillRect(px, py, TILE, TILE);
      for (let k = 0; k < 6; k++) { c.fillStyle = r() < 0.5 ? '#1e2c20' : '#101a12'; c.fillRect(px + r() * 15, py + r() * 15, 1 + (r() < 0.3 ? 1 : 0), 1); }
      if (r() < 0.3) { c.fillStyle = 'rgba(6,10,6,0.3)'; c.beginPath(); c.ellipse(px + r() * 16, py + r() * 16, 4 + r() * 4, 3 + r() * 3, 0, 0, 7); c.fill(); }
    } else if (v === WT.FLOOR || v === WT.DOOR) {
      c.fillStyle = '#191a1f'; c.fillRect(px, py, TILE, TILE);
    } else { // city BLDG footprint — mostly hidden under the prism
      c.fillStyle = '#0d0e12'; c.fillRect(px, py, TILE, TILE);
    }
  }

  // ---- road furniture: centre lines, lane dashes, crosswalks, stop lines ----
  const lo = RD[0], hi = RD[RD.length - 1] + 3;
  const inRoadSpan = p => RD.some(rr => p >= rr && p < rr + 4);
  for (const rr of RD) {
    const m = (rr + 2) * TILE;
    for (let p = lo * TILE; p < (hi + 1) * TILE; p += 4) {
      if (inRoadSpan(Math.floor(p / TILE))) continue;
      c.fillStyle = 'rgba(150,132,60,0.6)'; c.fillRect(m - 2, p, 1, 3); c.fillRect(m + 1, p, 1, 3); // double yellow centre
      c.fillRect(p, m - 2, 3, 1); c.fillRect(p, m + 1, 3, 1);
      if ((p >> 2) % 4 === 0) { c.fillStyle = 'rgba(190,196,205,0.34)'; c.fillRect(m - 18, p, 1, 8); c.fillRect(m + 17, p, 1, 8); c.fillRect(p, m - 18, 8, 1); c.fillRect(p, m + 17, 8, 1); }
    }
  }
  c.fillStyle = 'rgba(205,210,220,0.4)';
  for (const vx of RD) for (const hy of RD) {                      // zebra crossings on all 4 approaches
    const x0 = vx * TILE, y0 = hy * TILE, w4 = 4 * TILE;
    for (let s = 3; s < w4 - 3; s += 6) {
      c.fillRect(x0 + s, y0 - 9, 3, 7); c.fillRect(x0 + s, y0 + w4 + 2, 3, 7);
      c.fillRect(x0 - 9, y0 + s, 7, 3); c.fillRect(x0 + w4 + 2, y0 + s, 7, 3);
    }
  }

  // ---- BAKED LONG SHADOWS (the Commandos signature) — before trees, after markings ----
  c.fillStyle = 'rgba(3,5,13,0.36)';
  for (const B of MILG.bld) {
    const dx = B.hgt * MIL_SH.x, dy = B.hgt * MIL_SH.y;
    c.beginPath();
    c.moveTo(B.x0, B.y0); c.lineTo(B.x1, B.y0); c.lineTo(B.x1 + dx, B.y0 + dy);
    c.lineTo(B.x1 + dx, B.y1 + dy); c.lineTo(B.x0 + dx, B.y1 + dy); c.lineTo(B.x0, B.y1);
    c.closePath(); c.fill();
  }
  for (const tr of WORLD.trees) { c.beginPath(); c.ellipse(tr.x + tr.r * 0.8, tr.y + tr.r * 0.5, tr.r, tr.r * 0.8, 0, 0, 7); c.fill(); }
  for (const wk of WORLD.wrecks) { c.beginPath(); c.ellipse(wk.x + 4, wk.y + 3, 11, 8, wk.a, 0, 7); c.fill(); }
  // contact AO hugging every facade base
  c.fillStyle = 'rgba(0,0,0,0.5)';
  for (const B of MILG.bld) { c.fillRect(B.x0, B.y1, B.x1 - B.x0 + 2, 2); c.fillRect(B.x1, B.y0, 2, B.y1 - B.y0 + 2); }

  // ---- puddles: dark mirrors with a neon rim (after shadows so they read glossy) ----
  for (const p of WORLD.puddles) {
    c.fillStyle = '#0a0d15'; c.beginPath(); c.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, 7); c.fill();
    c.strokeStyle = milRgba(p.col, 0.22); c.lineWidth = 1;
    c.beginPath(); c.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, 7); c.stroke();
    c.fillStyle = milRgba(p.col, 0.10); c.beginPath(); c.ellipse(p.x, p.y, p.w / 4, p.h / 5, 0, 0, 7); c.fill();
  }
  c.lineWidth = 1;

  // ---- trees (canopy stays lit above the baked shade) ----
  for (const tr of WORLD.trees) {
    c.fillStyle = '#0d1409'; c.beginPath(); c.ellipse(tr.x + 1.5, tr.y + 1.2, tr.r, tr.r * 0.85, 0, 0, 7); c.fill();
    c.fillStyle = milMix(tr.col, '#22381c', 0.5); c.beginPath(); c.ellipse(tr.x, tr.y, tr.r * 0.95, tr.r * 0.8, 0, 0, 7); c.fill();
    c.fillStyle = milMix(tr.col, '#4a6a3a', 0.4); c.beginPath(); c.ellipse(tr.x - tr.r * 0.25, tr.y - tr.r * 0.25, tr.r * 0.55, tr.r * 0.42, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.ellipse(tr.x - tr.r * 0.35, tr.y - tr.r * 0.35, tr.r * 0.2, tr.r * 0.14, 0, 0, 7); c.fill();
  }
  // ---- wrecks: rusted dead shells ----
  for (const wk of WORLD.wrecks) {
    c.save(); c.translate(wk.x, wk.y); c.rotate(wk.a);
    c.fillStyle = '#211c17'; c.beginPath();
    if (c.roundRect) c.roundRect(-6, -10, 12, 20, 3); else c.rect(-6, -10, 12, 20);
    c.fill();
    c.fillStyle = '#33251a'; c.fillRect(-5, -9, 4, 5); c.fillRect(1, 2, 4, 6);
    c.fillStyle = '#0e1013'; c.fillRect(-4, -5, 8, 4); c.fillRect(-4, 4, 8, 3);
    c.fillStyle = 'rgba(122,80,40,0.5)'; c.fillRect(-6, -2, 2, 6); c.fillRect(4, -8, 2, 5);
    c.restore();
  }

  // ---- street light pools (warm) ----
  for (const L of WORLD.lights) {
    const g = c.createRadialGradient(L.x, L.y, 2, L.x, L.y, 30);
    g.addColorStop(0, 'rgba(255,196,120,0.20)'); g.addColorStop(1, 'rgba(255,196,120,0)');
    c.fillStyle = g; c.fillRect(L.x - 30, L.y - 30, 60, 60);
    c.fillStyle = '#3c4048'; c.fillRect(L.x - 1, L.y - 1, 2, 2);
    c.fillStyle = 'rgba(255,220,160,0.8)'; c.fillRect(L.x - 1, L.y - 1, 1, 1);
  }

  // ---- neon spill washing the pavement in front of signed facades ----
  for (const B of MILG.bld) {
    const b = B.b, col = b.neon || (b.sign && b.sign.col);
    if (!col) continue;
    const g = c.createLinearGradient(0, B.y1, 0, B.y1 + 22);
    g.addColorStop(0, milRgba(col, 0.13)); g.addColorStop(1, milRgba(col, 0));
    c.fillStyle = g; c.fillRect(B.x0 + 2, B.y1, B.x1 - B.x0 - 4, 22);
  }

  // ---- realistic interiors for enterable buildings (over shadows — rooms are lit) ----
  for (const B of MILG.bld) if (B.b.ent) milBakeInterior(c, B);

  // ---- door thresholds + warm spill ----
  for (const B of MILG.bld) {
    if (!B.b.ent || !B.b.doors) continue;
    for (const dtx of B.b.doors) {
      const dx = dtx * TILE;
      c.fillStyle = '#241d14'; c.fillRect(dx + 2, B.y1 - 3, 12, 6);
      const g = c.createLinearGradient(0, B.y1, 0, B.y1 + 14);
      g.addColorStop(0, 'rgba(255,190,110,0.28)'); g.addColorStop(1, 'rgba(255,190,110,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(dx + 3, B.y1); c.lineTo(dx + 13, B.y1); c.lineTo(dx + 17, B.y1 + 14); c.lineTo(dx - 1, B.y1 + 14); c.closePath(); c.fill();
    }
  }

  // ---- faint district grading, cinematic cohesion ----
  const grade = (x0, y0, x1, y1, col, a) => { c.fillStyle = milRgba(col, a); c.fillRect(x0 * TILE, y0 * TILE, (x1 - x0) * TILE, (y1 - y0) * TILE); };
  grade(0, 0, 64, 64, '#0a4a5c', 0.035);      // watson — teal
  grade(64, 0, 128, 64, '#7a1a4a', 0.035);    // westbrook — magenta
  grade(0, 64, 64, 128, '#0a3a2a', 0.035);    // pacifica — green rot
  grade(64, 64, 128, 128, '#6a5a10', 0.03);   // santo — dust
  grade(0, 78, 42, 128, '#7a3a08', 0.05);     // dogtown — burnt orange
}

// interiors mirror _bakeInterior's furniture geometry (WORLD.obst rects), realistic coats
function milBakeInterior(c, B) {
  const b = B.b, px = B.x0, py = B.y0, pw = B.x1 - B.x0, ph = B.y1 - B.y0;
  const fx = px + TILE, fy = py + TILE, fw = pw - 2 * TILE, fh = ph - 2 * TILE, cx = fx + fw / 2;
  c.fillStyle = '#0a0b0f'; c.fillRect(px, py, pw, ph);
  const FLOOR = { bar: '#2a1d12', guns: '#1c2028', ripper: '#1d272c', cars: '#232428', clouds: '#2a1626', den: '#201a1d', flat: '#241e17' };
  const fl = FLOOR[b.theme] || '#1e1e24';
  c.fillStyle = fl; c.fillRect(fx, fy, fw, fh);
  if (b.theme === 'bar' || b.theme === 'flat') {          // wood planks
    c.fillStyle = 'rgba(0,0,0,0.22)'; for (let gy = fy + 5; gy < fy + fh; gy += 5) c.fillRect(fx, gy, fw, 1);
    c.fillStyle = 'rgba(255,255,255,0.025)'; for (let gy = fy + 2; gy < fy + fh; gy += 10) c.fillRect(fx, gy, fw, 1);
  } else if (b.theme === 'clouds') {                      // plush carpet
    c.fillStyle = 'rgba(255,42,109,0.05)'; for (let gy = fy + 4; gy < fy + fh; gy += 8) for (let gx = fx + 4; gx < fx + fw; gx += 8) c.fillRect(gx, gy, 2, 2);
  } else {                                                // hard tile / concrete
    c.fillStyle = 'rgba(0,0,0,0.2)';
    for (let gx = fx + 12; gx < fx + fw; gx += 12) c.fillRect(gx, fy, 1, fh);
    for (let gy = fy + 12; gy < fy + fh; gy += 12) c.fillRect(fx, gy, fw, 1);
  }
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(fx, fy, fw, 3);            // wall AO
  c.fillStyle = '#343a46'; c.fillRect(fx, fy, fw, 2);                     // north wall cap
  const rng = mulberry32(B.seed);
  const box = (x, y, w, h, col, top) => {                                 // furniture w/ SE drop shadow
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 2, y + 2, w, h);
    c.fillStyle = col; c.fillRect(x, y, w, h);
    c.fillStyle = top || milMix(col, '#ffffff', 0.12); c.fillRect(x, y, w, 2);
  };
  const counter = col => box(fx + 4, fy + 12, fw - 8, 9, col);
  switch (b.theme) {
    case 'bar': {
      counter('#4a3a28');
      for (let sx = fx + 8; sx < fx + fw - 8; sx += 12) { c.fillStyle = '#101014'; c.beginPath(); c.ellipse(sx + 2, fy + 27, 2.6, 2.6, 0, 0, 7); c.fill(); c.fillStyle = '#2a2a32'; c.beginPath(); c.ellipse(sx + 2, fy + 26.4, 2.2, 2.2, 0, 0, 7); c.fill(); }
      for (let bx = fx + 6; bx < fx + fw - 6; bx += 4) { c.fillStyle = milRgba(NEON[(bx / 4 | 0) % NEON.length], 0.85); c.fillRect(bx, fy + 5, 1.5, 4); }
      c.fillStyle = 'rgba(255,120,160,0.06)'; c.beginPath(); c.ellipse(cx, fy + 16, fw * 0.4, 10, 0, 0, 7); c.fill();
      break;
    }
    case 'guns': {
      counter('#333a46');
      const rack = (rx) => { for (let gy = fy + 26; gy < fy + fh - 6; gy += 9) { box(rx, gy, 14, 6, '#14181f'); c.fillStyle = '#9aa3b2'; c.fillRect(rx + 2, gy + 2, 10, 1); c.fillStyle = '#5a6372'; c.fillRect(rx + 3, gy + 4, 8, 1); } };
      rack(fx + 4); rack(fx + fw - 18);
      c.fillStyle = 'rgba(249,240,2,0.5)'; for (let sx = fx + 2; sx < fx + fw - 2; sx += 6) c.fillRect(sx, fy + fh - 3, 3, 1); // hazard tape
      break;
    }
    case 'ripper': {
      counter('#2c3a44');
      box(cx - 7, fy + 26, 14, 20, '#3a424e');
      c.fillStyle = '#4c5666'; c.fillRect(cx - 5, fy + 28, 10, 7);        // cushion
      c.fillStyle = '#6a7686'; c.fillRect(cx - 5, fy + 27, 10, 2);
      c.fillStyle = '#0a4a55'; c.fillRect(fx + 5, fy + 6, 12, 6);         // wall monitor
      c.fillStyle = '#0ee7f7'; c.fillRect(fx + 6, fy + 7, 10, 1); c.fillRect(fx + 6, fy + 9, 6, 1);
      c.fillStyle = 'rgba(5,217,232,0.07)'; c.beginPath(); c.ellipse(cx, fy + 34, 16, 10, 0, 0, 7); c.fill();
      break;
    }
    case 'cars': {
      counter('#34353c');
      c.strokeStyle = '#8a8420'; c.lineWidth = 1; c.strokeRect(cx - 14.5, fy + 27.5, 29, 20);   // lift bay
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(cx - 12, fy + 30, 24, 15);
      c.fillStyle = 'rgba(20,16,8,0.5)'; c.beginPath(); c.ellipse(cx + 3, fy + 38, 6, 3, 0.4, 0, 7); c.fill(); // oil
      box(fx + 5, fy + 28, 8, 6, '#7a2a24');
      c.fillStyle = '#101014'; c.beginPath(); c.ellipse(fx + fw - 12, fy + fh - 10, 5, 5, 0, 0, 7); c.fill();
      c.fillStyle = '#22242a'; c.beginPath(); c.ellipse(fx + fw - 12, fy + fh - 10, 2, 2, 0, 0, 7); c.fill();
      break;
    }
    case 'clouds': {
      counter('#4a2a44');
      const couch = (sx) => { box(sx, fy + 30, 22, 8, '#5c2440'); c.fillStyle = '#7c3454'; c.fillRect(sx + 2, fy + 31, 8, 3); c.fillRect(sx + 12, fy + 31, 8, 3); };
      couch(fx + 6); couch(fx + fw - 28);
      for (let bx = fx + 8; bx < fx + fw - 8; bx += 6) { c.fillStyle = bx % 12 < 6 ? '#ff2a6d' : '#bd00ff'; c.fillRect(bx, fy + 5, 1.5, 3); }
      c.fillStyle = 'rgba(255,42,109,0.06)'; c.beginPath(); c.ellipse(cx, fy + fh / 2, fw * 0.4, fh * 0.3, 0, 0, 7); c.fill();
      break;
    }
    case 'den': {
      box(fx + 4, fy + 8, 16, 6, '#14181f');
      c.fillStyle = '#9aa3b2'; c.fillRect(fx + 6, fy + 10, 12, 1);
      box(cx - 9, fy + fh / 2 - 5, 18, 10, '#332a20');
      c.fillStyle = 'rgba(200,180,140,0.15)'; c.fillRect(cx - 6, fy + fh / 2 - 3, 5, 3); // cards on the table
      const tag = NEON[rng() * NEON.length | 0];
      c.strokeStyle = milRgba(tag, 0.65); c.lineWidth = 2;
      for (let k = 0; k < 4; k++) { const gx = fx + 5 + rng() * (fw - 16), gy = fy + 6 + rng() * (fh - 14); c.beginPath(); c.moveTo(gx, gy + 3); c.quadraticCurveTo(gx + 3, gy - 2, gx + 7, gy + 2); c.stroke(); }
      c.lineWidth = 1;
      break;
    }
    default: { // flat
      box(fx + fw - 18, fy + 6, 14, 20, '#31404e');
      c.fillStyle = '#d9dfeb'; c.fillRect(fx + fw - 16, fy + 8, 10, 5);   // pillow
      c.fillStyle = '#26536a'; c.fillRect(fx + fw - 16, fy + 14, 10, 10); // blanket
      box(cx - 8, fy + fh / 2, 16, 10, '#332a20');
      box(fx + 4, fy + 7, 10, 6, '#12303e');
      c.fillStyle = '#7ad7ff'; c.fillRect(fx + 5, fy + 8, 8, 3);
      c.fillStyle = 'rgba(122,215,255,0.06)'; c.beginPath(); c.ellipse(fx + 9, fy + 14, 10, 6, 0, 0, 7); c.fill();
    }
  }
  for (const dtx of b.doors) { c.fillStyle = fl; c.fillRect(dtx * TILE, B.y1 - TILE, TILE, TILE); c.fillStyle = '#2c3c46'; c.fillRect(dtx * TILE + 3, B.y1 - 9, 10, 6); }
}

// =====================================================================
// FACADE + ROOF BAKE — upright textures, laid onto slanted quads at draw
// =====================================================================
function milBakeBuildings() {
  for (const B of MILG.bld) {
    B.fS = milFacade(B.x1 - B.x0, B.hgt, B, 's');
    B.fE = milFacade(B.y1 - B.y0, B.hgt, B, 'e');
    B.roofCv = milRoof(B);
  }
}

const WIN_COLS = ['#ffbd6d', '#8fd8ef', '#20303c', '#141821', '#141821', '#c9d6e2'];
function milFacade(len, hgt, B, dir) {
  const b = B.b, cv = mkCanvas(Math.ceil(len * MIL_FK), Math.ceil(hgt * MIL_FK)), c = cv.getContext('2d');
  c.setTransform(MIL_FK, 0, 0, MIL_FK, 0, 0);
  const rng = mulberry32(B.seed + (dir === 's' ? 5 : 811));
  // concrete base, subtly lit from above
  const g = c.createLinearGradient(0, 0, 0, hgt);
  const wall = dir === 'e' ? milMix(B.wall, '#000000', 0.22) : B.wall;    // east faces sit deeper in shade
  g.addColorStop(0, milMix(wall, '#ffffff', 0.10)); g.addColorStop(0.25, wall); g.addColorStop(1, milMix(wall, '#000000', 0.30));
  c.fillStyle = g; c.fillRect(0, 0, len, hgt);
  for (let x = 13; x < len - 3; x += 14) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, 0, 1, hgt); }   // panel seams
  for (let k = 0; k < len / 5; k++) { c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.12)'; c.fillRect(rng() * len, rng() * hgt, 1 + rng() * 2, 1); }
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, hgt - 1, len, 1);
  // window floors (leave a ground floor of 13px)
  const gf = 13, floors = Math.max(1, ((hgt - gf - 4) / 9) | 0);
  const litBias = 0.28 + rng() * 0.3;
  for (let fl2 = 0; fl2 < floors; fl2++) {
    const wy = 4 + fl2 * ((hgt - gf - 6) / floors);
    c.fillStyle = 'rgba(255,255,255,0.045)'; c.fillRect(1, wy + 6, len - 2, 1);          // sill ledge
    for (let wx = 4; wx < len - 7; wx += 7) {
      const r2 = rng();
      const col = r2 < litBias ? WIN_COLS[rng() * 2 | 0] : WIN_COLS[2 + (rng() * 3 | 0)];
      c.fillStyle = '#0a0c11'; c.fillRect(wx - 1, wy - 1, 6, 7);
      c.fillStyle = col; c.fillRect(wx, wy, 4, 5);
      if (r2 < litBias) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(wx, wy, 4, 1); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(wx + 1, wy + 2, 1, 3); }
    }
  }
  // drainpipe
  if (rng() < 0.6) { const px2 = 3 + rng() * (len - 8); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(px2, 0, 2, hgt); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(px2, 0, 1, hgt); }
  // AC units
  for (let k = 0; k < len / 34; k++) {
    if (rng() < 0.35) continue;
    const ax = 4 + rng() * (len - 12), ay = 6 + rng() * (hgt - gf - 14);
    c.fillStyle = '#0c0e12'; c.fillRect(ax - 1, ay - 1, 7, 6);
    c.fillStyle = '#4a505c'; c.fillRect(ax, ay, 6, 4);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(ax + 1, ay + 1, 4, 1); c.fillRect(ax + 1, ay + 3, 4, 1);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(ax + 2, ay + 5, 1, Math.min(8, hgt - ay - 6)); // drip streak
  }
  // ground floor
  const gy0 = hgt - gf;
  c.fillStyle = milMix(wall, '#000000', 0.35); c.fillRect(0, gy0, len, gf);
  c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, gy0, len, 1);
  if (b.ent && dir === 's') {
    // storefront glass + doors
    const gg = c.createLinearGradient(0, gy0 + 2, 0, hgt);
    gg.addColorStop(0, '#2a4450'); gg.addColorStop(1, '#101c24');
    c.fillStyle = gg; c.fillRect(3, gy0 + 2, len - 6, gf - 3);
    c.fillStyle = 'rgba(255,255,255,0.10)'; for (let mx = 10; mx < len - 6; mx += 12) c.fillRect(mx, gy0 + 2, 1, gf - 3);
    c.fillStyle = 'rgba(255,236,190,0.12)'; c.fillRect(3, gy0 + 5, len - 6, gf - 7);
    for (const dtx of b.doors || []) {
      const dx = dtx * TILE - B.x0;
      c.fillStyle = '#171310'; c.fillRect(dx + 1, gy0 + 1, 14, gf - 1);
      const dg = c.createLinearGradient(0, gy0 + 1, 0, hgt); dg.addColorStop(0, '#ffdf9e'); dg.addColorStop(1, '#c78f4a');
      c.fillStyle = dg; c.fillRect(dx + 3, gy0 + 2, 10, gf - 2);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(dx + 7.5, gy0 + 2, 1, gf - 2);
    }
  } else {
    if (rng() < 0.4) { // roll-up service door
      const rx = 4 + rng() * Math.max(1, len - 26);
      c.fillStyle = '#22252c'; c.fillRect(rx, gy0 + 2, 18, gf - 2);
      c.fillStyle = 'rgba(0,0,0,0.4)'; for (let ry = gy0 + 3; ry < hgt - 1; ry += 2) c.fillRect(rx, ry, 18, 1);
    }
    if (rng() < 0.5) { // graffiti tag
      const tag = NEON[rng() * NEON.length | 0], tx2 = 3 + rng() * Math.max(1, len - 20);
      c.strokeStyle = milRgba(tag, 0.5); c.lineWidth = 2;
      c.beginPath(); c.moveTo(tx2, gy0 + 9); c.quadraticCurveTo(tx2 + 5, gy0 + 3, tx2 + 9, gy0 + 8); c.quadraticCurveTo(tx2 + 13, gy0 + 11, tx2 + 16, gy0 + 6); c.stroke();
      c.lineWidth = 1;
    }
    c.fillStyle = 'rgba(0,0,0,0.35)'; for (let vx = 6; vx < len - 8; vx += 22) { if (rng() < 0.5) { c.fillRect(vx, gy0 + 4, 8, 5); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(vx, gy0 + 4, 8, 1); c.fillStyle = 'rgba(0,0,0,0.35)'; } }
  }
  // neon trim strip along the parapet
  if (b.neon) {
    c.fillStyle = milRgba(b.neon, 0.9); c.fillRect(0, 1, len, 1);
    const ng = c.createLinearGradient(0, 2, 0, 8); ng.addColorStop(0, milRgba(b.neon, 0.28)); ng.addColorStop(1, milRgba(b.neon, 0));
    c.fillStyle = ng; c.fillRect(0, 2, len, 6);
  }
  return cv;
}

function milRoof(B) {
  const w = B.x1 - B.x0, h = B.y1 - B.y0, cv = mkCanvas(w * MIL_FK, h * MIL_FK), c = cv.getContext('2d');
  c.setTransform(MIL_FK, 0, 0, MIL_FK, 0, 0);
  const rng = mulberry32(B.seed + 77);
  const base = milMix(B.b.roof, '#3a3f4a', 0.55);
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let k = 0; k < w * h / 60; k++) { c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.14)'; c.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1); }
  // parapet: lit outer rim + inner AO
  c.fillStyle = milMix(base, '#ffffff', 0.16); c.fillRect(0, 0, w, 2); c.fillRect(0, 0, 2, h);
  c.fillStyle = milMix(base, '#ffffff', 0.08); c.fillRect(0, h - 2, w, 2); c.fillRect(w - 2, 0, 2, h);
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(2, 2, w - 4, 1); c.fillRect(2, 2, 1, h - 4);
  const shBox = (x, y, bw, bh, col) => {
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + bh * 0.5, y + bh * 0.35, bw, bh);
    c.fillStyle = col; c.fillRect(x, y, bw, bh);
    c.fillStyle = milMix(col, '#ffffff', 0.14); c.fillRect(x, y, bw, 1);
  };
  // vents & AC blocks
  for (let k = 0; k < (w * h) / 900 + 1; k++) {
    const x = 5 + rng() * (w - 16), y = 5 + rng() * (h - 14);
    if (rng() < 0.5) { shBox(x, y, 8, 6, '#4a4e58'); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 1, y + 2, 6, 1); c.fillRect(x + 1, y + 4, 6, 1); }
    else { shBox(x, y, 5, 5, '#3e424c'); c.fillStyle = '#20232a'; c.beginPath(); c.ellipse(x + 2.5, y + 2.5, 1.6, 1.6, 0, 0, 7); c.fill(); }
  }
  // water tank on the bigger roofs
  if (w > 90 && rng() < 0.75) {
    const x = 12 + rng() * (w - 30), y = 10 + rng() * (h - 24);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(x + 4, y + 3, 7, 6, 0, 0, 7); c.fill();
    c.fillStyle = '#5a4636'; c.beginPath(); c.ellipse(x, y, 7, 6, 0, 0, 7); c.fill();
    c.fillStyle = '#6e5844'; c.beginPath(); c.ellipse(x - 1.5, y - 1.5, 4, 3.4, 0, 0, 7); c.fill();
  }
  // skylight glow for the enterable ones
  if (B.b.ent) {
    const col = B.b.neon || '#ffd27a';
    c.fillStyle = 'rgba(10,12,16,0.8)'; c.fillRect(w / 2 - 7, h / 2 - 5, 14, 10);
    c.fillStyle = milRgba(col, 0.30); c.fillRect(w / 2 - 6, h / 2 - 4, 12, 8);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(w / 2 - 6, h / 2 - 4, 12, 2);
  }
  B.ant = rng() < 0.6 ? { x: B.x0 + 6 + rng() * (w - 12), y: B.y0 + 6 + rng() * (h - 12) } : null;
  return cv;
}

// =====================================================================
// per-frame building draw: two slanted facades + rotated roof + antenna
// =====================================================================
function milDrawBuilding(c, B, alpha) {
  const zh = B.hgt * MIL_ZK;
  const pS = proj(B.x0, B.y1, 0), pE = proj(B.x1, B.y0, 0);
  if (alpha < 1) c.globalAlpha = alpha;
  // south face: runs along +x → screen dir (R, R); texture y maps straight down.
  // c.transform (not setTransform) so the hi-res base transform composes through.
  c.save();
  c.transform(MIL_R / MIL_FK, MIL_R / MIL_FK, 0, MIL_ZK / MIL_FK, pS.x, pS.y - zh);
  c.drawImage(B.fS, 0, 0);
  c.restore();
  // east face: runs along +y → screen dir (−R, R)
  c.save();
  c.transform(-MIL_R / MIL_FK, MIL_R / MIL_FK, 0, MIL_ZK / MIL_FK, pE.x, pE.y - zh);
  c.drawImage(B.fE, 0, 0);
  c.restore();
  // roof: plan-rotated, lifted by zh
  c.save();
  c.translate(G._ox + (G._shx || 0), G._oy + (G._shy || 0) - zh);
  c.rotate(Math.PI / 4);
  c.drawImage(B.roofCv, B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
  c.restore();
  // blinking aircraft-warning lamp
  if (B.ant) {
    const a = proj(B.ant.x, B.ant.y, B.hgt);
    c.fillStyle = '#3a3e46'; c.fillRect(a.x - 0.5, a.y - 6, 1, 6);
    if ((G.frame / 40 | 0) % 2) { c.fillStyle = '#ff3344'; c.fillRect(a.x - 1, a.y - 7, 2, 2); }
  }
  c.globalAlpha = 1;
}

// =====================================================================
// MSPR — realistic actor / prop art (baked at first frame)
// =====================================================================
const MSPR = { _ped: {}, _civ: [], player: null, psycho: null, bushes: {}, crate: null, vend: null };

function milBakeActors() {
  const civPal = [
    { skin: '#c99772', hair: '#2a2018', jacket: '#3f4652', shirt: '#6a7280', pants: '#2c303c' },
    { skin: '#8a5c3c', hair: '#141210', jacket: '#4c3a30', shirt: '#8a8474', pants: '#33302a' },
    { skin: '#e0ac84', hair: '#7a5a2c', jacket: '#54424e', shirt: '#b0a8b8', pants: '#3a3444', hairLong: 1 },
    { skin: '#b98a64', hair: '#3c2c1e', jacket: '#37464a', shirt: '#7c959a', pants: '#2c3438' },
    { skin: '#d8a082', hair: '#8a2c4a', jacket: '#4a3554', shirt: '#c07898', pants: '#322c3c', hairLong: 1 },
    { skin: '#a8764e', hair: '#1c1c22', jacket: '#5a4a34', shirt: '#c9b98a', pants: '#3c3428' },
  ];
  MSPR._civ = civPal.map(p => milActorSet(p));
  MSPR.player = {
    m: milActorSet({ skin: '#d8a67e', hair: '#2c221a', jacket: '#4a5162', shirt: '#a62a3a', pants: '#3e4456', boots: '#23252e', trim: '#dfe4f0' }),
    f: milActorSet({ skin: '#e2b08c', hair: '#a63e52', jacket: '#4a5162', shirt: '#a62a3a', pants: '#3e4456', boots: '#23252e', trim: '#dfe4f0', hairLong: 1 }),
  };
  MSPR.psycho = milActorSet({ skin: '#b0b6c4', hair: '#10121a', jacket: '#2a1c34', shirt: '#bd00ff', pants: '#1e1626', trim: '#bd00ff' });
  MSPR.crate = milCrate();
  MSPR.vend = null; // drawn procedurally as a prism
}
function milPed(fac) {
  if (!MSPR._ped[fac]) {
    const col = (FACTIONS[fac] && FACTIONS[fac].col) || '#8a4a3c';
    MSPR._ped[fac] = milActorSet({
      skin: ['#c99772', '#8a5c3c', '#b98a64'][(fac.length * 7) % 3], hair: '#181410',
      jacket: milMix(col, '#3a3a42', 0.45), shirt: milMix(col, '#14141c', 0.3), pants: '#2b2e38', trim: col,
    });
  }
  return MSPR._ped[fac];
}
function milCiv(i) { return MSPR._civ[((i % 6) + 6) % 6]; }

function milActorSet(o) {
  const s = {};
  for (const face of ['down', 'up', 'side']) s[face] = [0, 1].map(f => milPaintActor(face, f, o));
  return s;
}
// 12×20 logical figure baked MIL_AS× dense — rounded anatomy, gradients, soft NW key
// light. Sampled back down smoothly, so it reads as a small painted person, not pixels.
function milPaintActor(face, f, o) {
  const S = MIL_AS, cv = mkCanvas(12 * S, 20 * S), c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const jkD = milMix(o.jacket, '#000000', 0.30), jkL = milMix(o.jacket, '#ffffff', 0.24);
  const skD = milMix(o.skin, '#000000', 0.16), skL = milMix(o.skin, '#ffffff', 0.16);
  const pnD = milMix(o.pants, '#000000', 0.24);
  const boot = o.boots || '#23252e';
  const sw = f ? 1 : -1;                                                   // walk stride
  const limb = (x0, y0, x1, y1, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  if (face === 'side') {
    // far leg + boot (in shade)
    limb(6, 13.4, 6 - sw * 1.5, 18.1, pnD, 2);
    limb(6 - sw * 1.5, 18.1, 6 - sw * 2.2, 18.7, boot, 2);
    // torso profile
    const g = c.createLinearGradient(3.4, 0, 8.8, 0);
    g.addColorStop(0, jkL); g.addColorStop(0.55, o.jacket); g.addColorStop(1, jkD);
    c.fillStyle = g; milRR(c, 3.7, 6.7, 5, 7, 2); c.fill();
    // near leg + boot
    limb(6.2, 13.4, 6.2 + sw * 1.6, 18.1, o.pants, 2.1);
    limb(6.2 + sw * 1.6, 18.1, 6.2 + sw * 2.4, 18.7, boot, 2.1);
    // near arm swings opposite the near leg
    limb(6.1, 8.4, 6.1 - sw * 1.2, 12.6, milMix(o.jacket, '#000000', 0.12), 1.8);
    c.fillStyle = o.skin; c.beginPath(); c.arc(6.1 - sw * 1.2, 13.1, 0.8, 0, 7); c.fill();
    // head profile: skull, jaw shade, nose, hair mass at the back
    const hg = c.createRadialGradient(5.8, 3.4, 0.4, 6.3, 4.2, 2.6);
    hg.addColorStop(0, skL); hg.addColorStop(1, skD);
    c.fillStyle = hg; c.beginPath(); c.arc(6.3, 4.2, 2.2, 0, 7); c.fill();
    c.fillStyle = o.skin; c.beginPath(); c.arc(8.35, 4.7, 0.5, 0, 7); c.fill();       // nose
    c.fillStyle = o.skin; c.fillRect(5.6, 6.1, 1.2, 0.8);                             // neck
    c.fillStyle = o.hair;
    c.beginPath(); c.arc(6.1, 4, 2.35, Math.PI * 0.55, Math.PI * 1.75); c.quadraticCurveTo(6.4, 2.4, 7.6, 2.9); c.closePath(); c.fill();
    if (o.hairLong) { milRR(c, 3.9, 3.6, 1.7, 5, 0.8); c.fill(); }
    c.fillStyle = '#10131a'; c.fillRect(7.25, 4.05, 0.75, 0.7);                       // eye
    if (o.trim) { c.fillStyle = o.trim; c.fillRect(5.4, 6.65, 2.2, 0.7); }            // collar
  } else {
    const back = face === 'up';
    // legs + boots, striding
    limb(4.7, 13.4, 4.5, 18.1 + sw * 0.4, back ? pnD : o.pants, 2.1);
    limb(7.3, 13.4, 7.5, 18.1 - sw * 0.4, pnD, 2.1);
    limb(4.5, 18.1 + sw * 0.4, 4.4, 18.8 + sw * 0.4, boot, 2.2);
    limb(7.5, 18.1 - sw * 0.4, 7.6, 18.8 - sw * 0.4, boot, 2.2);
    // arms w/ counter-swing, bare hands
    limb(3.1, 8.2, 2.7 - sw * 0.35, 12.5, jkD, 1.8);
    limb(8.9, 8.2, 9.3 + sw * 0.35, 12.5, jkD, 1.8);
    c.fillStyle = o.skin;
    c.beginPath(); c.arc(2.7 - sw * 0.35, 13, 0.8, 0, 7); c.fill();
    c.beginPath(); c.arc(9.3 + sw * 0.35, 13, 0.8, 0, 7); c.fill();
    // torso: rounded jacket, NW-lit, subtle contour
    const g = c.createLinearGradient(2.4, 6.4, 9.6, 13.6);
    g.addColorStop(0, jkL); g.addColorStop(0.5, o.jacket); g.addColorStop(1, jkD);
    c.fillStyle = g; milRR(c, 2.7, 6.6, 6.6, 7.2, 2.2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.5; milRR(c, 2.95, 6.85, 6.1, 6.7, 2); c.stroke();
    if (!back) {
      const sg = c.createLinearGradient(0, 7, 0, 13);
      sg.addColorStop(0, milMix(o.shirt, '#ffffff', 0.14)); sg.addColorStop(1, milMix(o.shirt, '#000000', 0.26));
      c.fillStyle = sg; milRR(c, 5.1, 7.1, 1.8, 5.6, 0.8); c.fill();                  // open jacket / shirt
      if (o.trim) {                                                                    // collar lapels
        c.fillStyle = o.trim;
        c.beginPath(); c.moveTo(4.3, 6.85); c.lineTo(5.35, 6.85); c.lineTo(4.75, 8.7); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(7.7, 6.85); c.lineTo(6.65, 6.85); c.lineTo(7.25, 8.7); c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(3.2, 12.9, 5.6, 0.7);              // belt
      c.fillStyle = '#c9cfdd'; c.fillRect(5.65, 12.9, 0.75, 0.7);                     // buckle
    } else if (o.trim) {
      c.fillStyle = milRgba(o.trim, 0.4); milRR(c, 3.8, 8.7, 4.4, 0.9, 0.45); c.fill(); // gang band across the back
    }
    // head: shaded skull + neck
    const hg = c.createRadialGradient(5.3, 3.4, 0.4, 6, 4.3, 2.7);
    hg.addColorStop(0, skL); hg.addColorStop(1, skD);
    c.fillStyle = hg; c.beginPath(); c.arc(6, 4.2, 2.25, 0, 7); c.fill();
    c.fillStyle = skD; c.fillRect(5.4, 6.1, 1.2, 0.8);                                // neck
    if (back) {
      c.fillStyle = o.hair; c.beginPath(); c.arc(6, 4.05, 2.3, 0, 7); c.fill();
      if (o.hairLong) { c.fillStyle = o.hair; milRR(c, 4.6, 4.6, 2.8, 3.8, 1.2); c.fill(); }
    } else {
      c.fillStyle = o.hair;
      c.beginPath(); c.arc(6, 4.05, 2.32, Math.PI * 0.98, Math.PI * 2.02); c.closePath(); c.fill(); // top cap
      c.fillRect(3.68, 3.9, 0.9, 1.3); c.fillRect(7.42, 3.9, 0.9, 1.3);               // temples
      if (o.hairLong) { milRR(c, 3.5, 3.7, 1.3, 4.6, 0.6); c.fill(); milRR(c, 7.2, 3.7, 1.3, 4.6, 0.6); c.fill(); }
      c.fillStyle = '#10131a';
      c.fillRect(5.0, 4.35, 0.75, 0.7); c.fillRect(6.25, 4.35, 0.75, 0.7);            // eyes
      c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(5.0, 4.3, 0.75, 0.22); c.fillRect(6.25, 4.3, 0.75, 0.22);
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(5.35, 5.6, 1.3, 0.45);             // mouth shade
    }
  }
  return cv;
}

// actor billboard: baked SE contact shadow to match the world's sun.
// sw/sh = the sprite's LOGICAL size (sources are baked denser and smooth-sampled).
function milBill(c, spr, x, y, alpha, scale, flip, shadow, sw, sh) {
  const s = proj(x, y, 0); scale = scale || 1; sw = sw || 12; sh = sh || 20;
  if (shadow !== false) {
    c.fillStyle = 'rgba(3,5,13,0.45)';
    c.beginPath(); c.ellipse(s.x + 2 * scale, s.y + 0.6, 4.6 * scale, 2 * scale, 0.5, 0, 7); c.fill();
  }
  c.save(); if (alpha != null) c.globalAlpha = alpha;
  c.translate(s.x, s.y + 0.5);
  if (flip) c.scale(-scale, scale); else c.scale(scale, scale);
  c.drawImage(spr, -sw / 2, -sh, sw, sh);
  c.restore(); c.globalAlpha = 1;
}

// axis-aligned prism (crate / vend / mtn tile): plan square → rotated diamond + straight sides
function milPrism(c, x0, y0, x1, y1, h, top, lt, dk, alpha) {
  const zh = h * MIL_ZK;
  const gN = proj(x0, y0, 0), gE = proj(x1, y0, 0), gS = proj(x1, y1, 0), gW = proj(x0, y1, 0);
  if (alpha != null && alpha < 1) c.globalAlpha = alpha;
  c.fillStyle = dk; c.beginPath(); c.moveTo(gW.x, gW.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - zh); c.lineTo(gW.x, gW.y - zh); c.closePath(); c.fill();
  c.fillStyle = lt; c.beginPath(); c.moveTo(gE.x, gE.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - zh); c.lineTo(gE.x, gE.y - zh); c.closePath(); c.fill();
  c.fillStyle = top; c.beginPath(); c.moveTo(gN.x, gN.y - zh); c.lineTo(gE.x, gE.y - zh); c.lineTo(gS.x, gS.y - zh); c.lineTo(gW.x, gW.y - zh); c.closePath(); c.fill();
  c.globalAlpha = 1;
}

function milCrate() {
  const S = MIL_FK, cv = mkCanvas(16 * S, 16 * S), c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  const g = c.createLinearGradient(1, 1, 15, 15);
  g.addColorStop(0, '#83693f'); g.addColorStop(1, '#5c4a2c');
  c.fillStyle = g; c.fillRect(1, 1, 14, 14);
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(1, 1, 14, 1.4); c.fillRect(1, 1, 1.4, 14);
  c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(1, 7.3, 14, 0.8); c.fillRect(7.3, 1, 0.8, 14); c.fillRect(1, 14.2, 14, 0.8); c.fillRect(14.2, 1, 0.8, 14);
  c.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 2; k < 14; k += 2.4) c.fillRect(1, k, 14, 0.35);  // plank grain
  c.fillStyle = '#c9b23c'; c.fillRect(2, 2, 4, 1.8); c.fillRect(10, 12.2, 4, 1.8);
  return cv;
}

// realistic bush blob (plan-space look, billboarded)
function milBush(kind) {
  if (MSPR.bushes[kind]) return MSPR.bushes[kind];
  const PAL = {
    hedge: ['#1d3319', '#2a4a24', '#3c6234'], bush: ['#22381c', '#30512a', '#427244'],
    neon: ['#1c2a3a', '#22506a', '#05d9e8'], scrub: ['#3a3420', '#514a2c', '#6a6038'],
    grass: ['#243a1e', '#33552a', '#4a7a3a'], dead: ['#33291c', '#4a3a26', '#5c4a30'],
  };
  const p = PAL[kind] || PAL.bush, S = MIL_AS, cv = mkCanvas(20 * S, 16 * S), c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  const rng = mulberry32(kind.length * 977 + 5);
  c.fillStyle = p[0]; c.beginPath(); c.ellipse(10, 10, 8.6, 5.2, 0, 0, 7); c.fill();
  for (let k = 0; k < 12; k++) { c.fillStyle = rng() < 0.5 ? p[1] : p[0]; c.beginPath(); c.ellipse(4 + rng() * 12, 6 + rng() * 6, 2.4 + rng() * 2, 1.8 + rng() * 1.4, rng() * 3, 0, 7); c.fill(); }
  for (let k = 0; k < 8; k++) { c.fillStyle = p[2]; c.globalAlpha = kind === 'neon' ? 0.85 : 0.45; c.beginPath(); c.ellipse(4 + rng() * 11, 4 + rng() * 7, 0.9, 0.7, rng() * 3, 0, 7); c.fill(); c.globalAlpha = 1; }
  MSPR.bushes[kind] = cv;
  return cv;
}

// =====================================================================
// drawCarMil — realistic top-down body, rotated rigidly (plan == screen), lifted roof
// =====================================================================
function drawCarMil(c, sx, sy, a, def, sc) {
  sc = sc || 1;
  const rot = a + Math.PI / 4;
  if (def.bike) {
    c.fillStyle = 'rgba(3,5,13,0.45)'; c.beginPath(); c.ellipse(sx + 2 * sc, sy + 1 * sc, 9 * sc, 4 * sc, rot, 0, 7); c.fill();
    c.save(); c.translate(sx, sy - 2.4 * sc); c.rotate(rot); c.scale(sc, sc);
    c.fillStyle = '#0c0d11'; c.fillRect(5, -1.1, 4.6, 2.2); c.fillRect(-9.4, -1.1, 4.6, 2.2);   // tires
    c.fillStyle = milMix(def.col, '#000000', 0.35); c.beginPath(); c.ellipse(-1, 0, 6.4, 1.9, 0, 0, 7); c.fill();
    c.fillStyle = def.col; c.beginPath(); c.ellipse(-0.6, 0, 5.6, 1.5, 0, 0, 7); c.fill();
    c.fillStyle = milMix(def.col, '#ffffff', 0.2); c.beginPath(); c.ellipse(-1.4, -0.35, 3.6, 0.7, 0, 0, 7); c.fill();
    c.fillStyle = '#101218'; c.fillRect(-3.4, -1.1, 3.4, 2.2);                                  // seat
    c.fillStyle = def.col2; c.fillRect(0.6, -0.8, 1.4, 1.6);                                    // tank badge
    c.fillStyle = '#2a2e38'; c.fillRect(4.4, -2.3, 1.2, 4.6);                                   // bars
    c.fillStyle = '#ffe9a0'; c.fillRect(8.4, -0.8, 1.4, 1.6);
    c.fillStyle = '#ff3344'; c.fillRect(-9.8, -0.8, 1, 1.6);
    c.restore();
    return;
  }
  const S = CAR_SHAPE[def.shape] || CAR_SHAPE.sedan;
  const hl = S.hl, hw = S.hw, lift = 4.6 * sc;
  const bodyD = milMix(def.col, '#000000', 0.34), bodyM = milMix(def.col, '#ffffff', 0.05), bodyL = milMix(def.col, '#ffffff', 0.26);
  const rrect = (x, y, w, h, r) => { if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); } else { c.beginPath(); c.rect(x, y, w, h); } };
  // ground: soft shadow + tires + dark hull
  c.fillStyle = 'rgba(3,5,13,0.5)';
  c.save(); c.translate(sx + 2.4 * sc, sy + 1.4 * sc); c.rotate(rot); c.scale(sc, sc);
  rrect(-hl, -hw, hl * 2, hw * 2, 3); c.fill();
  c.restore();
  c.save(); c.translate(sx, sy); c.rotate(rot); c.scale(sc, sc);
  c.fillStyle = '#0b0c10';
  for (const u of [hl * 0.58, -hl * 0.58]) for (const v of [-hw - 0.4, hw - 1.6]) c.fillRect(u - 2.6, v, 5.2, 2);
  c.fillStyle = milMix(def.col, '#000000', 0.62);
  rrect(-hl - 0.6, -hw - 0.6, hl * 2 + 1.2, hw * 2 + 1.2, 3.4); c.fill();
  c.restore();
  // lifted body
  c.save(); c.translate(sx, sy - lift); c.rotate(rot); c.scale(sc, sc);
  const bg = c.createLinearGradient(-hl, -hw, -hl, hw);      // lateral tone: NW-lit
  bg.addColorStop(0, bodyL); bg.addColorStop(0.45, bodyM); bg.addColorStop(1, bodyD);
  c.fillStyle = bg; rrect(-hl, -hw, hl * 2, hw * 2, S.wedge ? 4 : 3); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.8; rrect(-hl + 0.4, -hw + 0.4, hl * 2 - 0.8, hw * 2 - 0.8, 3); c.stroke();
  const cF = hl * S.cf, cR = hl * S.cr, cw = hw * 0.72;
  // hood + trunk panel lines
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(hl * 0.82, -hw * 0.8); c.lineTo(hl * 0.82, hw * 0.8); c.stroke();
  c.beginPath(); c.moveTo(-hl * 0.82, -hw * 0.8); c.lineTo(-hl * 0.82, hw * 0.8); c.stroke();
  // specular streak down the hood (night gloss)
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(cR + 2.4, -hw * 0.55, Math.max(0, hl - cR - 3.4), 1.1);
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(-hl + 1.4, -hw * 0.55, Math.max(0, (S.cf * hl) + hl - 2), 1.1);
  if (S.wedge) { c.fillStyle = 'rgba(255,255,255,0.09)'; c.beginPath(); c.moveTo(hl, 0); c.lineTo(hl * 0.4, -hw * 0.8); c.lineTo(hl * 0.4, hw * 0.8); c.closePath(); c.fill(); }
  if (S.bed) { // pickup bed
    c.fillStyle = '#15161c'; rrect(-hl + 1, -hw + 1, (cF + hl) - 2, hw * 2 - 2, 1.5); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.05)'; for (let bx = -hl + 3; bx < cF - 2; bx += 3) c.fillRect(bx, -hw + 1.4, 1, hw * 2 - 2.8);
  }
  // glasshouse: windshield → roof → rear glass
  const gG = c.createLinearGradient(cR + 2.6, 0, cF, 0);
  gG.addColorStop(0, '#9fc4d8'); gG.addColorStop(0.35, '#39606f'); gG.addColorStop(1, '#12242e');
  c.fillStyle = gG; rrect(cF, -cw, (cR - cF) + 2.6, cw * 2, 2); c.fill();
  c.fillStyle = milMix(def.col, '#000000', 0.16); rrect(cF + 1.6, -cw + 0.7, (cR - cF) - 1.4, cw * 2 - 1.4, 1.6); c.fill();  // roof panel
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(cF + 1.8, -cw + 0.9, (cR - cF) - 1.8, 1);
  c.fillStyle = '#101c24'; rrect(cF - 1.4, -cw + 0.6, 1.8, cw * 2 - 1.2, 1); c.fill();          // rear glass
  // side glass slits
  c.fillStyle = 'rgba(10,20,28,0.85)'; c.fillRect(cF + 1.2, -cw - 0.5, (cR - cF) - 0.6, 0.9); c.fillRect(cF + 1.2, cw - 0.4, (cR - cF) - 0.6, 0.9);
  // mirrors
  c.fillStyle = bodyD; c.fillRect(cR + 1.4, -hw - 0.9, 1.4, 1); c.fillRect(cR + 1.4, hw - 0.1, 1.4, 1);
  if (S.st) { c.fillStyle = milRgba(def.col2, 0.85); c.fillRect(cR + 1.5, -1.6, hl - cR - 2.2, 1.1); c.fillRect(cR + 1.5, 0.5, hl - cR - 2.2, 1.1); }
  // spoiler on the fast ones
  if (S.wedge || (S.st && !S.bed && def.shape !== 'muscle')) { c.fillStyle = bodyD; c.fillRect(-hl + 0.4, -hw + 0.6, 1.6, hw * 2 - 1.2); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(-hl + 0.4, -hw + 0.6, 0.6, hw * 2 - 1.2); }
  // lights (top view: always visible)
  c.fillStyle = '#ffefb8'; c.fillRect(hl - 1.6, -hw + 0.8, 1.4, 1.6); c.fillRect(hl - 1.6, hw - 2.4, 1.4, 1.6);
  c.fillStyle = '#e83a4a'; c.fillRect(-hl + 0.3, -hw + 0.8, 1.1, 1.5); c.fillRect(-hl + 0.3, hw - 2.3, 1.1, 1.5);
  c.restore();
  c.lineWidth = 1;
}

// Commandos-style enemy view cone, drawn in the plan-rotated ground pass
function milCone(c, e) {
  const r = enemyRange(e) * 0.45;
  const warm = e.detect > 0.05;
  const g = c.createRadialGradient(e.x, e.y, 2, e.x, e.y, r);
  const col = warm ? '#ff9f1c' : '#7dff5a';
  g.addColorStop(0, milRgba(col, 0.16 + e.detect * 0.10));
  g.addColorStop(1, milRgba(col, 0.015));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(e.x, e.y);
  c.arc(e.x, e.y, r, e.lookA - FOV_HALF, e.lookA + FOV_HALF);
  c.closePath(); c.fill();
  c.strokeStyle = milRgba(col, 0.28); c.lineWidth = 0.8;
  c.beginPath(); c.arc(e.x, e.y, r, e.lookA - FOV_HALF, e.lookA + FOV_HALF); c.stroke();
  c.lineWidth = 1;
}
