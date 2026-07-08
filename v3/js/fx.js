// fx.js — everything dynamic in the scene that isn't the world itself:
// actor meshes, LOS-clipped view cones, tracers, muzzle light, sparks,
// blood decals (painted permanently into the ground canvas), objective
// crates, the extraction ring and floating loot texts.
import * as THREE from 'three';
import { G } from './state.js';
import { MAPD, rayHit } from './map.js';
import { W } from './world.js';
import { buildActor, armActor, poseActor } from './actors.js';
import { hooks } from './sim.js';
import { hrng } from './util.js';

const RAYS = 15, HALF = 0.82;

const FXS = {
  scene: null,
  player: null, playerKind: '',
  guards: new Map(),     // guard → mesh
  cones: new Map(),      // guard → { mesh, pos }
  bullets: [],
  sparks: [],
  muzzle: null,
  ring: null,
  crates: [],
  floatEls: new Map(),   // text obj → div
  hud: null,
};

function coneFor(g) {
  let c = FXS.cones.get(g);
  if (c) return c;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((RAYS + 1) * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < RAYS - 1; i++) idx.push(0, i + 1, i + 2);
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: '#3fae36', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  FXS.scene.add(mesh);
  c = { mesh, pos };
  FXS.cones.set(g, c);
  return c;
}

function starTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.4, 'rgba(255,180,80,0.6)'); g.addColorStop(1, 'rgba(255,150,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export function initFX(scene) {
  FXS.scene = scene;
  FXS.hud = document.getElementById('hud');

  // permanent blood decals go straight into the baked ground
  hooks.bloodStain = (bx, by, big) => {
    const x = W.groundCtx, r = hrng((bx * 31 + by) | 0);
    if (!x) return;
    const n = big ? 13 : 7;
    for (let i = 0; i < n; i++) {
      x.fillStyle = ['#5a1512', '#481010', '#66201a'][(r() * 3) | 0];
      x.globalAlpha = 0.5 + r() * 0.3;
      const a = r() * 6.3, d = r() * (big ? 26 : 15);
      x.beginPath();
      x.ellipse(bx + Math.cos(a) * d, by + Math.sin(a) * d, 2.5 + r() * (big ? 11 : 6), 2 + r() * (big ? 8 : 5), r() * 3, 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
    W.groundTex.needsUpdate = true;
  };

  // muzzle flash light (one, reused)
  FXS.muzzle = new THREE.PointLight('#ffbe6e', 0, 210, 1.7);
  FXS.muzzle.position.set(0, -100, 0);
  scene.add(FXS.muzzle);

  // spark sprites
  const stx = starTexture();
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stx, transparent: true, depthWrite: false }));
    s.scale.set(16, 16, 1); s.visible = false;
    scene.add(s); FXS.sparks.push(s);
  }

  // extraction ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(MAPD.extract.r - 5, MAPD.extract.r, 48),
    new THREE.MeshBasicMaterial({ color: '#5ad06e', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(MAPD.extract.x, 1.1, MAPD.extract.y);
  ring.renderOrder = 3;
  scene.add(ring);
  FXS.ring = ring;

  // objective crates (visuals for MAPD.crates — SOLIDS already registered)
  FXS.crates = MAPD.crates.map((cr, i) => {
    const g = new THREE.Group();
    g.position.set(cr.x, 0, cr.y);
    g.rotation.y = (i * 0.9) % 1.2 - 0.4;
    const bx = new THREE.Mesh(new THREE.BoxGeometry(30, 22, 30), W.mats.crate);
    bx.castShadow = bx.receiveShadow = true; bx.position.y = 11; g.add(bx);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(32, 3.5, 32), W.mats.plank);
    lid.castShadow = true; lid.position.y = 23.5; g.add(lid);
    for (const e of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(32.5, 22.5, 3),
        new THREE.MeshStandardMaterial({ color: '#3c4038', roughness: 0.5, metalness: 0.5 }));
      strap.position.set(0, 11, e * 9); g.add(strap);
    }
    const mark = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6),
      new THREE.MeshStandardMaterial({ color: '#ffe84a', emissive: '#c8a800', emissiveIntensity: 1.4 }));
    mark.position.y = 32; g.add(mark);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(24, 27, 36),
      new THREE.MeshBasicMaterial({ color: '#f2d233', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2; halo.position.y = 1.2; halo.renderOrder = 3;
    g.add(halo);
    FXS.scene.add(g);
    return { g, mark, halo, lid };
  });
}

