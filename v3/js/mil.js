'use strict';
// ============ Military-projection layer (v3 — Commandos-style fake 3D) ============
// v1's sim is a flat world-pixel plane (TILE=16). We keep ALL of it and only change
// how (x,y) maps to the screen: the plan rotated 45° with NO foreshortening (the
// classic Commandos "impossible camera", det=1 → world px == screen px), heights
// rise straight up. The whole ground — realistic asphalt, curbs, crosswalks, baked
// long shadows, neon spill — is PRE-RENDERED once in plan space and rotate-blitted
// per frame. Buildings, actors and cars draw per frame, depth-sorted by wx+wy.
const MIL_R = Math.SQRT1_2;             // 0.70710678 — pure 45° rotation
const MIL_ZOOM = 2.25;                  // Commandos camera: close in — a block fills the screen
const MIL_ZK = 1.0;                     // world-z px risen per world-px of height (pre-zoom)
const MIL_SH = { x: 0.55, y: 0.42 };    // overcast key from the NW → soft, SHORT shadows to the SE (ref look)
// texture densities: everything is drawn in logical coords but baked N× denser, then
// smooth-sampled — this is what kills the chunky-pixel look. (Ground halves on small screens.)
const MIL_BK = ((window.innerWidth || 1280) * (window.devicePixelRatio || 1)) >= 900 ? 2 : 1;
const MIL_FK = 2;                       // facade / roof textures
const MIL_AS = 4;                       // actor sprites (Commandos-sized on screen)

function milRR(c, x, y, w, h, r) {
  if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  else { c.beginPath(); c.rect(x, y, w, h); }
}

