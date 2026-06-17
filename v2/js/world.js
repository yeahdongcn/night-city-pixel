'use strict';
// ============ Isometric city generation (tile + height grid) ============
let WORLD = null;

const T_STREET = 0, T_WALK = 1, T_PLAZA = 2, T_PARK = 3;
const GROUND_COL = { 0: '#16161e', 1: '#24242e', 2: '#1e1e28', 3: '#16241a' };

function genWorld(seed) {
  const W = 56, H = 56;
  const rng = mulberry32(seed || 1337);
  const solid = new Uint8Array(W * H);
  const height = new Uint8Array(W * H);     // building height in units (0 = walkable ground)
  const type = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const props = [], neons = [], buildings = [], dens = [];

  // base: everything sidewalk
  for (let i = 0; i < W * H; i++) type[i] = T_WALK;

  // road grid (2-wide every 9 tiles)
  const isRoad = v => (v % 9 === 0 || v % 9 === 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isRoad(x) || isRoad(y)) type[idx(x, y)] = T_STREET;
  }

  // blocks between roads
  for (let by = 2; by < H - 7; by += 9) for (let bx = 2; bx < W - 7; bx += 9) {
    const cx = bx + 3, cy = by + 3;
    if (Math.abs(cx - W / 2) < 5 && Math.abs(cy - H / 2) < 5) {       // central spawn plaza: open
      for (let y = by; y < by + 6; y++) for (let x = bx; x < bx + 6; x++) type[idx(x, y)] = T_PLAZA;
      for (let k = 0; k < 4; k++) props.push({ x: bx + 1 + (rng() * 4 | 0) + 0.5, y: by + 1 + (rng() * 4 | 0) + 0.5, kind: 'crate' });
      continue;
    }
    const roll = rng();
    if (roll < 0.16) {                                                // park
      for (let y = by; y < by + 6; y++) for (let x = bx; x < bx + 6; x++) type[idx(x, y)] = T_PARK;
      for (let k = 0; k < 5; k++) props.push({ x: bx + 0.5 + (rng() * 5 | 0), y: by + 0.5 + (rng() * 5 | 0), kind: rng() < 0.5 ? 'tree' : 'crate' });
      continue;
    }
    if (roll < 0.28) {                                                // open lot (cover + a den)
      for (let y = by; y < by + 6; y++) for (let x = bx; x < bx + 6; x++) type[idx(x, y)] = T_PLAZA;
      for (let k = 0; k < 5; k++) props.push({ x: bx + 0.5 + (rng() * 5 | 0), y: by + 0.5 + (rng() * 5 | 0), kind: 'crate' });
      dens.push({ x: cx + 0.5, y: cy + 0.5 });
      continue;
    }
    // building(s): footprint inside the block, height 2..6, with a 1-tile sidewalk gap
    const pat = rng();
    const rects = pat < 0.5 ? [[bx, by, 6, 6]]
      : pat < 0.78 ? [[bx, by, 6, 3], [bx, by + 4, 6, 2]]
      : [[bx, by, 3, 6], [bx + 4, by, 2, 6]];
    for (const [rx, ry, rw, rh] of rects) {
      const h = 2 + (rng() * 4 | 0);
      const roofCol = ['#20202c', '#24222e', '#1c2230', '#262430'][rng() * 4 | 0];
      buildings.push({ x: rx, y: ry, w: rw, h: rh, ht: h, roof: roofCol, seed: (rx * 977 + ry * 31) | 0 });
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        solid[idx(x, y)] = 1; height[idx(x, y)] = h; type[idx(x, y)] = T_WALK;
      }
      if (rng() < 0.6) neons.push({ x: rx + rw / 2, y: ry + rh / 2, h, col: ['#ff2a6d', '#05d9e8', '#f9f002', '#bd00ff', '#00ff9f'][rng() * 5 | 0] });
    }
  }

  // border wall ring so you can't leave the slab
  for (let x = 0; x < W; x++) { solid[idx(x, 0)] = solid[idx(x, H - 1)] = 1; height[idx(x, 0)] = height[idx(x, H - 1)] = 4; }
  for (let y = 0; y < H; y++) { solid[idx(0, y)] = solid[idx(W - 1, y)] = 1; height[idx(0, y)] = height[idx(W - 1, y)] = 4; }

  WORLD = {
    W, H, solid, height, type, props, neons, buildings, dens, rng,
    spawn: { x: W / 2, y: H / 2 },
    solidAt(x, y) { const tx = x | 0, ty = y | 0; return tx < 0 || ty < 0 || tx >= W || ty >= H || solid[ty * W + tx] === 1; },
    walkable(x, y) { return !this.solidAt(x, y); },
    losClear(x0, y0, x1, y1) {
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d * 3));
      for (let i = 1; i < n; i++) { const f = i / n; if (this.solidAt(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return false; }
      return true;
    },
  };
  return WORLD;
}

// find an open tile near (x,y) within [rMin,rMax]
function findOpen(x, y, rMin, rMax) {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
    const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
    if (nx > 1 && ny > 1 && nx < WORLD.W - 1 && ny < WORLD.H - 1 && WORLD.walkable(nx, ny)) return { x: nx, y: ny };
  }
  return null;
}
