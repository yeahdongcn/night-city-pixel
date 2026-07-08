// tex.js — canvas texture painters. Every material in the game gets one of
// these (flat colors are what killed the last three attempts). Painters return
// { map, bump } CanvasTextures; bump reuses a grayscale of the same painting.
import * as THREE from 'three';

export function mkcv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// deterministic rng so bakes are stable frame-to-frame and run-to-run
export function rng(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function tex(cv, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (typeof repeat === 'number') t.repeat.set(repeat, repeat);
  else t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// ---- shared paint primitives ----------------------------------------------

// soft irregular blotches — the base of every organic surface
export function blotches(x, cv, r, n, rad, colors, alpha) {
  for (let i = 0; i < n; i++) {
    const cx = r() * cv.width, cy = r() * cv.height, cr = rad * (0.4 + r() * 0.9);
    const g = x.createRadialGradient(cx, cy, cr * 0.1, cx, cy, cr);
    const c = colors[(r() * colors.length) | 0];
    g.addColorStop(0, c + Math.round(alpha * 255).toString(16).padStart(2, '0'));
    g.addColorStop(1, c + '00');
    x.fillStyle = g;
    x.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
}

// fine per-pixel-ish speckle
export function stipple(x, cv, r, n, size, colors, alpha) {
  x.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[(r() * colors.length) | 0];
    const s = size * (0.5 + r());
    x.fillRect(r() * cv.width, r() * cv.height, s, s);
  }
  x.globalAlpha = 1;
}

// short directional strokes (grass blades, wood grain, tile streaks)
export function strokes(x, cv, r, n, len, w, ang, spread, colors, alpha) {
  x.globalAlpha = alpha;
  x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const px = r() * cv.width, py = r() * cv.height;
    const a = ang + (r() - 0.5) * spread, l = len * (0.5 + r());
    x.strokeStyle = colors[(r() * colors.length) | 0];
    x.lineWidth = w * (0.6 + r() * 0.8);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  x.globalAlpha = 1;
}

// grayscale bump canvas derived from luminance of a painted canvas
export function bumpFrom(cv, contrast = 1) {
  const b = mkcv(cv.width, cv.height), x = b.getContext('2d');
  x.drawImage(cv, 0, 0);
  const d = x.getImageData(0, 0, b.width, b.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let l = (p[i] * 0.3 + p[i + 1] * 0.55 + p[i + 2] * 0.15);
    l = 128 + (l - 128) * contrast;
    p[i] = p[i + 1] = p[i + 2] = Math.max(0, Math.min(255, l));
  }
  x.putImageData(d, 0, 0);
  return b;
}

// neutral high-frequency detail tile (multiplied over the big ground texture
// in a shader patch so close-ups keep tooth) — values centred on 128
export function detailNoiseCanvas(seed = 7) {
  const cv = mkcv(256, 256), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  stipple(x, cv, r, 2600, 1.6, ['#6f6f6f', '#8d8d8d', '#787878', '#969696'], 0.5);
  stipple(x, cv, r, 900, 3.2, ['#747474', '#8a8a8a'], 0.25);
  blotches(x, cv, r, 40, 46, ['#7a7a7a', '#868686'], 0.35);
  return cv;
}

// ---- material painters ------------------------------------------------------

export function grassCanvas(seed = 1, size = 512) {
  const cv = mkcv(size, size), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#66713c'; x.fillRect(0, 0, size, size);
  blotches(x, cv, r, 90, size * 0.16, ['#5b6a33', '#71793f', '#5e7038', '#7a8046', '#556327'], 0.5);
  blotches(x, cv, r, 50, size * 0.07, ['#8a8a50', '#4e5c2b', '#767e42'], 0.4);   // dry + lush patches
  strokes(x, cv, r, 2400, 7, 1.3, -Math.PI / 3, 2.6, ['#7d8848', '#55642e', '#8f9455', '#616f36'], 0.5);
  stipple(x, cv, r, 2000, 1.8, ['#49561f', '#87905122', '#5d6c35'], 0.5);
  return cv;
}

export function dirtCanvas(seed = 2, size = 512) {
  const cv = mkcv(size, size), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#8d7a58'; x.fillRect(0, 0, size, size);
  blotches(x, cv, r, 80, size * 0.15, ['#7c6a4a', '#9a8763', '#856f4d', '#6f5f42'], 0.55);
  stipple(x, cv, r, 2400, 2, ['#6a5a3e', '#a08d68', '#77664a'], 0.5);
  stipple(x, cv, r, 300, 3.4, ['#5f5138', '#a89572'], 0.35);                     // pebbles
  return cv;
}

export function stoneWallCanvas(seed = 3, w = 512, h = 256) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#736e5c'; x.fillRect(0, 0, w, h);
  // irregular ashlar courses
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    const y0 = j * h / rows;
    let cx = -r() * 40;
    while (cx < w) {
      const bw = 40 + r() * 60, bh = h / rows;
      const tone = 0.68 + r() * 0.42;
      x.fillStyle = `rgb(${(122 * tone) | 0},${(116 * tone) | 0},${(98 * tone) | 0})`;
      x.fillRect(cx + 1.5, y0 + 1.5, bw - 3, bh - 3);
      // per-stone shading
      x.fillStyle = 'rgba(255,255,255,0.09)'; x.fillRect(cx + 1.5, y0 + 1.5, bw - 3, 3);
      x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(cx + 1.5, y0 + bh - 5, bw - 3, 3.5);
      cx += bw;
    }
  }
  blotches(x, cv, r, 80, 60, ['#565244', '#84806c', '#5f6a4a', '#4a463a'], 0.38);  // grime + moss tint
  blotches(x, cv, r, 40, 30, ['#4c5a37', '#5a683f', '#3f4d2e'], 0.34);
  stipple(x, cv, r, 1400, 1.8, ['#00000028', '#ffffff16'], 0.5);
  return cv;
}