// frame screen offset (set each frame in step/render). _ox/_oy stable (mouse), _shx/_shy add shake (draw)
const MIL_RZ = MIL_R * MIL_ZOOM;
function isoSetOffsets() {
  G._ox = VIEW_W / 2 - (G.cam.x - G.cam.y) * MIL_RZ;
  G._oy = VIEW_H / 2 - (G.cam.x + G.cam.y) * MIL_RZ;
}
function proj(wx, wy, wz) {
  return { x: (wx - wy) * MIL_RZ + G._ox + (G._shx || 0), y: (wx + wy) * MIL_RZ - (wz || 0) * MIL_ZK * MIL_ZOOM + G._oy + (G._shy || 0) };
}
// screen → world ground point (wz=0). uses the shake-free offsets.
function invProj(sx, sy) {
  const rx = (sx - G._ox) / MIL_RZ, ry = (sy - G._oy) / MIL_RZ;
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

// map frame: noisy sea on the W/S coast, rocky ridge on the N/E (masks live in world.js)
function milBorderTile(tx, ty) { return WORLD.isWater(tx, ty) || WORLD.isRock(tx, ty); }
function milBorderKind(tx, ty) { return WORLD.isWater(tx, ty) ? 'water' : 'mountain'; }
function milRockHeight(tx, ty) {
  const n = Math.sin(tx * 0.9) * Math.cos(ty * 0.7) + Math.sin((tx + ty) * 0.5);
  const edge = Math.max(0, 4 - Math.min(ty, WORLD.W - 1 - tx));
  return 8 + edge * 7 + (n + 2) * 8;
}

// ---- building list: real rects with per-building height / palette / linked roof fade ----
// sun-bleached concrete, stucco and brick — daytime Night City
const MIL_WALLS = ['#8f8a7d', '#989181', '#8d8a92', '#83817e', '#9a8f7c', '#7f7d80'];
function milExtractBuildings() {
  MILG.bld = WORLD.bldgs.map(b => {
    const rng = mulberry32(b.x * 977 + b.y * 131);
    // Commandos scale: one or two storeys, everything crowned with a pitched roof
    const shed = b.theme === 'shed';
    const hgt = shed ? 13 + (rng() * 3 | 0) : b.ent ? 19 + (rng() * 5 | 0) : 22 + (rng() * 7 | 0);
    const rise = shed ? 6 + (rng() * 3 | 0) : 9 + (rng() * 6 | 0);
    const wall = b.ent ? milMix(MIL_WALLS[(rng() * 6) | 0], b.roof, 0.14) : MIL_WALLS[(rng() * 6) | 0];
    let roofIdx = null;
    if (b.ent) { const i = WORLD.roofs.findIndex(r => r.tx0 === b.x && r.ty0 === b.y); if (i >= 0) roofIdx = i; }
    return {
      b, hgt, wall, roofIdx, shed, gable: !shed, rise,
      x0: b.x * TILE, y0: b.y * TILE, x1: (b.x + b.w) * TILE, y1: (b.y + b.h) * TILE,
      seed: b.x * 7451 + b.y * 977,
      fS: null, fE: null, roofN: null, roofS: null, roofCv: null, ant: null,
    };
  });
  // sign boards mount above the ridge of their building
  for (const sg of WORLD.signs) {
    const bb = MILG.bld.find(B => sg.x >= B.x0 && sg.x <= B.x1 && sg.y >= B.y0 - 4 && sg.y <= B.y1 + 4);
    sg._mh = bb ? bb.hgt + (bb.rise || 0) : 24;
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

  // ============ ORGANIC TERRAIN — no grid, ever (the Commandos read) ============
  const WPX = W * TILE, HPX = H * TILE;
  const jit = (tx, ty, s, a) => (_n2(tx, ty, s) - 0.5) * a;

  // ---- 1. packed-dirt country base: subtle tonal drift, heavy fine grain ----
  c.fillStyle = '#8b7d63'; c.fillRect(0, 0, WPX, HPX);
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const n = fbm2(tx / 7, ty / 7, 51);
    c.fillStyle = milRgba(n < 0.5 ? '#584e3e' : '#a89a7c', Math.min(0.22, Math.abs(n - 0.5) * 0.55));
    c.beginPath(); c.ellipse(tx * TILE + 8 + jit(tx, ty, 3, 10), ty * TILE + 8 + jit(tx, ty, 4, 10), 16 + jit(tx, ty, 5, 6), 13 + jit(tx, ty, 6, 6), _n2(tx, ty, 7) * 3, 0, 7); c.fill();
  }
  const rnd2 = mulberry32(909);
  for (let k = 0; k < 26000; k++) {                                       // ground grain
    const x = rnd2() * WPX, y = rnd2() * HPX;
    c.fillStyle = rnd2() < 0.5 ? 'rgba(255,244,220,0.07)' : 'rgba(48,40,30,0.09)';
    c.fillRect(x, y, 0.8 + rnd2() * 1.2, 0.8 + rnd2() * 0.8);
  }
  for (let k = 0; k < 2600; k++) {                                        // pebbles w/ light caps
    const x = rnd2() * WPX, y = rnd2() * HPX, s = 1 + rnd2() * 1.6;
    c.fillStyle = 'rgba(60,52,40,0.5)'; c.fillRect(x, y, s, s * 0.8);
    c.fillStyle = 'rgba(240,230,205,0.35)'; c.fillRect(x, y, s * 0.7, s * 0.3);
  }
  for (let k = 0; k < 1100; k++) {                                        // faint scuffs
    const x = rnd2() * WPX, y = rnd2() * HPX, a = rnd2() * 3.14, l = 3 + rnd2() * 7;
    c.strokeStyle = rnd2() < 0.5 ? 'rgba(60,50,38,0.10)' : 'rgba(240,230,205,0.07)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }

  // ---- 2. grass meadows: low-contrast layered blobs + dense stubble ----
  for (let pass = 0; pass < 2; pass++) for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (T[ty * W + tx] !== WT.PARK) continue;
    const gx = tx * TILE + 8 + jit(tx, ty, 61 + pass, 12), gy = ty * TILE + 8 + jit(tx, ty, 62 + pass, 12);
    c.fillStyle = pass === 0 ? '#4f5f38' : milRgba(_n2(tx, ty, 64) < 0.5 ? '#445430' : '#5c6c40', 0.65);
    c.beginPath(); c.ellipse(gx, gy, (pass ? 11 : 15) + jit(tx, ty, 65 + pass, 5), (pass ? 9 : 12.5) + jit(tx, ty, 66 + pass, 5), _n2(tx, ty, 67) * 3, 0, 7); c.fill();
  }
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {         // stubble + worn dirt breaks
    if (T[ty * W + tx] !== WT.PARK) continue;
    const r = mulberry32(tx * 733 + ty * 91);
    for (let k = 0; k < 7; k++) {
      c.fillStyle = r() < 0.5 ? 'rgba(130,148,84,0.30)' : 'rgba(34,44,22,0.28)';
      c.fillRect(tx * TILE + r() * 15, ty * TILE + r() * 15, 0.9, 1.6 + r());
    }
    if (r() < 0.10) { c.fillStyle = 'rgba(128,108,78,0.5)'; c.beginPath(); c.ellipse(tx * TILE + r() * 16, ty * TILE + r() * 16, 3 + r() * 3.5, 2 + r() * 2, r() * 3, 0, 7); c.fill(); }
  }

  // ---- 3. paved compound yards: aged concrete, tone-tinted + gravel grain ----
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (T[ty * W + tx] !== WT.PLAZA) continue;
    c.fillStyle = '#89816f';
    c.beginPath(); c.ellipse(tx * TILE + 8 + jit(tx, ty, 72, 6), ty * TILE + 8 + jit(tx, ty, 73, 6), 14, 12, 0, 0, 7); c.fill();
  }
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (T[ty * W + tx] !== WT.PLAZA) continue;
    const px2 = tx * TILE, py2 = ty * TILE;
    const n = fbm2(tx / 5, ty / 5, 71);
    c.fillStyle = milRgba(n < 0.5 ? '#5c5648' : '#a29a88', Math.min(0.16, Math.abs(n - 0.5) * 0.5));
    c.beginPath(); c.ellipse(px2 + 8, py2 + 8, 13, 11, 0, 0, 7); c.fill();
    const r = mulberry32(tx * 511 + ty * 77);
    for (let k = 0; k < 6; k++) { c.fillStyle = r() < 0.5 ? 'rgba(250,242,222,0.06)' : 'rgba(50,46,38,0.09)'; c.fillRect(px2 + r() * 15, py2 + r() * 15, 1, 1); }
    if (r() < 0.26) { c.strokeStyle = 'rgba(52,48,42,0.3)'; c.lineWidth = 0.7; c.beginPath(); const x0 = px2 + r() * 12, y0 = py2 + r() * 12; c.moveTo(x0, y0); c.lineTo(x0 + (r() - 0.3) * 14, y0 + r() * 10); c.stroke(); }
    if (r() < 0.12) { c.fillStyle = 'rgba(70,62,50,0.25)'; c.beginPath(); c.ellipse(px2 + 8, py2 + 8, 4 + r() * 4, 3 + r() * 3, r() * 3, 0, 7); c.fill(); }
    if (r() < 0.10) { c.fillStyle = 'rgba(118,150,84,0.3)'; c.fillRect(px2 + r() * 14, py2 + r() * 14, 1.4, 1); } // weeds
  }

  // ---- 4. interior floors get a neutral underlay (repainted by the interior pass) ----
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const v = T[ty * W + tx];
    if (v === WT.FLOOR || v === WT.DOOR) { c.fillStyle = '#57503f'; c.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
  }

  // ---- 5. sea: depth bands, chop, foam along the shore, wet sand ----
  const landNear = (tx, ty, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && !WORLD.isWater(x, y)) return true;
    }
    return false;
  };
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!WORLD.isWater(tx, ty)) continue;
    const d = landNear(tx, ty, 1) ? 0 : landNear(tx, ty, 3) ? 1 : 2;
    c.fillStyle = ['#2e6a76', '#215562', '#173f4c'][d];
    c.fillRect(tx * TILE - 2, ty * TILE - 2, TILE + 4, TILE + 4);
  }
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!WORLD.isWater(tx, ty)) continue;
    const r = mulberry32(tx * 397 + ty * 59);
    for (let k = 0; k < 2; k++) { c.fillStyle = 'rgba(200,230,235,0.10)'; c.fillRect(tx * TILE + r() * 13, ty * TILE + r() * 14, 3 + r() * 5, 1); }
    if (landNear(tx, ty, 1)) { c.fillStyle = 'rgba(235,245,240,0.35)'; for (let k = 0; k < 3; k++) c.fillRect(tx * TILE + r() * 13, ty * TILE + r() * 13, 2 + r() * 3, 1.2); }
  }
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {         // wet-sand rim on land
    if (WORLD.isWater(tx, ty) || !((WORLD.isWater(tx - 1, ty) || WORLD.isWater(tx + 1, ty) || WORLD.isWater(tx, ty - 1) || WORLD.isWater(tx, ty + 1)))) continue;
    c.fillStyle = 'rgba(120,100,70,0.55)';
    c.beginPath(); c.ellipse(tx * TILE + 8, ty * TILE + 8, 12, 10, 0, 0, 7); c.fill();
  }

  // ---- 6. rocky ridge ground (N/E frame) ----
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!WORLD.isRock(tx, ty)) continue;
    const r = mulberry32(tx * 211 + ty * 83);
    c.fillStyle = milMix('#7a6c52', r() < 0.5 ? '#8d8062' : '#5f5440', 0.4);
    c.beginPath(); c.ellipse(tx * TILE + 8 + jit(tx, ty, 81, 8), ty * TILE + 8 + jit(tx, ty, 82, 8), 13, 11, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(40,34,24,0.3)'; c.fillRect(tx * TILE + r() * 12, ty * TILE + r() * 12, 3 + r() * 4, 1.2);
  }

  // ---- 7. roads: stroked curves — soft margins, wheel ruts, worn paint ----
  const strokePath = (pts, off, width, style) => {
    c.strokeStyle = style; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      let x = pts[i].x, y = pts[i].y;
      if (off) {
        const q = pts[Math.min(i + 1, pts.length - 1)], p0 = pts[Math.max(0, i - 1)];
        const dx = q.x - p0.x, dy = q.y - p0.y, L = Math.hypot(dx, dy) || 1;
        x -= dy / L * off; y += dx / L * off;
      }
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  };
  for (const rd of WORLD.roads) {
    const asphalt = rd.kind === 'asphalt';
    strokePath(rd.pts, 0, rd.w + 9, 'rgba(96,86,66,0.45)');               // dusty verge blending into the dirt
    strokePath(rd.pts, 0, rd.w + 3, asphalt ? '#5a574f' : '#84796a');
    strokePath(rd.pts, 0, rd.w - 3, asphalt ? '#514e48' : '#8d8272');
    strokePath(rd.pts, 0, rd.w * 0.42, asphalt ? '#565349' : '#948a7a');  // crowned centre
    strokePath(rd.pts, rd.w * 0.24, 2.6, asphalt ? 'rgba(40,38,34,0.5)' : 'rgba(96,84,66,0.75)');  // wheel ruts
    strokePath(rd.pts, -rd.w * 0.24, 2.6, asphalt ? 'rgba(40,38,34,0.5)' : 'rgba(96,84,66,0.75)');
    const r = mulberry32(rd.pts.length * 17);
    for (const p of rd.pts) {                                             // potholes / patches / mud
      if (r() < 0.08) { c.fillStyle = 'rgba(48,42,34,0.5)'; c.beginPath(); c.ellipse(p.x + (r() - 0.5) * rd.w * 0.7, p.y + (r() - 0.5) * rd.w * 0.7, 2.5 + r() * 3, 1.8 + r() * 2, r() * 3, 0, 7); c.fill(); }
      if (asphalt && r() < 0.05) { c.fillStyle = 'rgba(80,76,70,0.7)'; c.fillRect(p.x - 4, p.y - 2.4, 8 + r() * 5, 5); }
    }
    if (asphalt) {                                                        // ghost of a centre line
      for (let i = 4; i < rd.pts.length - 4; i += 3) {
        if (r() < 0.35) continue;
        const p = rd.pts[i], q = rd.pts[i + 1];
        const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
        c.strokeStyle = 'rgba(214,206,178,0.30)'; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + dx / L * 6, p.y + dy / L * 6); c.stroke();
      }
    }
  }

  // ---- 8. crop fields: furrow rows like the refs' farmland ----
  for (const f of WORLD.fields) {
    c.fillStyle = 'rgba(96,80,58,0.6)'; c.fillRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4);
    for (let k = 0; k < (f.dir ? f.w : f.h); k += 5) {
      c.fillStyle = '#6e5c42'; f.dir ? c.fillRect(f.x + k, f.y, 2.6, f.h) : c.fillRect(f.x, f.y + k, f.w, 2.6);
      c.fillStyle = 'rgba(255,240,214,0.14)'; f.dir ? c.fillRect(f.x + k + 2.6, f.y, 1, f.h) : c.fillRect(f.x, f.y + k + 2.6, f.w, 1);
      c.fillStyle = 'rgba(90,120,60,0.5)';
      const r = mulberry32(f.x + k);
      for (let s = 4; s < (f.dir ? f.h : f.w) - 4; s += 4 + r() * 3) f.dir ? c.fillRect(f.x + k + 0.6, f.y + s, 1.3, 1.6) : c.fillRect(f.x + s, f.y + k + 0.6, 1.6, 1.3);
    }
  }

  // ---- 9. SOFT SHADOW PASS (short SE, two offsets for a blurred edge) ----
  const shadowPoly = (x0, y0, x1, y1, hh, a) => {
    const dx = hh * MIL_SH.x * a, dy = hh * MIL_SH.y * a;
    c.beginPath();
    c.moveTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1 + dx, y0 + dy);
    c.lineTo(x1 + dx, y1 + dy); c.lineTo(x0 + dx, y1 + dy); c.lineTo(x0, y1);
    c.closePath(); c.fill();
  };
  for (const soft of [1, 0.55]) {
    c.fillStyle = 'rgba(34,32,44,0.16)';
    for (const B of MILG.bld) shadowPoly(B.x0, B.y0, B.x1, B.y1, B.hgt + (B.rise || 0), soft);
    for (const wl of WORLD.walls) shadowPoly(wl.x0, wl.y0, wl.x1, wl.y1, wl.h, soft);
    for (const tr of WORLD.trees) { c.beginPath(); c.ellipse(tr.x + 11 * MIL_SH.x * soft, tr.y + 11 * MIL_SH.y * soft, tr.r * 1.05, tr.r * 0.8, 0, 0, 7); c.fill(); }
    for (const pr of WORLD.props) { c.beginPath(); c.ellipse(pr.x + 7 * MIL_SH.x * soft, pr.y + 7 * MIL_SH.y * soft, pr.kind === 'container' ? 17 : 9, pr.kind === 'container' ? 10 : 6, 0, 0, 7); c.fill(); }
    for (const wk of WORLD.wrecks) { c.beginPath(); c.ellipse(wk.x + 5 * MIL_SH.x * soft, wk.y + 5 * MIL_SH.y * soft, 11, 8, wk.a, 0, 7); c.fill(); }
  }
  c.fillStyle = 'rgba(34,32,44,0.22)';
  for (const L of WORLD.lights) {                                         // lamp pole shadows
    c.save(); c.translate(L.x, L.y); c.rotate(Math.atan2(MIL_SH.y, MIL_SH.x));
    c.fillRect(0, -0.7, 15, 1.4); c.beginPath(); c.ellipse(15.6, 0, 2, 1.2, 0, 0, 7); c.fill();
    c.restore();
  }
  for (const fs of WORLD.fences) {                                        // faint fence lines
    c.strokeStyle = 'rgba(34,32,44,0.13)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(fs.x0 + 2.4, fs.y0 + 2), c.lineTo(fs.x1 + 2.4, fs.y1 + 2); c.stroke();
  }
  // contact AO hugging bases
  c.fillStyle = 'rgba(30,28,26,0.4)';
  for (const B of MILG.bld) { c.fillRect(B.x0, B.y1, B.x1 - B.x0 + 1.4, 1.6); c.fillRect(B.x1, B.y0, 1.6, B.y1 - B.y0 + 1.4); }
  for (const wl of WORLD.walls) { c.fillRect(wl.x0, wl.y1, wl.x1 - wl.x0 + 1, 1.2); c.fillRect(wl.x1, wl.y0, 1.2, wl.y1 - wl.y0 + 1); }

  // ---- 10. wrecks (baked flat shells) + lamp bases + puddles ----
  for (const wk of WORLD.wrecks) {
    c.save(); c.translate(wk.x, wk.y); c.rotate(wk.a);
    c.fillStyle = '#75675a'; milRR(c, -6, -10, 12, 20, 3); c.fill();
    c.fillStyle = '#8d7f6c'; c.fillRect(-5, -9, 10, 4);
    c.fillStyle = '#7d4c2c'; c.fillRect(-5, -3, 4, 6); c.fillRect(2, 3, 3, 5);
    c.fillStyle = '#252a30'; c.fillRect(-4, -5, 8, 4); c.fillRect(-4, 5, 8, 3);
    c.restore();
  }
  for (const L of WORLD.lights) {
    c.fillStyle = '#5c584c'; c.beginPath(); c.ellipse(L.x, L.y, 2.2, 1.5, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(L.x - 1.4, L.y - 0.8, 2.8, 0.7);
  }
  for (const p of WORLD.puddles) {
    c.fillStyle = 'rgba(50,48,44,0.5)'; c.beginPath(); c.ellipse(p.x, p.y + 0.5, p.w / 2 + 0.6, p.h / 2 + 0.5, 0, 0, 7); c.fill();
    c.fillStyle = '#8ba4b0'; c.beginPath(); c.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(235,244,248,0.4)'; c.beginPath(); c.ellipse(p.x - p.w * 0.12, p.y - p.h * 0.1, p.w / 3.6, p.h / 4.2, 0, 0, 7); c.fill();
  }

  // ---- 11. worn footpath from each compound gate toward the road ----
  for (const B of MILG.bld) {
    if (!B.b.ent || !B.b.doors) continue;
    for (const dtx of B.b.doors) {
      const dx = dtx * TILE + 8;
      c.strokeStyle = 'rgba(150,132,104,0.4)'; c.lineWidth = 7; c.lineCap = 'round';
      c.beginPath(); c.moveTo(dx, B.y1 + 2); c.lineTo(dx + 4, B.y1 + 26); c.stroke();
      c.strokeStyle = 'rgba(110,96,74,0.35)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(dx - 1, B.y1 + 2); c.lineTo(dx + 3, B.y1 + 26); c.stroke();
    }
  }

  // ---- 12. interiors + thresholds ----
  for (const B of MILG.bld) if (B.b.ent) milBakeInterior(c, B);
  for (const B of MILG.bld) {
    if (!B.b.ent || !B.b.doors) continue;
    for (const dtx of B.b.doors) {
      const dx = dtx * TILE;
      c.fillStyle = '#6a6458'; c.fillRect(dx + 2, B.y1 - 3, 12, 6);
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(dx + 2, B.y1 - 3, 12, 1.2);
    }
  }
}

