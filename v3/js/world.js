'use strict';
// ============ v3 world: a Commandos-style Night City outskirts map ============
// REBUILT from scratch for the tactical edition: no city grid — organic terrain,
// curved roads, walled compounds with gates, wire fences, prop clutter, big trees.
// The sim contract is unchanged: WORLD exposes the same tiles/queries/lists the
// game logic uses (shops, roofs, dens, npcs, bushes, obst, crateSpots, …), so all
// systems and the shared save keep working. Seed is fixed → deterministic map.
let WORLD = null;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const RD = []; // legacy export (the grid roads are gone)
const WT = { ROAD: 0, WALK: 1, BLDG: 2, PLAZA: 3, PARK: 4, FLOOR: 5, DOOR: 6 };

// ---- tiny deterministic value noise (terrain painting + masks) ----
function _n2(ix, iy, s) {
  let h = (ix * 374761393 + iy * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return _n2(ix, iy, s) * (1 - u) * (1 - v) + _n2(ix + 1, iy, s) * u * (1 - v)
       + _n2(ix, iy + 1, s) * (1 - u) * v + _n2(ix + 1, iy + 1, s) * u * v;
}
function fbm2(x, y, s) { return vnoise(x, y, s) * 0.65 + vnoise(x * 2.3, y * 2.3, s + 7) * 0.35; }

// Catmull-Rom through control points → dense samples (world px)
function _spline(pts, step) {
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

function _districtOfTile(tx, ty) {
  if (tx >= 42 && tx <= 81 && ty >= 42 && ty <= 81) return 'center';
  if (tx < 42 && ty >= 78) return 'dogtown';
  if (tx < 64) return ty < 64 ? 'watson' : 'pacifica';
  return ty < 64 ? 'westbrook' : 'santo';
}

function genWorld() {
  const W = 128, H = 128;
  const t = new Uint8Array(W * H).fill(WT.WALK);          // packed-dirt country
  const rng = mulberry32(20770612);
  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // ---- coast (W + S) and rocky ridge (N + E) masks, noisy edges ----
  const water = new Uint8Array(W * H), rock = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wEdge = 3.5 + vnoise(y * 0.12, 3, 11) * 4, sEdge = 124 - vnoise(x * 0.12, 9, 12) * 4;
    const nEdge = 2.5 + vnoise(x * 0.13, 5, 13) * 3, eEdge = 125 - vnoise(y * 0.13, 7, 14) * 3;
    if (x < wEdge || y > sEdge) { water[idx(x, y)] = 1; t[idx(x, y)] = WT.BLDG; }
    else if (y < nEdge || x > eEdge) { rock[idx(x, y)] = 1; t[idx(x, y)] = WT.BLDG; }
  }

  // ---- grass meadows over the dirt ----
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t[idx(x, y)] !== WT.WALK) continue;
    if (fbm2(x / 9, y / 9, 21) > 0.52) t[idx(x, y)] = WT.PARK;
  }

  // ---- roads: three lazy curves across the country ----
  const J = (x, y, a) => ({ x: (x + (rng() - 0.5) * a) * TILE, y: (y + (rng() - 0.5) * a) * TILE });
  const roads = [
    { w: 30, kind: 'asphalt', pts: _spline([J(6, 62, 4), J(26, 58, 6), J(48, 64, 6), J(70, 56, 6), J(94, 44, 6), J(122, 34, 4)], 10) },
    { w: 26, kind: 'gravel', pts: _spline([J(44, 122, 4), J(52, 100, 6), J(62, 78, 6), J(60, 54, 6), J(70, 30, 6), J(84, 6, 4)], 10) },
    { w: 22, kind: 'gravel', pts: _spline([J(24, 100, 5), J(40, 88, 6), J(58, 88, 5), J(76, 92, 6), J(96, 84, 6), J(110, 66, 5)], 10) },
  ];
  for (const rd of roads) {
    const rT = Math.ceil(rd.w / 2 / TILE);
    for (const p of rd.pts) {
      const cx = Math.round(p.x / TILE), cy = Math.round(p.y / TILE);
      for (let dy = -rT; dy <= rT; dy++) for (let dx = -rT; dx <= rT; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!inB(x, y) || water[idx(x, y)] || rock[idx(x, y)]) continue;
        if (Math.hypot(dx, dy) <= rd.w / 2 / TILE + 0.2) t[idx(x, y)] = WT.ROAD;
      }
    }
  }

  // ============ compounds ============
  const bldgs = [], walls = [], fences = [], props = [], trees = [], wrecks = [], fields = [];
  const crateSpots = [], vends = [], holos = [], signs = [], lights = [], puddles = [], displays = [], roofs = [], dens = [], npcs = [], obst = [], bushes = [], alleys = [];
  const shops = {};
  const solid = (x, y, w, h) => obst.push({ x, y, w, h });
  const BUSH_BY_DIST = { center: 'hedge', watson: 'bush', westbrook: 'neon', santo: 'scrub', pacifica: 'grass', dogtown: 'dead' };
  const plant = (tx, ty, kind) => bushes.push({ x: tx * TILE + 8, y: ty * TILE + 8, r: 11, kind });

  const setRect = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inB(x, y)) t[idx(x, y)] = v; };
  const clearOf = (x0, y0, w, h) => { // free of water/rock/road
    for (let y = y0 - 1; y < y0 + h + 1; y++) for (let x = x0 - 1; x < x0 + w + 1; x++) {
      if (!inB(x, y) || water[idx(x, y)] || rock[idx(x, y)] || t[idx(x, y)] === WT.ROAD) return false;
    }
    return true;
  };

  // sites: walk the roads, hop off sideways — compounds hug the routes like the refs
  const sites = [];
  const wantSite = (tx, ty) => {
    if (tx < 10 || ty < 8 || tx > 116 || ty > 114) return false;
    for (const s of sites) if (Math.hypot(s.tx - tx, s.ty - ty) < 17) return false;
    return true;
  };
  const roadPool = [];
  for (const rd of roads) for (let i = 6; i < rd.pts.length - 6; i += 5) roadPool.push({ p: rd.pts[i], q: rd.pts[Math.min(i + 2, rd.pts.length - 1)] });
  let guard = 0;
  while (sites.length < 15 && guard++ < 400) {
    const seg = roadPool[(rng() * roadPool.length) | 0];
    const dx = seg.q.x - seg.p.x, dy = seg.q.y - seg.p.y, L = Math.hypot(dx, dy) || 1;
    const side = rng() < 0.5 ? 1 : -1, off = (7 + rng() * 4) * TILE;
    const tx = Math.round((seg.p.x - dy / L * off * side) / TILE), ty = Math.round((seg.p.y + dx / L * off * side) / TILE);
    if (wantSite(tx, ty)) sites.push({ tx, ty });
  }
  // shops claim the first sites that successfully place, nearest the centre first
  sites.sort((a, b) => Math.hypot(a.tx - 64, a.ty - 64) - Math.hypot(b.tx - 64, b.ty - 64));
  const themeQueue = ['bar', 'guns', 'ripper', 'cars', 'clouds'];
  const SHOP_META = {
    bar: { name: 'AFTERLIFE', col: '#ff2a6d' }, guns: { name: '2ND AMENDMENT', col: '#f9f002' },
    ripper: { name: "VIK'S CLINIC", col: '#05d9e8' }, cars: { name: 'NC AUTOFIXER', col: '#00ff9f' },
    clouds: { name: 'CLOUDS', col: '#bd00ff' },
  };
  let spawnPt = null, skippySpot = null;

  const placeCompound = (site, si) => {
    const padW = 15 + (rng() * 5 | 0), padH = 12 + (rng() * 4 | 0);
    let px0 = site.tx - (padW >> 1), py0 = site.ty - (padH >> 1);
    px0 = Math.max(4, Math.min(W - padW - 4, px0)); py0 = Math.max(4, Math.min(H - padH - 4, py0));
    if (!clearOf(px0, py0, padW, padH)) {
      // nudge the pad away from whatever it clipped (road/coast) before giving up
      let placed = false;
      for (const [sx, sy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [5, 3], [-5, 3], [5, -3], [-5, -3], [0, 6], [6, 0], [-6, 0], [0, -6]]) {
        const nx = Math.max(4, Math.min(W - padW - 4, px0 + sx)), ny = Math.max(4, Math.min(H - padH - 4, py0 + sy));
        if (clearOf(nx, ny, padW, padH)) { px0 = nx; py0 = ny; placed = true; break; }
      }
      if (!placed) return false;
    }
    const theme = themeQueue.length ? themeQueue.shift() : null;
    // paved yard with nibbled organic edge
    for (let y = py0; y < py0 + padH; y++) for (let x = px0; x < px0 + padW; x++) {
      const ex = Math.min(x - px0, px0 + padW - 1 - x), ey = Math.min(y - py0, py0 + padH - 1 - y);
      if (Math.min(ex, ey) === 0 && vnoise(x * 0.7, y * 0.7, 31 + si) < 0.45) continue;
      t[idx(x, y)] = WT.PLAZA;
    }
    // main building (north side of the yard), optional annex
    const bw = Math.min(padW - 4, 6 + (rng() * 4 | 0)), bh = 4 + (rng() * 2 | 0);
    const bx = px0 + 2 + ((padW - 4 - bw) * rng() | 0), by = py0 + 1;
    setRect(bx, by, bw, bh, WT.BLDG);
    const ROOFS = ['#8a4f35', '#7d4a38', '#5c6068', '#6e5342', '#65605a'];
    const ent = !!theme || rng() < 0.55;
    const den = !theme && ent && rng() < 0.45;
    const b = {
      x: bx, y: by, w: bw, h: bh,
      roof: ROOFS[rng() * ROOFS.length | 0],
      neon: theme ? SHOP_META[theme].col : (rng() < 0.3 ? ['#ff2a6d', '#05d9e8', '#f9f002'][rng() * 3 | 0] : null),
      sign: theme ? { text: SHOP_META[theme].name, col: SHOP_META[theme].col } : null,
      ent, den, theme: theme || (den ? 'den' : 'flat'),
    };
    bldgs.push(b);
    if (!theme && rng() < 0.5 && padW > 13) { // annex shed (never in shop yards — they stay open)
      const aw = 3 + (rng() * 2 | 0), ah = 3;
      const ax = rng() < 0.5 ? px0 + 1 : px0 + padW - aw - 1, ay = py0 + padH - ah - 1;
      if (clearOf(ax, ay, aw, ah + 1)) {
        setRect(ax, ay, aw, ah, WT.BLDG);
        bldgs.push({ x: ax, y: ay, w: aw, h: ah, roof: ROOFS[rng() * ROOFS.length | 0], neon: null, sign: null, theme: 'shed' });
      }
    }
    // perimeter: stone walls (with gates) or wire fence
    const wx0 = px0 - 1, wy0 = py0 - 1, wx1 = px0 + padW, wy1 = py0 + padH;
    const useWall = rng() < 0.55;
    const gate = 2 + ((padW - 6) * rng() | 0);
    if (useWall) {
      const seg = (x0, y0, x1, y1) => { // stamp + record one wall run
        if (x1 < x0 || y1 < y0) return;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y) && t[idx(x, y)] !== WT.BLDG) t[idx(x, y)] = WT.BLDG;
        walls.push({ x0: x0 * TILE, y0: y0 * TILE, x1: (x1 + 1) * TILE, y1: (y1 + 1) * TILE, h: 9, seed: x0 * 31 + y0 * 7 });
      };
      seg(wx0, wy0, bx - 1, wy0); seg(bx + bw, wy0, wx1, wy0);            // north (building sits in it)
      seg(wx0, wy0 + 1, wx0, wy1);                                       // west
      seg(wx1, wy0 + 1, wx1, wy1);                                       // east
      seg(wx0 + 1, wy1, wx0 + gate - 1, wy1); seg(wx0 + gate + 2, wy1, wx1 - 1, wy1); // south w/ gate
    } else {
      const post = (x0, y0, x1, y1) => { fences.push({ x0: x0 * TILE + 8, y0: y0 * TILE + 8, x1: x1 * TILE + 8, y1: y1 * TILE + 8 }); };
      post(wx0, wy0, wx0 + gate - 1, wy0); post(wx0 + gate + 2, wy0, wx1, wy0);
      post(wx0, wy0, wx0, wy1); post(wx1, wy0, wx1, wy1);
      post(wx0, wy1, wx0 + gate - 1, wy1); post(wx0 + gate + 2, wy1, wx1, wy1);
    }
    // yard clutter
    const pxc = (px0 + padW / 2) * TILE, pyc = (py0 + padH / 2) * TILE;
    const dropProp = (kind, ox, oy, cw, ch) => {
      const x = pxc + ox * TILE, y = pyc + oy * TILE;
      props.push({ kind, x, y, seed: (x * 13 + y * 7) | 0 });
      if (cw) solid(x - cw / 2, y - ch / 2, cw, ch);
      return { x, y };
    };
    const cs = dropProp('crates', -padW / 2 + 2.2, padH / 2 - 2.2, 14, 12);
    crateSpots.push({ x: cs.x + 14, y: cs.y - 6 });
    if (rng() < 0.7) dropProp('barrels', padW / 2 - 2.5, padH / 2 - 2.3, 12, 9);
    if (rng() < 0.5 && !theme) dropProp('container', padW / 2 - 3.4, -padH / 2 + 3.2, 30, 15);
    if (rng() < 0.5) dropProp('spool', -padW / 2 + 2, -padH / 2 + 3.4, 9, 9);
    if (theme) { vends.push({ x: (px0 + 1) * TILE + 8, y: (py0 + padH - 2) * TILE + 8 }); }
    else if (rng() < 0.3) vends.push({ x: (px0 + padW - 2) * TILE + 8, y: (py0 + padH - 2) * TILE });
    crateSpots.push({ x: (px0 + padW - 2) * TILE, y: (py0 + 2) * TILE + 8 });
    const dk = BUSH_BY_DIST[_districtOfTile(site.tx, site.ty)] || 'bush';
    plant(wx0 - 1, wy0 - 1, dk); plant(wx1 + 1, wy1 + 1, dk); plant(wx1 + 1, wy0 - 1, dk);
    if (theme === 'bar') spawnPt = { x: pxc, y: (py0 + padH - 3) * TILE };
    if (theme === 'cars') {
      displays.push({ x: pxc - 28, y: pyc + 20, id: 'type66' });
      displays.push({ x: pxc + 28, y: pyc + 20, id: 'shion' });
    }
    if (theme === 'clouds') {
      holos.push({ x: pxc, y: (py0 + padH + 2) * TILE, text: 'JIG-JIG STREET', col: '#ff2a6d' });
      npcs.push({ x: pxc - 30, y: pyc + 14, i: 4, name: 'ANGEL', kind: 'joy' });
      npcs.push({ x: pxc + 30, y: pyc + 18, i: 5, name: 'SKYE', kind: 'joy' });
      obst.push({ x: pxc - 34, y: pyc + 10, w: 8, h: 9 });
      obst.push({ x: pxc + 26, y: pyc + 14, w: 8, h: 9 });
    }
    return true;
  };
  sites.forEach((site, si) => placeCompound(site, si));
  // any shop that failed to site force-places on a spiral scan from the centre
  let scanR = 12;
  while (themeQueue.length && scanR < 56) {
    for (let a = 0; a < 14 && themeQueue.length; a++) {
      const ang = (a / 14 + scanR * 0.03) * Math.PI * 2;
      const s2 = { tx: Math.round(64 + Math.cos(ang) * scanR), ty: Math.round(64 + Math.sin(ang) * scanR) };
      if (!wantSite(s2.tx, s2.ty)) continue;
      if (placeCompound(s2, 90 + scanR + a)) sites.push(s2);
    }
    scanR += 7;
  }
  // the outskirts always hide at least two gang dens
  let denCount = bldgs.filter(b => b.den).length;
  for (const b of bldgs) {
    if (denCount >= 2) break;
    if (b.theme === 'flat') { b.den = true; b.ent = true; b.theme = 'den'; denCount++; }
  }

  // ---- carve interiors, doors, roofs, dens; register shop desks + vendors ----
  const NAMES = { guns: 'WILSON', ripper: 'VIKTOR', cars: 'DAKOTA', bar: 'CLAIRE' };
  for (const b of bldgs) {
    if (!b.ent) continue;
    setRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, WT.FLOOR);
    const cx = b.x + (b.w >> 1);
    b.doors = b.w >= 8 ? [cx - 1, cx] : [cx];
    for (const dx of b.doors) t[idx(dx, b.y + b.h - 1)] = WT.DOOR;
    const r = {
      x: b.x * TILE, y: b.y * TILE, w: b.w * TILE, h: b.h * TILE, a: 1,
      tx0: b.x, ty0: b.y, tx1: b.x + b.w - 1, ty1: b.y + b.h - 1,
      doorTx: b.doors.slice(), doorTy: b.y + b.h - 1, lights: [],
    };
    const fx = (b.x + 1) * TILE, fy = (b.y + 1) * TILE, fw = (b.w - 2) * TILE, fh = (b.h - 2) * TILE, ccx = fx + fw / 2;
    // furniture collision mirrors the tactical interior painter (mil.js)
    if (b.theme !== 'shed') solid(fx + 4, fy + 12, fw - 8, 9);            // counter
    switch (b.theme) {
      case 'guns': solid(fx + 4, fy + 26, 14, Math.max(6, fh - 32)); solid(fx + fw - 18, fy + 26, 14, Math.max(6, fh - 32)); r.lights.push({ x: ccx, y: fy + 14, col: '#f9f002' }); break;
      case 'ripper': solid(ccx - 7, fy + 26, 14, 20); r.lights.push({ x: fx + 11, y: fy + 8, col: '#05d9e8' }); break;
      case 'cars': solid(ccx - 15, fy + 27, 30, 21); solid(fx + 5, fy + 28, 8, 6); r.lights.push({ x: ccx, y: fy + 14, col: '#00ff9f' }); break;
      case 'bar': r.lights.push({ x: ccx, y: fy + 14, col: '#ff2a6d' }); break;
      case 'clouds': solid(fx + 6, fy + 30, 22, 8); solid(fx + fw - 28, fy + 30, 22, 8); solid(ccx - 4, fy + 21, 8, 9); npcs.push({ x: ccx, y: fy + 27, i: 3, name: 'EVE', kind: 'doll' }); r.lights.push({ x: ccx - 18, y: fy + 33, col: '#ff2a6d' }); r.lights.push({ x: ccx + 18, y: fy + 33, col: '#bd00ff' }); break;
      case 'den': { solid(fx + 4, fy + 8, 16, 6); solid(ccx - 9, fy + fh / 2 - 5, 18, 10); b.denId = dens.length; dens.push({ id: dens.length, tx0: b.x, ty0: b.y, tx1: b.x + b.w - 1, ty1: b.y + b.h - 1, done: false, cleared: false, left: 0 }); r.lights.push({ x: ccx, y: fy + fh / 2, col: '#ff2a3c' }); break; }
      default: solid(fx + fw - 18, fy + 6, 14, 20); solid(ccx - 8, fy + fh / 2, 16, 10); solid(fx + 4, fy + 7, 10, 6); r.lights.push({ x: fx + 9, y: fy + 10, col: '#7ad7ff' });
    }
    if (NAMES[b.theme]) {
      shops[b.theme] = { x: ccx, y: fy + TILE + 8, name: b.sign.text };
      npcs.push({ x: ccx, y: fy + 8, i: { guns: 2, ripper: 0, cars: 5, bar: 4 }[b.theme], name: NAMES[b.theme] });
      solid(ccx - 4, fy + 2, 8, 9);
      for (let k = 0; k < (b.den ? 2 : 1) + 1; k++) crateSpots.push({ x: fx + 6 + ((fw - 12) * rng() | 0), y: fy + fh - 8 });
    } else if (b.theme === 'flat' || b.theme === 'den') {
      for (let k = 0; k < (b.den ? 2 : 1); k++) crateSpots.push({ x: fx + 6 + ((fw - 12) * rng() | 0), y: fy + 6 + (Math.max(1, fh - 14) * rng() | 0) });
    }
    if (b.sign) signs.push({ x: (b.x + b.w / 2) * TILE, y: (b.y + b.h) * TILE - 6, text: b.sign.text, col: b.sign.col, big: true, roof: roofs.length });
    roofs.push(r);
  }
  // flavor boards on a couple of warehouses
  const noSign = bldgs.filter(b => !b.sign && b.theme !== 'shed');
  for (let k = 0; k < Math.min(3, noSign.length); k++) {
    const b = noSign[(rng() * noSign.length) | 0];
    if (b.sign) continue;
    b.sign = { text: ['MILITECH DEPOT', 'KANG TAO YARD', 'BIOTECHNICA', 'ARASAKA FREIGHT'][rng() * 4 | 0], col: ['#f9f002', '#05d9e8', '#2ecc71', '#ff2a3c'][rng() * 4 | 0] };
    signs.push({ x: (b.x + b.w / 2) * TILE, y: (b.y + b.h) * TILE - 6, text: b.sign.text, col: b.sign.col, big: false, roof: null });
  }

  // ---- trees: woods + roadside rows (big canopies like the refs) ----
  guard = 0;
  while (trees.length < 95 && guard++ < 3000) {
    const x = 6 + rng() * (W - 14), y = 5 + rng() * (H - 12);
    const txi = x | 0, tyi = y | 0;
    if (water[idx(txi, tyi)] || rock[idx(txi, tyi)]) continue;
    const tv = t[idx(txi, tyi)];
    if (tv === WT.BLDG || tv === WT.ROAD || tv === WT.PLAZA || tv === WT.FLOOR || tv === WT.DOOR) continue;
    let ok = true;
    for (const tr of trees) if (Math.hypot(tr.x - x * TILE, tr.y - y * TILE) < 52) { ok = false; break; }
    if (!ok) continue;
    const grove = fbm2(x / 7, y / 7, 41) > 0.55;
    if (!grove && rng() < 0.6) continue;
    trees.push({ x: x * TILE, y: y * TILE, r: 9 + rng() * 7 + (grove ? 2 : 0), col: rng() < 0.5 ? '#3c5426' : '#46522a' });
  }
  // ---- bushes fill hedgerows near trees and walls ----
  guard = 0;
  while (bushes.length < 70 && guard++ < 2000) {
    const anchor = rng() < 0.6 && trees.length ? trees[(rng() * trees.length) | 0] : { x: rng() * W * TILE, y: rng() * H * TILE };
    const x = anchor.x + (rng() - 0.5) * 90, y = anchor.y + (rng() - 0.5) * 90;
    const txi = (x / TILE) | 0, tyi = (y / TILE) | 0;
    if (!inB(txi, tyi) || water[idx(txi, tyi)] || rock[idx(txi, tyi)]) continue;
    const tv = t[idx(txi, tyi)];
    if (tv === WT.BLDG || tv === WT.FLOOR || tv === WT.DOOR || tv === WT.ROAD) continue;
    bushes.push({ x, y, r: 11, kind: BUSH_BY_DIST[_districtOfTile(txi, tyi)] || 'bush' });
  }

  // ---- crop fields (painted furrows, like the refs' farmland) ----
  guard = 0;
  while (fields.length < 3 && guard++ < 300) {
    const fw2 = 8 + (rng() * 5 | 0), fh2 = 6 + (rng() * 4 | 0);
    const fx2 = 8 + (rng() * (W - fw2 - 16) | 0), fy2 = 8 + (rng() * (H - fh2 - 16) | 0);
    let ok = true;
    for (let y = fy2; y < fy2 + fh2 && ok; y++) for (let x = fx2; x < fx2 + fw2; x++) {
      const tv = t[idx(x, y)];
      if (water[idx(x, y)] || rock[idx(x, y)] || tv === WT.BLDG || tv === WT.ROAD || tv === WT.PLAZA) { ok = false; break; }
    }
    if (!ok) continue;
    fields.push({ x: fx2 * TILE, y: fy2 * TILE, w: fw2 * TILE, h: fh2 * TILE, dir: rng() < 0.5 ? 0 : 1 });
  }

  // ---- roadside dressing: lamps, wrecks, barriers, puddles ----
  for (const rd of roads) {
    for (let i = 8; i < rd.pts.length - 8; i += 9) {
      const p = rd.pts[i], q = rd.pts[i + 1] || p;
      const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, side = (i / 9 | 0) % 2 ? 1 : -1;
      const lx = p.x - dy / L * (rd.w / 2 + 8) * side, ly = p.y + dx / L * (rd.w / 2 + 8) * side;
      const txi = (lx / TILE) | 0, tyi = (ly / TILE) | 0;
      if (!inB(txi, tyi) || t[idx(txi, tyi)] === WT.BLDG) continue;
      if (i % 18 === 8) lights.push({ x: lx, y: ly });
      else if (rng() < 0.3) { wrecks.push({ x: lx, y: ly, a: Math.atan2(dy, dx) + (rng() - 0.5) }); solid(lx - 8, ly - 6, 16, 12); }
      else if (rng() < 0.3) { props.push({ kind: 'barrier', x: lx, y: ly, seed: i * 31 }); solid(lx - 10, ly - 3, 20, 6); }
    }
    for (const p of rd.pts) if (rng() < 0.04) puddles.push({ x: p.x + (rng() - 0.5) * rd.w, y: p.y + (rng() - 0.5) * rd.w, w: 8 + rng() * 12, h: 4 + rng() * 4, col: '#9ab4c0' });
  }

  // ---- spawn safety net + skippy's ditch (far NE grass) ----
  if (!spawnPt) spawnPt = { x: 64 * TILE, y: 64 * TILE };
  const farSpots = [];
  for (let k = 0; k < 400; k++) {
    const x = (10 + rng() * 108) * TILE, y = (8 + rng() * 110) * TILE;
    if (Math.hypot(x - spawnPt.x, y - spawnPt.y) < 1100) continue;
    const txi = (x / TILE) | 0, tyi = (y / TILE) | 0;
    if (t[idx(txi, tyi)] !== WT.PARK && t[idx(txi, tyi)] !== WT.WALK) continue;
    farSpots.push({ x, y });
    if (farSpots.length > 6) break;
  }
  skippySpot = farSpots[0] || { x: 112 * TILE, y: 14 * TILE };

  // ---- fence collision (movers blocked, bullets fly over, eyes see through) ----
  for (const f of fences) {
    if (f.x0 === f.x1) obst.push({ x: f.x0 - 1.5, y: Math.min(f.y0, f.y1), w: 3, h: Math.abs(f.y1 - f.y0) });
    else obst.push({ x: Math.min(f.x0, f.x1), y: f.y0 - 1.5, w: Math.abs(f.x1 - f.x0), h: 3 });
  }

  // ---- minimap (earth tones) ----
  const mini = mkCanvas(W, H), mc = mini.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = t[idx(x, y)];
    mc.fillStyle = water[idx(x, y)] ? '#1e4a54' : rock[idx(x, y)] ? '#4a4232'
      : v === WT.ROAD ? '#5c5852' : v === WT.PARK ? '#3c4c28' : v === WT.PLAZA ? '#6a655c'
      : v === WT.BLDG ? '#2e2a24' : v >= 5 ? '#3a352c' : '#57503f';
    mc.fillRect(x, y, 1, 1);
  }

  const cv = mkCanvas(4, 4); // legacy slot — the tactical renderer bakes its own ground

  WORLD = {
    W, H, t, cv, mini, shops, vends, holos, signs, lights, puddles, crateSpots, displays,
    spawn: spawnPt, skippySpot, roofs, dens, npcs, obst, bushes,
    bldgs, trees, wrecks, alleys, roads, walls, fences, props, fields,
    isWater(tx, ty) { return tx < 0 || ty < 0 || tx >= W || ty >= H ? false : !!water[ty * W + tx]; },
    isRock(tx, ty) { return tx < 0 || ty < 0 || tx >= W || ty >= H ? false : !!rock[ty * W + tx]; },
    solidAt(tx, ty) { return tx < 0 || ty < 0 || tx >= W || ty >= H || t[ty * W + tx] === WT.BLDG; },
    solidPx(x, y) { return this.solidAt(Math.floor(x / TILE), Math.floor(y / TILE)); },
    blockedPx(x, y) {
      if (this.solidPx(x, y)) return true;
      for (let i = 0; i < obst.length; i++) {
        const o = obst[i];
        if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return true;
      }
      return false;
    },
    tileAt(x, y) {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      return (tx < 0 || ty < 0 || tx >= W || ty >= H) ? WT.BLDG : t[ty * W + tx];
    },
    losClear(x0, y0, x1, y1) {
      const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(d / 8));
      for (let i = 1; i < steps; i++) {
        const f = i / steps;
        if (this.solidPx(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return false;
      }
      return true;
    },
    districtAt(x, y) { return _districtOfTile(Math.floor(x / TILE), Math.floor(y / TILE)); },
  };
  return WORLD;
}
