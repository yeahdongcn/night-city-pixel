// sim.js — the stealth game: patrols, vision, alarm, iron. PURE plan-space
// logic (no THREE, no DOM) — ported from the proven previous build; the node
// smoke test drives a whole mission through this module.
import { G } from './state.js';
import { MAPD, slideMove, losClear, shotClear } from './map.js';
import { clamp, lerp, dist, angTo, angDiff } from './util.js';

export const WALK = 132, SNEAK = 62, GRAD = 13, PRAD = 11;

// renderer-side effects the sim triggers (left null headless)
export const hooks = { bloodStain: null };

// tiny synth cues (zero-dep)
const SND = { ctx: null };
export function beep(f0, f1, dur, type, vol) {
  try {
    if (typeof window === 'undefined') return;
    if (!SND.ctx) SND.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const a = SND.ctx, o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}

export function resetMission() {
  const rec = G.rec;
  G.p = {
    x: MAPD.pstart.x, y: MAPD.pstart.y,
    hp: 100 + (rec ? Math.min(60, rec.lvl * 2) : 0), maxhp: 100 + (rec ? Math.min(60, rec.lvl * 2) : 0),
    aim: -1.2, anim: 0, moving: false, sneak: false,
    ammo: 12, clip: 12, reload: 0, cd: 0, gun: (rec && rec.weapons > 14) ? 'rifle' : 'pistol',
    dmg: 30 + (rec ? Math.min(24, rec.weapons) : 0),
  };
  G.guards = MAPD.patrols.map((pt, i) => ({
    id: i, x: pt.pts[0].x, y: pt.pts[0].y, wp: 1 % pt.pts.length, pts: pt.pts, idleMax: pt.idle,
    idle: Math.random() * pt.idle, dir: 0, anim: 0, moving: false,
    sus: 0, alert: false, lastX: 0, lastY: 0, lostT: 0, cd: 0, hp: 42, gun: pt.gun, vr: 300, dead: false, heavy: false,
  }));
  G.bullets = []; G.fx = []; G.texts = []; G.bodies = [];
  G.crates = MAPD.crates.map(cr => ({ x: cr.x, y: cr.y, loot: cr.loot, looted: false, prog: 0 }));
  G.looted = 0; G.lootEddies = 0; G.kills = 0;
  G.alarm = 0; G.alarmed = false; G.reinforced = false;
  G.extractOpen = false; G.done = null; G.debriefSaved = false;
  G.cam.x = G.p.x; G.cam.y = G.p.y;
  note('CRACK THE 3 CARGO CRATES IN THE DEPOT', 6);
}

export function note(s, t) { G.note = s; G.noteT = t || 4; }
function addText(x, y, s, col) { G.texts.push({ x, y, s, col, t: 1.2 }); }
function bloodStain(x, y, big) { if (hooks.bloodStain) hooks.bloodStain(x, y, big); }

export function simStep(dt) {
  const p = G.p;

  // ---- player move (screen-relative WASD) ----
  let sx = (G.keys.has('KeyD') ? 1 : 0) - (G.keys.has('KeyA') ? 1 : 0);
  let sy = (G.keys.has('KeyS') ? 1 : 0) - (G.keys.has('KeyW') ? 1 : 0);
  p.sneak = G.keys.has('ShiftLeft') || G.keys.has('ShiftRight');
  const mlen = Math.hypot(sx, sy);
  p.moving = mlen > 0;
  const R2 = Math.SQRT1_2;
  if (p.moving) {
    sx /= mlen; sy /= mlen;
    const dxp = (sx + sy) * R2, dyp = (sy - sx) * R2;             // screen dir → plan dir
    const sp = (p.sneak ? SNEAK : WALK) * dt;
    slideMove(p, dxp * sp, dyp * sp, PRAD);
    p.anim += dt * (p.sneak ? 0.8 : 1.4) * 4;
  }

  // aim at the cursor (main.js keeps mouse.wx/wy = plan ground point)
  p.aim = angTo(p.x, p.y, G.mouse.wx, G.mouse.wy);

  // ---- fire ----
  p.cd -= dt;
  if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.ammo = p.clip; note('LOADED', 1); } }
  if (G.mouse.down && p.cd <= 0 && p.reload <= 0 && !G.done) {
    if (p.ammo <= 0) { p.reload = 1.3; beep(220, 90, 0.18, 'sawtooth', 0.05); }
    else {
      p.ammo--; p.cd = p.gun === 'rifle' ? 0.14 : 0.30;
      const a = p.aim + (Math.random() - 0.5) * 0.05;
      G.bullets.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, a, v: 900, from: 'p', life: 0.7 });
      G.fx.push({ kind: 'muzzle', x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, t: 0.06 });
      G.shake = 3;
      beep(950, 160, 0.09, 'square', 0.07);
      for (const g of G.guards) if (!g.dead && dist(p.x, p.y, g.x, g.y) < 460) { g.sus = 1; alertGuard(g); }
    }
  }
  if (G.pressed.has('KeyR') && p.reload <= 0 && p.ammo < p.clip) p.reload = 1.3;

  // ---- interactions: takedown / loot ----
  if (G.pressed.has('KeyE') && !G.done) {
    let tg = null;
    for (const g of G.guards) if (!g.dead && dist(p.x, p.y, g.x, g.y) < 40) { tg = g; break; }
    if (tg && tg.sus < 0.7 && !tg.alert && Math.abs(angDiff(tg.dir, angTo(tg.x, tg.y, p.x, p.y))) > 1.85) {
      killGuard(tg, true);
      note('SILENT TAKEDOWN', 2.5);
      beep(160, 60, 0.22, 'sawtooth', 0.09);
    }
  }
  let nearCrate = null;
  for (const cr of G.crates) if (!cr.looted && dist(p.x, p.y, cr.x, cr.y) < 48) { nearCrate = cr; break; }
  G.nearCrate = nearCrate;
  if (nearCrate && G.keys.has('KeyE') && !G.done) {
    nearCrate.prog += dt;
    if (nearCrate.prog >= 1) {
      nearCrate.looted = true; G.looted++; G.lootEddies += nearCrate.loot;
      addText(nearCrate.x, nearCrate.y, '+€$' + nearCrate.loot, '#f9f002');
      beep(660, 1320, 0.16, 'triangle', 0.09);
      if (G.looted >= G.crates.length) { G.extractOpen = true; note('CARGO SECURED — REACH THE EXTRACTION POINT', 6); beep(520, 1040, 0.3, 'triangle', 0.09); }
      else note('CRATE CRACKED (' + G.looted + '/' + G.crates.length + ')', 3);
    }
  } else if (nearCrate) nearCrate.prog = 0;

  // extraction
  if (G.extractOpen && !G.done && dist(p.x, p.y, MAPD.extract.x, MAPD.extract.y) < MAPD.extract.r) {
    G.done = 'out'; G.mode = 'debrief';
  }

  // ---- guards ----
  for (const g of G.guards) if (!g.dead) guardStep(g, dt);
  if (G.alarmed && !G.reinforced) { G.reinforced = true; spawnReinforcements(); }
  G.alarm = Math.max(0, G.alarm - dt * 0.05);

  // ---- bullets ----
  for (const b of G.bullets) {
    b.life -= dt;
    const nx = b.x + Math.cos(b.a) * b.v * dt, ny = b.y + Math.sin(b.a) * b.v * dt;
    if (!shotClear(b.x, b.y, nx, ny)) { b.life = 0; G.fx.push({ kind: 'spark', x: nx, y: ny, t: 0.15 }); }
    else {
      if (b.from === 'p') {
        for (const g of G.guards) {
          if (g.dead) continue;
          if (dist(nx, ny, g.x, g.y) < GRAD + 3) {
            b.life = 0; g.hp -= p.dmg;
            G.fx.push({ kind: 'blood', x: g.x, y: g.y, t: 0.2 });
            if (g.hp <= 0) killGuard(g, false); else { g.sus = 1; alertGuard(g); }
            break;
          }
        }
      } else if (!G.done && dist(nx, ny, p.x, p.y) < PRAD + 3) {
        b.life = 0; p.hp -= 9 + Math.random() * 5; G.shake = 5; G.fx.push({ kind: 'blood', x: p.x, y: p.y, t: 0.2 });
        if (p.hp <= 0) { G.done = 'dead'; G.mode = 'debrief'; bloodStain(p.x, p.y, true); }
      }
      b.x = nx; b.y = ny;
    }
  }
  G.bullets = G.bullets.filter(b => b.life > 0);
  for (const f of G.fx) f.t -= dt;
  G.fx = G.fx.filter(f => f.t > 0);
  for (const t of G.texts) t.t -= dt;
  G.texts = G.texts.filter(t => t.t > 0);

  // camera follows (plan coords; the renderer projects)
  G.cam.x = lerp(G.cam.x, p.x, Math.min(1, 5 * dt));
  G.cam.y = lerp(G.cam.y, p.y, Math.min(1, 5 * dt));
  if (G.shake > 0) { G.cam.x += (Math.random() - 0.5) * G.shake; G.cam.y += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt * 26); }
  G.noteT -= dt;
}