// interiors mirror _bakeInterior's furniture geometry (WORLD.obst rects), realistic coats
function milBakeInterior(c, B) {
  const b = B.b, px = B.x0, py = B.y0, pw = B.x1 - B.x0, ph = B.y1 - B.y0;
  const fx = px + TILE, fy = py + TILE, fw = pw - 2 * TILE, fh = ph - 2 * TILE, cx = fx + fw / 2;
  c.fillStyle = '#2b2925'; c.fillRect(px, py, pw, ph);
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
    B.fS = milFacade(B.x1 - B.x0, B.hgt, B, 's', 0);
    B.fE = milFacade(B.y1 - B.y0, B.hgt, B, 'e', B.gable ? B.rise : 0);  // gable ends carry a pediment
    if (B.gable) { B.roofN = milRoofHalf(B, 0); B.roofS = milRoofHalf(B, 1); }
    else B.roofCv = milRoof(B);
  }
}

// one slope of a gabled roof (ridge runs along x). Terracotta or slate courses along the ridge.
function milRoofHalf(B, south) {
  const w = B.x1 - B.x0, hh = Math.max(2, (B.y1 - B.y0) / 2);
  const cv = mkCanvas(Math.ceil(w * MIL_FK), Math.ceil(hh * MIL_FK)), c = cv.getContext('2d');
  c.setTransform(MIL_FK, 0, 0, MIL_FK, 0, 0);
  const rng = mulberry32(B.seed + (south ? 501 : 149));
  const slate = B.b.roof.includes('60') || B.b.roof === '#65605a';
  const base = milMix(B.b.roof, south ? '#e8d0a8' : '#3c3a44', south ? 0.16 : 0.22); // lit slope vs sky slope
  c.fillStyle = base; c.fillRect(0, 0, w, hh);
  // tile courses parallel to the ridge
  const step = slate ? 2.6 : 2.2;
  for (let v = 0; v < hh; v += step) {
    c.fillStyle = 'rgba(40,26,20,0.30)'; c.fillRect(0, south ? v : hh - v - 1, w, 0.9);
    c.fillStyle = 'rgba(255,240,220,0.10)'; c.fillRect(0, (south ? v : hh - v - 1) + 1, w, 0.7);
    for (let u = ((v * 7) % step); u < w; u += 4.6) {                     // staggered tile joints
      c.fillStyle = 'rgba(40,26,20,0.16)'; c.fillRect(u, south ? v : hh - v - 1, 0.7, step);
    }
  }
  for (let k = 0; k < w / 3; k++) {                                       // weathered / swapped tiles
    c.fillStyle = milMix(base, rng() < 0.5 ? '#ffffff' : '#301c14', 0.14 + rng() * 0.1);
    c.fillRect(rng() * w, rng() * hh, 2 + rng() * 3, 1.6);
  }
  c.fillStyle = 'rgba(90,110,70,0.18)';                                   // moss creep near the eave
  for (let k = 0; k < w / 6; k++) c.beginPath(), c.ellipse(rng() * w, (south ? hh : 0) + (south ? -1 : 1) * rng() * 3, 2 + rng() * 3, 1.2, 0, 0, 7), c.fill();
  // ridge cap on the ridge-side edge, drip edge on the eave side
  c.fillStyle = milMix(base, '#2a2018', 0.35); c.fillRect(0, south ? 0 : hh - 1.6, w, 1.6);
  c.fillStyle = 'rgba(255,244,225,0.35)'; c.fillRect(0, south ? 1.6 : hh - 2.2, w, 0.7);
  c.fillStyle = 'rgba(20,16,12,0.4)'; c.fillRect(0, south ? hh - 1 : 0, w, 1);
  // chimney with its little cast shadow (south half only, so it reads against the sky slope)
  if (south && w > 60 && rng() < 0.8) {
    const cx2 = 8 + rng() * (w - 18);
    c.fillStyle = 'rgba(20,16,12,0.35)'; c.fillRect(cx2 - 2.4, 2.2, 6.5, 4.6);
    c.fillStyle = '#7a5844'; c.fillRect(cx2, 1, 5, 4.5);
    c.fillStyle = '#94705a'; c.fillRect(cx2, 1, 5, 1.2);
    c.fillStyle = '#3a3026'; c.fillRect(cx2 + 0.8, 0, 1.4, 1.4); c.fillRect(cx2 + 2.9, 0, 1.4, 1.4);
  }
  return cv;
}

