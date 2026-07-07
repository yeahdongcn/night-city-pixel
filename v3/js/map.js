'use strict';
// ============ map.js — one hand-crafted mission map (Commandos style) ============
// OPERATION: DEAD MAIL — a Barghest cargo depot on the old coast road.
// Everything here is composed by hand: the checkpoint, the walled depot,
// the farmstead, tree lines and patrol routes are placed like a level, not rolled.

let MAPD = null, SOLIDS = [], FENCEC = [];

function spline(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const seg = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function buildMap() {
  const road = spline([
    { x: 140, y: 2120 }, { x: 560, y: 1810 }, { x: 1020, y: 1560 },
    { x: 1330, y: 1300 }, { x: 1620, y: 1010 }, { x: 1990, y: 700 }, { x: 2320, y: 470 },
  ], 26);
  const lane = spline([{ x: 1180, y: 1420 }, { x: 1080, y: 1260 }, { x: 1035, y: 1105 }], 24);

  MAPD = {
    W: 2500, H: 2400,
    roads: [{ pts: road, w: 74 }, { pts: lane, w: 44 }],
    paths: [
      [{ x: 1035, y: 1100 }, { x: 1035, y: 1010 }],
      [{ x: 1620, y: 1330 }, { x: 1700, y: 1420 }, { x: 1760, y: 1555 }],
    ],
    dirt: [
      { x: 1035, y: 800, r: 420 },   // depot yard halo
      { x: 1330, y: 1300, r: 260 },  // checkpoint
      { x: 1780, y: 1660, r: 300 },  // farm
      { x: 320, y: 2020, r: 200 },   // insertion
    ],
    yards: [{ x: 700, y: 480, w: 680, h: 540 }],
    fields: [{ x: 1960, y: 1350, w: 420, h: 330, a: -0.22 }],

    // ---- the depot (objective) ----
    bldgs: [
      { x: 760, y: 540, w: 340, d: 180, h: 96, rise: 58, mat: 'brick', roof: 'slate', chimney: true, ivy: true, doorFace: 's', sign: 'ARASAKA FREIGHT', signCol: '#e33', awning: 0 },
      { x: 1190, y: 560, w: 165, d: 120, h: 62, rise: 40, mat: 'stucco', roof: 'rust', chimney: false, doorFace: 's' },
      // farmhouse
      { x: 1650, y: 1560, w: 230, d: 140, h: 78, rise: 52, mat: 'stone', roof: 'terra', chimney: true, ivy: true, doorFace: 's', awning: '#8a4a3a' },
      // roadside shack near insertion
      { x: 470, y: 1830, w: 130, d: 95, h: 52, rise: 34, mat: 'stucco', roof: 'rust', doorFace: 'e' },
    ],

    // depot perimeter (stone) — gate on the south side toward the lane
    walls: [
      { x0: 690, y0: 460, x1: 1400, y1: 478, h: 30, t: 18 },     // north
      { x0: 690, y0: 478, x1: 708, y1: 1040, h: 30, t: 18 },     // west
      { x0: 1382, y0: 478, x1: 1400, y1: 1040, h: 30, t: 18 },   // east
      { x0: 690, y0: 1022, x1: 968, y1: 1040, h: 30, t: 18 },    // south-west of gate
      { x0: 1108, y0: 1022, x1: 1400, y1: 1040, h: 30, t: 18 },  // south-east of gate
      // checkpoint walls astride the road
      { x0: 1150, y0: 1345, x1: 1258, y1: 1362, h: 28, t: 16 },
      { x0: 1400, y0: 1218, x1: 1520, y1: 1235, h: 28, t: 16 },
    ],
    pillars: [
      { x: 985, y: 1032, s: 15, h: 66 }, { x: 1092, y: 1032, s: 15, h: 66 },        // depot gate
      { x: 1282, y: 1352, s: 14, h: 74 }, { x: 1382, y: 1228, s: 14, h: 74 },       // checkpoint
    ],
    fences: [
      { x0: 1560, y0: 1490, x1: 1935, y1: 1490 }, { x0: 1935, y0: 1490, x1: 1935, y1: 1855 },
      { x0: 1560, y0: 1855, x1: 1935, y1: 1855 }, { x0: 1560, y0: 1490, x1: 1560, y1: 1690 },
      { x0: 1560, y0: 1790, x1: 1560, y1: 1855 },                                    // gap = paddock gate
    ],
    props: [
      { kind: 'crates', x: 810, y: 930 }, { kind: 'crates', x: 1300, y: 620 },
      { kind: 'barrels', x: 1180, y: 950 }, { kind: 'barrels', x: 745, y: 760 },
      { kind: 'spool', x: 1330, y: 900 },
      { kind: 'traps', x: 1180, y: 1442 }, { kind: 'traps', x: 1455, y: 1140 },
      { kind: 'wagon', x: 1720, y: 1790, a: 0.5 },
      { kind: 'crates', x: 545, y: 1935 },
      { kind: 'boom', x: 1298, y: 1338, a: angTo(1298, 1338, 1372, 1245), len: 118 },
    ],
    trees: [
      { x: 340, y: 620, r: 56 }, { x: 470, y: 520, r: 44 }, { x: 250, y: 800, r: 48 }, { x: 430, y: 940, r: 60 },
      { x: 560, y: 700, r: 38 }, { x: 300, y: 1130, r: 52 },
      { x: 1560, y: 640, r: 54 }, { x: 1700, y: 780, r: 46 }, { x: 1830, y: 560, r: 58 },
      { x: 2120, y: 1050, r: 50 }, { x: 2260, y: 1230, r: 44 },
      { x: 830, y: 1330, r: 46 }, { x: 700, y: 1480, r: 52 },
      { x: 2090, y: 1900, r: 56 }, { x: 2230, y: 1760, r: 44 }, { x: 1990, y: 2040, r: 48 },
      { x: 1090, y: 1830, r: 42 }, { x: 900, y: 1990, r: 50 }, { x: 1420, y: 1700, r: 40 },
      { x: 160, y: 1550, r: 44 }, { x: 640, y: 2200, r: 46 }, { x: 1240, y: 2120, r: 52 },
    ],
    lamps: [
      { x: 1035, y: 1085 }, { x: 1240, y: 1395 }, { x: 1430, y: 1185 },
      { x: 880, y: 1660 }, { x: 1740, y: 940 },
    ],

    crates: [
      { x: 900, y: 860, loot: 4200 }, { x: 1245, y: 700, loot: 3600 }, { x: 1035, y: 640, loot: 5200 },
    ],
    patrols: [
      { pts: [{ x: 1035, y: 1090 }, { x: 1035, y: 1180 }], idle: 2.2, gun: 'rifle' },           // gate sentry
      { pts: [{ x: 1290, y: 1290 }, { x: 1360, y: 1268 }], idle: 3.0, gun: 'rifle' },           // checkpoint
      { pts: [{ x: 780, y: 620 }, { x: 1150, y: 600 }, { x: 1150, y: 950 }, { x: 790, y: 960 }], idle: 1.4, gun: 'rifle' },   // yard loop
      { pts: [{ x: 1330, y: 760 }, { x: 1240, y: 980 }, { x: 1120, y: 760 }], idle: 1.8, gun: 'pistol' },
      { pts: [{ x: 1210, y: 520 }, { x: 1340, y: 520 }], idle: 2.6, gun: 'pistol' },            // shed guard
      { pts: [{ x: 1470, y: 1090 }, { x: 1620, y: 1010 }, { x: 1800, y: 880 }], idle: 2.0, gun: 'rifle' },  // road patrol
      { pts: [{ x: 1755, y: 1740 }, { x: 1660, y: 1740 }], idle: 4.0, gun: 'pistol' },          // farm porch
    ],
    pstart: { x: 300, y: 2080 },
    extract: { x: 255, y: 2125, r: 70 },
  };

  // ---- collision registry: axis-aligned rects (movement + LOS + bullets) ----
  SOLIDS = []; FENCEC = [];
  for (const b of MAPD.bldgs) SOLIDS.push({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d, h: b.h });
  for (const w of MAPD.walls) { const t = w.t / 2; SOLIDS.push({ x0: w.x0 - t, y0: w.y0 - t, x1: w.x1 + t, y1: w.y1 + t, h: w.h }); }
  for (const p of MAPD.pillars) SOLIDS.push({ x0: p.x - p.s, y0: p.y - p.s, x1: p.x + p.s, y1: p.y + p.s, h: p.h });
  for (const pr of MAPD.props) {
    if (pr.kind === 'crates') SOLIDS.push({ x0: pr.x - 26, y0: pr.y - 22, x1: pr.x + 26, y1: pr.y + 26, h: 22, low: true });
    if (pr.kind === 'barrels') SOLIDS.push({ x0: pr.x - 17, y0: pr.y - 15, x1: pr.x + 17, y1: pr.y + 17, h: 16, low: true });
    if (pr.kind === 'wagon') SOLIDS.push({ x0: pr.x - 30, y0: pr.y - 24, x1: pr.x + 30, y1: pr.y + 24, h: 18, low: true });
    if (pr.kind === 'spool') SOLIDS.push({ x0: pr.x - 13, y0: pr.y - 9, x1: pr.x + 13, y1: pr.y + 11, h: 14, low: true });
  }
  for (const cr of MAPD.crates) SOLIDS.push({ x0: cr.x - 15, y0: cr.y - 15, x1: cr.x + 15, y1: cr.y + 15, h: 22, low: true });
  for (const f of MAPD.fences) FENCEC.push(f);
}

// movement: circle vs solids + fences + map bounds
function blocked(x, y, rad) {
  if (x < rad + 30 || y < rad + 30 || x > MAPD.W - rad - 30 || y > MAPD.H - rad - 30) return true;
  for (const s of SOLIDS) {
    if (x > s.x0 - rad && x < s.x1 + rad && y > s.y0 - rad && y < s.y1 + rad) return true;
  }
  for (const f of FENCEC) {
    // distance point→segment
    const dx = f.x1 - f.x0, dy = f.y1 - f.y0, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - f.x0) * dx + (y - f.y0) * dy) / L2, 0, 1);
    if (dist(x, y, f.x0 + dx * t, f.y0 + dy * t) < rad + 4) return true;
  }
  return false;
}
function slideMove(a, dx, dy, rad) {
  if (!blocked(a.x + dx, a.y + dy, rad)) { a.x += dx; a.y += dy; return true; }
  if (!blocked(a.x + dx, a.y, rad)) { a.x += dx; return true; }
  if (!blocked(a.x, a.y + dy, rad)) { a.y += dy; return true; }
  return false;
}

