// actors.js — low-poly articulated humanoids (V, guards, heavies) with a
// procedural walk. At the Commandos camera (~50px tall) silhouette + motion
// carry everything, so joints are simple boxes with careful proportions.
import * as THREE from 'three';
import { G } from './state.js';
import { lerp } from './util.js';

const yaw = a => -a;

function flat(c, rough = 0.85) {
  return new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });
}
function part(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const PAL = {
  guard: { coat: '#5a614b', pants: '#484d3a', hat: '#3e4433', skin: '#c39a76', boot: '#2c2820', gun: '#2f3232' },
  heavy: { coat: '#46525e', pants: '#39424c', hat: '#2f3942', skin: '#b98f6d', boot: '#23211c', gun: '#26282a' },
  vm: { coat: '#3a3f53', pants: '#2c2f39', hat: '#231710', skin: '#c99f7c', boot: '#26232c', gun: '#33363a' },
  vf: { coat: '#41314a', pants: '#2c2f39', hat: '#2a180f', skin: '#cfa483', boot: '#26232c', gun: '#33363a' },
};

export function buildActor(kind) {
  const c = PAL[kind] || PAL.guard;
  const root = new THREE.Group();
  const parts = {};

  const coat = flat(c.coat), pants = flat(c.pants), skin = flat(c.skin), boot = flat(c.boot);

  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0, 30, side * 3.6);
    const th = part(6, 16, 7, pants); th.position.y = -8; leg.add(th);
    const sh = part(5.2, 12, 6, pants); sh.position.y = -20; leg.add(sh);
    const ft = part(9, 3.4, 6.4, boot); ft.position.set(1.8, -27.2, 0); leg.add(ft);
    root.add(leg);
    parts[side < 0 ? 'legL' : 'legR'] = leg;
  }
  const pelvis = part(11, 6, 12.5, pants); pelvis.position.y = 31; root.add(pelvis);
  const belt = part(11.6, 2.2, 13); belt.material = flat('#241f18'); belt.position.y = 33.4; root.add(belt);

  const torsoG = new THREE.Group(); torsoG.position.y = 34;
  const torso = part(12.5, 16.5, 14.5, coat); torso.position.y = 8; torsoG.add(torso);
  const chest = part(13.2, 6.5, 15.2, coat); chest.position.y = 12.8; torsoG.add(chest);
  if (kind === 'vm' || kind === 'vf') {
    const stripe = part(13.6, 2.4, 15.6, flat('#8c2433')); stripe.position.y = 10.4; torsoG.add(stripe);
  }
  root.add(torsoG);
  parts.torso = torsoG;

  const headG = new THREE.Group(); headG.position.y = 52.5;
  const head = part(8.4, 9, 8.8, skin); head.position.y = 4.5; headG.add(head);
  if (kind === 'guard' || kind === 'heavy') {
    const cap = part(9.4, 3, 9.8, flat(c.hat)); cap.position.y = 10; headG.add(cap);
    if (kind === 'heavy') { const rim = part(11, 1.6, 11.4, flat(c.hat)); rim.position.y = 8.6; headG.add(rim); }
    else { const peak = part(4.4, 1.2, 8.6, flat(c.hat)); peak.position.set(6, 8.7, 0); headG.add(peak); }
  } else {
    const hair = part(9, 3.2, 9.4, flat(c.hat)); hair.position.y = 9.9; headG.add(hair);
    if (kind === 'vf') { const tail = part(3.4, 12, 5, flat(c.hat)); tail.position.set(-5.6, 3, 0); headG.add(tail); }
  }
  root.add(headG);
  parts.head = headG;

  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0, 49, side * 7.8);
    const up = part(4.6, 13, 5.4, coat); up.position.y = -6.5; arm.add(up);
    const lo = part(4.2, 11, 4.8, coat); lo.position.y = -17.5; arm.add(lo);
    const hand = part(3.6, 3.4, 3.8, skin); hand.position.y = -24.4; arm.add(hand);
    root.add(arm);
    parts[side < 0 ? 'armL' : 'armR'] = arm;
  }

  root.userData.parts = parts;
  root.userData.kind = kind;
  return root;
}