function milFacade(len, hgt, B, dir, padTop) {
  padTop = padTop || 0;
  const b = B.b, cv = mkCanvas(Math.ceil(len * MIL_FK), Math.ceil((hgt + padTop) * MIL_FK)), c = cv.getContext('2d');
  c.setTransform(MIL_FK, 0, 0, MIL_FK, 0, 0);
  const rng = mulberry32(B.seed + (dir === 's' ? 5 : 811));
  // overcast sun model: east faces a touch warmer, south faces a touch cooler
  const lit = dir === 'e';
  const wall = lit ? milMix(B.wall, '#f4e2c4', 0.16) : milMix(B.wall, '#4c5468', 0.22);
  if (padTop) {                                                            // gable pediment above the wall plate
    c.fillStyle = milMix(wall, '#000000', 0.10);
    c.beginPath(); c.moveTo(-0.5, padTop + 0.5); c.lineTo(len / 2, 0); c.lineTo(len + 0.5, padTop + 0.5); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(56,42,30,0.55)'; c.lineWidth = 1;                // bargeboards
    c.beginPath(); c.moveTo(0, padTop); c.lineTo(len / 2, 0.5); c.lineTo(len, padTop); c.stroke();
    c.fillStyle = 'rgba(28,24,20,0.6)';                                    // attic vent
    c.beginPath(); c.arc(len / 2, padTop * 0.6, Math.min(2.2, padTop * 0.24), 0, 7); c.fill();
    c.lineWidth = 1;
  }
  c.translate(0, padTop);                                                  // wall paints in its own frame below
  const g = c.createLinearGradient(0, 0, 0, hgt);
  g.addColorStop(0, milMix(wall, '#ffffff', 0.12)); g.addColorStop(0.3, wall); g.addColorStop(1, milMix(wall, '#2a2c38', 0.22));
  c.fillStyle = g; c.fillRect(0, 0, len, hgt);
  // material grime + panel seams
  for (let x = 13; x < len - 3; x += 14) { c.fillStyle = 'rgba(40,38,34,0.22)'; c.fillRect(x, 0, 1, hgt); }
  for (let k = 0; k < len / 3; k++) { c.fillStyle = rng() < 0.5 ? 'rgba(255,252,240,0.05)' : 'rgba(40,38,32,0.14)'; c.fillRect(rng() * len, rng() * hgt, 1 + rng() * 2.5, 1); }
  for (let k = 0; k < len / 16; k++) { c.fillStyle = 'rgba(50,46,40,0.16)'; const sx2 = rng() * len; c.fillRect(sx2, 0, 1 + rng() * 2, 3 + rng() * hgt * 0.5); } // rain streaks off the parapet
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, hgt - 1, len, 1);
  // window floors (leave a ground floor of 13px)
  const gf = 13, floors = Math.max(1, ((hgt - gf - 4) / 9) | 0);
  for (let fl2 = 0; fl2 < floors; fl2++) {
    const wy = 4 + fl2 * ((hgt - gf - 6) / floors);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(1, wy + 6, len - 2, 1);            // sill ledge
    c.fillStyle = 'rgba(30,30,36,0.18)'; c.fillRect(1, wy + 7, len - 2, 0.8);             // sill shadow
    for (let wx = 4; wx < len - 7; wx += 7) {
      const r2 = rng();
      c.fillStyle = 'rgba(34,34,40,0.9)'; c.fillRect(wx - 0.8, wy - 0.8, 5.6, 6.8);       // frame
      const wg = c.createLinearGradient(wx, wy, wx + 4, wy + 5);                          // sky-glass
      if (r2 < 0.72) {
        wg.addColorStop(0, lit ? '#cfe2ec' : '#8fa4b6'); wg.addColorStop(0.55, lit ? '#8fb4c8' : '#5c7284'); wg.addColorStop(1, lit ? '#5a7a90' : '#3c4e5e');
        c.fillStyle = wg; c.fillRect(wx, wy, 4, 5);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.moveTo(wx, wy + 3.4); c.lineTo(wx + 2.4, wy); c.lineTo(wx + 3.4, wy); c.lineTo(wx, wy + 4.6); c.closePath(); c.fill();
      } else if (r2 < 0.86) { c.fillStyle = '#1c222c'; c.fillRect(wx, wy, 4, 5); }         // dark interior
      else { c.fillStyle = '#10141c'; c.fillRect(wx, wy, 4, 5); c.fillStyle = 'rgba(255,190,110,0.5)'; c.fillRect(wx + 0.6, wy + 1, 2.8, 3); } // someone's home
      c.fillStyle = 'rgba(40,40,46,0.7)'; c.fillRect(wx + 1.7, wy, 0.6, 5);               // mullion
    }
  }
  // drainpipe
  if (rng() < 0.6) { const px2 = 3 + rng() * (len - 8); c.fillStyle = 'rgba(30,28,26,0.55)'; c.fillRect(px2, 0, 2, hgt); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(px2, 0, 0.8, hgt); }
  // AC units w/ hard sun shadows + drip stains
  for (let k = 0; k < len / 30; k++) {
    if (rng() < 0.3) continue;
    const ax = 4 + rng() * (len - 12), ay = 6 + rng() * (hgt - gf - 14);
    c.fillStyle = 'rgba(20,22,30,0.4)'; c.fillRect(ax - 1.6, ay + 1, 8, 6);               // cast shadow
    c.fillStyle = lit ? '#9aa0a8' : '#666c78'; c.fillRect(ax, ay, 6.5, 5);
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(ax, ay, 6.5, 1);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(ax + 1, ay + 2, 4.5, 0.8); c.fillRect(ax + 1, ay + 3.6, 4.5, 0.8);
    c.fillStyle = 'rgba(46,42,38,0.35)'; c.fillRect(ax + 2.4, ay + 5, 1.2, Math.min(9, hgt - ay - 6));
  }
  // ground floor
  const gy0 = hgt - gf;
  c.fillStyle = milMix(wall, '#3a3834', 0.3); c.fillRect(0, gy0, len, gf);
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, gy0, len, 1);
  if (b.ent && dir === 's') {
    // shop front: striped awning over glazing + doors
    const aw1 = b.neon || '#b0483a', aw2 = '#e8e2d4';
    for (let sx2 = 2; sx2 < len - 2; sx2 += 6) { c.fillStyle = ((sx2 / 6) | 0) % 2 ? milRgba(aw1, 0.95) : aw2; c.fillRect(sx2, gy0 + 0.5, Math.min(6, len - 2 - sx2), 3.6); }
    for (let sx2 = 2; sx2 < len - 2; sx2 += 3) { c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.arc(sx2 + 1.5, gy0 + 4.1, 1.5, 0, Math.PI); c.fill(); } // scalloped hem
    c.fillStyle = 'rgba(20,22,28,0.35)'; c.fillRect(2, gy0 + 4.6, len - 4, 1.2);          // awning shadow
    const gg = c.createLinearGradient(0, gy0 + 6, 0, hgt);
    gg.addColorStop(0, '#b9cdd8'); gg.addColorStop(1, '#5c7280');
    c.fillStyle = gg; c.fillRect(3, gy0 + 6, len - 6, gf - 7);
    c.fillStyle = 'rgba(255,255,255,0.35)'; for (let mx = 8; mx < len - 6; mx += 12) { c.beginPath(); c.moveTo(mx, hgt - 1); c.lineTo(mx + 4, gy0 + 6); c.lineTo(mx + 5.4, gy0 + 6); c.lineTo(mx + 1.4, hgt - 1); c.closePath(); c.fill(); }
    c.fillStyle = 'rgba(34,34,40,0.8)'; for (let mx = 10; mx < len - 6; mx += 12) c.fillRect(mx, gy0 + 6, 1, gf - 7);
    for (const dtx of b.doors || []) {
      const dx = dtx * TILE - B.x0;
      c.fillStyle = '#3c3630'; c.fillRect(dx + 1, gy0 + 5, 14, gf - 5);
      const dg = c.createLinearGradient(0, gy0 + 5, 0, hgt); dg.addColorStop(0, '#e8d8b8'); dg.addColorStop(1, '#a8804e');
      c.fillStyle = dg; c.fillRect(dx + 3, gy0 + 6, 10, gf - 6);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(dx + 7.6, gy0 + 6, 0.8, gf - 6);
    }
  } else {
    if (rng() < 0.45) { // roll-up service door
      const rx = 4 + rng() * Math.max(1, len - 26);
      c.fillStyle = lit ? '#8a8478' : '#5c5a56'; c.fillRect(rx, gy0 + 2, 18, gf - 2);
      c.fillStyle = 'rgba(0,0,0,0.28)'; for (let ry = gy0 + 3; ry < hgt - 1; ry += 2) c.fillRect(rx, ry, 18, 0.8);
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(rx - 1, gy0 + 2, 1, gf - 2); c.fillRect(rx + 18, gy0 + 2, 1, gf - 2);
    }
    if (rng() < 0.45) { // small gang tag near the wall base
      const tag = NEON[rng() * NEON.length | 0], tx2 = 3 + rng() * Math.max(1, len - 14), gy2 = hgt - 7;
      c.strokeStyle = milRgba(tag, 0.5); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(tx2, gy2 + 4); c.quadraticCurveTo(tx2 + 3, gy2, tx2 + 5.5, gy2 + 3.4); c.quadraticCurveTo(tx2 + 8, gy2 + 5.4, tx2 + 10, gy2 + 2); c.stroke();
      c.lineWidth = 1;
    }
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let vx = 6; vx < len - 8; vx += 22) { if (rng() < 0.5) { c.fillRect(vx, gy0 + 4, 8, 5); c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(vx, gy0 + 4, 8, 1); c.fillStyle = 'rgba(0,0,0,0.3)'; } }
  }
  // parapet cap + unlit neon tube along it
  c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(0, 0, len, 1.2);
  if (b.neon) c.fillStyle = milRgba(b.neon, 0.55), c.fillRect(0, 1.4, len, 1);
  return cv;
}

