// world.js — builds the whole static 3D world from MAPD. All look, no logic.
// The bar: Commandos BEL — textured everything, dense clutter, deep sunlight.
import * as THREE from 'three';
import { MAPD } from './map.js';
import { hrng, dist } from './util.js';
import {
  mkcv, tex, bumpFrom, paintedMat, detailNoiseCanvas, rng,
  grassCanvas, dirtCanvas, stoneWallCanvas, brickCanvas, stuccoCanvas,
  roofTileCanvas, slateCanvas, plankCanvas, metalCanvas, corrugatedCanvas,
  barkCanvas, tarpCanvas, sandCanvas, crateCanvas, stripeCanvas,
  leafCanvas, tuftCanvas,
} from './tex.js';

export const W = {
  group: null, ground: null, mats: {},
  groundCv: null, groundCtx: null, groundTex: null, PAD: 400, S: 1,
};

const yaw = a => -a;   // plan angle → world Y rotation

// ---- contact shadows -------------------------------------------------------
let aoRound = null, aoRect = null;
function aoTexRound() {
  if (aoRound) return aoRound;
  const cv = mkcv(128, 128), c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(16,13,7,0.95)'); g.addColorStop(0.55, 'rgba(16,13,7,0.5)'); g.addColorStop(1, 'rgba(16,13,7,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  aoRound = new THREE.CanvasTexture(cv);
  return aoRound;
}
function aoTexRect() {
  if (aoRect) return aoRect;
  const cv = mkcv(128, 128), c = cv.getContext('2d');
  c.filter = 'blur(14px)';
  c.fillStyle = 'rgba(16,13,7,0.9)';
  c.beginPath(); c.roundRect(26, 26, 76, 76, 16); c.fill();
  c.filter = 'none';
  aoRect = new THREE.CanvasTexture(cv);
  return aoRect;
}
export function aoBlob(parent, x, y, rx, ry, a = 0.42, rot = 0, rect = false) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(rx * 2, ry * 2),
    new THREE.MeshBasicMaterial({ map: rect ? aoTexRect() : aoTexRound(), transparent: true, opacity: a, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2; m.rotation.z = rot;
  m.position.set(x, 0.6, y);
  m.renderOrder = 2;
  parent.add(m);
  return m;
}

// ---- roof geometry: two slopes, ridge along local X ------------------------
export function gableGeometry(w, d, rise) {
  const hw = w / 2, hd = d / 2, v = [], uv = [];
  const slope = Math.hypot(hd, rise);
  const quad = (a, b, c, dd) => { v.push(...a, ...b, ...c, ...a, ...c, ...dd); };
  const uquad = () => uv.push(0, 0, w / 256, 0, w / 256, slope / 120, 0, 0, w / 256, slope / 120, 0, slope / 120);
  quad([-hw, 0, hd], [hw, 0, hd], [hw, rise, 0], [-hw, rise, 0]); uquad();   // south slope
  quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, rise, 0], [hw, rise, 0]); uquad(); // north slope
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}
// triangles closing the gable ends (wall material)
function pedimentGeometry(w, d, rise) {
  const hw = w / 2, hd = d / 2, v = [], uv = [];
  v.push(-hw, 0, -hd, -hw, 0, hd, -hw, rise, 0);   // west end (normal −x)
  v.push(hw, 0, hd, hw, 0, -hd, hw, rise, 0);      // east end (normal +x)
  uv.push(0, 0, d / 128, 0, d / 256, rise / 128);
  uv.push(0, 0, d / 128, 0, d / 256, rise / 128);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(r0, r1, h, seg, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ============================ THE GROUND =====================================
function paintGround(group) {
  const PAD = W.PAD, TW = MAPD.W + PAD * 2, TH = MAPD.H + PAD * 2;
  const S = 4096 / Math.max(TW, TH);
  const cv = mkcv(4096, Math.round(TH * S));
  const x = cv.getContext('2d');
  x.setTransform(S, 0, 0, S, PAD * S, PAD * S);   // paint in plan coordinates
  const r = hrng(4242);
  W.groundCv = cv; W.groundCtx = x; W.S = S;

  // deep grass base with broad tonal drift
  x.fillStyle = '#48521f'; x.fillRect(-PAD, -PAD, TW, TH);
  const tones = ['#3c4a1c', '#57622e', '#636834', '#35431c', '#6a6d3e', '#4d5e24'];
  for (let i = 0; i < 300; i++) {
    const cx = -PAD + r() * TW, cy = -PAD + r() * TH, cr = 90 + r() * 260;
    const g = x.createRadialGradient(cx, cy, cr * 0.15, cx, cy, cr);
    const c = tones[(r() * tones.length) | 0];
    g.addColorStop(0, c + '77'); g.addColorStop(1, c + '00');
    x.fillStyle = g; x.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
  // sun-dried patches
  for (let i = 0; i < 54; i++) {
    const cx = r() * MAPD.W, cy = r() * MAPD.H, cr = 40 + r() * 120;
    const g = x.createRadialGradient(cx, cy, 4, cx, cy, cr);
    const c = ['#767745', '#83814d', '#696b3c'][(r() * 3) | 0];
    g.addColorStop(0, c + '58'); g.addColorStop(1, c + '00');
    x.fillStyle = g; x.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
  // grass weave: tiny dense blades, clumped — painted EARLY so roads/yards
  // cover them (fine tweed, not scattered sticks)
  x.lineCap = 'round';
  const blade = (gx, gy) => {
    const a = -1.15 + (r() - 0.5) * 1.6, l = 1.6 + r() * 3.2;
    x.strokeStyle = ['#66763a', '#42511f', '#78854a', '#54642e', '#87914e', '#37451b'][(r() * 6) | 0];
    x.globalAlpha = 0.22 + r() * 0.3; x.lineWidth = 0.9 + r() * 0.9;
    x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + Math.cos(a) * l, gy + Math.sin(a) * l);
    x.stroke();
  };
  for (let c = 0; c < 1700; c++) {
    const cx = -PAD + r() * TW, cy = -PAD + r() * TH, cr = 14 + r() * 46;
    const n = 30 + r() * 60;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.3, d = Math.sqrt(r()) * cr;
      blade(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    }
  }
  for (let i = 0; i < 30000; i++) blade(-PAD + r() * TW, -PAD + r() * TH);
  x.globalAlpha = 1;
  // dark meadow mottle — micro-contrast the refs have everywhere
  for (let i = 0; i < 3200; i++) {
    const mx = -PAD + r() * TW, my = -PAD + r() * TH, mr = 4 + r() * 15;
    x.fillStyle = ['#333f16', '#2c3814', '#3a471c'][(r() * 3) | 0];
    x.globalAlpha = 0.1 + r() * 0.12;
    x.beginPath(); x.ellipse(mx, my, mr, mr * (0.5 + r() * 0.5), r() * 3, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  // darker world beyond the mission bounds
  x.fillStyle = 'rgba(38,48,22,0.55)';
  x.fillRect(-PAD, -PAD, TW, PAD + 14); x.fillRect(-PAD, MAPD.H - 14, TW, PAD + 28);
  x.fillRect(-PAD, 0, PAD + 14, MAPD.H); x.fillRect(MAPD.W - 14, 0, PAD + 28, MAPD.H);

  // packed-earth halos (depot yard, checkpoint, farm, insertion)
  for (const d of MAPD.dirt) {
    const g = x.createRadialGradient(d.x, d.y, d.r * 0.2, d.x, d.y, d.r);
    g.addColorStop(0, 'rgba(132,114,82,0.72)'); g.addColorStop(0.7, 'rgba(127,110,79,0.42)'); g.addColorStop(1, 'rgba(124,107,77,0)');
    x.fillStyle = g; x.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
  }

  // packed-dirt yards: heavy tonal noise, fine cracks, oil stains, tire arcs
  for (const yd of MAPD.yards) {
    x.fillStyle = '#877c62'; x.fillRect(yd.x, yd.y, yd.w, yd.h);
    for (let i = 0; i < 280; i++) {
      x.fillStyle = ['#7b7057', '#93876c', '#746a52', '#9c9074', '#6c6350'][(r() * 5) | 0];
      x.globalAlpha = 0.3;
      const bx = yd.x + r() * yd.w, by = yd.y + r() * yd.h, br = 7 + r() * 24;
      x.beginPath(); x.ellipse(bx, by, br, br * (0.5 + r() * 0.5), r() * 3, 0, 7); x.fill();
      x.globalAlpha = 1;
    }
    x.strokeStyle = 'rgba(66,58,40,0.22)'; x.lineWidth = 1.2;
    for (let i = 0; i < 36; i++) {
      let cx = yd.x + r() * yd.w, cy = yd.y + r() * yd.h;
      x.beginPath(); x.moveTo(cx, cy);
      for (let k = 0; k < 3; k++) { cx += (r() - 0.5) * 26; cy += (r() - 0.5) * 26; x.lineTo(cx, cy); }
      x.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const sx = yd.x + r() * yd.w, sy = yd.y + r() * yd.h, sr = 10 + r() * 26;
      const g = x.createRadialGradient(sx, sy, 2, sx, sy, sr);
      g.addColorStop(0, 'rgba(42,38,28,0.45)'); g.addColorStop(1, 'rgba(42,38,28,0)');
      x.fillStyle = g; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    // tire arcs sweeping through the yard
    x.strokeStyle = 'rgba(88,76,54,0.34)';
    for (let i = 0; i < 6; i++) {
      const cx = yd.x + r() * yd.w, cy = yd.y + r() * yd.h, cr = 90 + r() * 220;
      const a0 = r() * 6.3, al = 0.35 + r() * 0.7;
      for (const off of [0, 9]) {
        x.lineWidth = 4;
        x.beginPath(); x.arc(cx, cy, cr + off, a0, a0 + al); x.stroke();
      }
    }
  }

  // ploughed fields — wavy furrows, earthy tonal drift, crop stubble
  for (const f of MAPD.fields) {
    x.save();
    x.translate(f.x + f.w / 2, f.y + f.h / 2); x.rotate(f.a);
    x.fillStyle = '#6b5a3c'; x.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
    for (let i = 0; i < 40; i++) {
      const bx = (r() - 0.5) * f.w, by = (r() - 0.5) * f.h, br = 24 + r() * 70;
      const g = x.createRadialGradient(bx, by, 4, bx, by, br);
      const c = ['#5d4c30', '#79694a', '#645638', '#816f4e'][(r() * 4) | 0];
      g.addColorStop(0, c + '77'); g.addColorStop(1, c + '00');
      x.fillStyle = g; x.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    for (let fy = -f.h / 2 + 8; fy < f.h / 2 - 4; fy += 13) {
      const ph = r() * 6.3, amp = 1.2 + r() * 1.8;
      const wavy = (col, wdt, alpha, off) => {
        x.strokeStyle = col; x.lineWidth = wdt; x.globalAlpha = alpha;
        x.beginPath();
        for (let fx = -f.w / 2 + 5; fx <= f.w / 2 - 5; fx += 14) {
          const yy = fy + off + Math.sin(fx * 0.045 + ph) * amp;
          if (fx === -f.w / 2 + 5) x.moveTo(fx, yy); else x.lineTo(fx, yy);
        }
        x.stroke(); x.globalAlpha = 1;
      };
      wavy('rgba(42,33,20,0.8)', 5.5, 0.85, 0);       // furrow shadow
      wavy('rgba(155,134,96,0.6)', 3, 0.7, -4.4);     // sunlit ridge
      // crop stubble along the ridge
      for (let fx = -f.w / 2 + 8 + r() * 10; fx < f.w / 2 - 8; fx += 7 + r() * 7) {
        x.fillStyle = ['#75803c', '#868f48', '#647032', '#93985a'][(r() * 4) | 0];
        x.globalAlpha = 0.75 + r() * 0.25;
        x.fillRect(fx, fy - 2 + Math.sin(fx * 0.045 + ph) * amp - 2.4, 2, 3.2);
        x.globalAlpha = 1;
      }
    }
    x.strokeStyle = 'rgba(48,40,26,0.85)'; x.lineWidth = 4;
    x.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
    x.restore();
  }

  // roads: verge → body → ruts → potholes
  const strokePts = (pts, w, col, alpha = 1) => {
    x.strokeStyle = col; x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round';
    x.globalAlpha = alpha;
    x.beginPath(); x.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) x.lineTo(p.x, p.y);
    x.stroke(); x.globalAlpha = 1;
  };
  for (const rd of MAPD.roads) {
    strokePts(rd.pts, rd.w + 30, '#61603a', 0.55);           // grassy verge blend
    strokePts(rd.pts, rd.w + 8, '#746a49', 0.9);             // shoulder
    strokePts(rd.pts, rd.w - 4, '#80714f');                  // packed body
    // ragged grass bites into the road edge
    for (let i = 2; i < rd.pts.length - 2; i += 2) {
      if (r() < 0.55) continue;
      const p = rd.pts[i], q = rd.pts[i + 1];
      const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
      const side = r() < 0.5 ? -1 : 1;
      const ex = p.x + Math.cos(a) * rd.w * 0.5 * side, ey = p.y + Math.sin(a) * rd.w * 0.5 * side;
      x.fillStyle = ['#55622c', '#4a5726', '#606b33'][(r() * 3) | 0];
      x.globalAlpha = 0.7;
      x.beginPath(); x.ellipse(ex, ey, 6 + r() * 16, 4 + r() * 8, a, 0, 7); x.fill();
      x.globalAlpha = 1;
    }
    // scattered stones on the body
    for (let i = 0; i < rd.pts.length; i += 2) {
      const p = rd.pts[i];
      x.fillStyle = r() < 0.5 ? 'rgba(120,108,82,0.6)' : 'rgba(90,80,60,0.6)';
      x.beginPath();
      x.arc(p.x + (r() - 0.5) * rd.w * 0.8, p.y + (r() - 0.5) * rd.w * 0.8, 1 + r() * 2.4, 0, 7);
      x.fill();
    }
    // wheel ruts: offset polylines
    for (const side of [-1, 1]) {
      x.strokeStyle = 'rgba(84,71,50,0.9)'; x.lineWidth = 6; x.lineCap = 'round';
      x.beginPath();
      for (let i = 0; i < rd.pts.length; i++) {
        const p = rd.pts[i], q = rd.pts[Math.min(rd.pts.length - 1, i + 1)];
        const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
        const ox = Math.cos(a) * rd.w * 0.26 * side, oy = Math.sin(a) * rd.w * 0.26 * side;
        if (i === 0) x.moveTo(p.x + ox, p.y + oy); else x.lineTo(p.x + ox, p.y + oy);
      }
      x.stroke();
      // lighter ridge beside each rut
      x.strokeStyle = 'rgba(160,142,106,0.4)'; x.lineWidth = 3;
      x.beginPath();
      for (let i = 0; i < rd.pts.length; i++) {
        const p = rd.pts[i], q = rd.pts[Math.min(rd.pts.length - 1, i + 1)];
        const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
        const ox = Math.cos(a) * rd.w * 0.15 * side, oy = Math.sin(a) * rd.w * 0.15 * side;
        if (i === 0) x.moveTo(p.x + ox, p.y + oy); else x.lineTo(p.x + ox, p.y + oy);
      }
      x.stroke();
    }
    // potholes + surface noise
    for (let i = 0; i < rd.pts.length; i += 3) {
      const p = rd.pts[i];
      if (r() < 0.4) {
        const px = p.x + (r() - 0.5) * rd.w * 0.7, py = p.y + (r() - 0.5) * rd.w * 0.7;
        x.fillStyle = `rgba(${70 + r() * 40 | 0},${60 + r() * 34 | 0},${44 + r() * 26 | 0},0.55)`;
        x.beginPath(); x.ellipse(px, py, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, 7); x.fill();
      }
    }
  }
  // foot paths
  for (const path of MAPD.paths) {
    x.strokeStyle = 'rgba(133,117,80,0.6)'; x.lineWidth = 13; x.lineCap = 'round';
    x.beginPath(); x.moveTo(path[0].x, path[0].y);
    for (const p of path) x.lineTo(p.x, p.y);
    x.stroke();
  }

  // worn dirt at doorways, gates, extraction
  const wear = (wx, wy, wr, a) => {
    const g = x.createRadialGradient(wx, wy, 2, wx, wy, wr);
    g.addColorStop(0, `rgba(133,115,80,${a})`); g.addColorStop(1, 'rgba(133,115,80,0)');
    x.fillStyle = g; x.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
  };
  wear(1038, 1032, 70, 0.8); wear(1332, 1290, 60, 0.7);
  for (const b of MAPD.bldgs) wear(b.x + b.w / 2, b.y + b.d + 14, 44, 0.6);
  wear(MAPD.extract.x, MAPD.extract.y, 60, 0.5);

  // universal grain (over everything, incl. roads/yards)
  for (let i = 0; i < 34000; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(18,22,8,0.16)' : 'rgba(214,218,164,0.11)';
    x.fillRect(-PAD + r() * TW, -PAD + r() * TH, 1.6, 1.6);
  }

  // → mesh
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bumpFrom(cv, 1.3));
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 4, roughness: 1, metalness: 0 });
  const detail = new THREE.CanvasTexture(detailNoiseCanvas(7));
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  mat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: detail };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D detailMap;')
      .replace('#include <map_fragment>',
        '#include <map_fragment>\n{ vec3 dtl = texture2D(detailMap, vMapUv * 52.0).rgb; diffuseColor.rgb *= mix(vec3(1.0), dtl * 2.0, 0.42); }');
  };
  W.groundTex = map;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(MAPD.W / 2, 0, MAPD.H / 2);
  mesh.receiveShadow = true;
  group.add(mesh);
  W.ground = mesh;
}

// ============================ BUILDINGS ======================================
const FK = 2;   // facade canvas px per world unit
function baseWallPattern(x, b, wpx, hpx) {
  const painter = { brick: brickCanvas, stone: stoneWallCanvas, stucco: stuccoCanvas }[b.mat] || stuccoCanvas;
  const pat = x.createPattern(painter(3 + (b.x | 0) % 7), 'repeat');
  x.fillStyle = pat; x.fillRect(0, 0, wpx, hpx);
}
function paintWindow(x, wx, wy, ww, wh, opts = {}) {
  const K = FK;
  x.fillStyle = 'rgba(214,205,180,0.9)';                        // surround
  x.fillRect(wx - 3 * K, wy - 3 * K, ww + 6 * K, wh + 6 * K);
  x.fillStyle = '#2b3026'; x.fillRect(wx, wy, ww, wh);          // frame
  const g = x.createLinearGradient(0, wy, 0, wy + wh);          // glass
  g.addColorStop(0, '#54646c'); g.addColorStop(0.55, '#39443e'); g.addColorStop(1, '#20281f');
  x.fillStyle = g; x.fillRect(wx + 1.6 * K, wy + 1.6 * K, ww - 3.2 * K, wh - 3.2 * K);
  x.fillStyle = 'rgba(220,235,240,0.16)';                       // glint
  x.beginPath(); x.moveTo(wx + ww * 0.15, wy + wh); x.lineTo(wx + ww * 0.5, wy); x.lineTo(wx + ww * 0.75, wy); x.lineTo(wx + ww * 0.35, wy + wh); x.fill();
  x.fillStyle = '#33382d';                                      // mullions
  x.fillRect(wx + ww / 2 - 0.8 * K, wy, 1.6 * K, wh);
  x.fillRect(wx, wy + wh / 2 - 0.8 * K, ww, 1.6 * K);
  x.fillStyle = '#d9d1ba'; x.fillRect(wx - 4 * K, wy + wh, ww + 8 * K, 3.2 * K);   // sill
  x.fillStyle = 'rgba(50,44,30,0.35)'; x.fillRect(wx - 4 * K, wy + wh + 3.2 * K, ww + 8 * K, 1.6 * K);
  if (opts.shutters) {
    x.fillStyle = '#4e5e40';
    x.fillRect(wx - 9 * K, wy - K, 7 * K, wh + 2 * K);
    x.fillRect(wx + ww + 2 * K, wy - K, 7 * K, wh + 2 * K);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 5; i++) {
      x.fillRect(wx - 9 * K, wy - K + i * (wh + 2 * K) / 5, 7 * K, 1.2 * K);
      x.fillRect(wx + ww + 2 * K, wy - K + i * (wh + 2 * K) / 5, 7 * K, 1.2 * K);
    }
  }
}
function facadeCanvas(b, face) {
  const fw = (face === 'e' || face === 'w') ? b.d : b.w;
  const cv = mkcv(fw * FK, b.h * FK), x = cv.getContext('2d');
  const rr = rng((b.x * 7 + b.y) | 0);
  baseWallPattern(x, b, cv.width, cv.height);
  const K = FK;
  // lift — facades must read in the hemisphere-lit shade
  x.fillStyle = 'rgba(228,218,192,0.14)'; x.fillRect(0, 0, cv.width, cv.height);
  // plinth
  x.fillStyle = 'rgba(58,52,38,0.4)'; x.fillRect(0, cv.height - 10 * K, cv.width, 10 * K);
  x.fillStyle = 'rgba(30,26,18,0.5)'; x.fillRect(0, cv.height - 10 * K, cv.width, 1.5 * K);
  // eave grime
  const g = x.createLinearGradient(0, 0, 0, 14 * K);
  g.addColorStop(0, 'rgba(40,36,24,0.4)'); g.addColorStop(1, 'rgba(40,36,24,0)');
  x.fillStyle = g; x.fillRect(0, 0, cv.width, 14 * K);
  // windows
  const hasDoor = b.doorFace === face;
  const n = Math.max(1, Math.floor(fw / 95));
  const ww = 24 * K, wh = 30 * K, wy = (b.h * 0.30) * K;
  const doorI = hasDoor ? (n / 2 | 0) : -1;
  for (let i = 0; i < n; i++) {
    const wx = ((i + 0.5) * fw / n) * K - ww / 2;
    if (i === doorI) {
      // door: planks + frame + step
      const dw = 30 * K, dh = 44 * K, dx = ((i + 0.5) * fw / n) * K - dw / 2, dy = cv.height - dh - 2 * K;
      x.fillStyle = 'rgba(216,206,182,0.9)'; x.fillRect(dx - 3 * K, dy - 3 * K, dw + 6 * K, dh + 3 * K);
      x.fillStyle = '#4a3a26'; x.fillRect(dx, dy, dw, dh);
      x.fillStyle = 'rgba(0,0,0,0.3)';
      for (let p = 1; p < 5; p++) x.fillRect(dx + p * dw / 5, dy, 1.2 * K, dh);
      x.fillStyle = 'rgba(255,240,210,0.10)'; x.fillRect(dx, dy, dw, 2 * K);
      x.fillStyle = '#8a8574'; x.beginPath(); x.arc(dx + dw - 5 * K, dy + dh * 0.55, 1.6 * K, 0, 7); x.fill();
      continue;
    }
    paintWindow(x, wx, wy, ww, wh, { shutters: b.mat === 'stone' });
    // grime streaks under the window
    x.strokeStyle = 'rgba(52,46,32,0.22)'; x.lineWidth = 2;
    for (let s = 0; s < 4; s++) {
      const sx = wx + rr() * ww;
      x.beginPath(); x.moveTo(sx, wy + wh + 4 * K); x.lineTo(sx + (rr() - 0.5) * 4, wy + wh + (12 + rr() * 10) * K); x.stroke();
    }
  }
  // ivy climbing the wall
  if (b.ivy && (face === 'w' || face === 'n')) {
    const cols = 2 + (rr() * 2 | 0);
    for (let cI = 0; cI < cols; cI++) {
      let ix = (0.12 + rr() * 0.7) * cv.width, iy = cv.height;
      const climb = cv.height * (0.5 + rr() * 0.45);
      while (iy > cv.height - climb) {
        for (let l = 0; l < 5; l++) {
          x.fillStyle = ['#3d5426', '#2f451d', '#4b6030', '#576b36'][(rr() * 4) | 0];
          x.globalAlpha = 0.85;
          const lx = ix + (rr() - 0.5) * 16 * K, ly = iy + (rr() - 0.5) * 6 * K;
          x.beginPath(); x.ellipse(lx, ly, (1.4 + rr() * 2) * K, (1.1 + rr() * 1.6) * K, rr() * 3, 0, 7); x.fill();
        }
        ix += (rr() - 0.5) * 7 * K; iy -= 5 * K;
      }
      x.globalAlpha = 1;
    }
  }
  // sign board
  if (b.sign && face === b.doorFace) {
    const sw = Math.min(cv.width * 0.6, b.sign.length * 8.4 * K), sh = 12 * K;
    const sx = cv.width / 2 - sw / 2, sy = 5 * K;
    x.fillStyle = '#241f16'; x.fillRect(sx - 2 * K, sy - 1.5 * K, sw + 4 * K, sh + 3 * K);
    x.fillStyle = '#39321f'; x.fillRect(sx, sy, sw, sh);
    x.strokeStyle = 'rgba(190,175,140,0.5)'; x.lineWidth = K; x.strokeRect(sx + K, sy + K, sw - 2 * K, sh - 2 * K);
    x.fillStyle = '#c23c2c'; x.font = `bold ${8.6 * K}px monospace`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(b.sign, cv.width / 2, sy + sh / 2 + K * 0.4);
  }
  return cv;
}
function facadeMat(b, face) {
  const cv = facadeCanvas(b, face);
  return new THREE.MeshStandardMaterial({
    map: tex(cv, { repeat: 1 }),
    bumpMap: tex(bumpFrom(cv, 1.1), { repeat: 1, srgb: false }),
    bumpScale: 2.5, roughness: 0.95, metalness: 0,
  });
}

