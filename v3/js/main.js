// main.js — engine core: renderer, Commandos camera rig, sunlight, loop, input.
import * as THREE from 'three';
import { G } from './state.js';
import { clamp } from './util.js';
import { buildMap, MAPD } from './map.js';
import { buildWorld } from './world.js';
import { loadRecord } from './record.js';
import { resetMission, simStep } from './sim.js';
import { initFX, updateFX } from './fx.js';
import { initHUD, refreshBriefing, updateHUD } from './hud.js';

export const E = {
  renderer: null, scene: null, camera: null, sun: null, hemi: null,
  SW: 0, SH: 0,
  ZOOM: 1.15,                    // screen px per world unit (Commandos-close)
  PITCH: 52 * Math.PI / 180,     // camera elevation
  YAW: Math.PI / 4,              // 45° plan rotation
};

const VIEW = new THREE.Vector3(); // camera offset dir, derived from YAW/PITCH
function viewDir() {
  return VIEW.set(
    Math.sin(E.YAW) * Math.cos(E.PITCH),
    Math.sin(E.PITCH),
    Math.cos(E.YAW) * Math.cos(E.PITCH),
  );
}

// sun offset from the camera target — from the ESE so the two camera-facing
// faces catch light while shadows still fall screen down-left
const SUN_OFF = new THREE.Vector3(640, 1150, -680);

export function fit() {
  E.SW = window.innerWidth; E.SH = window.innerHeight;
  E.renderer.setSize(E.SW, E.SH, false);
  E.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const c = E.camera;
  c.left = -E.SW / 2 / E.ZOOM; c.right = E.SW / 2 / E.ZOOM;
  c.top = E.SH / 2 / E.ZOOM; c.bottom = -E.SH / 2 / E.ZOOM;
  c.updateProjectionMatrix();
}

// plan (x,y) ⇄ world (X,0,Z); the sim lives entirely in plan space
export function planToWorld(x, y, z = 0) { return new THREE.Vector3(x, z, y); }

const RAY = new THREE.Raycaster();
const NDC = new THREE.Vector2();
export function screenToPlan(sx, sy) {
  NDC.set((sx / E.SW) * 2 - 1, -(sy / E.SH) * 2 + 1);
  RAY.setFromCamera(NDC, E.camera);
  const o = RAY.ray.origin, d = RAY.ray.direction;
  const t = -o.y / d.y;
  return { x: o.x + d.x * t, y: o.z + d.z * t };
}

export function placeCamera() {
  const target = new THREE.Vector3(G.cam.x, 0, G.cam.y);
  E.camera.position.copy(target).addScaledVector(viewDir(), 2400);
  E.camera.lookAt(target);
  // sun follows the target so the high-res shadow box stays tight on screen;
  // snap to shadow-texel grid to stop edge shimmer while scrolling
  const tex = (E.sun.shadow.camera.right - E.sun.shadow.camera.left) / E.sun.shadow.mapSize.width;
  const sx = Math.round(target.x / tex) * tex, sz = Math.round(target.z / tex) * tex;
  E.sun.position.set(sx + SUN_OFF.x, SUN_OFF.y, sz + SUN_OFF.z);
  E.sun.target.position.set(sx, 0, sz);
  E.sun.target.updateMatrixWorld();
}

function boot() {
  const cv = document.getElementById('cv');
  E.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  E.renderer.shadowMap.enabled = true;
  E.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  E.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  E.renderer.toneMappingExposure = 1.22;
  E.renderer.outputColorSpace = THREE.SRGBColorSpace;

  E.scene = new THREE.Scene();
  E.scene.background = new THREE.Color('#232a1c');

  E.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 6000);

  E.sun = new THREE.DirectionalLight('#ffe2b8', 2.9);
  E.sun.castShadow = true;
  E.sun.shadow.mapSize.set(4096, 4096);
  const sc = E.sun.shadow.camera;
  sc.left = -820; sc.right = 820; sc.top = 820; sc.bottom = -820;
  sc.near = 100; sc.far = 4000;
  E.sun.shadow.bias = -0.0004;
  E.sun.shadow.normalBias = 2.5;
  E.scene.add(E.sun); E.scene.add(E.sun.target);

  E.hemi = new THREE.HemisphereLight('#cfe0ff', '#9a927a', 0.78);
  E.scene.add(E.hemi);

  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('keydown', e => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!e.repeat) { G.keys.add(e.code); G.pressed.add(e.code); }
  });
  window.addEventListener('keyup', e => G.keys.delete(e.code));
  cv.addEventListener('mousemove', e => { G.mouse.x = e.clientX; G.mouse.y = e.clientY; });
  cv.addEventListener('mousedown', e => { G.mouse.down = true; G.mouse.click = true; e.preventDefault(); });
  window.addEventListener('mouseup', () => { G.mouse.down = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // demo record for headless screenshots — never clobbers a real save
  if (/rec=demo/.test(location.search || '') && !localStorage.getItem('ncpx2077_v1')) {
    localStorage.setItem('ncpx2077_v1', JSON.stringify({
      v: 1, gender: 'f', eddies: 184500, lvl: 25, weapons: new Array(31).fill('w'),
      cars: ['a', 'b'], cyber: { kiroshi: 2 }, stats: { kills: 500 },
    }));
  }
  loadRecord();
  buildMap();
  buildWorld(E.scene);
  initFX(E.scene);
  resetMission();
  initHUD();
  refreshBriefing();

  // debug spots shared with the old build: ?play skips briefing, ?at= teleports
  const q = location.search || '';
  if (/play/.test(q)) G.mode = 'play';
  const spots = { depot: [1035, 880], gate: [1035, 1160], checkpoint: [1310, 1330], farm: [1745, 1700], insert: [330, 2050] };
  const at = q.match(/at=(\w+)/);
  if (at && spots[at[1]]) { G.p.x = spots[at[1]][0]; G.p.y = spots[at[1]][1]; }
  G.cam.x = G.p.x; G.cam.y = G.p.y;
  const zq = q.match(/zoom=([\d.]+)/); if (zq) { E.ZOOM = parseFloat(zq[1]); fit(); }

  let last = performance.now();
  const loop = now => {
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    try { tick(dt); } catch (err) {
      console.error(err);
      let e = document.getElementById('nc-err');
      if (!e) {
        e = document.createElement('div');
        e.id = 'nc-err';
        e.style.cssText = 'position:fixed;left:0;right:0;top:40%;padding:10px;background:rgba(40,0,0,.85);'
          + 'font:13px monospace;color:#faa;text-align:center;z-index:9;';
        document.body.appendChild(e);
      }
      e.textContent = 'SCRIPT ERROR — F12: ' + String(err && err.message || err).slice(0, 160);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const PRJ = new THREE.Vector3();
export function project(x, h, y) {   // plan point (+height) → css px
  PRJ.set(x, h, y).project(E.camera);
  return { x: (PRJ.x * 0.5 + 0.5) * E.SW, y: (-PRJ.y * 0.5 + 0.5) * E.SH, on: PRJ.z < 1 };
}

function tick(dt) {
  G.t += dt; G.frame++;
  const w = screenToPlan(G.mouse.x, G.mouse.y);
  G.mouse.wx = w.x; G.mouse.wy = w.y;
  if (G.mode === 'play') simStep(dt);
  updateFX(dt, project);
  updateHUD(dt, project);
  placeCamera();
  E.renderer.render(E.scene, E.camera);
  G.pressed.clear(); G.mouse.click = false;
}

window.addEventListener('load', boot);
window.NC = { G, E, get MAPD() { return MAPD; } };   // console/debug handle