function milRoof(B) {
  const w = B.x1 - B.x0, h = B.y1 - B.y0, cv = mkCanvas(w * MIL_FK, h * MIL_FK), c = cv.getContext('2d');
  c.setTransform(MIL_FK, 0, 0, MIL_FK, 0, 0);
  const rng = mulberry32(B.seed + 77);
  if (B.shed) {
    // corrugated mono-pitch: seams run down the slope (along y), sun grazes from the NE
    const base = milMix(milMix(B.b.roof, '#9a8a74', 0.75), '#ffe0b0', 0.18);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, milMix(base, '#fff4dc', 0.30)); g.addColorStop(1, milMix(base, '#4c4438', 0.25));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3.2) {
      c.fillStyle = 'rgba(255,250,235,0.16)'; c.fillRect(x, 0, 1, h);
      c.fillStyle = 'rgba(40,36,30,0.22)'; c.fillRect(x + 1.8, 0, 1, h);
    }
    for (let k = 0; k < w / 5; k++) { c.fillStyle = 'rgba(150,90,50,0.28)'; c.fillRect(rng() * w, rng() * h, 1.5 + rng() * 3, 1 + rng() * 2); } // rust
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, 0, w, 1.4);           // ridge flashing
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, h - 1.4, w, 1.4);            // eave gutter
    if (rng() < 0.7) { // stove pipe
      const px2 = 6 + rng() * (w - 12), py2 = 4 + rng() * (h * 0.4);
      c.fillStyle = 'rgba(20,20,26,0.35)'; c.beginPath(); c.ellipse(px2 - 2.4, py2 + 2.6, 3, 1.6, 0.5, 0, 7); c.fill();
      c.fillStyle = '#6a6e76'; c.beginPath(); c.ellipse(px2, py2, 1.8, 1.8, 0, 0, 7); c.fill();
      c.fillStyle = '#2c2e34'; c.beginPath(); c.ellipse(px2, py2, 1, 1, 0, 0, 7); c.fill();
    }
    B.ant = null;
    return cv;
  }
  // flat roof: sun-baked gravel/membrane, parapet lit on the NE, clutter casting SW shadows
  const base = milMix(B.b.roof, '#8e887a', 0.7);
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let k = 0; k < w * h / 30; k++) { c.fillStyle = rng() < 0.5 ? 'rgba(255,250,238,0.06)' : 'rgba(50,46,40,0.12)'; c.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1); }
  for (let k = 0; k < w * h / 700; k++) { c.fillStyle = 'rgba(70,64,54,0.14)'; c.beginPath(); c.ellipse(rng() * w, rng() * h, 3 + rng() * 6, 2 + rng() * 4, rng() * 3, 0, 7); c.fill(); } // ponding stains
  // membrane seams
  c.fillStyle = 'rgba(60,56,48,0.2)'; for (let x = 12; x < w; x += 16) c.fillRect(x, 2, 1, h - 4);
  // parapet: NE edges catch sun, SW inner edge shades
  c.fillStyle = milMix(base, '#fff2d0', 0.4); c.fillRect(0, 0, w, 2); c.fillRect(w - 2, 0, 2, h);
  c.fillStyle = milMix(base, '#ffffff', 0.14); c.fillRect(0, h - 2, w, 2); c.fillRect(0, 0, 2, h);
  c.fillStyle = 'rgba(30,28,36,0.35)'; c.fillRect(2, 2, w - 4, 1); c.fillRect(2, 2, 1, h - 4);
  const shBox = (x, y, bw, bh, col) => {
    c.fillStyle = 'rgba(24,26,40,0.4)'; c.fillRect(x - bh * 0.6, y + bh * 0.4, bw + bh * 0.4, bh);  // SW cast
    c.fillStyle = col; c.fillRect(x, y, bw, bh);
    c.fillStyle = milMix(col, '#fff4d8', 0.35); c.fillRect(x, y, bw, 1.2);
    c.fillStyle = milMix(col, '#20222c', 0.3); c.fillRect(x, y + bh - 1, bw, 1);
  };
  for (let k = 0; k < (w * h) / 800 + 1; k++) {
    const x = 6 + rng() * (w - 18), y = 6 + rng() * (h - 16);
    if (rng() < 0.5) { shBox(x, y, 8, 6, '#9aa0a8'); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 1, y + 2, 6, 0.9); c.fillRect(x + 1, y + 4, 6, 0.9); }
    else { shBox(x, y, 5.5, 5.5, '#8a9098'); c.fillStyle = '#3c4048'; c.beginPath(); c.ellipse(x + 2.7, y + 2.7, 1.7, 1.7, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(x + 2.3, y + 2.3, 0.6, 0.6, 0, 0, 7); c.fill(); }
  }
  // water tank on the bigger roofs
  if (w > 90 && rng() < 0.75) {
    const x = 14 + rng() * (w - 32), y = 12 + rng() * (h - 26);
    c.fillStyle = 'rgba(24,26,40,0.42)'; c.beginPath(); c.ellipse(x - 5, y + 4.5, 8, 6, 0.5, 0, 7); c.fill();
    c.fillStyle = '#7c6450'; c.beginPath(); c.ellipse(x, y, 7, 6, 0, 0, 7); c.fill();
    c.fillStyle = '#a08468'; c.beginPath(); c.ellipse(x + 1.6, y - 1.4, 4.2, 3.4, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(40,32,24,0.5)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(x, y, 5.4, 4.4, 0, 0, 7); c.stroke(); c.lineWidth = 1;
  }
  // skylight for the enterable ones
  if (B.b.ent) {
    c.fillStyle = 'rgba(24,26,40,0.4)'; c.fillRect(w / 2 - 8.4, h / 2 - 4, 15, 10);
    c.fillStyle = '#2e3844'; c.fillRect(w / 2 - 7, h / 2 - 5, 14, 10);
    const sg = c.createLinearGradient(w / 2 - 6, h / 2 - 4, w / 2 + 6, h / 2 + 4);
    sg.addColorStop(0, '#c8dce8'); sg.addColorStop(1, '#5a7284');
    c.fillStyle = sg; c.fillRect(w / 2 - 6, h / 2 - 4, 12, 8);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.moveTo(w / 2 - 6, h / 2 + 2); c.lineTo(w / 2 - 1, h / 2 - 4); c.lineTo(w / 2 + 1, h / 2 - 4); c.lineTo(w / 2 - 4, h / 2 + 4); c.closePath(); c.fill();
  }
  B.ant = rng() < 0.6 ? { x: B.x0 + 6 + rng() * (w - 12), y: B.y0 + 6 + rng() * (h - 12) } : null;
  return cv;
}

