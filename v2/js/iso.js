'use strict';
// ============ Isometric projection layer (v2) ============
// v1's sim is a flat world-pixel plane (TILE=16). We keep ALL of it and only change how
// world (x,y) maps to the screen: 2:1 dimetric. cam = world-space point the camera centers.
const ISO_ZK = 0.92;   // screen px risen per world-px of height

// frame screen offset (set each frame in step/render). _ox/_oy stable (mouse), _shx/_shy add shake (draw)
function isoSetOffsets() {
  G._ox = -(G.cam.x - G.cam.y) + VIEW_W / 2;
  G._oy = -((G.cam.x + G.cam.y) * 0.5) + VIEW_H / 2;
}
function proj(wx, wy, wz) {
  return { x: (wx - wy) + G._ox + (G._shx || 0), y: (wx + wy) * 0.5 - (wz || 0) * ISO_ZK + G._oy + (G._shy || 0) };
}
// screen → world ground point (wz=0). uses the shake-free offsets.
function invProj(sx, sy) {
  const rx = sx - G._ox, ry = sy - G._oy;
  return { x: rx / 2 + ry, y: ry - rx / 2 };
}
function isoDepth(x, y) { return x + y; }
function isoVisible(x, y, m) {
  const s = proj(x, y, 0); m = m || 60;
  return s.x > -m && s.x < VIEW_W + m && s.y > -m && s.y < VIEW_H + m + 40;
}

// ---- building height + wall colour per BLDG tile (stable hash; const within a footprint) ----
const _WALL_PALS = [
  { top: '#2c2c38', lt: '#23232e', dk: '#15151c' },
  { top: '#302a3a', lt: '#26222e', dk: '#17131e' },
  { top: '#283038', lt: '#20262e', dk: '#141a20' },
  { top: '#322c34', lt: '#28232a', dk: '#181420' },
];
function isoTileHeight(tx, ty) {
  // coarse region (≈ building footprint) → consistent flat-roof height 2.4..4.8 tiles
  const h = (((tx / 5) | 0) * 73856 ^ ((ty / 5) | 0) * 19349) >>> 0;
  if (tx <= 1 || ty <= 1 || tx >= WORLD.W - 2 || ty >= WORLD.H - 2) return 70; // border ring tall
  return (38 + (h % 5) * 12); // px
}
function isoWallPal(tx, ty) {
  const k = (((tx / 5) | 0) * 31 + ((ty / 5) | 0) * 17) & 3;
  return _WALL_PALS[k];
}

// ---- iso ground diamond (filled, by the 4 tile corners) ----
function isoGroundTile(c, tx, ty, col, edge) {
  const x0 = tx * TILE, y0 = ty * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
  const n = proj(x0, y0, 0), e = proj(x1, y0, 0), s = proj(x1, y1, 0), w = proj(x0, y1, 0);
  c.fillStyle = col;
  c.beginPath(); c.moveTo(n.x, n.y); c.lineTo(e.x, e.y); c.lineTo(s.x, s.y); c.lineTo(w.x, w.y); c.closePath(); c.fill();
  if (edge) { c.strokeStyle = edge; c.lineWidth = 1; c.stroke(); }
}

// ---- iso wall/building block (top diamond + SW + SE faces), alpha for interior reveal ----
function isoBlock(c, tx, ty, htPx, pal, alpha) {
  const x0 = tx * TILE, y0 = ty * TILE, x1 = x0 + TILE, y1 = y0 + TILE, zh = htPx * ISO_ZK;
  const gN = proj(x0, y0, 0), gE = proj(x1, y0, 0), gS = proj(x1, y1, 0), gW = proj(x0, y1, 0);
  if (alpha != null && alpha < 1) c.globalAlpha = alpha;
  // SW face (W–S), darker
  c.fillStyle = pal.dk;
  c.beginPath(); c.moveTo(gW.x, gW.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - zh); c.lineTo(gW.x, gW.y - zh); c.closePath(); c.fill();
  // SE face (E–S), mid
  c.fillStyle = pal.lt;
  c.beginPath(); c.moveTo(gE.x, gE.y); c.lineTo(gS.x, gS.y); c.lineTo(gS.x, gS.y - zh); c.lineTo(gE.x, gE.y - zh); c.closePath(); c.fill();
  // top diamond, lit
  c.fillStyle = pal.top;
  c.beginPath(); c.moveTo(gN.x, gN.y - zh); c.lineTo(gE.x, gE.y - zh); c.lineTo(gS.x, gS.y - zh); c.lineTo(gW.x, gW.y - zh); c.closePath(); c.fill();
  // edge highlight on top
  c.strokeStyle = shade(pal.top, 14); c.lineWidth = 1; c.stroke();
  c.globalAlpha = 1; c.lineWidth = 1;
}

// ---- billboard sprite (actor/prop), feet at world (x,y) ----
function isoBill(c, spr, x, y, alpha, scale, flip, shadow) {
  const s = proj(x, y, 0); scale = scale || 1;
  if (shadow !== false) { c.fillStyle = 'rgba(0,0,0,0.32)'; c.beginPath(); c.ellipse(s.x, s.y, 4 * scale, 2 * scale, 0, 0, 7); c.fill(); }
  c.save(); if (alpha != null) c.globalAlpha = alpha;
  c.translate(s.x, s.y);
  if (flip) c.scale(-scale, scale); else c.scale(scale, scale);
  c.drawImage(spr, -4, -14);
  c.restore(); c.globalAlpha = 1;
}