// dense leafy noise for tree crowns
export function leafCanvas(seed = 17, size = 256) {
  const cv = mkcv(size, size), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#2e421f'; x.fillRect(0, 0, size, size);
  blotches(x, cv, r, 70, 40, ['#243619', '#3a5124', '#455c2b', '#1d2c14'], 0.55);
  for (let i = 0; i < 2400; i++) {
    x.fillStyle = ['#31491e', '#3f5827', '#4b632e', '#243818', '#566d36'][(r() * 5) | 0];
    x.globalAlpha = 0.5 + r() * 0.4;
    const s = 2 + r() * 4;
    x.beginPath(); x.ellipse(r() * size, r() * size, s, s * 0.6, r() * 3, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  return cv;
}

// a small fan of grass blades (alpha-tested billboard)
export function tuftCanvas(seed = 18, w = 64, h = 48) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.16 + (r() - 0.5) * 0.12;
    const l = h * (0.55 + r() * 0.4);
    x.strokeStyle = ['#5c7030', '#6d7f3a', '#4c5f28', '#7d8c46'][(r() * 4) | 0];
    x.lineWidth = 2 + r() * 1.6;
    x.beginPath();
    x.moveTo(w / 2 + (r() - 0.5) * 10, h);
    x.quadraticCurveTo(w / 2 + Math.cos(a) * l * 0.5, h + Math.sin(a) * l * 0.6,
      w / 2 + Math.cos(a) * l + (r() - 0.5) * 4, h + Math.sin(a) * l);
    x.stroke();
  }
  return cv;
}

export function brickCanvas(seed = 4, w = 512, h = 256) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#7e5648'; x.fillRect(0, 0, w, h);
  const bh = 16, bw = 44;
  for (let j = 0; j < h / bh; j++) {
    const off = (j % 2) * bw / 2;
    for (let i = -1; i < w / bw; i++) {
      const tone = 0.78 + r() * 0.44;
      x.fillStyle = `rgb(${(146 * tone) | 0},${(88 * tone) | 0},${(70 * tone) | 0})`;
      x.fillRect(i * bw + off + 1, j * bh + 1, bw - 2, bh - 2);
      if (r() < 0.12) { x.fillStyle = 'rgba(60,50,45,0.5)'; x.fillRect(i * bw + off + 1, j * bh + 1, bw - 2, bh - 2); }
    }
  }
  x.fillStyle = 'rgba(220,210,190,0.16)';
  for (let j = 0; j < h / bh; j++) x.fillRect(0, j * bh - 0.5, w, 1.5);           // mortar hint
  blotches(x, cv, r, 50, 56, ['#4f382f', '#93655a', '#6a7a55'], 0.3);
  stipple(x, cv, r, 1000, 1.6, ['#00000026', '#ffffff14'], 0.5);
  return cv;
}