export function alertGuard(g) {
  if (!g.alert) { beep(340, 620, 0.2, 'square', 0.08); }
  g.alert = true; g.lostT = 0; g.lastX = G.p.x; g.lastY = G.p.y;
  G.alarm = Math.min(1, G.alarm + 0.5);
  if (!G.alarmed) {
    G.alarmed = G.guards.filter(x => !x.dead && x.alert).length >= 2 || G.alarm >= 1;
    if (G.alarmed) note('ALARM RAISED — REINFORCEMENTS INBOUND', 4);
  }
}
export function killGuard(g, silent) {
  g.dead = true; G.kills++;
  G.bodies.push({ x: g.x, y: g.y, a: Math.random() * 0.6 - 0.3 + Math.PI / 4, guard: true });
  bloodStain(g.x, g.y, !silent);
  if (!silent) for (const o of G.guards) if (!o.dead && dist(g.x, g.y, o.x, o.y) < 260 && losClear(o.x, o.y, g.x, g.y)) { o.sus = 1; alertGuard(o); }
}
function spawnReinforcements() {
  const spots = [{ x: 2320, y: 500 }, { x: 2280, y: 520 }, { x: 160, y: 2090 }, { x: 1035, y: 500 }];
  for (const s of spots) {
    G.guards.push({
      id: 90 + G.guards.length, x: s.x, y: s.y, wp: 0, pts: [s], idleMax: 1, idle: 0,
      dir: 0, anim: 0, moving: false,
      sus: 1, alert: true, lastX: G.p.x, lastY: G.p.y, lostT: 0, cd: 1, hp: 60, gun: 'rifle', vr: 340, dead: false, heavy: true,
    });
  }
}

