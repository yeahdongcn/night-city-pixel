'use strict';
// ============ paint.js — every pixel of the Commandos look ============
// Terrain is baked once in plan space and rotate-blitted. Buildings, trees and
// actors are baked to sprites at 2-3× density and depth-sorted per frame.
// Light: soft overcast key from the NW → short SE shadows, moss + grime everywhere.

const TD = 1.3;                       // terrain bake density (px per world unit)
const SHDX = 0.62, SHDY = 0.5;        // shadow direction (plan), short like the refs
let TER = null, TCTX = null;          // the pre-rendered ground

function mkcv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function mixc(a, b, f) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const q = v => Math.round(v).toString(16).padStart(2, '0');
  return '#' + q(((A >> 16) & 255) + (((B >> 16) & 255) - ((A >> 16) & 255)) * f)
             + q(((A >> 8) & 255) + (((B >> 8) & 255) - ((A >> 8) & 255)) * f)
             + q((A & 255) + ((B & 255) - (A & 255)) * f);
}
function rgba(c, a) { const A = parseInt(c.slice(1), 16); return 'rgba(' + ((A >> 16) & 255) + ',' + ((A >> 8) & 255) + ',' + (A & 255) + ',' + a + ')'; }

// ================= TERRAIN =================
function bakeWorld() {
  const W = MAPD.W, H = MAPD.H;
  TER = mkcv(W * TD, H * TD); TCTX = TER.getContext('2d');
  const c = TCTX;
  c.setTransform(TD, 0, 0, TD, 0, 0);   // stays forever: dynamic decals write in plan units
  c.lineCap = 'round'; c.lineJoin = 'round';

  // -- base grass, mottled in big soft drifts --
  c.fillStyle = '#5a6b3e'; c.fillRect(0, 0, W, H);
  for (let gy = 0; gy < H; gy += 26) for (let gx = 0; gx < W; gx += 26) {
    const n = fbm(gx / 260, gy / 260, 11);
    c.fillStyle = rgba(n < 0.5 ? '#43512c' : '#758552', Math.min(0.3, Math.abs(n - 0.5) * 0.9 + 0.04));
    c.beginPath(); c.ellipse(gx + 13 + (h2(gx, gy, 1) - 0.5) * 22, gy + 13 + (h2(gx, gy, 2) - 0.5) * 22, 24 + h2(gx, gy, 3) * 14, 19 + h2(gx, gy, 4) * 12, h2(gx, gy, 5) * 3, 0, 7); c.fill();
  }
  // dry-patch drift (khaki summer grass, very ref1)
  for (let gy = 0; gy < H; gy += 26) for (let gx = 0; gx < W; gx += 26) {
    const n = fbm(gx / 340 + 9, gy / 340, 31);
    if (n < 0.58) continue;
    c.fillStyle = rgba('#8a8a55', Math.min(0.34, (n - 0.58) * 1.4));
    c.beginPath(); c.ellipse(gx + 13, gy + 13, 30, 24, h2(gx, gy, 6) * 3, 0, 7); c.fill();
  }

  // -- dirt aprons: bare ground around every compound / building / road --
  const dirtBlob = (x, y, r, a) => {
    const g = c.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, rgba('#87795b', a)); g.addColorStop(0.75, rgba('#87795b', a * 0.8)); g.addColorStop(1, rgba('#87795b', 0));
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * 0.9, 0, 0, 7); c.fill();
  };
  for (const z of MAPD.dirt) dirtBlob(z.x, z.y, z.r, 0.95);
  for (const b of MAPD.bldgs) dirtBlob(b.x + b.w / 2, b.y + b.d / 2, Math.max(b.w, b.d) * 1.15, 0.9);

  // -- roads: layered strokes with ruts + edge wear --
  for (const rd of MAPD.roads) {
    const P = rd.pts;
    const stroke = (off, w, style) => {
      c.strokeStyle = style; c.lineWidth = w; c.beginPath();
      for (let i = 0; i < P.length; i++) {
        let x = P[i].x, y = P[i].y;
        if (off) {
          const q = P[Math.min(i + 1, P.length - 1)], p0 = P[Math.max(0, i - 1)];
          const dx = q.x - p0.x, dy = q.y - p0.y, L = Math.hypot(dx, dy) || 1;
          x -= dy / L * off; y += dx / L * off;
        }
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    };
    stroke(0, rd.w + 30, 'rgba(122,109,82,0.55)');       // dusty verge
    stroke(0, rd.w + 8, '#7d7361');
    stroke(0, rd.w - 8, '#877c69');
    stroke(0, rd.w * 0.4, '#90856f');                    // crown
    stroke(rd.w * 0.26, 7, 'rgba(93,83,64,0.85)');       // wheel ruts
    stroke(-rd.w * 0.26, 7, 'rgba(93,83,64,0.85)');
    const r = hrng(P.length * 977);
    for (const p of P) {
      if (r() < 0.5) { c.fillStyle = 'rgba(80,72,56,0.5)'; c.beginPath(); c.ellipse(p.x + (r() - 0.5) * rd.w, p.y + (r() - 0.5) * rd.w, 5 + r() * 8, 3 + r() * 5, r() * 3, 0, 7); c.fill(); }
      if (r() < 0.4) { c.fillStyle = 'rgba(158,148,122,0.4)'; c.beginPath(); c.ellipse(p.x + (r() - 0.5) * rd.w, p.y + (r() - 0.5) * rd.w, 4 + r() * 6, 3 + r() * 4, r() * 3, 0, 7); c.fill(); }
    }
  }

  // -- paved compound yards --
  for (const yd of MAPD.yards) {
    c.fillStyle = '#8b8271';
    roundedRect(c, yd.x, yd.y, yd.w, yd.h, 18); c.fill();
    const r = hrng(yd.x * 7 + yd.y);
    for (let k = 0; k < yd.w * yd.h / 900; k++) {
      const x = yd.x + r() * yd.w, y = yd.y + r() * yd.h;
      c.fillStyle = r() < 0.5 ? 'rgba(60,54,42,0.14)' : 'rgba(240,232,208,0.10)';
      c.beginPath(); c.ellipse(x, y, 8 + r() * 14, 6 + r() * 10, r() * 3, 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(58,52,40,0.4)'; c.lineWidth = 1.4;
    for (let k = 0; k < yd.w * yd.h / 5200; k++) {       // cracks
      let x = yd.x + r() * yd.w, y = yd.y + r() * yd.h;
      c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 3; s++) { x += (r() - 0.5) * 26; y += (r() - 0.3) * 20; c.lineTo(x, y); }
      c.stroke();
    }
    c.fillStyle = 'rgba(96,120,64,0.4)';
    for (let k = 0; k < yd.w * yd.h / 2100; k++) c.fillRect(yd.x + r() * yd.w, yd.y + r() * yd.h, 2.4, 1.6);  // weeds
  }

  // -- crop field: furrows --
  for (const f of MAPD.fields) {
    c.save(); c.translate(f.x + f.w / 2, f.y + f.h / 2); c.rotate(f.a || 0);
    c.fillStyle = '#6e5c40'; c.fillRect(-f.w / 2 - 4, -f.h / 2 - 4, f.w + 8, f.h + 8);
    for (let k = -f.h / 2; k < f.h / 2; k += 13) {
      c.fillStyle = '#5b4a32'; c.fillRect(-f.w / 2, k, f.w, 6.5);
      c.fillStyle = 'rgba(255,240,210,0.12)'; c.fillRect(-f.w / 2, k + 6.5, f.w, 2);
      const r = hrng(f.x + k);
      c.fillStyle = 'rgba(106,138,74,0.75)';
      for (let s = -f.w / 2 + 6; s < f.w / 2 - 6; s += 9 + r() * 7) c.fillRect(s, k + 1.6, 3, 3.4);
    }
    c.restore();
  }

  // -- global grain: the pre-rendered feel --
  const r0 = hrng(4242);
  for (let k = 0; k < W * H / 190; k++) {
    const x = r0() * W, y = r0() * H;
    c.fillStyle = r0() < 0.5 ? 'rgba(255,246,222,0.05)' : 'rgba(30,28,18,0.07)';
    c.fillRect(x, y, 1 + r0() * 1.8, 1 + r0());
  }
  for (let k = 0; k < W * H / 1400; k++) {               // grass stubble ticks
    const x = r0() * W, y = r0() * H, l = 2.5 + r0() * 3;
    c.strokeStyle = r0() < 0.5 ? 'rgba(150,168,96,0.25)' : 'rgba(34,44,20,0.25)';
    c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + l); c.quadraticCurveTo(x + 1, y + l / 2, x + (r0() - 0.5) * 3, y); c.stroke();
  }

  // -- SOFT SHADOWS: every standing thing drops one short SE pool --
  const soft = (fn) => { c.fillStyle = 'rgba(30,30,24,0.13)'; fn(1.25); c.fillStyle = 'rgba(30,30,24,0.2)'; fn(0.8); };
  for (const b of MAPD.bldgs) soft(k => {
    const hh = (b.h + b.rise) * 0.42 * k;
    c.beginPath();
    c.moveTo(b.x, b.y); c.lineTo(b.x + b.w, b.y); c.lineTo(b.x + b.w + hh * SHDX, b.y + hh * SHDY);
    c.lineTo(b.x + b.w + hh * SHDX, b.y + b.d + hh * SHDY); c.lineTo(b.x + hh * SHDX, b.y + b.d + hh * SHDY); c.lineTo(b.x, b.y + b.d);
    c.closePath(); c.fill();
  });
  for (const w of MAPD.walls) soft(k => {
    const hh = w.h * 0.5 * k, t = w.t / 2;
    c.beginPath();
    c.moveTo(w.x0 - t, w.y0 - t); c.lineTo(w.x1 + t, w.y0 - t); c.lineTo(w.x1 + t + hh * SHDX, w.y0 - t + hh * SHDY);
    c.lineTo(w.x1 + t + hh * SHDX, w.y1 + t + hh * SHDY); c.lineTo(w.x0 - t + hh * SHDX, w.y1 + t + hh * SHDY); c.lineTo(w.x0 - t, w.y1 + t);
    c.closePath(); c.fill();
  });
  for (const p of MAPD.pillars) soft(k => { c.beginPath(); c.ellipse(p.x + p.h * 0.24 * k * SHDX * 2, p.y + p.h * 0.24 * k * SHDY * 2, p.s * 0.9, p.s * 0.7, 0, 0, 7); c.fill(); });
  for (const tr of MAPD.trees) soft(k => { c.beginPath(); c.ellipse(tr.x + 20 * SHDX * k, tr.y + 20 * SHDY * k, tr.r * 1.05, tr.r * 0.82, 0, 0, 7); c.fill(); });
  for (const pr of MAPD.props) soft(k => { c.beginPath(); c.ellipse(pr.x + 9 * SHDX * k, pr.y + 9 * SHDY * k, pr.kind === 'wagon' ? 30 : 15, pr.kind === 'wagon' ? 18 : 10, pr.a || 0, 0, 7); c.fill(); });
  for (const L of MAPD.lamps) { c.fillStyle = 'rgba(30,30,24,0.22)'; c.save(); c.translate(L.x, L.y); c.rotate(Math.atan2(SHDY, SHDX)); c.fillRect(0, -1.6, 34, 3.2); c.restore(); }

  // -- contact AO --
  c.fillStyle = 'rgba(24,24,18,0.35)';
  for (const b of MAPD.bldgs) { c.fillRect(b.x - 2, b.y + b.d, b.w + 5, 4); c.fillRect(b.x + b.w, b.y - 2, 4, b.d + 5); }
  for (const w of MAPD.walls) { const t = w.t / 2; c.fillRect(w.x0 - t, w.y1 + t, (w.x1 - w.x0) + w.t, 3); c.fillRect(w.x1 + t, w.y0 - t, 3, (w.y1 - w.y0) + w.t); }

  // -- worn footpaths --
  for (const path of MAPD.paths) {
    c.strokeStyle = 'rgba(138,121,91,0.5)'; c.lineWidth = 13;
    c.beginPath(); path.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
    c.strokeStyle = 'rgba(108,94,70,0.4)'; c.lineWidth = 5;
    c.beginPath(); path.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
  }

  // pre-bake every sprite
  for (const b of MAPD.bldgs) b._spr = bakeBuilding(b);
  for (const tr of MAPD.trees) tr._spr = bakeTree(tr);
  SPRITES.vm = bakeActor({ skin: '#d8a67e', hair: '#241c14', coat: '#3d4354', shirt: '#94212e', pants: '#3a3f50', boot: '#22242c' });
  SPRITES.vf = bakeActor({ skin: '#e2b08c', hair: '#8c3a4a', coat: '#3d4354', shirt: '#94212e', pants: '#3a3f50', boot: '#22242c', hairLong: true });
  SPRITES.guard = bakeActor({ skin: '#c69a72', hair: '#1c1812', coat: '#565a40', shirt: '#6e2830', pants: '#44483a', boot: '#26241e', cap: '#494d36' });
  SPRITES.heavy = bakeActor({ skin: '#b08a66', hair: '#14120e', coat: '#4a3a3e', shirt: '#8a2430', pants: '#3a3234', boot: '#201e1a', cap: '#3c2e32' });
}