// sight: segment vs TALL solids only (fences and low cargo don't block eyes)
function losClear(x0, y0, x1, y1) {
  for (const s of SOLIDS) {
    if (s.low) continue;
    if (segRect(x0, y0, x1, y1, s)) return false;
  }
  return true;
}
// bullets stop on anything solid (incl. low cover — that's what cover is for)
function shotClear(x0, y0, x1, y1) {
  for (const s of SOLIDS) if (segRect(x0, y0, x1, y1, s)) return false;
  return true;
}
function segRect(x0, y0, x1, y1, s) {
  let tmin = 0, tmax = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, d, lo, hi] of [[x0, dx, s.x0, s.x1], [y0, dy, s.y0, s.y1]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; }
    else {
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
// first hit point of a ray (for cone clipping), capped at maxD
function rayHit(x0, y0, ang, maxD) {
  const x1 = x0 + Math.cos(ang) * maxD, y1 = y0 + Math.sin(ang) * maxD;
  let best = maxD;
  for (const s of SOLIDS) {
    if (s.low) continue;
    const t = rayRectT(x0, y0, x1 - x0, y1 - y0, s);
    if (t != null && t * maxD < best) best = t * maxD;
  }
  return best;
}
function rayRectT(x0, y0, dx, dy, s) {
  let tmin = 0, tmax = 1;
  for (const [p, d, lo, hi] of [[x0, dx, s.x0, s.x1], [y0, dy, s.y0, s.y1]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; }
    else {
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : null;
}
