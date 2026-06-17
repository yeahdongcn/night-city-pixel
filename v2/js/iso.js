'use strict';
// ============ Isometric projection + procedural sprites ============
// World coords are in TILE UNITS (floats). The sim is a flat plane; we project to 2:1 iso.

const HW = 16, HH = 8;        // half tile footprint on screen (tile diamond = 32 x 16)
const ZK = 11;                // px a wall rises per 1.0 height unit

function isoX(wx, wy) { return (wx - wy) * HW; }
function isoY(wx, wy, wz) { return (wx + wy) * HH - (wz || 0) * ZK; }
function depthOf(wx, wy) { return wx + wy; }          // back-to-front sort key
// invert ground projection (wz=0): screen-rel → world tile
function screenToWorld(sx, sy) {
  return { x: (sx / HW + sy / HH) / 2, y: (sy / HH - sx / HW) / 2 };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

function gridToCanvas(rows, pal) {
  const cv = mkCanvas(rows[0].length, rows.length), c = cv.getContext('2d');
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const k = rows[y][x]; if (k !== '.' && pal[k]) { c.fillStyle = pal[k]; c.fillRect(x, y, 1, 1); }
  }
  return cv;
}

// ---- upright billboard humanoid (8x14) used for all actors, drawn flat facing camera ----
const BODY = {
  front: ['..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SESSES.', '..SSSS..', '.JJJJJJ.', '.JTJJTJ.', 'SJJJJJJS', '.JJJJJJ.', '.JJJJJJ.', '.PP..PP.', '.PP..PP.', '.BB..BB.', '.BB..BB.'],
  back:  ['..HHHH..', '.HHHHHH.', '.HHHHHH.', '.HHHHHH.', '..HHHH..', '.JJJJJJ.', '.JJTTJJ.', 'SJJJJJJS', '.JJJJJJ.', '.JJJJJJ.', '.PP..PP.', '.PP..PP.', '.BB..BB.', '.BB..BB.'],
  side:  ['..HHHH..', '.HHHHHH.', '.SSHHHH.', '.ESHHHH.', '..SSHH..', '.JJJJJ..', '.TJJJJ..', '.SJJJJ..', '.JJJJJ..', '.JJJJJ..', '.PPP....', '.PP.....', '.BB.....', '.BB.....'],
};
function makeActor(pal) {
  const p = Object.assign({ H:'#222', S:'#e8b88a', E:'#05d9e8', J:'#333', T:'#888', P:'#23232c', B:'#101014' }, pal);
  return { front: gridToCanvas(BODY.front, p), back: gridToCanvas(BODY.back, p), side: gridToCanvas(BODY.side, p) };
}
// pick facing canvas + flip from a world-space velocity angle (already iso-rotated feel)
function actorFacing(ax, ang) {
  // ang in screen space (atan2 of projected dir). 8-way → front/back/side
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a > 0.9 && a < 2.24) return { cv: ax.front, flip: false };
  if (a > 4.05 && a < 5.38) return { cv: ax.back, flip: false };
  const right = a < Math.PI / 2 || a > 3 * Math.PI / 2;
  return { cv: ax.side, flip: !right };
}

// ---- iso ground-tile diamond sprite (32x16) ----
function tileSprite(col, edge) {
  const cv = mkCanvas(32, 18), c = cv.getContext('2d');
  c.fillStyle = col;
  c.beginPath(); c.moveTo(16, 0); c.lineTo(32, 8); c.lineTo(16, 16); c.lineTo(0, 8); c.closePath(); c.fill();
  if (edge) { c.strokeStyle = edge; c.lineWidth = 1; c.stroke(); }
  // subtle top sheen
  c.fillStyle = shade(col, 8);
  c.beginPath(); c.moveTo(16, 1); c.lineTo(30, 8); c.lineTo(16, 4); c.closePath(); c.fill();
  return cv;
}

// ---- glow sprite (additive) ----
const _glows = {};
function glow(col, r) {
  const k = col + r;
  if (!_glows[k]) {
    const cv = mkCanvas(r * 2, r * 2), c = cv.getContext('2d');
    const g = c.createRadialGradient(r, r, 1, r, r, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, r * 2, r * 2);
    _glows[k] = cv;
  }
  return _glows[k];
}

// ---- draw an iso wall/building block at tile (i,j) of height h, palette ----
// faces: top diamond (lit), left wall (mid), right wall (dark). drawn at screen (sx,sy)=top-of-tile-ground.
function drawIsoBlock(c, sx, sy, h, top, lt, dk) {
  const zh = h * ZK;
  // left wall (facing down-left)
  c.fillStyle = dk;
  c.beginPath(); c.moveTo(sx - HW, sy + HH); c.lineTo(sx, sy + HH * 2); c.lineTo(sx, sy + HH * 2 - zh); c.lineTo(sx - HW, sy + HH - zh); c.closePath(); c.fill();
  // right wall (facing down-right)
  c.fillStyle = lt;
  c.beginPath(); c.moveTo(sx + HW, sy + HH); c.lineTo(sx, sy + HH * 2); c.lineTo(sx, sy + HH * 2 - zh); c.lineTo(sx + HW, sy + HH - zh); c.closePath(); c.fill();
  // top diamond
  c.fillStyle = top;
  c.beginPath(); c.moveTo(sx, sy - zh); c.lineTo(sx + HW, sy + HH - zh); c.lineTo(sx, sy + HH * 2 - zh); c.lineTo(sx - HW, sy + HH - zh); c.closePath(); c.fill();
}

// lit windows on a wall face (cheap detail), drawn after the block
function drawWindows(c, sx, sy, h, rng) {
  for (let row = 0; row < h; row++) {
    const wy = sy + HH * 2 - (row + 1) * ZK + 2;
    for (let k = -1; k <= 0; k++) {
      if (rng() < 0.45) { c.fillStyle = rng() < 0.5 ? '#ffd27a' : '#7ad7ff'; c.fillRect(sx + 3 + k * 7, wy + (sx & 1), 3, 3); }
      if (rng() < 0.45) { c.fillStyle = rng() < 0.5 ? '#ffd27a' : '#7ad7ff'; c.fillRect(sx - 9 + k * 7 + 6, wy + 1, 3, 3); }
    }
  }
}

function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
