// util.js — pure math shared by sim, map and renderer. No DOM, no THREE.
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, f) { return a + (b - a) * f; }
export function dist(x0, y0, x1, y1) { return Math.hypot(x1 - x0, y1 - y0); }
export function angTo(x0, y0, x1, y1) { return Math.atan2(y1 - y0, x1 - x0); }
export function angDiff(a, b) { return ((b - a) + Math.PI * 3) % (Math.PI * 2) - Math.PI; }

// deterministic rng (map layout, art bakes, sim jitter)
export function hrng(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// catmull-rom through points, sampled every ~step
export function spline(pts, step) {
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