function buildBuilding(group, b, mats) {
  const bx = b.x + b.w / 2, bz = b.y + b.d / 2;
  const g = new THREE.Group();
  g.position.set(bx, 0, bz);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [
    facadeMat(b, 'e'), facadeMat(b, 'w'), mats[b.mat], mats[b.mat],
    facadeMat(b, 's'), facadeMat(b, 'n'),
  ]);
  walls.castShadow = walls.receiveShadow = true;
  walls.position.y = b.h / 2;
  g.add(walls);

  // roof: slopes + ridge + pediments + bargeboards
  const EAVE = 15;
  const roofMatKey = { terra: 'terra', slate: 'slate', rust: 'rust' }[b.roof] || 'terra';
  const roof = new THREE.Mesh(gableGeometry(b.w + EAVE * 2, b.d + EAVE * 2, b.rise), mats[roofMatKey]);
  roof.castShadow = roof.receiveShadow = true;
  roof.position.y = b.h - 2;
  g.add(roof);

  const ped = new THREE.Mesh(pedimentGeometry(b.w, b.d, b.rise), mats[b.mat]);
  ped.castShadow = ped.receiveShadow = true;
  ped.position.y = b.h - 2;
  g.add(ped);

  const slopeLen = Math.hypot((b.d + EAVE * 2) / 2, b.rise);
  const pitch = Math.atan2(b.rise, (b.d + EAVE * 2) / 2);
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) {
    const bb = box(4, 5, slopeLen + 4, mats.plank);
    bb.rotation.x = ez * pitch;
    bb.position.set(ex * (b.w / 2 + EAVE - 2), b.h - 2 + b.rise / 2 + 1, ez * (b.d / 2 + EAVE) / 2);
    g.add(bb);
  }
  const ridge = box(b.w + EAVE * 2 + 4, 4.5, 9, mats[roofMatKey]);
  ridge.position.y = b.h - 2 + b.rise + 1;
  g.add(ridge);

  if (b.chimney) {
    const ch = new THREE.Group();
    ch.position.set(b.w * 0.24, 0, -b.d * 0.16);
    const stack = box(19, 40, 19, mats.brick); stack.position.y = b.h + b.rise * 0.45; ch.add(stack);
    const cap = box(25, 4.5, 25, mats.stone); cap.position.y = b.h + b.rise * 0.45 + 22; ch.add(cap);
    for (const px of [-5, 5]) {
      const pot = cyl(3.2, 4, 9, 8, mats.terra); pot.position.set(px, b.h + b.rise * 0.45 + 28, 0); ch.add(pot);
    }
    g.add(ch);
  }

  if (b.awning) {
    const cvA = mkcv(128, 64), xa = cvA.getContext('2d');
    for (let i = 0; i < 8; i++) { xa.fillStyle = i % 2 ? b.awning : '#d8cdb4'; xa.fillRect(i * 16, 0, 16, 64); }
    xa.fillStyle = 'rgba(0,0,0,0.22)'; xa.fillRect(0, 48, 128, 16);
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(58, 30),
      new THREE.MeshStandardMaterial({ map: tex(cvA), side: THREE.DoubleSide, roughness: 0.9 }));
    aw.castShadow = true;
    aw.rotation.x = -Math.PI / 2 + 0.55;
    aw.position.set(0, b.h * 0.66, b.d / 2 + 12);
    g.add(aw);
  }

  group.add(g);
  aoBlob(group, bx, bz, b.w * 0.72, b.d * 0.78, 0.4, 0, true);
}