function roundedRect(c, x, y, w, h, r) {
  if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  else { c.beginPath(); c.rect(x, y, w, h); }
}

// blood pools bake permanently into the ground
function bloodStain(x, y, big) {
  const c = TCTX, r = hrng((x * 13 + y * 7) | 0);
  c.fillStyle = 'rgba(96,16,16,0.5)';
  c.beginPath(); c.ellipse(x, y, 7 + (big ? 8 : 0) + r() * 5, 5 + (big ? 5 : 0) + r() * 4, r() * 3, 0, 7); c.fill();
  c.fillStyle = 'rgba(130,22,20,0.4)';
  for (let k = 0; k < 6; k++) c.fillRect(x + (r() - 0.5) * 26, y + (r() - 0.5) * 20, 2 + r() * 2, 1.4);
}

// ================= BUILDINGS (baked whole, shadow included) =================
// footprint w×d (plan), wall height h, gable rise, materials. Ridge runs along w.
function bakeBuilding(b) {
  const S = 2;                                          // bake density
  const spanX = (b.w + b.d) * R2, top = b.h + b.rise;
  const padL = 12, padR = 22, padT = 10, padB = 26;     // padB holds the SE shadow skirt
  const cw = spanX + padL + padR, ch = spanX + top + padT + padB;
  const cv = mkcv(cw * S, ch * S), c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  c.lineCap = 'round'; c.lineJoin = 'round';
  // local projection: plan NW corner (0,0) at (ox, oy)
  const ox = b.d * R2 + padL, oy = top + padT;
  const L = (x, y, z) => ({ x: (x - y) * R2 + ox, y: (x + y) * R2 - (z || 0) + oy });
  const rng = hrng((b.x * 31 + b.y * 17) | 0);

  const MATS = {
    stone: { base: '#8a8672', hi: '#a29d87', lo: '#6c6854', blocky: true },
    stucco: { base: '#9a9078', hi: '#b0a68c', lo: '#7a7260', blocky: false },
    brick: { base: '#8a6a52', hi: '#a08066', lo: '#6a4e3c', blocky: true },
  };
  const M = MATS[b.mat] || MATS.stucco;
  const ROOFS = { terra: ['#96543a', '#aa6644', '#6e3c28'], slate: ['#5c6068', '#6e737c', '#42464e'], rust: ['#7c5638', '#8f6a44', '#59402a'] };
  const RF = ROOFS[b.roof] || ROOFS.terra;

  // ---- facades ----
  const face = (p0, p1, lit) => {                       // wall from plan pt p0→p1, height b.h
    const a = L(p0.x, p0.y, 0), d2 = L(p1.x, p1.y, 0);
    const wcol = lit ? mixc(M.base, '#f5ead0', 0.13) : mixc(M.base, '#3c4252', 0.3);
    const g = c.createLinearGradient(0, a.y - b.h, 0, a.y);
    g.addColorStop(0, mixc(wcol, '#ffffff', 0.08)); g.addColorStop(1, mixc(wcol, '#20201a', 0.22));
    c.fillStyle = g;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(d2.x, d2.y); c.lineTo(d2.x, d2.y - b.h); c.lineTo(a.x, a.y - b.h); c.closePath(); c.fill();
    const len = Math.hypot(d2.x - a.x, d2.y - a.y);
    const along = f => ({ x: a.x + (d2.x - a.x) * f, y: a.y + (d2.y - a.y) * f });
    // coursing / plaster stains
    if (M.blocky) {
      c.strokeStyle = 'rgba(40,38,30,0.28)'; c.lineWidth = 0.9;
      for (let z = 11; z < b.h - 4; z += 12) { c.beginPath(); c.moveTo(a.x, a.y - z); c.lineTo(d2.x, d2.y - z); c.stroke(); }
      for (let f = 0.08; f < 0.95; f += 0.13) {
        const p = along(f + (rng() - 0.5) * 0.04);
        c.beginPath(); c.moveTo(p.x, p.y - 2 - rng() * 6); c.lineTo(p.x, p.y - b.h * (0.4 + rng() * 0.5)); c.stroke();
      }
    }
    for (let k = 0; k < len / 12; k++) {                 // grime + damp
      const p = along(rng());
      c.fillStyle = rng() < 0.5 ? 'rgba(46,46,34,0.13)' : 'rgba(240,234,210,0.08)';
      c.beginPath(); c.ellipse(p.x, p.y - rng() * b.h, 4 + rng() * 7, 3 + rng() * 5, 0, 0, 7); c.fill();
    }
    c.fillStyle = 'rgba(58,72,40,0.35)';                 // moss at the footing
    for (let k = 0; k < len / 16; k++) { const p = along(rng()); c.beginPath(); c.ellipse(p.x, p.y - 1.5 - rng() * 4, 4 + rng() * 5, 2.4, 0, 0, 7); c.fill(); }
    // windows
    const nWin = Math.max(1, Math.floor(len / 46));
    for (let iW = 0; iW < nWin; iW++) {
      const f = (iW + 0.5) / nWin + (rng() - 0.5) * 0.05;
      if (b.doorFace === (lit ? 'e' : 's') && Math.abs(f - 0.5) < 0.14 && b.w < 300) continue;
      const p = along(f), wz = b.h * 0.52, ww = 12, wh = 17;
      c.fillStyle = 'rgba(236,230,210,0.9)'; c.fillRect(p.x - ww / 2 - 1.6, p.y - wz - wh, ww + 3.2, wh + 2.4);   // stone surround
      c.fillStyle = '#1a2026'; c.fillRect(p.x - ww / 2, p.y - wz - wh + 1.6, ww, wh - 1.6);
      const wg = c.createLinearGradient(p.x - ww / 2, p.y - wz - wh, p.x + ww / 2, p.y - wz);
      wg.addColorStop(0, 'rgba(150,170,180,0.55)'); wg.addColorStop(0.5, 'rgba(70,86,96,0.4)'); wg.addColorStop(1, 'rgba(30,40,46,0.3)');
      c.fillStyle = wg; c.fillRect(p.x - ww / 2, p.y - wz - wh + 1.6, ww, wh - 1.6);
      c.fillStyle = 'rgba(230,224,204,0.85)'; c.fillRect(p.x - ww / 2 - 0.6, p.y - wz - (wh - 1.6) / 2 - wh / 2 + wh / 2, ww + 1.2, 1.6); // transom bar
      c.fillStyle = 'rgba(20,22,20,0.8)'; c.fillRect(p.x - 0.8, p.y - wz - wh + 1.6, 1.6, wh - 1.6);
      c.fillStyle = 'rgba(238,232,212,0.9)'; c.fillRect(p.x - ww / 2 - 2.4, p.y - wz + 0.6, ww + 4.8, 2);          // sill
      if (rng() < 0.4) {                                  // shutter
        c.fillStyle = mixc('#4a5a40', '#2c361f', rng() * 0.5);
        c.fillRect(p.x - ww / 2 - 6.4, p.y - wz - wh + 1.6, 5, wh - 1.6);
        c.fillStyle = 'rgba(0,0,0,0.25)'; for (let s = 0; s < 4; s++) c.fillRect(p.x - ww / 2 - 5.8, p.y - wz - wh + 4 + s * 3.6, 3.8, 1);
      }
      c.fillStyle = 'rgba(30,30,24,0.3)'; c.fillRect(p.x - ww / 2 - 1.6, p.y - wz + 2.6, ww + 3.2, 1.6);           // drop shade
    }
    // door
    if ((lit ? 'e' : 's') === b.doorFace) {
      const p = along(0.5), dw = 17, dh = b.h * 0.62;
      c.fillStyle = 'rgba(236,230,210,0.9)'; c.fillRect(p.x - dw / 2 - 2, p.y - dh - 2.4, dw + 4, dh + 2.4);
      const dg = c.createLinearGradient(0, p.y - dh, 0, p.y);
      dg.addColorStop(0, '#6a4e30'); dg.addColorStop(1, '#46321e');
      c.fillStyle = dg; c.fillRect(p.x - dw / 2, p.y - dh, dw, dh);
      c.fillStyle = 'rgba(0,0,0,0.3)'; for (let s = 1; s < 4; s++) c.fillRect(p.x - dw / 2 + s * dw / 4, p.y - dh, 1, dh);
      c.fillStyle = '#c9c4ae'; c.fillRect(p.x + dw / 2 - 3.4, p.y - dh * 0.5, 1.8, 1.8);
      c.fillStyle = 'rgba(24,24,18,0.4)'; c.fillRect(p.x - dw / 2 - 2, p.y - 1, dw + 4, 2);
      if (b.awning) {                                    // striped canvas over the door
        const aw = dw + 26;
        for (let s = 0; s < aw; s += 6.4) { c.fillStyle = ((s / 6.4) | 0) % 2 ? rgba(b.awning, 0.92) : '#e6e0cc'; c.fillRect(p.x - aw / 2 + s, p.y - dh - 11, Math.min(6.4, aw - s), 8.4); }
        for (let s = 0; s < aw; s += 5.4) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.arc(p.x - aw / 2 + s + 2.7, p.y - dh - 2.6, 2.7, 0, Math.PI); c.fill(); }
        c.fillStyle = 'rgba(24,24,18,0.35)'; c.fillRect(p.x - aw / 2, p.y - dh - 2, aw, 2.4);
      }
    }
    // drainpipe on one end
    if (rng() < 0.7) { const p = along(lit ? 0.94 : 0.05); c.fillStyle = 'rgba(40,38,30,0.7)'; c.fillRect(p.x - 1.4, p.y - b.h, 2.8, b.h); c.fillStyle = 'rgba(255,248,226,0.22)'; c.fillRect(p.x - 1.4, p.y - b.h, 1, b.h); }
  };
  // ivy climbing a corner (very ref2)
  const ivy = (p, hMax) => {
    for (let k = 0; k < 30; k++) {
      c.fillStyle = rgba(k % 3 ? '#3c5424' : '#54703a', 0.85);
      c.beginPath(); c.ellipse(p.x + (rng() - 0.5) * 16, p.y - rng() * hMax, 3.4 + rng() * 3, 2.6 + rng() * 2, rng() * 3, 0, 7); c.fill();
    }
  };

  face({ x: 0, y: b.d }, { x: b.w, y: b.d }, false);     // south (shade side)
  face({ x: b.w, y: b.d }, { x: b.w, y: 0 }, true);      // east (lit side)

  // gable pediments above the east wall (ridge runs along x)
  const gE0 = L(b.w, b.d, b.h), gE1 = L(b.w, 0, b.h), gEm = L(b.w, b.d / 2, b.h + b.rise);
  c.fillStyle = mixc(mixc(M.base, '#f5ead0', 0.1), '#20201a', 0.12);
  c.beginPath(); c.moveTo(gE0.x, gE0.y); c.lineTo(gEm.x, gEm.y); c.lineTo(gE1.x, gE1.y); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(52,40,28,0.6)'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(gE0.x, gE0.y); c.lineTo(gEm.x, gEm.y); c.lineTo(gE1.x, gE1.y); c.stroke();
  c.fillStyle = 'rgba(26,26,20,0.7)'; c.beginPath(); c.arc(gEm.x, gEm.y + b.rise * 0.55, 2.6, 0, 7); c.fill();

  // ---- gabled roof: two slopes, tile courses ----
  const slope = (yEave, south) => {
    const e0 = L(0, yEave, b.h), e1 = L(b.w, yEave, b.h);
    const r0 = L(0, b.d / 2, b.h + b.rise), r1 = L(b.w, b.d / 2, b.h + b.rise);
    const base = south ? mixc(RF[0], '#f8e6c8', 0.13) : mixc(RF[0], '#2e3038', 0.25);
    c.fillStyle = base;
    c.beginPath(); c.moveTo(e0.x, e0.y); c.lineTo(e1.x, e1.y); c.lineTo(r1.x, r1.y); c.lineTo(r0.x, r0.y); c.closePath(); c.fill();
    // courses parallel to the ridge
    const nC = 9;
    for (let iC = 1; iC <= nC; iC++) {
      const f = iC / nC;
      const ax = e0.x + (r0.x - e0.x) * f, ay = e0.y + (r0.y - e0.y) * f;
      const bx2 = e1.x + (r1.x - e1.x) * f, by2 = e1.y + (r1.y - e1.y) * f;
      c.strokeStyle = 'rgba(46,26,18,0.35)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx2, by2); c.stroke();
      c.strokeStyle = 'rgba(255,238,214,0.13)'; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(ax, ay + 1.4); c.lineTo(bx2, by2 + 1.4); c.stroke();
      // per-tile jitter cells
      const segs = Math.max(4, Math.floor(b.w / 16));
      for (let s2 = 0; s2 < segs; s2++) {
        if (rng() < 0.55) continue;
        const ff = s2 / segs + rng() * 0.05;
        const px2 = ax + (bx2 - ax) * ff, py2 = ay + (by2 - ay) * ff;
        c.fillStyle = rgba(rng() < 0.5 ? RF[1] : RF[2], 0.4 + rng() * 0.3);
        c.fillRect(px2, py2 - 2, 6 + rng() * 8, 3.4);
      }
    }
    // eave drip + moss near the eave
    c.strokeStyle = 'rgba(30,22,16,0.55)'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(e0.x, e0.y); c.lineTo(e1.x, e1.y); c.stroke();
    c.fillStyle = 'rgba(84,104,58,0.3)';
    for (let k = 0; k < b.w / 22; k++) { const f = rng(); c.beginPath(); c.ellipse(e0.x + (e1.x - e0.x) * f, e0.y + (e1.y - e0.y) * f - 2.4, 4 + rng() * 5, 2.2, 0, 0, 7); c.fill(); }
  };
  slope(0, false);                                       // north slope (sky side)
  slope(b.d, true);                                      // south slope (lit)
  // ridge cap
  const rg0 = L(0, b.d / 2, b.h + b.rise), rg1 = L(b.w, b.d / 2, b.h + b.rise);
  c.strokeStyle = mixc(RF[2], '#1c140e', 0.3); c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(rg0.x, rg0.y); c.lineTo(rg1.x, rg1.y); c.stroke();
  c.strokeStyle = 'rgba(255,240,214,0.25)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(rg0.x, rg0.y - 1.4); c.lineTo(rg1.x, rg1.y - 1.4); c.stroke();
  // chimney
  if (b.chimney) {
    const cxp = 0.22 + rng() * 0.5;
    const base2 = L(b.w * cxp, b.d / 2, b.h + b.rise - 4);
    const chW = 12, chH = 26;
    c.fillStyle = 'rgba(30,26,20,0.35)'; c.fillRect(base2.x - chW / 2 + 4, base2.y - chH + 6, chW, chH);   // its shadow on the roof
    const cg = c.createLinearGradient(base2.x - chW / 2, 0, base2.x + chW / 2, 0);
    cg.addColorStop(0, mixc('#8a6a52', '#f5ead0', 0.18)); cg.addColorStop(1, mixc('#8a6a52', '#2c2820', 0.3));
    c.fillStyle = cg; c.fillRect(base2.x - chW / 2, base2.y - chH, chW, chH);
    c.strokeStyle = 'rgba(40,30,22,0.4)'; c.lineWidth = 0.9;
    for (let z = 4; z < chH; z += 5) { c.beginPath(); c.moveTo(base2.x - chW / 2, base2.y - z); c.lineTo(base2.x + chW / 2, base2.y - z); c.stroke(); }
    c.fillStyle = '#4a4038'; c.fillRect(base2.x - chW / 2 - 1.6, base2.y - chH - 3, chW + 3.2, 3.6);
    c.fillStyle = '#2a2622'; c.fillRect(base2.x - 3.4, base2.y - chH - 8, 3, 5.4); c.fillRect(base2.x + 1, base2.y - chH - 8, 3, 5.4);
  }
  if (b.ivy) { ivy(L(b.w, b.d, 0), b.h * 0.9); ivy(L(b.w * 0.2, b.d, 0), b.h * 0.6); }
  if (b.sign) {                                          // small hanging board, Night City touch
    const p = L(b.w / 2, b.d, b.h + 2);
    c.fillStyle = 'rgba(20,18,14,0.85)'; c.fillRect(p.x - 34, p.y - 12, 68, 15);
    c.strokeStyle = rgba(b.signCol || '#ff2a6d', 0.9); c.lineWidth = 1.2; c.strokeRect(p.x - 34, p.y - 12, 68, 15);
    c.fillStyle = rgba(b.signCol || '#ff2a6d', 0.95); c.font = '600 9px "Bahnschrift","Arial Narrow",sans-serif'; c.textAlign = 'center';
    c.fillText(b.sign, p.x, p.y - 1.6);
  }
  return { cv, ox, oy, s: S, w: cw, h: ch };
}
function drawBuilding(c, b) {
  const s = scr(b.x, b.y, 0), sp = b._spr;
  c.drawImage(sp.cv, s.x - sp.ox, s.y - sp.oy, sp.w, sp.h);
}