// weapon variants (attached later so each actor can carry its own iron)
export function armActor(root, gunKind) {
  const c = PAL[root.userData.kind] || PAL.guard;
  const gunG = new THREE.Group();
  const gmat = flat(c.gun, 0.5); gmat.metalness = 0.45;
  if (gunKind === 'rifle') {
    const barrel = part(26, 2.4, 2, gmat); barrel.position.x = 8; gunG.add(barrel);
    const stock = part(7.5, 3.4, 2.6, flat('#4a3620')); stock.position.x = -6; gunG.add(stock);
    const mag = part(2.4, 5, 2.2, gmat); mag.position.set(4, -3, 0); gunG.add(mag);
  } else {
    const barrel = part(9, 2.6, 2.2, gmat); barrel.position.x = 4; gunG.add(barrel);
    const grip = part(2.4, 4.6, 2.4, flat('#4a3620')); grip.position.set(0, -3, 0); gunG.add(grip);
  }
  gunG.position.set(9, 38, 3.2);
  root.add(gunG);
  root.userData.parts.gun = gunG;
  root.userData.gunKind = gunKind;
  return root;
}

// per-frame pose from sim state
export function poseActor(root, a, opts = {}) {
  const P = root.userData.parts;
  const dir = opts.aim != null ? opts.aim : a.dir;

  if (a.dead || opts.dead) {   // face-up on the ground
    root.position.set(a.x, 1.6, a.y);
    root.rotation.set(0, yaw(opts.bodyA != null ? opts.bodyA : dir), 0);
    root.rotation.x = -Math.PI / 2 + 0.06;
    return;
  }

  root.position.set(a.x, opts.sneak ? -2.6 : 0, a.y);
  root.rotation.set(0, yaw(dir), 0);

  const ph = (a.anim || 0) * 6;
  const swing = a.moving ? Math.sin(ph) : 0;
  const k = a.moving ? 1 : 0;
  P.legL.rotation.z = lerp(P.legL.rotation.z, -swing * 0.62 * k, 0.5);
  P.legR.rotation.z = lerp(P.legR.rotation.z, swing * 0.62 * k, 0.5);
  root.position.y += a.moving ? Math.abs(Math.cos(ph)) * 1.3 : 0;

  // three carry states: relaxed swing → low-ready → full aim
  const aiming = !!opts.aiming, ready = !!opts.ready;
  const armF = aiming ? 1.3 : ready ? 0.62 : 0;
  P.armL.rotation.z = lerp(P.armL.rotation.z, armF + (aiming || ready ? 0 : swing * 0.5 * k), 0.4);
  P.armR.rotation.z = lerp(P.armR.rotation.z, armF * 0.92 + (aiming || ready ? 0 : -swing * 0.5 * k), 0.4);
  P.armL.rotation.y = lerp(P.armL.rotation.y, aiming ? -0.5 : ready ? -0.34 : 0, 0.4);
  P.armR.rotation.y = lerp(P.armR.rotation.y, aiming ? 0.14 : ready ? 0.1 : 0, 0.4);

  if (P.gun) {
    P.gun.rotation.z = lerp(P.gun.rotation.z, aiming ? 0 : -0.28, 0.4);
    P.gun.rotation.y = lerp(P.gun.rotation.y, aiming ? 0 : ready ? 0.5 : 0.72, 0.4);
    P.gun.position.y = lerp(P.gun.position.y, aiming ? 42.5 : 37, 0.4);
  }

  P.torso.rotation.z = lerp(P.torso.rotation.z, opts.sneak ? 0.34 : 0, 0.35);
  P.head.rotation.z = lerp(P.head.rotation.z, opts.sneak ? -0.2 : 0, 0.35);
}