// ============================ DRESSING =======================================
function buildWallsAndTowers(group, mats) {
  for (const w of MAPD.walls) {
    const lenX = Math.max(w.x1 - w.x0, w.t), lenZ = Math.max(w.y1 - w.y0, w.t);
    const cx = (w.x0 + w.x1) / 2, cz = (w.y0 + w.y1) / 2;
    const stone = mats.stone.clone();
    stone.map = mats.stone.map.clone(); stone.bumpMap = mats.stone.bumpMap.clone();
    const horiz = lenX > lenZ;
    stone.map.repeat.set((horiz ? lenX : lenZ) / 210, w.h / 52);
    stone.bumpMap.repeat.copy(stone.map.repeat);
    const seg = box(lenX, w.h, lenZ, stone);
    seg.position.set(cx, w.h / 2, cz);
    group.add(seg);
    const cap = box(horiz ? lenX + 4 : w.t + 8, 4.5, horiz ? w.t + 8 : lenZ + 4, mats.stone);
    cap.position.set(cx, w.h + 2, cz);
    group.add(cap);
    aoBlob(group, cx, cz, lenX * 0.62 + 10, lenZ * 0.62 + 10, 0.35, 0, true);
  }
  MAPD.towers.forEach((t, i) => {
    const g = new THREE.Group(); g.position.set(t.x, 0, t.y);
    const shaft = box(t.s * 2, t.h, t.s * 2, mats.stone); shaft.position.y = t.h / 2; g.add(shaft);
    const plat = box(t.s * 2 + 14, 7, t.s * 2 + 14, mats.stone); plat.position.y = t.h + 3; g.add(plat);
    for (const [dx, dz, w, d] of [[0, 1, t.s * 2 + 14, 5], [0, -1, t.s * 2 + 14, 5], [1, 0, 5, t.s * 2 + 14], [-1, 0, 5, t.s * 2 + 14]]) {
      const par = box(w, 9, d, mats.stone);
      par.position.set(dx * (t.s + 4.5), t.h + 11, dz * (t.s + 4.5));
      g.add(par);
    }
    if (i === 0 || i === 3) {
      const hut = new THREE.Mesh(new THREE.ConeGeometry(t.s * 1.5, 26, 4), mats.terra);
      hut.rotation.y = Math.PI / 4; hut.position.y = t.h + 28; hut.castShadow = true;
      g.add(hut);
    }
    // slit windows
    for (const f of [[0, 1], [1, 0]]) {
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(5, 16), new THREE.MeshBasicMaterial({ color: '#14170f' }));
      slit.position.set(f[0] * (t.s + 0.6), t.h * 0.68, f[1] * (t.s + 0.6));
      if (f[0]) slit.rotation.y = Math.PI / 2;
      g.add(slit);
    }
    group.add(g);
    aoBlob(group, t.x, t.y, t.s * 1.7, t.s * 1.7, 0.42, 0, true);
  });
  for (const p of MAPD.pillars) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.y);
    const shaft = box(p.s * 2, p.h, p.s * 2, mats.stone); shaft.position.y = p.h / 2; g.add(shaft);
    const cap = box(p.s * 2 + 8, 5, p.s * 2 + 8, mats.stone); cap.position.y = p.h + 2.5; g.add(cap);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#d8c890', emissive: '#8a6a20', emissiveIntensity: 0.5, roughness: 0.4 }));
    lamp.position.y = p.h + 9; g.add(lamp);
    const cage = cyl(5.5, 6.5, 8, 6, mats.metal); cage.position.y = p.h + 9; g.add(cage);
    group.add(g);
    aoBlob(group, p.x, p.y, p.s * 2, p.s * 2, 0.4);
  }
}