export function stuccoCanvas(seed = 5, w = 512, h = 256) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#a89c82'; x.fillRect(0, 0, w, h);
  blotches(x, cv, r, 90, 60, ['#988c70', '#b5a98e', '#8f8268'], 0.4);
  stipple(x, cv, r, 2600, 1.6, ['#8f846a', '#b8ac90', '#a09478'], 0.5);
  // water streaks from the top
  strokes(x, cv, r, 60, 60, 2, Math.PI / 2, 0.1, ['#79704f', '#6d6549'], 0.16);
  blotches(x, cv, r, 30, 40, ['#6d7a52', '#5f6c47'], 0.22);                      // moss
  return cv;
}

export function roofTileCanvas(seed = 6, w = 512, h = 256, base = [150, 82, 58]) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, w, h);
  const th = 18, tw = 26;
  for (let j = 0; j < h / th; j++) {
    for (let i = -1; i < w / tw; i++) {
      const off = (j % 2) * tw / 2, tone = 0.7 + r() * 0.55;
      x.fillStyle = `rgb(${(base[0] * tone) | 0},${(base[1] * tone) | 0},${(base[2] * tone) | 0})`;
      x.fillRect(i * tw + off + 0.5, j * th + 0.5, tw - 1, th - 1.5);
      x.fillStyle = 'rgba(255,235,215,0.13)'; x.fillRect(i * tw + off + 0.5, j * th + 0.5, tw - 1, 2.5);
      x.fillStyle = 'rgba(30,10,5,0.28)'; x.fillRect(i * tw + off + 0.5, j * th + th - 4, tw - 1, 2.5);
    }
  }
  blotches(x, cv, r, 40, 50, ['#54432f', '#6e7a50', '#9a8a6a'], 0.26);           // weathering + moss
  stipple(x, cv, r, 900, 1.6, ['#00000030', '#ffffff16'], 0.5);
  return cv;
}

export function slateCanvas(seed = 11, w = 512, h = 256) {
  return roofTileCanvas(seed, w, h, [96, 100, 108]);
}

export function plankCanvas(seed = 8, w = 512, h = 256, base = [122, 95, 62]) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, w, h);
  const pw = 42;
  for (let i = 0; i < w / pw; i++) {
    const tone = 0.8 + r() * 0.4;
    x.fillStyle = `rgba(${(base[0] * tone) | 0},${(base[1] * tone) | 0},${(base[2] * tone) | 0},0.9)`;
    x.fillRect(i * pw + 1, 0, pw - 2, h);
    x.fillStyle = 'rgba(35,22,12,0.55)'; x.fillRect(i * pw, 0, 1.5, h);
  }
  strokes(x, cv, r, 700, 30, 1, Math.PI / 2, 0.12, ['#5d452b', '#8d7148', '#4e3a24'], 0.4);
  stipple(x, cv, r, 500, 1.6, ['#00000022', '#ffffff12'], 0.5);
  // knots
  for (let i = 0; i < 14; i++) {
    const kx = r() * w, ky = r() * h;
    x.fillStyle = 'rgba(40,26,14,0.6)';
    x.beginPath(); x.ellipse(kx, ky, 2.5, 4, 0, 0, 7); x.fill();
  }
  return cv;
}

export function metalCanvas(seed = 9, w = 256, h = 256, base = [104, 112, 104]) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, w, h);
  blotches(x, cv, r, 60, 40, ['#5c645c', '#79837a', '#8a7355'], 0.4);            // rust blooms
  blotches(x, cv, r, 24, 20, ['#7a5a38', '#6a4c30'], 0.4);
  stipple(x, cv, r, 900, 1.6, ['#00000028', '#ffffff14'], 0.5);
  return cv;
}