export function updateFX(dt, project) {
  const t = G.t;

  // ---- player ----
  const kind = (G.rec && G.rec.gender === 'f') ? 'vf' : 'vm';
  const pk = kind + ':' + (G.p ? G.p.gun : '');
  if (!FXS.player || FXS.playerKind !== pk) {
    if (FXS.player) FXS.scene.remove(FXS.player);
    FXS.player = armActor(buildActor(kind), G.p ? G.p.gun : 'pistol');
    FXS.playerKind = pk;
    FXS.scene.add(FXS.player);
  }
  if (G.p) poseActor(FXS.player, G.p, {
    aim: G.p.aim, sneak: G.p.sneak, ready: true,
    aiming: G.mouse.down || G.p.cd > 0 || G.p.reload > 0,
    dead: G.done === 'dead',
  });

  // ---- guards + cones ----
  const seen = new Set();
  for (const g of G.guards) {
    seen.add(g);
    let m = FXS.guards.get(g);
    if (!m) { m = armActor(buildActor(g.heavy ? 'heavy' : 'guard'), g.gun); FXS.scene.add(m); FXS.guards.set(g, m); }
    poseActor(m, g, { aiming: g.alert, ready: g.sus > 0.25, dead: g.dead });

    const c = coneFor(g);
    const show = !g.dead && (!!(G.rec && G.rec.kiroshi) || g.alert || g.sus >= 0.1);
    c.mesh.visible = show;
    if (show) {
      const R = g.vr * 0.62;
      c.pos[0] = g.x; c.pos[1] = 1.6; c.pos[2] = g.y;
      for (let i = 0; i < RAYS; i++) {
        const ang = g.dir + (i / (RAYS - 1) - 0.5) * 2 * HALF;
        const rr = rayHit(g.x, g.y, ang, R);
        c.pos[(i + 1) * 3] = g.x + Math.cos(ang) * rr;
        c.pos[(i + 1) * 3 + 1] = 1.6;
        c.pos[(i + 1) * 3 + 2] = g.y + Math.sin(ang) * rr;
      }
      c.mesh.geometry.attributes.position.needsUpdate = true;
      c.mesh.material.color.set(g.alert ? '#e03828' : g.sus >= 0.1 ? '#e09018' : '#3fae36');
      c.mesh.material.opacity = 0.26 + 0.1 * Math.sin(t * (g.alert ? 9 : 3));
    }
  }
  for (const [g, m] of FXS.guards) {
    if (!seen.has(g)) {
      FXS.scene.remove(m); FXS.guards.delete(g);
      const c = FXS.cones.get(g);
      if (c) { FXS.scene.remove(c.mesh); FXS.cones.delete(g); }
    }
  }

  // ---- bullets ----
  while (FXS.bullets.length < G.bullets.length) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(13, 1.5, 1.5),
      new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
    b.visible = false; FXS.scene.add(b); FXS.bullets.push(b);
  }
  for (let i = 0; i < FXS.bullets.length; i++) {
    const m = FXS.bullets[i], b = G.bullets[i];
    if (b) { m.visible = true; m.position.set(b.x, 30, b.y); m.rotation.y = -b.a; }
    else m.visible = false;
  }

  // ---- transient fx events ----
  let mz = null, si = 0;
  for (const f of G.fx) {
    if (f.kind === 'muzzle') mz = f;
    if (f.kind === 'spark' && si < FXS.sparks.length) {
      const s = FXS.sparks[si++];
      s.visible = true;
      s.position.set(f.x, 28, f.y);
      s.material.opacity = f.t / 0.15;
    }
  }
  for (; si < FXS.sparks.length; si++) FXS.sparks[si].visible = false;
  if (mz) {
    FXS.muzzle.position.set(mz.x, 32, mz.y);
    FXS.muzzle.intensity = 900 * (mz.t / 0.06);
  } else FXS.muzzle.intensity = 0;

  // ---- extraction ring ----
  if (FXS.ring) {
    const open = G.extractOpen && !G.done;
    FXS.ring.material.color.set(open ? '#5ad06e' : '#cfd8c8');
    FXS.ring.material.opacity = open ? 0.4 + 0.25 * Math.sin(t * 4) : 0.12;
    FXS.ring.scale.setScalar(open ? 1 + 0.06 * Math.sin(t * 4) : 1);
  }

  // ---- objective crates ----
  for (let i = 0; i < FXS.crates.length; i++) {
    const vis = FXS.crates[i], cr = G.crates[i];
    if (!cr) continue;
    vis.mark.visible = !cr.looted;
    vis.halo.visible = !cr.looted;
    if (!cr.looted) {
      vis.mark.position.y = 32 + Math.sin(t * 3 + i) * 2;
      vis.mark.rotation.y = t * 1.6;
      vis.halo.material.opacity = 0.24 + 0.16 * Math.sin(t * 3 + i);
      vis.halo.scale.setScalar(1 + (cr.prog || 0) * 0.2);
    } else if (vis.lid.rotation.z < 0.8) {
      vis.lid.rotation.z += dt * 3;
      vis.lid.position.y = 23.5 + vis.lid.rotation.z * 6;
      vis.lid.position.x = -vis.lid.rotation.z * 10;
    }
  }

  // ---- floating texts (DOM) ----
  if (FXS.hud && project) {
    const live = new Set();
    for (const tx of G.texts) {
      live.add(tx);
      let el = FXS.floatEls.get(tx);
      if (!el) {
        el = document.createElement('div');
        el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:bold 16px "Bahnschrift","Segoe UI",sans-serif;'
          + 'text-shadow:0 1px 3px rgba(0,0,0,0.9);pointer-events:none;white-space:nowrap;';
        el.textContent = tx.s;
        el.style.color = tx.col || '#ffe84a';
        FXS.hud.appendChild(el);
        FXS.floatEls.set(tx, el);
      }
      const pt = project(tx.x, 30 + (1.2 - tx.t) * 34, tx.y);
      el.style.left = pt.x + 'px';
      el.style.top = pt.y + 'px';
      el.style.opacity = Math.min(1, tx.t * 2.2);
    }
    for (const [tx, el] of FXS.floatEls) {
      if (!live.has(tx)) { el.remove(); FXS.floatEls.delete(tx); }
    }
  }
}