function buildFences(group, mats) {
  for (const f of MAPD.fences) {
    const len = dist(f.x0, f.y0, f.x1, f.y1);
    const a = Math.atan2(f.y1 - f.y0, f.x1 - f.x0);
    const g = new THREE.Group();
    g.position.set(f.x0, 0, f.y0);
    g.rotation.y = yaw(a);
    const n = Math.max(2, Math.round(len / 46));
    for (let i = 0; i <= n; i++) {
      const post = box(4.5, 27, 4.5, mats.plank);
      post.position.set(i * len / n, 13.5, 0);
      g.add(post);
    }
    for (const ry of [10, 20]) {
      const rail = box(len, 3, 2.4, mats.plank);
      rail.position.set(len / 2, ry, 0);
      g.add(rail);
    }
    group.add(g);
  }
}

function roadTangentAt(x, y) {
  let best = 1e9, ang = 0;
  for (const rd of MAPD.roads) {
    for (let i = 0; i < rd.pts.length - 1; i += 2) {
      const p = rd.pts[i], q = rd.pts[i + 2] || rd.pts[i + 1];
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < best) { best = d; ang = Math.atan2(q.y - p.y, q.x - p.x); }
    }
  }
  return ang;
}
function buildPolesAndLamps(group, mats) {
  for (const p of MAPD.poles) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.y);
    g.rotation.y = yaw(roadTangentAt(p.x, p.y)) + Math.PI / 2;   // crossarms face the road
    const pole = cyl(3.2, 4.6, 112, 7, mats.bark); pole.position.y = 56; g.add(pole);
    for (const [ay, aw] of [[100, 40], [88, 30]]) {
      const arm = box(aw, 3.4, 3.4, mats.plank); arm.position.y = ay; g.add(arm);
      for (const ax of [-aw / 2 + 3, aw / 2 - 3]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(2, 6, 5),
          new THREE.MeshStandardMaterial({ color: '#cfd4d8', roughness: 0.35 }));
        knob.position.set(ax, ay + 3.6, 0); g.add(knob);
      }
    }
    group.add(g);
    aoBlob(group, p.x, p.y, 9, 7, 0.45);
  }
  for (const l of MAPD.lamps) {
    const g = new THREE.Group(); g.position.set(l.x, 0, l.y);
    const pole = cyl(2.6, 3.4, 74, 7, mats.metal); pole.position.y = 37; g.add(pole);
    const arm = box(20, 2.6, 2.6, mats.metal); arm.position.set(8, 73, 0); g.add(arm);
    const shade = cyl(3, 8, 7, 8, mats.metal); shade.position.set(17, 70, 0); g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#ffe8b8', emissive: '#c09030', emissiveIntensity: 0.5 }));
    bulb.position.set(17, 66.5, 0); g.add(bulb);
    group.add(g);
    aoBlob(group, l.x, l.y, 8, 6, 0.45);
  }
}