export function corrugatedCanvas(seed = 10, w = 256, h = 256, base = [116, 104, 88]) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 12) {
    x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(i, 0, 4, h);
    x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(i + 7, 0, 4, h);
  }
  blotches(x, cv, r, 40, 34, ['#7a5a38', '#8a6a42', '#5f564a'], 0.35);
  stipple(x, cv, r, 600, 1.5, ['#00000024', '#ffffff12'], 0.4);
  return cv;
}

export function barkCanvas(seed = 12, w = 128, h = 256) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#4b3a28'; x.fillRect(0, 0, w, h);
  strokes(x, cv, r, 260, 40, 2.4, Math.PI / 2, 0.25, ['#3b2c1c', '#5c4a32', '#2e2214', '#66543c'], 0.6);
  stipple(x, cv, r, 400, 1.6, ['#00000030', '#ffffff14'], 0.5);
  return cv;
}

export function tarpCanvas(seed = 13, w = 256, h = 256, base = [104, 106, 78]) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, w, h);
  blotches(x, cv, r, 50, 44, ['#5f6148', '#75775a', '#6a6c50'], 0.5);
  strokes(x, cv, r, 300, 26, 1.2, 0, 0.2, ['#565840', '#7d7f60'], 0.3);      // weave
  strokes(x, cv, r, 300, 26, 1.2, Math.PI / 2, 0.2, ['#565840', '#7d7f60'], 0.3);
  stipple(x, cv, r, 600, 1.5, ['#00000022', '#ffffff12'], 0.4);
  return cv;
}

export function sandCanvas(seed = 14, w = 256, h = 256) {
  const cv = mkcv(w, h), x = cv.getContext('2d'), r = rng(seed);
  x.fillStyle = '#9c8a64'; x.fillRect(0, 0, w, h);
  blotches(x, cv, r, 60, 36, ['#8a7a56', '#ab9870', '#93815c'], 0.5);
  stipple(x, cv, r, 1400, 1.4, ['#7d6d4c', '#b3a078'], 0.45);
  return cv;
}

// crate sides: planks + stencilled cargo marks
export function crateCanvas(seed = 15, size = 256) {
  const cv = mkcv(size, size), x = cv.getContext('2d'), r = rng(seed);
  x.drawImage(plankCanvas(seed, size, size), 0, 0);
  // edge battens
  x.fillStyle = 'rgba(70,50,28,0.85)';
  x.fillRect(0, 0, size, 14); x.fillRect(0, size - 14, size, 14);
  x.fillRect(0, 0, 14, size); x.fillRect(size - 14, 0, 14, size);
  x.fillStyle = 'rgba(255,240,210,0.12)';
  x.fillRect(0, 2, size, 3); x.fillRect(2, 0, 3, size);
  // stencil
  x.save();
  x.translate(size / 2, size / 2); x.rotate(-0.04);
  x.fillStyle = 'rgba(30,22,14,0.55)';
  x.font = `bold ${size / 6}px monospace`; x.textAlign = 'center';
  x.fillText('NC-77', 0, -size / 12);
  x.strokeStyle = 'rgba(120,30,20,0.5)'; x.lineWidth = 5;
  x.strokeRect(-size / 4, size / 16, size / 2, size / 5);
  x.restore();
  stipple(x, cv, r, 300, 2, ['#00000026'], 0.4);
  return cv;
}

// red/white boom-barrier stripes
export function stripeCanvas(w = 256, h = 32) {
  const cv = mkcv(w, h), x = cv.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#b8352a' : '#ded6c4'; x.fillRect(i * w / 8, 0, w / 8, h); }
  x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, h - 6, w, 6);
  return cv;
}

// standard material with painted map + derived bump
export function paintedMat(cv, { repeat = 1, bump = 3, rough = 0.94, contrast = 1, extra = {} } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex(cv, { repeat }),
    bumpMap: tex(bumpFrom(cv, contrast), { repeat, srgb: false }),
    bumpScale: bump,
    roughness: rough,
    metalness: 0.0,
    ...extra,
  });
  return m;
}
