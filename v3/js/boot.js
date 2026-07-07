'use strict';
// ============ NIGHT CITY: COMMANDOS — fresh engine, zero inherited code ============
// A small Commandos-style stealth mission set in Night City's outskirts.
// Only link to the other editions: it READS the shared ncpx2077_v1 record
// (and safely writes eddies/kills back). Everything else is new.

let CV = null, CX = null, DPR = 1, SW = 0, SH = 0;   // canvas, ctx, device ratio, css size
const R2 = Math.SQRT1_2;                              // 45° plan rotation (military projection)

// global game state
const G = {
  mode: 'brief',              // brief | play | debrief
  t: 0, frame: 0,
  cam: { x: 0, y: 0 },
  keys: new Set(), pressed: new Set(),
  mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, click: false },
  p: null, guards: [], bullets: [], fx: [], texts: [], bodies: [],
  alarm: 0, alarmed: false, reinforced: false,
  crates: [], looted: 0, lootEddies: 0, kills: 0,
  extractOpen: false, done: null,                     // done: 'out' | 'dead'
  rec: null,                                          // the shared Night City record
  shake: 0, noteT: 0, note: '', debriefSaved: false,
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, f) { return a + (b - a) * f; }
function dist(x0, y0, x1, y1) { return Math.hypot(x1 - x0, y1 - y0); }
function angTo(x0, y0, x1, y1) { return Math.atan2(y1 - y0, x1 - x0); }
function angDiff(a, b) { return ((b - a) + Math.PI * 3) % (Math.PI * 2) - Math.PI; }

// deterministic hash rng (map + art baking)
function hrng(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function h2(ix, iy, s) {
  let h = (ix * 374761393 + iy * 668265263 + (s | 0) * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return h2(ix, iy, s) * (1 - u) * (1 - v) + h2(ix + 1, iy, s) * u * (1 - v)
       + h2(ix, iy + 1, s) * (1 - u) * v + h2(ix + 1, iy + 1, s) * u * v;
}
function fbm(x, y, s) { return vnoise(x, y, s) * 0.6 + vnoise(x * 2.7, y * 2.7, s + 9) * 0.28 + vnoise(x * 6.1, y * 6.1, s + 17) * 0.12; }

// ---- projection: plan rotated 45°, z straight up, no foreshortening ----
function px(x, y) { return (x - y) * R2; }
function py(x, y, z) { return (x + y) * R2 - (z || 0); }
function scr(x, y, z) { return { x: px(x, y) - G.cam.x + SW / 2, y: py(x, y, z) - G.cam.y + SH / 2 }; }
function unscr(sx, sy) {  // screen → plan ground point
  const rx = sx - SW / 2 + G.cam.x, ry = sy - SH / 2 + G.cam.y;
  return { x: (ry + rx) / R2 / 2, y: (ry - rx) / R2 / 2 };
}

// ---- canvas / input ----
function fit() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  SW = window.innerWidth; SH = window.innerHeight;
  CV.width = Math.round(SW * DPR); CV.height = Math.round(SH * DPR);
  CX.setTransform(DPR, 0, 0, DPR, 0, 0);
  CX.imageSmoothingEnabled = true;
  if (CX.imageSmoothingQuality) CX.imageSmoothingQuality = 'high';
}

function boot() {
  CV = document.getElementById('cv');
  CX = CV.getContext('2d');
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('keydown', e => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!e.repeat) { G.keys.add(e.code); G.pressed.add(e.code); }
  });
  window.addEventListener('keyup', e => G.keys.delete(e.code));
  CV.addEventListener('mousemove', e => {
    const r = CV.getBoundingClientRect();
    G.mouse.x = e.clientX - r.left; G.mouse.y = e.clientY - r.top;
  });
  CV.addEventListener('mousedown', e => { G.mouse.down = true; G.mouse.click = true; e.preventDefault(); });
  window.addEventListener('mouseup', () => { G.mouse.down = false; });
  CV.addEventListener('contextmenu', e => e.preventDefault());

  loadRecord();
  buildMap();
  bakeWorld();
  resetMission();
  const q = location.search || '';
  if (/play/.test(q)) G.mode = 'play';                        // headless screenshot hooks
  const at = q.match(/at=(\w+)/);
  if (at) {
    const spots = { depot: [1035, 880], gate: [1035, 1160], checkpoint: [1310, 1330], farm: [1745, 1700], insert: [330, 2050] };
    const s = spots[at[1]];
    if (s) { G.p.x = s[0]; G.p.y = s[1]; G.cam.x = px(s[0], s[1]); G.cam.y = py(s[0], s[1], 0); }
  }

  let last = performance.now();
  const loop = now => {
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    try { tick(dt); } catch (err) {
      console.error(err);
      CX.fillStyle = '#300'; CX.fillRect(0, SH / 2 - 20, SW, 40);
      CX.fillStyle = '#faa'; CX.font = '14px monospace'; CX.textAlign = 'center';
      CX.fillText('SCRIPT ERROR — F12: ' + String(err && err.message || err).slice(0, 120), SW / 2, SH / 2 + 5);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function tick(dt) {
  G.t += dt; G.frame++;
  if (G.mode === 'play') simStep(dt);
  render(dt);
  G.pressed.clear(); G.mouse.click = false;
}

window.addEventListener('load', boot);
window.__boot = boot;   // headless hooks
window.__tick = tick;