function buildProps(group, mats) {
  const r = hrng(909);
  for (const pr of MAPD.props) {
    const g = new THREE.Group();
    g.position.set(pr.x, 0, pr.y);
    if (pr.a) g.rotation.y = yaw(pr.a);

    if (pr.kind === 'crates') {
      const c1 = box(38, 34, 38, mats.crate); c1.position.set(-6, 17, 2); c1.rotation.y = 0.06; g.add(c1);
      const c2 = box(27, 25, 27, mats.crate); c2.position.set(22, 12.5, 14); c2.rotation.y = -0.5; g.add(c2);
      const c3 = box(21, 19, 21, mats.crate); c3.position.set(-4, 34 + 9.5, 0); c3.rotation.y = 0.6; g.add(c3);
      if (pr.big) { const c4 = box(50, 44, 42, mats.crate); c4.position.set(-14, 22, -34); c4.rotation.y = -0.14; g.add(c4); }
      aoBlob(group, pr.x, pr.y, 56, 48, 0.4);
    } else if (pr.kind === 'barrels') {
      for (const [ox, oz, tip] of [[-10, -4, 0], [8, 6, 0], [24, -8, 1]]) {
        const b = cyl(9.5, 9.5, 26, 12, mats.metal);
        if (tip) { b.rotation.z = Math.PI / 2; b.rotation.y = r() * 3; b.position.set(ox, 9.5, oz); }
        else b.position.set(ox, 13, oz);
        for (const hy of [-7, 7]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(9.8, 0.9, 6, 16),
            new THREE.MeshStandardMaterial({ color: '#3d4038', roughness: 0.6, metalness: 0.4 }));
          ring.rotation.x = Math.PI / 2; ring.position.y = hy;
          b.add(ring);
        }
        g.add(b);
      }
      aoBlob(group, pr.x, pr.y, 40, 32, 0.42);
    } else if (pr.kind === 'spool') {
      const sp = new THREE.Group();
      for (const sx of [-11, 11]) { const disc = cyl(20, 20, 5, 16, mats.plank); disc.rotation.z = Math.PI / 2; disc.position.set(sx, 20, 0); sp.add(disc); }
      const axle = cyl(8, 8, 22, 10, mats.plank); axle.rotation.z = Math.PI / 2; axle.position.y = 20; sp.add(axle);
      g.add(sp);
      aoBlob(group, pr.x, pr.y, 26, 22, 0.42);
    } else if (pr.kind === 'traps') {
      for (const [hx, hz] of [[-44, 40], [0, 0], [44, -40]]) {
        const h = new THREE.Group(); h.position.set(hx, 0, hz);
        for (const rot of [[0, 0, Math.PI / 4], [Math.PI / 4, Math.PI / 2, 0], [-Math.PI / 4, -Math.PI / 2, 0]]) {
          const beam = box(5.5, 5.5, 46, mats.metal);
          beam.rotation.set(rot[0], rot[1], rot[2]);
          beam.position.y = 13;
          h.add(beam);
        }
        g.add(h);
        aoBlob(group, pr.x + hx, pr.y + hz, 26, 22, 0.4);
      }
    } else if (pr.kind === 'wagon' || pr.kind === 'cart') {
      const bed = box(58, 7, 38, mats.plank); bed.position.y = 20; g.add(bed);
      for (const [sx, sz] of [[0, 20.5], [0, -20.5]]) { const side = box(58, 12, 3, mats.plank); side.position.set(sx, 28, sz); g.add(side); }
      for (const [wx, wz] of [[-20, 21], [20, 21], [-20, -21], [20, -21]]) {
        const wheel = cyl(13, 13, 4, 12, mats.plank);
        wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 13, wz);
        const hub = cyl(3, 3, 6, 8, mats.metal); hub.rotation.x = Math.PI / 2; hub.position.set(wx, 13, wz);
        g.add(wheel); g.add(hub);
      }
      const shaft = box(30, 3.5, 3.5, mats.plank); shaft.rotation.y = 0.12; shaft.position.set(-40, 14, 4); g.add(shaft);
      aoBlob(group, pr.x, pr.y, 46, 38, 0.4);
    } else if (pr.kind === 'truck') {
      const olive = mats.olive;
      const chassis = box(116, 8, 50, olive); chassis.position.y = 17; g.add(chassis);
      const hood = box(20, 15, 38, olive); hood.position.set(48, 30, 0); g.add(hood);
      const cab = box(26, 25, 44, olive); cab.position.set(24, 36, 0); g.add(cab);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(34, 9),
        new THREE.MeshStandardMaterial({ color: '#1d2620', roughness: 0.25, metalness: 0.3 }));
      glass.rotation.y = Math.PI / 2; glass.position.set(37.2, 41, 0); g.add(glass);
      const tarp = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 66, 12, 1, false, 0, Math.PI), mats.tarp);
      tarp.rotation.z = Math.PI / 2;
      tarp.position.set(-22, 30, 0); tarp.castShadow = tarp.receiveShadow = true;
      g.add(tarp);
      const tail = box(4, 16, 46, mats.plank); tail.position.set(-54, 28, 0); g.add(tail);
      for (const wx of [-38, 0, 40]) for (const wz of [-26, 26]) {
        const wheel = cyl(11, 11, 8, 12, new THREE.MeshStandardMaterial({ color: '#22221e', roughness: 0.9 }));
        wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 11, wz);
        wheel.castShadow = true;
        g.add(wheel);
      }
      aoBlob(group, pr.x, pr.y, 68, 46, 0.42);
    } else if (pr.kind === 'sandbags') {
      for (let i = 0; i < 5; i++) {
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(6.5, 11, 3, 8), mats.sand);
        bag.rotation.z = Math.PI / 2; bag.rotation.y = (r() - 0.5) * 0.3;
        bag.position.set(-28 + i * 14, 6, (r() - 0.5) * 3);
        bag.castShadow = bag.receiveShadow = true;
        g.add(bag);
      }
      for (let i = 0; i < 4; i++) {
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(6.5, 11, 3, 8), mats.sand);
        bag.rotation.z = Math.PI / 2; bag.rotation.y = (r() - 0.5) * 0.3;
        bag.position.set(-21 + i * 14, 15, (r() - 0.5) * 3);
        bag.castShadow = bag.receiveShadow = true;
        g.add(bag);
      }
      aoBlob(group, pr.x, pr.y, 40, 24, 0.4);
    } else if (pr.kind === 'woodpile') {
      for (const px of [-26, 26]) { const post = box(4, 24, 4, mats.plank); post.position.set(px, 12, 0); g.add(post); }
      let n = 4;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < n; i++) {
          const log = cyl(6.2, 6.2, 48, 9, mats.bark);
          log.rotation.z = Math.PI / 2;
          log.position.set(0, 7 + row * 11, -n * 6.5 + i * 13 + 6.5);
          g.add(log);
        }
        n--;
      }
      aoBlob(group, pr.x, pr.y, 34, 22, 0.45);
    } else if (pr.kind === 'boom') {
      const pivot = box(7, 34, 7, mats.metal); pivot.position.y = 17; g.add(pivot);
      const armMat = new THREE.MeshStandardMaterial({ map: tex(stripeCanvas(), { repeat: [2, 1] }), roughness: 0.7 });
      const arm = new THREE.Mesh(new THREE.BoxGeometry(pr.len, 5.5, 4), armMat);
      arm.castShadow = true;
      arm.position.set(pr.len / 2 - 4, 27, 0);
      g.add(arm);
      const rest = box(4, 25, 4, mats.metal); rest.position.set(pr.len - 8, 12.5, 0); g.add(rest);
      const weight = box(10, 12, 8, mats.metal); weight.position.set(-10, 27, 0); g.add(weight);
      aoBlob(group, pr.x, pr.y, 14, 10, 0.4);
    }
    group.add(g);
  }
}