function guardStep(g, dt) {
  const p = G.p;
  // ---- vision ----
  const d = dist(g.x, g.y, p.x, p.y);
  let sees = false;
  if (!G.done && d < g.vr) {
    const aTo = angTo(g.x, g.y, p.x, p.y);
    if (Math.abs(angDiff(g.dir, aTo)) < 0.82 && losClear(g.x, g.y, p.x, p.y)) sees = true;
  }
  if (sees) {
    const k = (p.sneak ? 0.55 : 1.15) * (1.35 - d / g.vr);
    g.sus += dt * k * 1.5;
    g.lastX = p.x; g.lastY = p.y;
    if (g.sus >= 1) alertGuard(g);
  } else g.sus = Math.max(g.alert ? 0.6 : 0, g.sus - dt * 0.25);
  g.sus = clamp(g.sus, 0, 1);

  if (g.alert) {
    // ---- combat ----
    if (sees) {
      g.lostT = 0;
      g.dir = angTo(g.x, g.y, p.x, p.y);
      g.moving = false;
      g.cd -= dt;
      if (g.cd <= 0 && d < 320) {
        g.cd = g.gun === 'rifle' ? 0.9 : 1.2;
        const a = g.dir + (Math.random() - 0.5) * 0.14;
        G.bullets.push({ x: g.x + Math.cos(a) * 16, y: g.y + Math.sin(a) * 16, a, v: 760, from: 'g', life: 0.8 });
        G.fx.push({ kind: 'muzzle', x: g.x + Math.cos(a) * 20, y: g.y + Math.sin(a) * 20, t: 0.06 });
        beep(700, 120, 0.08, 'square', 0.05);
      }
      if (d > 240) moveToward(g, p.x, p.y, 96 * dt);
    } else {
      g.lostT += dt;
      if (dist(g.x, g.y, g.lastX, g.lastY) > 24) { moveToward(g, g.lastX, g.lastY, 108 * dt); }
      else if (g.lostT > 5.5) { g.alert = false; g.sus = 0.4; }
      else { g.dir += dt * 1.6 * (g.id % 2 ? 1 : -1); g.moving = false; }   // scan around
    }
  } else {
    // ---- patrol ----
    const wp = g.pts[g.wp % g.pts.length];
    if (g.pts.length === 1 || dist(g.x, g.y, wp.x, wp.y) < 8) {
      g.idle -= dt; g.moving = false;
      if (g.pts.length > 1 && g.idle <= 0) { g.wp = (g.wp + 1) % g.pts.length; g.idle = g.idleMax; }
      if (g.pts.length === 1) g.dir += Math.sin(G.t * 0.6 + g.id) * dt * 0.7;   // sentries sweep their gaze
    } else moveToward(g, wp.x, wp.y, 66 * dt);
  }
  if (g.moving) g.anim += dt * 4;
}
function moveToward(g, x, y, step) {
  const a = angTo(g.x, g.y, x, y);
  g.dir = g.dir + angDiff(g.dir, a) * 0.2;
  g.moving = slideMove(g, Math.cos(a) * step, Math.sin(a) * step, GRAD);
  if (!g.moving) {   // hug around obstacles
    g.moving = slideMove(g, Math.cos(a + 0.9) * step, Math.sin(a + 0.9) * step, GRAD)
            || slideMove(g, Math.cos(a - 0.9) * step, Math.sin(a - 0.9) * step, GRAD);
  }
}