// ================= TREES =================
function bakeTree(tr) {
  const R = tr.r, S = 2, w = R * 2.7, h = R * 2.3;
  const cv = mkcv(w * S, h * S), c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  const rng = hrng((tr.x * 13 + tr.y * 7) | 0);
  const cx = w / 2, cy = h / 2;
  // billowy crown built from lobes, each lit by its own facing (the ref look)
  const lobes = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng() * 0.5, d = R * (0.34 + rng() * 0.3);
    lobes.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.72, r: R * (0.36 + rng() * 0.18) });
  }
  lobes.push({ x: cx, y: cy - R * 0.1, r: R * 0.52 });
  c.fillStyle = '#26331a';                                 // under-mass
  for (const lb of lobes) { c.beginPath(); c.ellipse(lb.x + R * 0.06, lb.y + R * 0.08, lb.r * 1.06, lb.r * 0.9, 0, 0, 7); c.fill(); }
  for (const lb of lobes) {                                // dark base → lit crown per lobe
    const litK = clamp(0.55 - (lb.x - cx) / R * 0.28 - (lb.y - cy) / R * 0.42, 0.08, 1);
    const g = c.createRadialGradient(lb.x - lb.r * 0.3, lb.y - lb.r * 0.42, lb.r * 0.12, lb.x, lb.y, lb.r);
    g.addColorStop(0, mixc('#3a4f22', '#8aa452', litK));
    g.addColorStop(0.62, mixc('#31431e', '#5c7634', litK * 0.7));
    g.addColorStop(1, '#223016');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(lb.x, lb.y, lb.r, lb.r * 0.86, 0, 0, 7); c.fill();
  }
  for (let k = 0; k < 46; k++) {                           // leaf-cluster texture dabs
    const lb = lobes[(rng() * lobes.length) | 0];
    const a = rng() * 7, d = Math.sqrt(rng()) * lb.r * 0.8;
    const bx = lb.x + Math.cos(a) * d, by = lb.y + Math.sin(a) * d * 0.8;
    const litK = clamp(0.55 - (bx - cx) / R * 0.3 - (by - cy) / R * 0.45 + (rng() - 0.5) * 0.3, 0, 1);
    c.fillStyle = rgba(mixc('#26361a', '#93b058', litK), 0.8);
    c.beginPath(); c.ellipse(bx, by, R * (0.08 + rng() * 0.06), R * (0.05 + rng() * 0.045), rng() * 3, 0, 7); c.fill();
  }
  c.fillStyle = 'rgba(228,244,168,0.3)';                   // top-left sun catches
  for (let k = 0; k < 12; k++) { const a = rng() * 7, d = rng() * R * 0.5; c.beginPath(); c.ellipse(cx - R * 0.26 + Math.cos(a) * d * 0.5, cy - R * 0.34 + Math.sin(a) * d * 0.35, R * 0.06, R * 0.04, rng() * 3, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(8,12,5,0.35)';                       // SE depth pocket
  c.beginPath(); c.ellipse(cx + R * 0.3, cy + R * 0.34, R * 0.5, R * 0.28, 0.25, 0, 7); c.fill();
  return { cv, w, h };
}
function drawTree(c, tr) {
  const b = scr(tr.x, tr.y, 0);
  c.strokeStyle = '#3a3020'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + 1.6, b.y - tr.r * 0.5 - 12); c.stroke();
  c.strokeStyle = 'rgba(255,240,210,0.16)'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(b.x - 1.6, b.y); c.lineTo(b.x, b.y - tr.r * 0.5 - 12); c.stroke();
  const t = scr(tr.x, tr.y, tr.r * 0.62 + 18), sp = tr._spr;
  c.drawImage(sp.cv, t.x - sp.w / 2, t.y - sp.h / 2, sp.w, sp.h);
  c.lineWidth = 1;
}