// ---- trees ------------------------------------------------------------------
let lobeGeos = null, leafBase = null;
function lobeGeo(r) {
  if (!lobeGeos) {
    lobeGeos = [];
    for (let v = 0; v < 4; v++) {
      const geo = new THREE.IcosahedronGeometry(1, 2);
      const pos = geo.getAttribute('position');
      const rr = rng(31 + v);
      for (let i = 0; i < pos.count; i++) {
        const k = 1 + (rr() - 0.5) * 0.36;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.84, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();
      lobeGeos.push(geo);
    }
  }
  return lobeGeos[(r * lobeGeos.length) | 0];
}
function leafMat(r, dark = 0) {
  if (!leafBase) {
    const cv = leafCanvas(17);
    leafBase = {
      map: tex(cv, { repeat: 2 }),
      bump: tex(bumpFrom(cv, 1.4), { repeat: 2, srgb: false }),
    };
  }
  const m = new THREE.MeshStandardMaterial({
    map: leafBase.map, bumpMap: leafBase.bump, bumpScale: 2.4,
    roughness: 1, metalness: 0, flatShading: true,
  });
  const k = (0.82 + r() * 0.4) * (dark ? 0.7 : 1);
  m.color.setRGB(k, k * (0.96 + r() * 0.1), k * 0.9);
  return m;
}
function buildTree(group, tr, mats, r) {
  const g = new THREE.Group();
  g.position.set(tr.x, 0, tr.y);
  const trunkH = 34 + tr.r * 0.35;
  const trunk = cyl(tr.r * 0.085, tr.r * 0.15, trunkH, 7, mats.bark);
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const leaf = leafMat(r);
  const n = tr.r > 50 ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const lob = new THREE.Mesh(lobeGeo(r()), leaf);
    const s = tr.r * (0.42 + r() * 0.26);
    lob.scale.set(s, s * (0.82 + r() * 0.25), s);
    lob.position.set((r() - 0.5) * tr.r * 0.95, trunkH + tr.r * 0.38 + (r() - 0.5) * tr.r * 0.5, (r() - 0.5) * tr.r * 0.95);
    lob.rotation.y = r() * 3;
    lob.castShadow = lob.receiveShadow = true;
    g.add(lob);
  }
  const top = new THREE.Mesh(lobeGeo(r()), leaf);
  const ts = tr.r * 0.42;
  top.scale.set(ts, ts * 0.9, ts);
  top.position.set(0, trunkH + tr.r * 0.85, 0);
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  group.add(g);
  aoBlob(group, tr.x + 4, tr.y + 4, tr.r * 1.05, tr.r * 0.85, 0.38);
}