// =====================================================================
// per-frame building draw: two slanted facades + rotated roof + antenna
// =====================================================================
function milDrawBuilding(c, B, alpha) {
  const Z = MIL_ZOOM, zh = B.hgt * MIL_ZK * Z, rh = B.rise * MIL_ZK * Z, RZ = MIL_R * Z, ZKZ = MIL_ZK * Z;
  const pS = proj(B.x0, B.y1, 0), pE = proj(B.x1, B.y0, 0), pN = proj(B.x0, B.y0, 0);
  if (alpha < 1) c.globalAlpha = alpha;
  // south face: runs along +x → screen dir (R, R); texture y maps straight down.
  // c.transform (not setTransform) so the hi-res base transform composes through.
  c.save();
  c.transform(RZ / MIL_FK, RZ / MIL_FK, 0, ZKZ / MIL_FK, pS.x, pS.y - zh);
  c.drawImage(B.fS, 0, 0);
  c.restore();
  // east face — gable ends carry their pediment in the texture, so it starts higher
  c.save();
  c.transform(-RZ / MIL_FK, RZ / MIL_FK, 0, ZKZ / MIL_FK, pE.x, pE.y - zh - (B.gable ? rh : 0));
  c.drawImage(B.fE, 0, 0);
  c.restore();
  if (B.gable) {
    // pitched roof, ridge along x: two plan half-textures sheared toward/away from the ridge
    const H2 = Math.max(2, (B.y1 - B.y0) / 2), pM = proj(B.x0, (B.y0 + B.y1) / 2, 0);
    c.save();
    c.transform(RZ / MIL_FK, RZ / MIL_FK, -RZ / MIL_FK, (RZ - rh / H2) / MIL_FK, pN.x, pN.y - zh);
    c.drawImage(B.roofN, 0, 0);
    c.restore();
    c.save();
    c.transform(RZ / MIL_FK, RZ / MIL_FK, -RZ / MIL_FK, (RZ + rh / H2) / MIL_FK, pM.x, pM.y - zh - rh);
    c.drawImage(B.roofS, 0, 0);
    c.restore();
  } else {
    // mono-pitch shed: high north eave dropping south; east face gets a flat wedge
    const H = B.y1 - B.y0;
    c.save();
    c.transform(RZ / MIL_FK, RZ / MIL_FK, -RZ / MIL_FK, RZ / MIL_FK + rh / (H * MIL_FK), pN.x, pN.y - zh - rh);
    c.drawImage(B.roofCv, 0, 0);
    c.restore();
    const eN = proj(B.x1, B.y0, 0), eS = proj(B.x1, B.y1, 0);
    c.fillStyle = milMix(B.wall, '#000000', 0.12);
    c.beginPath(); c.moveTo(eN.x, eN.y - zh); c.lineTo(eN.x, eN.y - zh - rh); c.lineTo(eS.x, eS.y - zh); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(eN.x, eN.y - zh - rh); c.lineTo(eS.x, eS.y - zh); c.stroke();
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
  // 4-phase walk: contact-L, passing (also the standing pose), contact-R, passing+bob
  for (const face of ['down', 'up', 'side']) s[face] = [0, 1, 2, 3].map(ph => milPaintActor(face, ph, o));
  return s;
}
// 12×20 logical figure baked MIL_AS× dense — rounded anatomy, gradients, warm sun key.
// Sampled back down smoothly, so it reads as a small painted person, not pixels.
function milPaintActor(face, ph, o) {
  const S = MIL_AS, cv = mkCanvas(12 * S, 20 * S), c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  if (ph === 1 || ph === 3) c.translate(0, -0.3);                          // passing pose rides a touch higher
  c.lineCap = 'round'; c.lineJoin = 'round';
  const jkD = milMix(o.jacket, '#1a2030', 0.35), jkL = milMix(o.jacket, '#fff2d8', 0.30);
  const skD = milMix(o.skin, '#5a3c30', 0.25), skL = milMix(o.skin, '#fff0d8', 0.22);
  const pnD = milMix(o.pants, '#141824', 0.3);
  const boot = o.boots || '#23252e';
  const sw = [-1, 0.12, 1, -0.12][ph];                                     // walk stride
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

// actor billboard: cast shadow stretched along the sun line + soft contact blob.
// sw/sh = the sprite's LOGICAL size (sources are baked denser and smooth-sampled).
// scale is multiplied by the camera zoom — world actors are Commandos-sized.
function milBill(c, spr, x, y, alpha, scale, flip, shadow, sw, sh) {
  const s = proj(x, y, 0); scale = (scale || 1) * MIL_ZOOM; sw = sw || 12; sh = sh || 20;
  if (shadow !== false) {
    c.fillStyle = 'rgba(18,22,44,0.35)';
    c.beginPath(); c.ellipse(s.x - 3.4 * scale, s.y + 0.5, 5.6 * scale, 1.7 * scale, 0.12, 0, 7); c.fill();
    c.fillStyle = 'rgba(14,18,36,0.3)';
    c.beginPath(); c.ellipse(s.x, s.y + 0.4, 2.6 * scale, 1.2 * scale, 0, 0, 7); c.fill();
  }
  c.save(); if (alpha != null) c.globalAlpha = alpha;
  c.translate(s.x, s.y + 0.5);
  if (flip) c.scale(-scale, scale); else c.scale(scale, scale);
  c.drawImage(spr, -sw / 2, -sh, sw, sh);
  c.restore(); c.globalAlpha = 1;
}

function milPh(a) { return Math.floor(a * 2) % 4; }   // 4-phase walk from the sim's anim counter

// axis-aligned prism (crate / vend / rock): plan square → rotated diamond + straight sides.
// z0 lifts the whole box (stacked cargo). Heights are world-z; the camera zoom applies here.
function milPrism(c, x0, y0, x1, y1, h, top, lt, dk, alpha, z0) {
  const zh = h * MIL_ZK * MIL_ZOOM, zb = (z0 || 0) * MIL_ZK * MIL_ZOOM;
  const gN = proj(x0, y0, 0), gE = proj(x1, y0, 0), gS = proj(x1, y1, 0), gW = proj(x0, y1, 0);
  if (alpha != null && alpha < 1) c.globalAlpha = alpha;
  c.fillStyle = dk; c.beginPath(); c.moveTo(gW.x, gW.y - zb); c.lineTo(gS.x, gS.y - zb); c.lineTo(gS.x, gS.y - zb - zh); c.lineTo(gW.x, gW.y - zb - zh); c.closePath(); c.fill();
  c.fillStyle = lt; c.beginPath(); c.moveTo(gE.x, gE.y - zb); c.lineTo(gS.x, gS.y - zb); c.lineTo(gS.x, gS.y - zb - zh); c.lineTo(gE.x, gE.y - zb - zh); c.closePath(); c.fill();
  c.fillStyle = top; c.beginPath(); c.moveTo(gN.x, gN.y - zb - zh); c.lineTo(gE.x, gE.y - zb - zh); c.lineTo(gS.x, gS.y - zb - zh); c.lineTo(gW.x, gW.y - zb - zh); c.closePath(); c.fill();
  c.globalAlpha = 1;
}

// ============ Commandos prop kit (depth-sorted world objects) ============
function milTreeCv(tr) {
  if (tr._cv) return tr._cv;
  const R = tr.r, w = R * 2.7, h = R * 2.2, S = 3;
  const cv = mkCanvas(Math.ceil(w * S), Math.ceil(h * S)), c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  const rng = mulberry32((tr.x * 13 + tr.y * 7) | 0);
  const base = milMix(tr.col || '#3c5426', '#22301a', 0.35), cx = w / 2, cy = h / 2;
  c.fillStyle = milMix(base, '#0c1408', 0.55);                            // dark silhouette mass
  c.beginPath(); c.ellipse(cx, cy, R * 1.2, R * 0.96, 0, 0, 7); c.fill();
  for (let k = 0; k < 22; k++) {                                          // dense dark billows
    const a = rng() * 7, d = rng() * R * 0.66;
    const bx = cx + Math.cos(a) * d, by = cy + Math.sin(a) * d * 0.78;
    c.fillStyle = milMix(base, rng() < 0.5 ? '#31421f' : '#1a2612', 0.4 + rng() * 0.3);
    c.beginPath(); c.ellipse(bx, by, R * (0.26 + rng() * 0.18), R * (0.2 + rng() * 0.14), rng() * 3, 0, 7); c.fill();
  }
  for (let k = 0; k < 12; k++) {                                          // mid-tone leaf clusters
    const a = rng() * 7, d = rng() * R * 0.5;
    c.fillStyle = milRgba(milMix(base, '#55703a', 0.6), 0.6);
    c.beginPath(); c.ellipse(cx + Math.cos(a) * d - R * 0.06, cy + Math.sin(a) * d * 0.7 - R * 0.1, R * 0.15, R * 0.1, rng() * 3, 0, 7); c.fill();
  }
  for (let k = 0; k < 7; k++) {                                           // small top-left sun flecks
    c.fillStyle = 'rgba(168,190,110,0.28)';
    c.beginPath(); c.ellipse(cx - R * 0.16 + (rng() - 0.5) * R * 0.6, cy - R * 0.3 + (rng() - 0.5) * R * 0.35, R * 0.09, R * 0.06, rng() * 3, 0, 7); c.fill();
  }
  c.fillStyle = 'rgba(6,10,4,0.4)';                                       // deep SE underside
  c.beginPath(); c.ellipse(cx + R * 0.24, cy + R * 0.4, R * 0.6, R * 0.32, 0.2, 0, 7); c.fill();
  tr._cv = cv; tr._w = w; tr._h = h;
  return cv;
}
function milDrawTree(c, tr) {
  const Z = MIL_ZOOM, b = proj(tr.x, tr.y, 0);
  c.strokeStyle = '#3c3222'; c.lineWidth = 2 * Z;                          // trunk
  c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + 0.5 * Z, b.y - 7 * Z); c.stroke();
  c.strokeStyle = 'rgba(255,240,210,0.18)'; c.lineWidth = 0.7 * Z;
  c.beginPath(); c.moveTo(b.x - 0.6 * Z, b.y); c.lineTo(b.x, b.y - 7 * Z); c.stroke();
  const cv = milTreeCv(tr), p = proj(tr.x, tr.y, 9 + tr.r * 0.4);
  c.drawImage(cv, p.x - tr._w / 2 * Z, p.y - tr._h / 2 * Z, tr._w * Z, tr._h * Z);
  c.lineWidth = 1;
}

function milDrawWall(c, wl) {
  const Z = MIL_ZOOM, zh = wl.h * MIL_ZK * Z;
  const gE = proj(wl.x1, wl.y0, 0), gS = proj(wl.x1, wl.y1, 0), gW = proj(wl.x0, wl.y1, 0), gN = proj(wl.x0, wl.y0, 0);
  const stone = '#84816c';
  // south + east faces, then the cap course
  c.fillStyle = milMix(stone, '#3e4452', 0.30);
  c.beginPath(); c.moveTo(gW.x, gW.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - zh); c.lineTo(gW.x, gW.y - zh); c.closePath(); c.fill();
  c.fillStyle = milMix(stone, '#efe6c8', 0.14);
  c.beginPath(); c.moveTo(gE.x, gE.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - zh); c.lineTo(gE.x, gE.y - zh); c.closePath(); c.fill();
  c.fillStyle = milMix(stone, '#fff4d8', 0.08);
  c.beginPath(); c.moveTo(gN.x, gN.y - zh); c.lineTo(gE.x, gE.y - zh); c.lineTo(gS.x, gS.y - zh); c.lineTo(gW.x, gW.y - zh); c.closePath(); c.fill();
  // weathered cap: tone patches + coping joints across the top
  const rngT = mulberry32((wl.seed | 0) + 5);
  for (let k = 0; k < (wl.x1 - wl.x0 + wl.y1 - wl.y0) / 26; k++) {
    const u = wl.x0 + rngT() * (wl.x1 - wl.x0), v = wl.y0 + rngT() * (wl.y1 - wl.y0), p = proj(u, v, wl.h);
    c.fillStyle = rngT() < 0.5 ? 'rgba(60,58,48,0.22)' : 'rgba(250,244,224,0.14)';
    c.beginPath(); c.ellipse(p.x, p.y, 4.5 * MIL_ZOOM, 2.2 * MIL_ZOOM, 0.4, 0, 7); c.fill();
  }
  // masonry joints + moss along the base
  const rng = mulberry32(wl.seed | 0), Lx = wl.x1 - wl.x0, Ly = wl.y1 - wl.y0;
  c.strokeStyle = 'rgba(44,42,36,0.35)'; c.lineWidth = 0.6 * Z;
  if (Lx >= Ly) {
    for (let u = wl.x0 + 7; u < wl.x1 - 2; u += 8) {
      const p = proj(u, wl.y1, 0);
      c.beginPath(); c.moveTo(p.x, p.y - zh * (0.2 + rng() * 0.15)); c.lineTo(p.x, p.y - zh * (0.75 + rng() * 0.2)); c.stroke();
    }
    const m0 = proj(wl.x0, wl.y1, 0), m1 = proj(wl.x1, wl.y1, 0);
    c.beginPath(); c.moveTo(m0.x, m0.y - zh * 0.5); c.lineTo(m1.x, m1.y - zh * 0.5); c.stroke();
  } else {
    for (let v = wl.y0 + 7; v < wl.y1 - 2; v += 8) {
      const p = proj(wl.x1, v, 0);
      c.beginPath(); c.moveTo(p.x, p.y - zh * (0.2 + rng() * 0.15)); c.lineTo(p.x, p.y - zh * (0.75 + rng() * 0.2)); c.stroke();
    }
    const m0 = proj(wl.x1, wl.y0, 0), m1 = proj(wl.x1, wl.y1, 0);
    c.beginPath(); c.moveTo(m0.x, m0.y - zh * 0.5); c.lineTo(m1.x, m1.y - zh * 0.5); c.stroke();
  }
  c.fillStyle = 'rgba(92,112,62,0.30)';
  for (let k = 0; k < (Lx + Ly) / 24; k++) {
    const u = wl.x0 + rng() * Lx, v = wl.y1 - rng() * 2;
    const p = proj(Lx >= Ly ? u : wl.x1, Lx >= Ly ? wl.y1 : wl.y0 + rng() * Ly, 0);
    c.beginPath(); c.ellipse(p.x, p.y - zh * 0.18, 2.4 * Z, 1.2 * Z, 0, 0, 7); c.fill();
  }
  c.lineWidth = 1;
}

function milDrawFence(c, f) {
  const Z = MIL_ZOOM;
  const dx = f.x1 - f.x0, dy = f.y1 - f.y0, L = Math.hypot(dx, dy) || 1, n = Math.max(1, Math.round(L / 26));
  c.strokeStyle = 'rgba(34,30,26,0.6)'; c.lineWidth = 0.7 * Z;             // wire runs
  for (const zz of [7.2, 4.8, 2.2]) {
    const p0 = proj(f.x0, f.y0, zz), p1 = proj(f.x1, f.y1, zz);
    c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
  }
  for (let i = 0; i <= n; i++) {
    const x = f.x0 + dx * i / n, y = f.y0 + dy * i / n;
    const b = proj(x, y, 0), t = proj(x, y, 8);
    c.strokeStyle = '#4c4030'; c.lineWidth = 1.4 * Z;
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(t.x, t.y); c.stroke();
    c.fillStyle = 'rgba(255,244,220,0.3)'; c.fillRect(t.x - 0.6 * Z, t.y, 1.2 * Z, 1.2 * Z);
  }
  c.lineWidth = 1;
}

function milDrawProp(c, pr) {
  const Z = MIL_ZOOM, rng = mulberry32(pr.seed | 0), x = pr.x, y = pr.y;
  switch (pr.kind) {
    case 'crates': {   // a little cargo depot: two on the ground, one stacked askew
      milPrism(c, x - 7, y - 6, x + 1, y + 2, 7, '#8a7048', '#6e5838', '#4e3e26');
      milPrism(c, x + 1.5, y - 5, x + 8.5, y + 2, 6, '#93794e', '#75603c', '#52422a');
      milPrism(c, x - 3.5, y - 4.5, x + 3.5, y + 2.5, 6.4, '#9b8158', '#7a6544', '#57472e', 1, 7);
      const t = proj(x, y - 1, 13.4);
      c.fillStyle = 'rgba(40,30,18,0.5)'; c.fillRect(t.x - 4.4 * Z, t.y - 0.5 * Z, 8.8 * Z, Z); // strap
      break;
    }
    case 'barrels': {
      for (const [ox, oy] of [[-3.4, -1.6], [3.2, -2.2], [0.2, 2.6]]) {
        const bx = x + ox, by = y + oy, b = proj(bx, by, 0), t = proj(bx, by, 8);
        const col = rng() < 0.4 ? '#7a3a30' : rng() < 0.7 ? '#4e5c46' : '#5c5a52';
        c.fillStyle = milMix(col, '#20242a', 0.35);
        c.beginPath(); c.moveTo(b.x - 3.4 * Z, b.y); c.lineTo(b.x - 3.4 * Z, t.y); c.lineTo(b.x + 3.4 * Z, t.y); c.lineTo(b.x + 3.4 * Z, b.y); c.closePath(); c.fill();
        c.fillStyle = milMix(col, '#f4e8c8', 0.10);
        c.fillRect(b.x - 3.4 * Z, t.y, 2.2 * Z, b.y - t.y);
        c.fillStyle = 'rgba(30,26,20,0.5)'; c.fillRect(b.x - 3.4 * Z, t.y + (b.y - t.y) * 0.35, 6.8 * Z, 0.8 * Z);
        c.fillStyle = milMix(col, '#fff4d8', 0.3);
        c.beginPath(); c.ellipse(t.x, t.y, 3.4 * Z, 1.9 * Z, 0, 0, 7); c.fill();
        c.fillStyle = 'rgba(40,34,26,0.4)';
        c.beginPath(); c.ellipse(t.x, t.y, 2.2 * Z, 1.1 * Z, 0, 0, 7); c.fill();
      }
      break;
    }
    case 'container': {
      const col = ['#5f4a38', '#44503c', '#54424a', '#3e4a52'][(pr.seed >>> 3) % 4];
      milPrism(c, x - 15, y - 7, x + 15, y + 7, 13, milMix(col, '#f4e6c4', 0.2), milMix(col, '#fff', 0.06), milMix(col, '#141820', 0.35));
      const p0 = proj(x - 13, y + 7, 0), p1 = proj(x + 13, y + 7, 0), zt = 12 * MIL_ZK * Z;
      c.strokeStyle = 'rgba(20,18,14,0.35)'; c.lineWidth = 0.7 * Z;        // corrugation
      for (let k = 1; k < 9; k++) {
        const fx2 = p0.x + (p1.x - p0.x) * k / 9, fy2 = p0.y + (p1.y - p0.y) * k / 9;
        c.beginPath(); c.moveTo(fx2, fy2 - zt * 0.08); c.lineTo(fx2, fy2 - zt * 0.92); c.stroke();
      }
      c.lineWidth = 1;
      break;
    }
    case 'barrier': {
      milPrism(c, x - 10, y - 2.6, x + 10, y + 2.6, 5, '#9a948a', '#7c766c', '#5a554c');
      const t = proj(x, y - 2.6, 5 * 1);
      c.fillStyle = 'rgba(180,140,30,0.6)';
      const b0 = proj(x - 8, y + 2.6, 0), b1 = proj(x + 8, y + 2.6, 0), zb = 5 * MIL_ZK * Z;
      for (let k = 0; k < 4; k++) {
        const fx2 = b0.x + (b1.x - b0.x) * (k * 0.25 + 0.05), fy2 = b0.y + (b1.y - b0.y) * (k * 0.25 + 0.05);
        c.beginPath(); c.moveTo(fx2, fy2 - zb * 0.15); c.lineTo(fx2 + 2.4 * Z, fy2 - zb * 0.85); c.lineTo(fx2 + 4 * Z, fy2 - zb * 0.85); c.lineTo(fx2 + 1.6 * Z, fy2 - zb * 0.15); c.closePath(); c.fill();
      }
      break;
    }
    case 'spool': {
      const b = proj(x, y, 0), t = proj(x, y, 7);
      c.fillStyle = '#6e5a40';
      c.beginPath(); c.ellipse(b.x, b.y, 4.6 * Z, 2.6 * Z, 0, 0, 7); c.fill();
      c.fillStyle = '#57452e'; c.fillRect(b.x - 4.6 * Z, t.y, 9.2 * Z, b.y - t.y);
      c.fillStyle = '#83693f';
      c.beginPath(); c.ellipse(t.x, t.y, 4.6 * Z, 2.6 * Z, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(40,30,18,0.5)'; c.lineWidth = 0.8 * Z;
      c.beginPath(); c.ellipse(t.x, t.y, 3 * Z, 1.7 * Z, 0, 0, 7); c.stroke();
      c.fillStyle = '#3e3222'; c.fillRect(t.x - 0.9 * Z, t.y - 0.9 * Z, 1.8 * Z, 1.8 * Z);
      c.lineWidth = 1;
      break;
    }
  }
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
  for (let k = 0; k < 8; k++) { c.fillStyle = p[2]; c.globalAlpha = kind === 'neon' ? 0.85 : 0.5; c.beginPath(); c.ellipse(4 + rng() * 11, 4 + rng() * 7, 0.9, 0.7, rng() * 3, 0, 7); c.fill(); c.globalAlpha = 1; }
  c.fillStyle = 'rgba(255,248,214,0.28)';                                   // NE sun catch
  c.beginPath(); c.ellipse(13, 6.4, 3.6, 2, 0.4, 0, 7); c.fill();
  c.fillStyle = 'rgba(10,16,8,0.32)';
  c.beginPath(); c.ellipse(6.5, 12, 4.4, 2.2, 0.3, 0, 7); c.fill();
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
    c.fillStyle = 'rgba(22,26,52,0.4)'; c.beginPath(); c.ellipse(sx - 2.6 * sc, sy + 1.2 * sc, 9 * sc, 4 * sc, rot, 0, 7); c.fill();
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
  // ground: hard sun shadow (SW, matching the bake) + tires + dark hull
  c.fillStyle = 'rgba(22,26,52,0.42)';
  c.save(); c.translate(sx - 3.2 * sc, sy + 1.7 * sc); c.rotate(rot); c.scale(sc, sc);
  rrect(-hl - 0.5, -hw - 0.5, hl * 2 + 1, hw * 2 + 1, 3); c.fill();
  c.restore();
  c.save(); c.translate(sx, sy); c.rotate(rot); c.scale(sc, sc);
  c.fillStyle = '#101216';
  for (const u of [hl * 0.58, -hl * 0.58]) for (const v of [-hw - 0.8, hw - 1.4]) { rrect(u - 3.1, v, 6.2, 2.2, 1); c.fill(); }
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

// Commandos-style enemy view cone — solid enough to read on sunlit pavement
function milCone(c, e) {
  const r = enemyRange(e) * 0.45;
  const warm = e.detect > 0.05;
  const col = warm ? '#e08a10' : '#3a9a2e', rim = warm ? '#ffb43c' : '#54c43e';
  const g = c.createRadialGradient(e.x, e.y, 2, e.x, e.y, r);
  g.addColorStop(0, milRgba(col, 0.34 + e.detect * 0.12));
  g.addColorStop(0.75, milRgba(col, 0.20));
  g.addColorStop(1, milRgba(col, 0.05));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(e.x, e.y);
  c.arc(e.x, e.y, r, e.lookA - FOV_HALF, e.lookA + FOV_HALF);
  c.closePath(); c.fill();
  c.strokeStyle = milRgba(rim, 0.55); c.lineWidth = 1;
  c.beginPath(); c.arc(e.x, e.y, r, e.lookA - FOV_HALF, e.lookA + FOV_HALF); c.stroke();
  c.strokeStyle = milRgba(rim, 0.3); c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(e.x, e.y); c.arc(e.x, e.y, r * 0.55, e.lookA - FOV_HALF, e.lookA + FOV_HALF); c.closePath(); c.stroke();
  c.lineWidth = 1;
}