// ================= WALLS / PILLARS / FENCES / PROPS / LAMPS =================
function drawWall(c, w) {
  const t = w.t / 2, stone = '#87836e';
  const gN = scr(w.x0 - t, w.y0 - t, 0), gE = scr(w.x1 + t, w.y0 - t, 0), gS = scr(w.x1 + t, w.y1 + t, 0), gW = scr(w.x0 - t, w.y1 + t, 0);
  c.fillStyle = mixc(stone, '#3a4050', 0.28);
  c.beginPath(); c.moveTo(gW.x, gW.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - w.h); c.lineTo(gW.x, gW.y - w.h); c.closePath(); c.fill();
  c.fillStyle = mixc(stone, '#f2e7c8', 0.12);
  c.beginPath(); c.moveTo(gE.x, gE.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - w.h); c.lineTo(gE.x, gE.y - w.h); c.closePath(); c.fill();
  c.fillStyle = mixc(stone, '#fff6da', 0.05);
  c.beginPath(); c.moveTo(gN.x, gN.y - w.h); c.lineTo(gE.x, gE.y - w.h); c.lineTo(gS.x, gS.y - w.h); c.lineTo(gW.x, gW.y - w.h); c.closePath(); c.fill();
  const rng = hrng((w.x0 * 7 + w.y0 * 13) | 0), horiz = (w.x1 - w.x0) >= (w.y1 - w.y0);
  c.strokeStyle = 'rgba(42,40,32,0.4)'; c.lineWidth = 1;
  const len = horiz ? w.x1 - w.x0 : w.y1 - w.y0;
  for (let u = 12; u < len - 4; u += 14) {                // masonry joints on the south/east face
    const p = horiz ? scr(w.x0 + u, w.y1 + t, 0) : scr(w.x1 + t, w.y0 + u, 0);
    c.beginPath(); c.moveTo(p.x, p.y - w.h * (0.12 + rng() * 0.12)); c.lineTo(p.x, p.y - w.h * (0.72 + rng() * 0.2)); c.stroke();
  }
  const mid = horiz ? [scr(w.x0, w.y1 + t, 0), scr(w.x1, w.y1 + t, 0)] : [scr(w.x1 + t, w.y0, 0), scr(w.x1 + t, w.y1, 0)];
  c.beginPath(); c.moveTo(mid[0].x, mid[0].y - w.h * 0.48); c.lineTo(mid[1].x, mid[1].y - w.h * 0.48); c.stroke();
  c.fillStyle = 'rgba(86,106,58,0.4)';                    // moss along the cap + base
  for (let k = 0; k < len / 30; k++) {
    const u = rng() * len;
    const pTop = horiz ? scr(w.x0 + u, w.y0 + (rng() - 0.5) * w.t, 0) : scr(w.x0 + (rng() - 0.5) * w.t, w.y0 + u, 0);
    c.beginPath(); c.ellipse(pTop.x, pTop.y - w.h, 5 + rng() * 5, 2.6, 0.3, 0, 7); c.fill();
  }
}
function drawPillar(c, p) {
  const s = p.s;
  const gN = scr(p.x - s, p.y - s, 0), gE = scr(p.x + s, p.y - s, 0), gS = scr(p.x + s, p.y + s, 0), gW = scr(p.x - s, p.y + s, 0);
  const stone = '#8a8670';
  c.fillStyle = mixc(stone, '#3a4050', 0.3);
  c.beginPath(); c.moveTo(gW.x, gW.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - p.h); c.lineTo(gW.x, gW.y - p.h); c.closePath(); c.fill();
  c.fillStyle = mixc(stone, '#f2e7c8', 0.14);
  c.beginPath(); c.moveTo(gE.x, gE.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - p.h); c.lineTo(gE.x, gE.y - p.h); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(42,40,32,0.45)'; c.lineWidth = 1;
  for (let z = 12; z < p.h - 6; z += 13) { c.beginPath(); c.moveTo(gW.x, gW.y - z); c.lineTo(gS.x, gS.y - z); c.lineTo(gE.x, gE.y - z); c.stroke(); }
  // cap + lamp
  c.fillStyle = mixc(stone, '#fff6da', 0.16);
  c.beginPath(); c.moveTo(gN.x, gN.y - p.h); c.lineTo(gE.x, gE.y - p.h); c.lineTo(gS.x, gS.y - p.h); c.lineTo(gW.x, gW.y - p.h); c.closePath(); c.fill();
  c.fillStyle = 'rgba(30,28,22,0.5)'; c.fillRect(gS.x - 4, gS.y - p.h - 10, 8, 10);
  const lit = 0.6 + 0.4 * Math.sin(G.t * 2.2 + p.x);
  c.fillStyle = rgba('#ffd890', 0.55 + lit * 0.35); c.fillRect(gS.x - 2.6, gS.y - p.h - 8.4, 5.2, 6);
}
function drawFence(c, f) {
  const dx = f.x1 - f.x0, dy = f.y1 - f.y0, L2 = Math.hypot(dx, dy) || 1, n = Math.max(1, Math.round(L2 / 42));
  c.strokeStyle = 'rgba(40,36,28,0.75)'; c.lineWidth = 1.2;
  for (const zz of [17, 11, 5]) {
    const p0 = scr(f.x0, f.y0, zz), p1 = scr(f.x1, f.y1, zz);
    c.beginPath(); c.moveTo(p0.x, p0.y);
    const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2 + 1.8;            // saggy wire
    c.quadraticCurveTo(mx, my, p1.x, p1.y); c.stroke();
  }
  for (let i = 0; i <= n; i++) {
    const x = f.x0 + dx * i / n, y = f.y0 + dy * i / n;
    const b = scr(x, y, 0), t = scr(x, y, 19);
    c.strokeStyle = '#4c4434'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(t.x, t.y); c.stroke();
    c.strokeStyle = 'rgba(255,244,220,0.25)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(b.x - 1, b.y); c.lineTo(t.x - 1, t.y); c.stroke();
  }
  c.lineWidth = 1;
}
function prism(c, x0, y0, x1, y1, z0, h, top, lt, dk) {
  const gN = scr(x0, y0, z0), gE = scr(x1, y0, z0), gS = scr(x1, y1, z0), gW = scr(x0, y1, z0);
  c.fillStyle = dk; c.beginPath(); c.moveTo(gW.x, gW.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - h); c.lineTo(gW.x, gW.y - h); c.closePath(); c.fill();
  c.fillStyle = lt; c.beginPath(); c.moveTo(gE.x, gE.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - h); c.lineTo(gE.x, gE.y - h); c.closePath(); c.fill();
  c.fillStyle = top; c.beginPath(); c.moveTo(gN.x, gN.y - h); c.lineTo(gE.x, gE.y - h); c.lineTo(gS.x, gS.y - h); c.lineTo(gW.x, gW.y - h); c.closePath(); c.fill();
}
function drawProp(c, pr) {
  const rng = hrng((pr.x * 13 + pr.y * 7) | 0), x = pr.x, y = pr.y;
  switch (pr.kind) {
    case 'crates': {
      const wood = ['#8a6f46', '#7a6240', '#93794e'];
      const box = (bx, by, s2, z0, h) => {
        const w0 = wood[(rng() * 3) | 0];
        prism(c, bx - s2, by - s2, bx + s2, by + s2, z0, h, mixc(w0, '#f8ecd0', 0.16), mixc(w0, '#fff', 0.02), mixc(w0, '#241a10', 0.32));
        const t = scr(bx, by, z0 + h);
        c.strokeStyle = 'rgba(40,28,16,0.5)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(t.x - s2 * R2 * 2 * 0.7, t.y); c.lineTo(t.x + s2 * R2 * 2 * 0.7, t.y); c.stroke();
      };
      box(x - 11, y - 8, 12, 0, 20); box(x + 12, y - 2, 12, 0, 18); box(x - 2, y + 12, 11, 0, 16);
      box(x + 1, y - 4, 10, 20, 16);
      break;
    }
    case 'barrels': {
      for (const [ox, oy] of [[-9, -4], [8, -7], [1, 8]]) {
        const bx = x + ox, by = y + oy, b = scr(bx, by, 0), t = scr(bx, by, 19);
        const col = rng() < 0.4 ? '#6e3c30' : '#4e5c46';
        const g = c.createLinearGradient(b.x - 8, 0, b.x + 8, 0);
        g.addColorStop(0, mixc(col, '#f8ecd0', 0.2)); g.addColorStop(0.55, col); g.addColorStop(1, mixc(col, '#1a1c20', 0.4));
        c.fillStyle = g; c.fillRect(b.x - 8, t.y, 16, b.y - t.y);
        c.fillStyle = 'rgba(20,18,14,0.5)'; c.fillRect(b.x - 8, t.y + (b.y - t.y) * 0.32, 16, 1.6); c.fillRect(b.x - 8, t.y + (b.y - t.y) * 0.72, 16, 1.6);
        c.fillStyle = mixc(col, '#fff4d8', 0.3); c.beginPath(); c.ellipse(t.x, t.y, 8, 4.4, 0, 0, 7); c.fill();
        c.fillStyle = 'rgba(30,26,20,0.45)'; c.beginPath(); c.ellipse(t.x, t.y, 5.4, 2.8, 0, 0, 7); c.fill();
      }
      break;
    }
    case 'traps': {                                       // anti-tank hedgehog, pure Commandos
      for (const [ox, oy] of [[0, 0], [34, 14], [-30, 18]]) {
        const b = scr(x + ox, y + oy, 0);
        c.strokeStyle = '#4a4438'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(b.x - 12, b.y + 6); c.lineTo(b.x + 12, b.y - 18); c.stroke();
        c.beginPath(); c.moveTo(b.x + 12, b.y + 6); c.lineTo(b.x - 12, b.y - 18); c.stroke();
        c.beginPath(); c.moveTo(b.x, b.y + 9); c.lineTo(b.x, b.y - 22); c.stroke();
        c.strokeStyle = 'rgba(250,240,214,0.25)'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(b.x - 12, b.y + 5); c.lineTo(b.x + 12, b.y - 19); c.stroke();
      }
      c.lineWidth = 1;
      break;
    }
    case 'spool': {
      const b = scr(x, y, 0), t = scr(x, y, 16);
      c.fillStyle = '#6e5a40'; c.beginPath(); c.ellipse(b.x, b.y, 13, 7, 0, 0, 7); c.fill();
      c.fillStyle = '#57452e'; c.fillRect(b.x - 13, t.y, 26, b.y - t.y);
      c.fillStyle = '#83693f'; c.beginPath(); c.ellipse(t.x, t.y, 13, 7, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(40,30,18,0.55)'; c.lineWidth = 1.4;
      c.beginPath(); c.ellipse(t.x, t.y, 8.6, 4.6, 0, 0, 7); c.stroke();
      c.fillStyle = '#3e3222'; c.fillRect(t.x - 2.4, t.y - 2, 4.8, 4);
      break;
    }
    case 'wagon': {
      c.save();
      const b = scr(x, y, 0);
      c.translate(b.x, b.y); c.rotate((pr.a || 0) + Math.PI / 4);
      c.fillStyle = '#241f16'; c.beginPath(); c.ellipse(-20, 8, 7, 4.6, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(20, 8, 7, 4.6, 0, 0, 7); c.fill();
      const g = c.createLinearGradient(0, -26, 0, 4);
      g.addColorStop(0, '#7c6440'); g.addColorStop(1, '#57452c');
      c.fillStyle = g; c.fillRect(-30, -22, 60, 26);
      c.fillStyle = 'rgba(30,22,12,0.5)'; for (let s = -30; s < 30; s += 7.4) c.fillRect(s, -22, 1.4, 26);
      c.fillStyle = 'rgba(255,240,210,0.2)'; c.fillRect(-30, -22, 60, 2.4);
      c.fillStyle = '#3c3226'; c.fillRect(-34, -10, 5, 4); c.fillRect(29, -10, 5, 4);
      c.restore();
      break;
    }
    case 'boom': {                                        // checkpoint barrier arm
      const b0 = scr(x, y, 26), b1 = scr(x + pr.len * Math.cos(pr.a), y + pr.len * Math.sin(pr.a), 20);
      c.strokeStyle = '#d8d2be'; c.lineWidth = 4.4;
      c.beginPath(); c.moveTo(b0.x, b0.y); c.lineTo(b1.x, b1.y); c.stroke();
      c.strokeStyle = '#b03830'; c.lineWidth = 4.4; c.setLineDash([13, 13]);
      c.beginPath(); c.moveTo(b0.x, b0.y); c.lineTo(b1.x, b1.y); c.stroke(); c.setLineDash([]);
      const post = scr(x, y, 0);
      c.strokeStyle = '#54503f'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(post.x, post.y); c.lineTo(b0.x, b0.y); c.stroke();
      c.lineWidth = 1;
      break;
    }
  }
}
function drawLamp(c, L) {
  const b = scr(L.x, L.y, 0), t = scr(L.x, L.y, 56), hd = scr(L.x + 10, L.y + 10, 53);
  c.strokeStyle = '#3c3a30'; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(t.x, t.y); c.stroke();
  c.beginPath(); c.moveTo(t.x, t.y); c.quadraticCurveTo(t.x + 5, t.y - 3, hd.x, hd.y); c.stroke();
  c.strokeStyle = 'rgba(255,244,214,0.2)'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(b.x - 1.2, b.y); c.lineTo(t.x - 1.2, t.y); c.stroke();
  c.fillStyle = '#4a4a42'; c.fillRect(hd.x - 5, hd.y - 3, 10, 5);
  c.fillStyle = 'rgba(255,224,150,0.85)'; c.fillRect(hd.x - 3.4, hd.y + 1.4, 6.8, 2.6);
  c.lineWidth = 1;
}
function drawCrate(c, cr) {                               // objective cargo crate
  const s2 = 15, glow = cr.looted ? 0 : 0.5 + 0.5 * Math.sin(G.t * 3 + cr.x);
  prism(c, cr.x - s2, cr.y - s2, cr.x + s2, cr.y + s2, 0, 24, cr.looted ? '#6a5a40' : '#8a7448', '#79643e', '#4c3c26');
  const t = scr(cr.x, cr.y, 24);
  c.strokeStyle = 'rgba(34,24,12,0.6)'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(t.x - 19, t.y); c.lineTo(t.x + 19, t.y); c.stroke();
  c.beginPath(); c.moveTo(t.x, t.y - 10); c.lineTo(t.x, t.y + 10); c.stroke();
  if (!cr.looted) {
    c.fillStyle = rgba('#f9f002', 0.5 + glow * 0.4); c.fillRect(t.x - 4, t.y - 4, 8, 8);
    c.fillStyle = 'rgba(20,16,8,0.8)'; c.font = '700 8px sans-serif'; c.textAlign = 'center'; c.fillText('€$', t.x, t.y + 2.6);
  }
  c.lineWidth = 1;
}

// ================= ACTORS =================
const SPRITES = {};
function bakeActor(p) {
  const S3 = 3, set = {};
  for (const face of ['down', 'up', 'side']) {
    set[face] = [];
    for (let ph = 0; ph < 4; ph++) {
      const cv = mkcv(34 * S3, 52 * S3), c = cv.getContext('2d');
      c.setTransform(S3, 0, 0, S3, 0, 0);
      paintActor(c, face, ph, p);
      set[face].push(cv);
    }
  }
  return set;
}
// 34×52 canvas, feet at (17,50). ~46px figures, painterly shading.
function paintActor(c, face, ph, p) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (ph === 1 || ph === 3) c.translate(0, -0.8);
  const stride = [-1, 0.12, 1, -0.12][ph];
  const ctD = mixc(p.coat, '#141824', 0.32), ctL = mixc(p.coat, '#f4e8cc', 0.2);
  const skD = mixc(p.skin, '#5a3428', 0.28), skL = mixc(p.skin, '#ffedd2', 0.2);
  const pnD = mixc(p.pants, '#101420', 0.3);
  const limb = (x0, y0, x1, y1, col, w2) => { c.strokeStyle = col; c.lineWidth = w2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  if (face === 'side') {
    limb(17, 34, 17 - stride * 4.4, 47, pnD, 5.2);
    limb(17 - stride * 4.4, 47, 17 - stride * 6, 48.6, p.boot, 5.4);
    const g = c.createLinearGradient(11, 0, 24, 0);
    g.addColorStop(0, ctL); g.addColorStop(0.55, p.coat); g.addColorStop(1, ctD);
    c.fillStyle = g; roundedRect(c, 10.6, 16.4, 12.6, 18.6, 5); c.fill();
    limb(17.6, 34, 17.6 + stride * 4.6, 47.2, p.pants, 5.4);
    limb(17.6 + stride * 4.6, 47.2, 17.6 + stride * 6.4, 48.8, p.boot, 5.6);
    limb(17, 20.6, 17 - stride * 3.4, 31.4, mixc(p.coat, '#101420', 0.12), 4.6);
    c.fillStyle = p.skin; c.beginPath(); c.arc(17 - stride * 3.4, 32.8, 2.2, 0, 7); c.fill();
    const hg = c.createRadialGradient(16, 8.4, 1, 17.6, 10.6, 6.8);
    hg.addColorStop(0, skL); hg.addColorStop(1, skD);
    c.fillStyle = hg; c.beginPath(); c.arc(17.6, 10.6, 5.8, 0, 7); c.fill();
    c.fillStyle = p.skin; c.beginPath(); c.arc(23.2, 11.8, 1.3, 0, 7); c.fill();      // nose
    c.fillStyle = p.skin; c.fillRect(15.6, 15.4, 3.4, 2.2);
    c.fillStyle = p.hair;
    c.beginPath(); c.arc(17, 10, 6.1, Math.PI * 0.52, Math.PI * 1.72); c.quadraticCurveTo(18.4, 4.2, 21.4, 5.4); c.closePath(); c.fill();
    if (p.hairLong) { roundedRect(c, 10.6, 9, 4.4, 12.4, 2); c.fill(); }
    if (p.cap) { c.fillStyle = p.cap; c.beginPath(); c.arc(17.2, 8.6, 6.1, Math.PI * 0.95, Math.PI * 2.02); c.closePath(); c.fill(); c.fillRect(17.2, 6.6, 8.4, 2.4); }
    c.fillStyle = '#14161c'; c.fillRect(20.4, 9.6, 1.9, 1.8);                          // eye
  } else {
    const back = face === 'up';
    limb(13.4, 34.4, 12.8, 47 + stride, back ? pnD : p.pants, 5.2);
    limb(20.6, 34.4, 21.2, 47 - stride, pnD, 5.2);
    limb(12.8, 47 + stride, 12.6, 49 + stride, p.boot, 5.4);
    limb(21.2, 47 - stride, 21.4, 49 - stride, p.boot, 5.4);
    limb(9.4, 21, 8.4 - stride, 32.4, ctD, 4.6);
    limb(24.6, 21, 25.6 + stride, 32.4, ctD, 4.6);
    c.fillStyle = p.skin;
    c.beginPath(); c.arc(8.4 - stride, 33.8, 2.2, 0, 7); c.fill();
    c.beginPath(); c.arc(25.6 + stride, 33.8, 2.2, 0, 7); c.fill();
    const g = c.createLinearGradient(7, 16, 27, 36);
    g.addColorStop(0, ctL); g.addColorStop(0.5, p.coat); g.addColorStop(1, ctD);
    c.fillStyle = g; roundedRect(c, 7.6, 16.2, 18.8, 19.2, 6); c.fill();
    c.strokeStyle = 'rgba(10,12,18,0.28)'; c.lineWidth = 1.2; roundedRect(c, 8.4, 17, 17.2, 17.6, 5.4); c.stroke();
    if (!back) {
      const sg = c.createLinearGradient(0, 17, 0, 33);
      sg.addColorStop(0, mixc(p.shirt, '#ffffff', 0.16)); sg.addColorStop(1, mixc(p.shirt, '#141018', 0.3));
      c.fillStyle = sg; roundedRect(c, 14.6, 17.4, 4.8, 15, 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(9, 32.4, 16, 1.8);
      c.fillStyle = '#c9cfdd'; c.fillRect(16.1, 32.4, 1.8, 1.8);
    } else {
      c.fillStyle = 'rgba(8,10,14,0.2)'; c.fillRect(16.4, 18, 1.4, 15.4);
    }
    const hg = c.createRadialGradient(15, 8, 1.4, 17, 10.4, 7.2);
    hg.addColorStop(0, skL); hg.addColorStop(1, skD);
    c.fillStyle = hg; c.beginPath(); c.arc(17, 10.4, 6, 0, 7); c.fill();
    c.fillStyle = skD; c.fillRect(15.2, 15.4, 3.8, 2.4);
    if (back) {
      c.fillStyle = p.hair; c.beginPath(); c.arc(17, 10, 6.1, 0, 7); c.fill();
      if (p.hairLong) { c.fillStyle = p.hair; roundedRect(c, 13, 12, 8, 9, 3); c.fill(); }
    } else {
      c.fillStyle = p.hair;
      c.beginPath(); c.arc(17, 9.9, 6.15, Math.PI * 0.97, Math.PI * 2.03); c.closePath(); c.fill();
      c.fillRect(10.9, 9.6, 2.2, 3.4); c.fillRect(20.9, 9.6, 2.2, 3.4);
      if (p.hairLong) { roundedRect(c, 10.2, 9.4, 3, 11.4, 1.4); c.fill(); roundedRect(c, 20.8, 9.4, 3, 11.4, 1.4); c.fill(); }
      c.fillStyle = '#14161c'; c.fillRect(14.2, 11, 2, 1.9); c.fillRect(17.8, 11, 2, 1.9);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(14.2, 10.8, 2, 0.6); c.fillRect(17.8, 10.8, 2, 0.6);
      c.fillStyle = 'rgba(60,30,24,0.35)'; c.fillRect(15.4, 14.4, 3.2, 1);
    }
    if (p.cap) {
      c.fillStyle = p.cap;
      c.beginPath(); c.arc(17, 9.4, 6.2, Math.PI * 0.92, Math.PI * 2.06); c.closePath(); c.fill();
      if (!back) { c.fillStyle = mixc(p.cap, '#000', 0.3); c.fillRect(11.2, 8.8, 11.6, 1.6); }
    }
  }
}
function drawActor(c, a, sprSet) {
  const s = scr(a.x, a.y, 0);
  // soft cast + contact shadow
  c.fillStyle = 'rgba(26,26,20,0.28)';
  c.beginPath(); c.ellipse(s.x + 8, s.y + 1, 15, 5, 0.22, 0, 7); c.fill();
  c.fillStyle = 'rgba(20,20,16,0.3)';
  c.beginPath(); c.ellipse(s.x, s.y + 0.6, 7.4, 3.2, 0, 0, 7); c.fill();
  const ph = a.moving ? Math.floor(a.anim * 7) % 4 : 1;
  const face = a.face || 'down';
  const spr = sprSet[face === 'side' ? 'side' : face][ph];
  c.save();
  if (a.alpha != null) c.globalAlpha = a.alpha;
  c.translate(s.x, s.y);
  if (face === 'side' && a.flip) c.scale(-1, 1);
  c.drawImage(spr, -17, -50, 34, 52);
  c.restore(); c.globalAlpha = 1;
  // held gun toward aim
  if (a.gun) {
    const ang = Math.atan2(py(Math.cos(a.aim), Math.sin(a.aim), 0), px(Math.cos(a.aim), Math.sin(a.aim)));
    c.save(); c.translate(s.x, s.y - 19); c.rotate(ang);
    c.fillStyle = '#20222a'; c.fillRect(5, -1.4, a.gun === 'rifle' ? 21 : 13, 3.6);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(5, -1.4, a.gun === 'rifle' ? 21 : 13, 1.1);
    if (a.gun === 'rifle') { c.fillStyle = '#4a3a26'; c.fillRect(1, -1.2, 6, 3.2); }
    c.restore();
  }
}
function drawBody(c, b) {                                  // the fallen
  const s = scr(b.x, b.y, 0);
  c.save(); c.translate(s.x, s.y); c.rotate(b.a);
  c.globalAlpha = 0.95;
  const spr = (b.guard ? SPRITES.guard : SPRITES.vm).side[1];
  c.drawImage(spr, -26, -17, 34 * 0.98, 52 * 0.98);
  c.restore(); c.globalAlpha = 1;
}