export function buildWorld(scene) {
  W.group = new THREE.Group();
  scene.add(W.group);
  const group = W.group;
  const r = hrng(20770612);

  const mats = W.mats = {
    stone: paintedMat(stoneWallCanvas(3), { bump: 5 }),
    brick: paintedMat(brickCanvas(4), { bump: 4 }),
    stucco: paintedMat(stuccoCanvas(5), { bump: 3 }),
    terra: paintedMat(roofTileCanvas(6), { bump: 4 }),
    slate: paintedMat(slateCanvas(11), { bump: 4 }),
    rust: paintedMat(corrugatedCanvas(10), { bump: 3, rough: 0.8, extra: { metalness: 0.2 } }),
    plank: paintedMat(plankCanvas(8), { bump: 3 }),
    metal: paintedMat(metalCanvas(9), { bump: 2, rough: 0.7, extra: { metalness: 0.35 } }),
    bark: paintedMat(barkCanvas(12), { bump: 4 }),
    tarp: paintedMat(tarpCanvas(13), { bump: 2.5, extra: { side: THREE.DoubleSide } }),
    sand: paintedMat(sandCanvas(14), { bump: 3 }),
    crate: paintedMat(crateCanvas(15), { bump: 3 }),
    olive: paintedMat(metalCanvas(16, 256, 256, [92, 99, 74]), { bump: 2, rough: 0.65, extra: { metalness: 0.25 } }),
  };

  paintGround(group);

  for (const b of MAPD.bldgs) buildBuilding(group, b, mats);
  buildWallsAndTowers(group, mats);
  buildFences(group, mats);
  buildPolesAndLamps(group, mats);
  buildProps(group, mats);

  for (const tr of MAPD.trees) buildTree(group, tr, mats, r);
  // framing trees just outside the mission bounds
  for (let i = 0; i < 16; i++) {
    const edge = i % 4;
    const t = {
      x: edge === 0 ? -100 - r() * 200 : edge === 1 ? MAPD.W + 100 + r() * 200 : r() * MAPD.W,
      y: edge === 2 ? -100 - r() * 200 : edge === 3 ? MAPD.H + 100 + r() * 200 : r() * MAPD.H,
      r: 44 + r() * 26,
    };
    if (edge > 1 && (t.x > MAPD.W || t.x < 0)) continue;
    buildTree(group, t, mats, r);
  }
  // bushes
  for (const bu of MAPD.bushes) {
    const leaf = leafMat(r, 1);
    const n = 1 + (r() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(lobeGeo(r()), leaf);
      const s = bu.r * (0.7 + r() * 0.4);
      m.scale.set(s, s * 0.7, s);
      m.position.set(bu.x + (r() - 0.5) * bu.r, s * 0.5, bu.y + (r() - 0.5) * bu.r);
      m.castShadow = m.receiveShadow = true;
      W.group.add(m);
    }
    aoBlob(group, bu.x, bu.y, bu.r * 1.2, bu.r, 0.35);
  }
  // grass tufts — 3D tooth on the painted ground
  const tuftTex = tex(tuftCanvas(18));
  const tuftGeo = new THREE.PlaneGeometry(17, 12);
  tuftGeo.translate(0, 6, 0);
  {  // light billboards like the ground they grow from
    const nrm = tuftGeo.getAttribute('normal');
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  }
  const nearRoad = (tx, ty) => {
    for (const rd of MAPD.roads) {
      for (let i = 0; i < rd.pts.length; i += 3) {
        const p = rd.pts[i];
        if ((p.x - tx) * (p.x - tx) + (p.y - ty) * (p.y - ty) < (rd.w / 2 + 24) ** 2) return true;
      }
    }
    return false;
  };
  const inRect = (tx, ty, rc, pad) => tx > rc.x - pad && tx < rc.x + rc.w + pad && ty > rc.y - pad && ty < rc.y + rc.h + pad;
  for (let i = 0; i < 240; i++) {
    const tx = 40 + r() * (MAPD.W - 80), ty = 40 + r() * (MAPD.H - 80);
    if (nearRoad(tx, ty)) continue;
    if (MAPD.yards.some(yd => inRect(tx, ty, yd, 16))) continue;
    if (MAPD.fields.some(f => inRect(tx, ty, f, 16))) continue;
    if (MAPD.bldgs.some(b => tx > b.x - 8 && tx < b.x + b.w + 8 && ty > b.y - 8 && ty < b.y + b.d + 8)) continue;
    if (MAPD.dirt.some(d => (d.x - tx) ** 2 + (d.y - ty) ** 2 < (d.r * 0.72) ** 2)) continue;
    const t = new THREE.Group();
    t.position.set(tx, 0, ty);
    t.rotation.y = r() * Math.PI;
    const sc = 0.7 + r() * 0.9;
    t.scale.set(sc, sc, sc);
    for (const ry of [0, Math.PI / 2 + (r() - 0.5) * 0.5]) {
      // unlit: vertical billboards go black under a top sun otherwise
      const m = new THREE.Mesh(tuftGeo, new THREE.MeshBasicMaterial({
        map: tuftTex, alphaTest: 0.5, side: THREE.DoubleSide,
        color: new THREE.Color(0.62 + r() * 0.25, 0.66 + r() * 0.25, 0.5),
      }));
      m.rotation.y = ry;
      t.add(m);
    }
    group.add(t);
  }
  // scattered rocks
  const rockMat = paintedMat(stoneWallCanvas(21), { bump: 3 });
  for (let i = 0; i < 26; i++) {
    const rx = r() * MAPD.W, ry = r() * MAPD.H, rs = 5 + r() * 9;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(rs, 0), rockMat);
    rock.position.set(rx, rs * 0.3, ry);
    rock.rotation.set(r() * 3, r() * 3, r() * 3);
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
  }
}
