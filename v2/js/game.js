'use strict';
// ============ NIGHT CITY: DIABLO EDITION — isometric ARPG core ============
let CV, C, G;
const SAVE_KEY = 'ncpx_iso_v1';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, f) { return a + (b - a) * f; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }
function pick(a) { return a[Math.random() * a.length | 0]; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function fmt(n) { n = Math.round(n); let s = '' + Math.abs(n), o = ''; while (s.length > 3) { o = ',' + s.slice(-3) + o; s = s.slice(0, -3); } return (n < 0 ? '-' : '') + s + o; }

function newGame() {
  return {
    state: 'play', ui: null, t: 0, frame: 0, timeScale: 1,
    keys: new Set(), pressed: new Set(),
    mouse: { sx: 320, sy: 180, wx: 0, wy: 0, down: false, click: false },
    cam: { x: 0, y: 0 },
    p: null, enemies: [], bullets: [], ebullets: [], loot: [], orbs: [], parts: [], texts: [], beams: [], aoes: [],
    eddies: 0, lvl: 1, xp: 0,
    backpack: [], equip: { WEAPON: null, ARMOR: null, IMPLANT: null },
    spawnT: 1, waveN: 0, msgs: [], banner: null,
    shake: 0, stats: { kills: 0, items: 0, elites: 0, playT: 0 },
    tips: [], hovItem: null,
  };
}

function makePlayer() {
  return {
    x: WORLD.spawn.x, y: WORLD.spawn.y, vx: 0, vy: 0, faceA: 0, moving: false, anim: 0,
    hp: 100, maxhp: 100, energy: 100, maxen: 100,
    fireCd: 0, reloadT: 0, mag: 0, dashT: 0, dashCd: 0, iframes: 0, regenT: 0,
    sandT: 0, hurtFx: 0,
    // derived (recalc): dmgMult, fireMult, crit, critDmg, armor, speedMult, xpMult, lifeOnKill, pickup
    dmgMult: 1, fireMult: 1, crit: 0.05, critDmg: 1.5, armor: 0, speedMult: 1, xpMult: 1, lifeOnKill: 0, pickup: 0,
    skillCd: { sandevistan: 0, overload: 0, grenade: 0 },
  };
}

// =================== items / affixes (ARPG core) ===================
function rollRarity(ilvl, floor) {
  const r = Math.random() + ilvl * 0.012;
  let rar = r > 1.18 ? 5 : r > 1.02 ? 4 : r > 0.86 ? 3 : r > 0.62 ? 2 : r > 0.34 ? 1 : 0;
  return Math.max(floor || 0, rar);
}
function rollItem(ilvl, rarFloor, slotForce) {
  const slot = slotForce || pick(SLOTS);
  const rar = rollRarity(ilvl, rarFloor);
  const base = slot === 'WEAPON' ? WEAPONS[clamp(irnd(0, Math.min(WEAPONS.length - 1, 2 + (ilvl / 3 | 0))), 0, WEAPONS.length - 1)] : null;
  const n = RAR_AFFIX[rar];
  const pool = AFFIXES.slice();
  const affixes = [];
  for (let i = 0; i < n && pool.length; i++) {
    const a = pool.splice(pool.length * Math.random() | 0, 1)[0];
    affixes.push({ k: a.k, v: rollAffixVal(a, ilvl) });
  }
  const it = { slot, base: base ? base.id : null, rar, ilvl, affixes };
  it.name = (base ? base.name : slot) ;
  it.score = itemScore(it);
  return it;
}
function itemScore(it) {
  let s = it.rar * 12;
  if (it.base) s += WPN[it.base].dmg * WPN[it.base].rof * 0.4;
  for (const a of it.affixes) s += a.v * (a.k === 'dmg' || a.k === 'crit' || a.k === 'critd' ? 1.4 : 1);
  return Math.round(s);
}
function itemLabel(it) { return RAR_NAME[it.rar] + ' ' + it.name; }

// =================== boot / input ===================
function boot() {
  CV = document.getElementById('cv'); C = CV.getContext('2d'); C.imageSmoothingEnabled = false;
  buildSprites();
  genWorld(1337);
  G = newGame();
  fit(); addEventListener('resize', fit);
  G.p = makePlayer();
  startRun();

  // debug/screenshot helpers
  const q = (window.location && window.location.search) || '';
  if (/demo/.test(q)) {
    G.lvl = 6; recalc(); G.p.hp = G.p.maxhp; G.eddies = 1240;
    for (let i = 0; i < 12; i++) { const o = findOpen(G.p.x, G.p.y, 2, 7); if (o) G.enemies.push(makeEnemy(pick(ENEMY_TIERS), o.x, o.y, i === 0)); }
    for (let i = 0; i < 5; i++) { const o = findOpen(G.p.x, G.p.y, 1.5, 6); if (o) dropItem(o.x, o.y, 8, i % 3); }
    G.mouse.sx = 420; G.mouse.sy = 150;
    for (let i = 0; i < 50; i++) step(1 / 60);
    G.banner = null;
    if (/char/.test(q)) { for (let i = 0; i < 6; i++) backpackPush(rollItem(8, i % 4)); G.ui = 'char'; G.mouse.sx = 380; G.mouse.sy = 70; }
  }
  step(1 / 60);

  addEventListener('keydown', e => {
    if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    G.keys.add(e.code); G.pressed.add(e.code);
    if (e.code === 'KeyM') { SFX.init(); SFX.toggleMute(); }
    if (e.code === 'Tab') { G.ui = G.ui === 'char' ? null : 'char'; SFX.ui && SFX.ui(); }
    if (e.code === 'Escape') G.ui = null;
  });
  addEventListener('keyup', e => G.keys.delete(e.code));
  CV.addEventListener('mousemove', e => { const r = CV.getBoundingClientRect(); G.mouse.sx = (e.clientX - r.left) * (VIEW_W / r.width); G.mouse.sy = (e.clientY - r.top) * (VIEW_H / r.height); });
  CV.addEventListener('mousedown', e => { SFX.init(); if (e.button === 0) { G.mouse.down = true; G.mouse.click = true; } e.preventDefault(); });
  addEventListener('mouseup', () => G.mouse.down = false);
  CV.addEventListener('contextmenu', e => e.preventDefault());

  let last = performance.now();
  const loop = now => { const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now; try { step(dt); } catch (err) { console.error(err); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
function fit() { const s = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H))); CV.style.width = VIEW_W * s + 'px'; CV.style.height = VIEW_H * s + 'px'; }
function press(c) { if (G.pressed.has(c)) { G.pressed.delete(c); return true; } return false; }

function startRun() {
  // starter weapon
  const w = rollItem(1, 0, 'WEAPON'); w.base = 'lexington'; w.rar = 0; w.affixes = []; w.name = WPN.lexington.name; w.score = itemScore(w);
  G.equip.WEAPON = w;
  recalc(); G.p.hp = G.p.maxhp; G.p.energy = G.p.maxen; G.p.mag = curWpn().mag;
  banner('NIGHT CITY: DIABLO EDITION', 'CARVE THE HORDE. CHASE THE LOOT.', '#f9f002');
  TIPS.forEach((t, i) => G.tips.push({ at: 2 + i * 5, text: t }));
  snapCam();
}
function snapCam() { G.cam.x = G.p.x; G.cam.y = G.p.y; }
function curWpn() { return G.equip.WEAPON ? WPN[G.equip.WEAPON.base] : WPN.lexington; }

// =================== stats ===================
function recalc() {
  const p = G.p, s = { dmg: 0, fire: 0, crit: 0, critd: 0, hp: 0, armor: 0, speed: 0, xp: 0, lok: 0, pickup: 0 };
  for (const slot of SLOTS) { const it = G.equip[slot]; if (!it) continue; for (const a of it.affixes) s[a.k] = (s[a.k] || 0) + a.v; }
  const oldMax = p.maxhp;
  p.maxhp = 100 + (G.lvl - 1) * 8 + s.hp;
  p.hp = clamp(p.hp + Math.max(0, p.maxhp - oldMax), 1, p.maxhp);
  p.dmgMult = 1 + s.dmg / 100;
  p.fireMult = 1 + s.fire / 100;
  p.crit = 0.05 + s.crit / 100;
  p.critDmg = 1.5 + s.critd / 100;
  p.armor = s.armor;
  p.speedMult = 1 + s.speed / 100;
  p.xpMult = 1 + s.xp / 100;
  p.lifeOnKill = s.lok;
  p.pickup = s.pickup;
}

// =================== step ===================
function step(dt) {
  G.frame++;
  if (G.state === 'play' && !G.ui) {
    const p = G.p;
    G.timeScale = p.sandT > 0 ? 0.3 : 1;
    const dtw = dt * G.timeScale;
    G.t += dtw; G.stats.playT += dt;
    updatePlayer(dt, dtw);
    updateEnemies(dtw);
    updateBullets(dtw);
    updateLoot(dt);
    updateSpawns(dt);
    updateTips(dt);
    G.parts = G.parts.filter(o => (o.t -= dtw) > 0 && (o.x += o.vx * dtw, o.y += o.vy * dtw, o.z += (o.vz || 0) * dtw, o.vz = (o.vz || 0) - 9 * dtw, true));
    G.texts = G.texts.filter(o => (o.t -= dt) > 0 && (o.z += 1.2 * dt, true));
    G.aoes = G.aoes.filter(o => (o.t -= dtw) > 0);
    G.beams = G.beams.filter(b => b.it);
    // camera
    G.cam.x = lerp(G.cam.x, p.x, clamp(7 * dt, 0, 1));
    G.cam.y = lerp(G.cam.y, p.y, clamp(7 * dt, 0, 1));
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
    // mouse → world
    const w = invScreen(G.mouse.sx, G.mouse.sy); G.mouse.wx = w.x; G.mouse.wy = w.y;
    p.hurtFx = Math.max(0, p.hurtFx - dt * 2);
  }
  G.msgs = G.msgs.filter(m => (m.t -= dt) > 0);
  if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  if (G.ui === 'char') handleCharUI();
  render();
  G.pressed.clear(); G.mouse.click = false;
}

function updateTips(dt) { for (const t of G.tips) { t.at -= dt; if (t.at <= 0 && !t.done) { t.done = true; msg(t.text, '#05d9e8'); } } G.tips = G.tips.filter(t => !t.done); }

// =================== player ===================
function updatePlayer(dt, dtw) {
  const p = G.p;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.sandT = Math.max(0, p.sandT - dt);
  for (const k in p.skillCd) p.skillCd[k] = Math.max(0, p.skillCd[k] - dt);
  p.energy = Math.min(p.maxen, p.energy + 9 * dt);
  p.regenT += dt; if (p.regenT > 4) p.hp = Math.min(p.maxhp, p.hp + 6 * dt);

  // movement (iso WASD)
  const mx = (G.keys.has('KeyD') ? 1 : 0) - (G.keys.has('KeyA') ? 1 : 0);
  const my = (G.keys.has('KeyS') ? 1 : 0) - (G.keys.has('KeyW') ? 1 : 0);
  let wvx = mx + my, wvy = my - mx;            // screen-axis → world-axis
  const ml = Math.hypot(wvx, wvy);
  if (ml > 0) { wvx /= ml; wvy /= ml; }
  let spd = 4.2 * p.speedMult;
  if (press('Space') && p.dashCd <= 0 && ml > 0) { p.dashT = 0.16; p.dashCd = 0.8; p.iframes = 0.24; SFX.dash && SFX.dash(); }
  if (p.dashT > 0) { p.dashT -= dt; spd *= 3; }
  p.moving = ml > 0;
  moveColl(p, wvx * spd * dt, wvy * spd * dt, 0.3);
  if (p.moving) p.anim += dt * 9;

  // aim (screen-facing toward cursor)
  const aw = invScreen(G.mouse.sx, G.mouse.sy);
  p.aim = Math.atan2(aw.y - p.y, aw.x - p.x);
  const ahead = { x: isoX(p.x + Math.cos(p.aim), p.y + Math.sin(p.aim)) - isoX(p.x, p.y), y: isoY(p.x + Math.cos(p.aim), p.y + Math.sin(p.aim)) - isoY(p.x, p.y) };
  p.faceA = Math.atan2(ahead.y, ahead.x);

  // skills
  if (press('KeyQ')) useSkill('sandevistan');
  if (press('KeyW') && false) {}                 // (W is movement; Overclock on its own key below)
  if (press('KeyE')) useSkill('grenade');
  if (press('KeyR')) startReload();
  if (press('KeyF') || press('Digit2')) useSkill('overload');
  // fire
  if (G.mouse.down) fire();
  if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { p.mag = curWpn().mag; SFX.reload && SFX.reload(); } }
}

function moveColl(e, dx, dy, r) {
  if (dx && WORLD.walkable(e.x + dx + Math.sign(dx) * r, e.y) && WORLD.walkable(e.x + dx + Math.sign(dx) * r, e.y + r * 0.6) && WORLD.walkable(e.x + dx + Math.sign(dx) * r, e.y - r * 0.6)) e.x += dx;
  if (dy && WORLD.walkable(e.x, e.y + dy + Math.sign(dy) * r) && WORLD.walkable(e.x + r * 0.6, e.y + dy + Math.sign(dy) * r) && WORLD.walkable(e.x - r * 0.6, e.y + dy + Math.sign(dy) * r)) e.y += dy;
}

function startReload() { const w = curWpn(); if (G.p.mag < w.mag && G.p.reloadT <= 0) G.p.reloadT = w.rel; }

function fire() {
  const p = G.p, w = curWpn();
  if (p.fireCd > 0 || p.reloadT > 0) return;
  if (p.mag <= 0) { startReload(); return; }
  p.mag--;
  p.fireCd = 1 / (w.rof * p.fireMult);
  SFX.shoot && SFX.shoot(w.cls);
  const n = w.pellets || 1;
  for (let i = 0; i < n; i++) {
    const a = p.aim + rnd(-w.spread, w.spread) * Math.PI / 180;
    const crit = Math.random() < p.crit;
    let dmg = w.dmg * p.dmgMult * (crit ? p.critDmg : 1);
    let homing = null;
    if (w.homing) { let bd = 9; for (const e of G.enemies) { if (e.dead) continue; const d = dist(p.x, p.y, e.x, e.y); const da = Math.abs(((Math.atan2(e.y - p.y, e.x - p.x) - p.aim) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (d < 8 && da < 0.6 && d < bd) { bd = d; homing = e; } } }
    G.bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd, dmg, crit, life: 1.4, pierce: w.pierce || 0, kb: w.kb || 0, homing, turn: w.homing || 0, col: w.kind === 'tech' ? '#7af2ff' : w.kind === 'smart' ? '#ff7ab8' : '#ffe9a0' });
  }
  if (p.mag <= 0) startReload();
}

function useSkill(id) {
  const p = G.p, sk = SKILLS[id];
  if (p.skillCd[id] > 0) { msg(sk.name + ' ON COOLDOWN', '#ff5a5a'); return; }
  if (p.energy < sk.cost) { msg('NOT ENOUGH ENERGY', '#ff5a5a'); return; }
  p.energy -= sk.cost; p.skillCd[id] = sk.cd;
  if (id === 'sandevistan') { p.sandT = sk.dur; banner('SANDEVISTAN', null, '#00ff9f'); SFX.sande && SFX.sande(true); }
  else if (id === 'overload') { aoeBlast(p.x, p.y, 4.2, 40 * p.dmgMult, '#05d9e8', true); banner('OVERCLOCK', null, '#05d9e8'); }
  else if (id === 'grenade') { const w = invScreen(G.mouse.sx, G.mouse.sy); G.bullets.push({ x: p.x, y: p.y, vx: (w.x - p.x), vy: (w.y - p.y), nade: 1, t: 0.5, dmg: 70 * p.dmgMult, life: 0.5, col: '#ff9f1c' }); }
}

function aoeBlast(x, y, r, dmg, col, kb) {
  G.aoes.push({ x, y, r, t: 0.35, max: 0.35, col });
  G.shake = Math.max(G.shake, 5);
  SFX.explode && SFX.explode();
  for (const e of G.enemies) { if (e.dead) continue; const d = dist(x, y, e.x, e.y); if (d < r + e.r) { hurtEnemy(e, dmg * (1 - d / (r + 1)), false, Math.atan2(e.y - y, e.x - x), kb ? 6 : 0); } }
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; G.parts.push({ x, y, z: 0.3, vx: Math.cos(a) * rnd(3, 7), vy: Math.sin(a) * rnd(3, 7), vz: rnd(2, 5), t: 0.5, col }); }
}

// =================== enemies ===================
function makeEnemy(type, x, y, elite) {
  const d = ENEMIES[type], tier = 1 + G.lvl * 0.12;
  const hp = Math.round(d.hp * tier * (elite ? 4 : 1));
  return { type, x, y, vx: 0, vy: 0, hp, maxhp: hp, dmg: d.dmg * (0.8 + G.lvl * 0.05), r: d.r, kind: d.kind, spd: d.spd, xp: d.xp, col: d.col, big: d.big, elite, eaff: elite ? pick(ELITE_AFFIX) : null, shootCd: rnd(0.5, 1.5), bspd: d.bspd, hitT: 0, anim: 0, faceA: 0, dead: false };
}
function updateEnemies(dtw) {
  const p = G.p;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.hitT = Math.max(0, e.hitT - dtw);
    e.shootCd -= dtw;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d > 26) { e.dead = true; continue; }                 // cull stragglers
    const aTo = Math.atan2(p.y - e.y, p.x - e.x);
    let mvx = Math.cos(aTo), mvy = Math.sin(aTo);
    let spd = e.spd * (e.eaff === 'SWIFT' ? 1.5 : 1) * (1 + G.lvl * 0.015);
    if (e.kind === 'gun') {
      if (d < 5) { mvx *= -1; mvy *= -1; } else if (d < 8) { mvx = Math.cos(aTo + 1.4); mvy = Math.sin(aTo + 1.4); }
      if (d < 11 && e.shootCd <= 0 && WORLD.losClear(e.x, e.y, p.x, p.y)) {
        e.shootCd = 1.6; G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(aTo) * e.bspd, vy: Math.sin(aTo) * e.bspd, dmg: e.dmg, life: 1.6, col: '#ff5a7a' });
        SFX.shoot && SFX.shoot('smg');
      }
    } else {
      if (d < e.r + 0.45) { mvx = mvy = 0; if (e.atkCd === undefined || e.atkCd <= 0) { e.atkCd = 0.7; if (p.iframes <= 0) hurtPlayer(e.dmg); } }
    }
    if (e.atkCd > 0) e.atkCd -= dtw;
    // separation
    for (const o of G.enemies) { if (o === e || o.dead) continue; const dd = dist(e.x, e.y, o.x, o.y); if (dd > 0.01 && dd < (e.r + o.r)) { mvx += (e.x - o.x) / dd * 0.4; mvy += (e.y - o.y) / dd * 0.4; } }
    const ml = Math.hypot(mvx, mvy); if (ml > 0.01) { moveColl(e, mvx / ml * spd * dtw, mvy / ml * spd * dtw, e.r); e.anim += dtw * 8; const sa = { x: isoX(e.x + mvx, e.y + mvy) - isoX(e.x, e.y), y: isoY(e.x + mvx, e.y + mvy) - isoY(e.x, e.y) }; e.faceA = Math.atan2(sa.y, sa.x); }
  }
  G.enemies = G.enemies.filter(e => !e.dead || e.death > 0);
}

function hurtEnemy(e, dmg, crit, dir, kb) {
  if (e.dead) return;
  if (e.eaff === 'JUGGERNAUT') dmg *= 0.6;
  e.hp -= dmg; e.hitT = 0.09;
  if (kb) { moveColl(e, Math.cos(dir) * kb * 0.1, Math.sin(dir) * kb * 0.1, e.r); }
  txt(e.x, e.y, Math.round(dmg), crit ? '#f9f002' : '#fff', crit);
  for (let i = 0; i < (crit ? 5 : 2); i++) G.parts.push({ x: e.x, y: e.y, z: 0.4, vx: rnd(-3, 3), vy: rnd(-3, 3), vz: rnd(1, 4), t: 0.35, col: '#a01828' });
  SFX.hit && SFX.hit();
  if (e.hp <= 0) killEnemy(e, dir);
}
function killEnemy(e, dir) {
  e.dead = true; G.stats.kills++;
  if (e.elite) G.stats.elites++;
  SFX.kill && SFX.kill();
  for (let i = 0; i < (e.big ? 16 : 8); i++) G.parts.push({ x: e.x, y: e.y, z: 0.4, vx: rnd(-5, 5), vy: rnd(-5, 5), vz: rnd(2, 6), t: 0.6, col: '#a01828' });
  gainXp(e.xp * (e.elite ? 5 : 1));
  if (G.p.lifeOnKill) G.p.hp = Math.min(G.p.maxhp, G.p.hp + G.p.lifeOnKill);
  if (e.eaff === 'VOLATILE') aoeBlast(e.x, e.y, 3, 18, '#ff6a00', true);
  // drops
  const ed = irnd(3, 9) * (e.elite ? 6 : 1); G.orbs.push({ kind: 'eddies', amt: ed, x: e.x + rnd(-.3, .3), y: e.y + rnd(-.3, .3), z: .3, vz: 3, t: 30 });
  const dropC = (e.big ? 0.6 : 0.12) + (e.elite ? 0.5 : 0);
  if (Math.random() < dropC) dropItem(e.x, e.y, G.lvl + (e.elite ? 3 : 0), e.elite ? 2 : 0);
  if (Math.random() < 0.14) G.orbs.push({ kind: 'health', x: e.x, y: e.y, z: .3, vz: 3, t: 20 });
  else if (Math.random() < 0.1) G.orbs.push({ kind: 'energy', x: e.x, y: e.y, z: .3, vz: 3, t: 20 });
  G.p.regenT = 0;
}

function dropItem(x, y, ilvl, rarFloor) {
  const it = rollItem(ilvl, rarFloor);
  const o = findOpen(x, y, 0.1, 1.2) || { x, y };
  G.loot.push({ it, x: o.x, y: o.y, t: 60, bob: Math.random() * 6 });
}

// =================== bullets ===================
function updateBullets(dtw) {
  const p = G.p;
  for (const b of G.bullets) {
    if (b.dead) continue;
    if (b.nade) { b.t -= dtw; b.x += b.vx * dtw * 2; b.y += b.vy * dtw * 2; b.vx *= 0.92; b.vy *= 0.92; if (b.t <= 0) { aoeBlast(b.x, b.y, 3.2, b.dmg, '#ff9f1c', true); b.dead = true; } continue; }
    b.life -= dtw; if (b.life <= 0) { b.dead = true; continue; }
    if (b.homing && !b.homing.dead && b.turn) { const wa = Math.atan2(b.homing.y - b.y, b.homing.x - b.x), ca = Math.atan2(b.vy, b.vx); let df = ((wa - ca + Math.PI * 3) % (Math.PI * 2)) - Math.PI; const na = ca + clamp(df, -b.turn * dtw, b.turn * dtw), sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; }
    const steps = 2; for (let s = 0; s < steps && !b.dead; s++) {
      b.x += b.vx * dtw / steps; b.y += b.vy * dtw / steps;
      if (WORLD.solidAt(b.x, b.y)) { b.dead = true; break; }
      for (const e of G.enemies) { if (e.dead || e.hitBy === b) continue; if (dist(b.x, b.y, e.x, e.y) < e.r + 0.15) { hurtEnemy(e, b.dmg, b.crit, Math.atan2(b.vy, b.vx), b.kb); e.hitBy = b; if (b.pierce > 0) b.pierce--; else { b.dead = true; } break; } }
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);
  for (const b of G.ebullets) {
    if (b.dead) continue; b.life -= dtw; if (b.life <= 0) { b.dead = true; continue; }
    b.x += b.vx * dtw; b.y += b.vy * dtw;
    if (WORLD.solidAt(b.x, b.y)) { b.dead = true; continue; }
    if (p.iframes <= 0 && dist(b.x, b.y, p.x, p.y) < 0.35) { hurtPlayer(b.dmg); b.dead = true; }
  }
  G.ebullets = G.ebullets.filter(b => !b.dead);
}

function hurtPlayer(dmg) {
  const p = G.p; if (p.iframes > 0) return;
  dmg = dmg * 100 / (100 + p.armor);
  p.hp -= dmg; p.iframes = 0.25; p.regenT = 0; p.hurtFx = 1; G.shake = Math.max(G.shake, 3);
  SFX.hurt && SFX.hurt();
  if (p.hp <= 0) death();
}
function death() {
  G.state = 'dead'; G.deadT = 3;
  banner('FLATLINED', 'THE CITY KEEPS YOUR LOOT', '#ff2a3c');
  SFX.explode && SFX.explode();
}

// =================== loot pickup ===================
function updateLoot(dt) {
  const p = G.p, pr = 0.7 + p.pickup * 0.25;
  for (const o of G.orbs) {
    o.t -= dt; if (o.z > 0) { o.z -= 4 * dt; o.vz -= 12 * dt; o.z += o.vz * dt; if (o.z < 0) o.z = 0; }
    const d = dist(o.x, o.y, p.x, p.y);
    if (d < pr * 3) { o.x += (p.x - o.x) * Math.min(1, 8 * dt); o.y += (p.y - o.y) * Math.min(1, 8 * dt); }
    if (d < 0.5) { o.t = -1; pickOrb(o); }
  }
  G.orbs = G.orbs.filter(o => o.t > 0);
  for (const L of G.loot) {
    L.t -= dt;
    if (dist(L.x, L.y, p.x, p.y) < 0.6 + p.pickup * 0.2) { L.t = -1; grabItem(L.it); }
  }
  G.loot = G.loot.filter(L => L.t > 0);
}
function pickOrb(o) {
  if (o.kind === 'eddies') { G.eddies += o.amt; txt(G.p.x, G.p.y, '+' + o.amt, '#f9f002'); SFX.coin && SFX.coin(); }
  else if (o.kind === 'health') { G.p.hp = Math.min(G.p.maxhp, G.p.hp + G.p.maxhp * 0.18); txt(G.p.x, G.p.y, '+HP', '#ff2a3c'); SFX.heal && SFX.heal(); }
  else if (o.kind === 'energy') { G.p.energy = Math.min(G.p.maxen, G.p.energy + 35); txt(G.p.x, G.p.y, '+EN', '#05d9e8'); }
}
function grabItem(it) {
  G.stats.items++;
  const cur = G.equip[it.slot];
  if (!cur || it.score > cur.score) {
    if (cur) backpackPush(cur);
    G.equip[it.slot] = it; recalc();
    msg('EQUIPPED ' + itemLabel(it) + ' (+' + (cur ? it.score - cur.score : it.score) + ')', RAR_COL[it.rar]);
    SFX.buy && SFX.buy();
  } else { backpackPush(it); msg('LOOTED ' + itemLabel(it), RAR_COL[it.rar]); SFX.coin && SFX.coin(); }
}
function backpackPush(it) {
  G.backpack.push(it);
  if (G.backpack.length > 16) { G.backpack.sort((a, b) => a.score - b.score); const junk = G.backpack.shift(); G.eddies += 5 + junk.rar * 8; }
}

// =================== xp / spawns ===================
function gainXp(n) {
  n = Math.round(n * G.p.xpMult); G.xp += n;
  while (G.xp >= xpFor(G.lvl)) { G.xp -= xpFor(G.lvl); G.lvl++; recalc(); G.p.hp = G.p.maxhp; G.p.energy = G.p.maxen; banner('LEVEL ' + G.lvl, 'POWER GROWS', '#f9f002'); SFX.levelup && SFX.levelup(); }
}
function updateSpawns(dt) {
  G.spawnT -= dt;
  const cap = 14 + G.lvl * 2;
  if (G.spawnT <= 0 && G.enemies.length < cap) {
    G.spawnT = Math.max(0.6, 2.2 - G.lvl * 0.05);
    G.waveN++;
    const s = findOpen(G.p.x, G.p.y, 9, 14); if (!s) return;
    const packN = irnd(3, 5);
    const elite = G.waveN % 6 === 0;
    for (let i = 0; i < packN; i++) {
      const o = findOpen(s.x, s.y, 0.2, 2.5) || s;
      const type = ENEMY_TIERS[clamp(irnd(0, Math.min(3, 1 + (G.lvl / 4 | 0))), 0, 3)];
      G.enemies.push(makeEnemy(type, o.x, o.y, elite && i === 0));
    }
    if (elite) msg('AN ELITE PROWLS THE BLOCK', '#bd00ff');
  }
}

// =================== fx ===================
function txt(x, y, s, col, big) { G.texts.push({ x, y, z: 0.6, s: '' + s, col, t: 0.7, big }); }
function msg(s, col) { G.msgs.push({ text: s, col: col || '#cfd6e4', t: 4 }); if (G.msgs.length > 6) G.msgs.shift(); }
function banner(t, sub, col) { G.banner = { text: t, sub, col: col || '#f9f002', t: 2.6 }; }

// =================== projection helpers ===================
function camS() { return { x: isoX(G.cam.x, G.cam.y), y: isoY(G.cam.x, G.cam.y, 0) }; }
function proj(wx, wy, wz) { const cs = camS(); return { x: isoX(wx, wy) - cs.x + VIEW_W / 2 + (G.shake ? rnd(-G.shake, G.shake) : 0), y: isoY(wx, wy, wz) - cs.y + VIEW_H / 2 + (G.shake ? rnd(-G.shake, G.shake) : 0) }; }
function invScreen(px, py) { const cs = camS(); return screenToWorld(px - VIEW_W / 2 + cs.x, py - VIEW_H / 2 + cs.y); }

// =================== render ===================
function render() {
  const c = C;
  c.fillStyle = '#06060a'; c.fillRect(0, 0, VIEW_W, VIEW_H);
  const cs = camS(), ox = -cs.x + VIEW_W / 2, oy = -cs.y + VIEW_H / 2;
  // visible tile bounds
  const corners = [invScreen(0, 0), invScreen(VIEW_W, 0), invScreen(0, VIEW_H), invScreen(VIEW_W, VIEW_H)];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of corners) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const x0 = clamp(minX - 2 | 0, 0, WORLD.W - 1), x1 = clamp(maxX + 3 | 0, 0, WORLD.W - 1), y0 = clamp(minY - 2 | 0, 0, WORLD.H - 1), y1 = clamp(maxY + 8 | 0, 0, WORLD.H - 1);
  // ground tiles
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const t = WORLD.type[j * WORLD.W + i];
    if (WORLD.height[j * WORLD.W + i] > 0) continue;       // building tiles drawn in sorted pass
    const sx = isoX(i + 0.5, j + 0.5) + ox, sy = isoY(i + 0.5, j + 0.5, 0) + oy;
    if (sx < -40 || sx > VIEW_W + 40 || sy < -40 || sy > VIEW_H + 40) continue;
    c.drawImage(SPR.tiles[t], (sx - 16) | 0, (sy - 8) | 0);
  }
  // sorted drawables
  const dr = [];
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (WORLD.height[j * WORLD.W + i] > 0) dr.push({ d: i + j, kind: 'wall', i, j });
  for (const pr of WORLD.props) if (pr.x > x0 - 1 && pr.x < x1 + 2 && pr.y > y0 - 1 && pr.y < y1 + 2) dr.push({ d: pr.x + pr.y, kind: 'prop', o: pr });
  for (const L of G.loot) dr.push({ d: L.x + L.y, kind: 'loot', o: L });
  for (const o of G.orbs) dr.push({ d: o.x + o.y, kind: 'orb', o });
  for (const e of G.enemies) dr.push({ d: e.x + e.y, kind: 'enemy', o: e });
  dr.push({ d: G.p.x + G.p.y, kind: 'player' });
  dr.sort((a, b) => a.d - b.d);
  for (const it of dr) drawDrawable(c, it, ox, oy);
  // bullets + aoe + particles (screen space, after)
  for (const a of G.aoes) { const s = proj(a.x, a.y, 0), f = 1 - a.t / a.max; c.globalAlpha = 0.5 * (1 - f); c.strokeStyle = a.col; c.lineWidth = 2; c.beginPath(); c.ellipse(s.x, s.y, a.r * HW * f, a.r * HH * f, 0, 0, 7); c.stroke(); c.globalAlpha = 1; c.lineWidth = 1; }
  drawBulletList(c, G.bullets); drawBulletList(c, G.ebullets);
  for (const pa of G.parts) { const s = proj(pa.x, pa.y, pa.z); c.fillStyle = pa.col; c.fillRect(s.x | 0, s.y | 0, 2, 2); }
  // glow pass
  c.globalCompositeOperation = 'lighter';
  for (const n of WORLD.neons) { const s = proj(n.x, n.y, n.h + 0.3); c.globalAlpha = 0.28 + 0.08 * Math.sin(G.t * 4 + n.x); c.drawImage(glow(n.col, 16), s.x - 16, s.y - 16); }
  for (const L of G.loot) { const s = proj(L.x, L.y, 0.2); c.globalAlpha = 0.5; c.drawImage(glow(RAR_COL[L.it.rar], 10), s.x - 10, s.y - 10); }
  for (const b of G.bullets) { const s = proj(b.x, b.y, 0.25); c.globalAlpha = 0.5; c.drawImage(glow(b.col, 5), s.x - 5, s.y - 5); }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  // floating text
  for (const tx of G.texts) { const s = proj(tx.x, tx.y, tx.z); drawTextC(c, tx.s, s.x, s.y, tx.col, tx.big ? 2 : 1); }

  drawHUD(c);
  if (G.ui === 'char') drawChar(c);
  if (G.state === 'dead') drawDead(c);
  drawCursor(c);
}

function drawBulletList(c, list) { for (const b of list) { const s = proj(b.x, b.y, 0.25); if (b.nade) { c.fillStyle = b.col; c.fillRect(s.x - 2, s.y - 2, 4, 4); continue; } const s2 = proj(b.x - b.vx * 0.03, b.y - b.vy * 0.03, 0.25); c.strokeStyle = b.col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(s2.x, s2.y); c.lineTo(s.x, s.y); c.stroke(); c.lineWidth = 1; } }

function drawDrawable(c, it, ox, oy) {
  if (it.kind === 'wall') {
    const i = it.i, j = it.j, h = WORLD.height[j * WORLD.W + i];
    const sx = isoX(i + 0.5, j + 0.5) + ox, sy = isoY(i + 0.5, j + 0.5, 0) + oy;
    if (sx < -40 || sx > VIEW_W + 40 || sy < -60 || sy > VIEW_H + 60) return;
    const b = SPR.wallAt(i, j);
    drawIsoBlock(c, sx, sy - 8, h, b.top, b.lt, b.dk);
    drawWindows(c, sx, sy - 8, h, mulberry32((i * 73 + j * 911) | 0));
    return;
  }
  const o = it.o;
  if (it.kind === 'prop') { const s = proj(o.x, o.y, 0); if (o.kind === 'crate') c.drawImage(SPR.crate, s.x - 7, s.y - 12); else { c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(s.x, s.y, 7, 3, 0, 0, 7); c.fill(); c.drawImage(SPR.tree, s.x - 8, s.y - 22); } return; }
  if (it.kind === 'loot') { const s = proj(o.x, o.y, 0); const col = RAR_COL[o.it.rar]; c.fillStyle = col; c.globalAlpha = 0.25; c.fillRect(s.x - 1, s.y - 34, 2, 34); c.globalAlpha = 1; const bob = Math.sin(G.t * 4 + o.bob) * 1.5; c.fillStyle = '#0a0a0c'; c.fillRect(s.x - 5, s.y - 8 + bob, 10, 6); c.fillStyle = col; c.fillRect(s.x - 5, s.y - 8 + bob, 10, 1); c.fillRect(s.x - 4, s.y - 6 + bob, 3, 3); return; }
  if (it.kind === 'orb') { const s = proj(o.x, o.y, o.z); const col = o.kind === 'health' ? '#ff2a3c' : o.kind === 'energy' ? '#05d9e8' : '#f9f002'; if (o.kind === 'eddies') { c.fillStyle = col; c.fillRect(s.x - 1, s.y - 1, 3, 3); } else { c.fillStyle = '#0a0a0c'; c.beginPath(); c.arc(s.x, s.y, 4, 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(s.x, s.y, 3, 0, 7); c.fill(); } return; }
  if (it.kind === 'enemy') return drawActor(c, o, false);
  if (it.kind === 'player') return drawActor(c, G.p, true);
}

function drawActor(c, e, isP) {
  const s = proj(e.x, e.y, 0);
  // shadow
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(s.x, s.y, (e.big ? 9 : 5), (e.big ? 4.5 : 3), 0, 0, 7); c.fill();
  const ax = isP ? SPR.player : SPR.enemyAx(e.type, e.col);
  const f = actorFacing(ax, isP ? e.faceA : e.faceA);
  const sc = e.big ? 1.7 : 1, w = 8 * sc, h = 14 * sc;
  c.save(); c.translate(s.x, s.y - 1); if (f.flip) c.scale(-1, 1);
  if (!isP && e.hitT > 0) c.globalAlpha = 0.55;
  if (e.elite) { c.globalAlpha = 0.6; c.drawImage(glow('#bd00ff', 14 * sc), -14 * sc, -h - 4); c.globalAlpha = 1; }
  c.drawImage(f.cv, -w / 2, -h);
  c.restore();
  if (isP && e.sandT > 0) {}
  // hp bar
  if (!isP && e.hp < e.maxhp) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(s.x - 8 * sc, s.y - h - 5, 16 * sc, 2); c.fillStyle = e.elite ? '#bd00ff' : '#ff2a3c'; c.fillRect(s.x - 8 * sc, s.y - h - 5, 16 * sc * e.hp / e.maxhp, 2); }
  if (!isP && e.elite) drawTextC(c, e.eaff, s.x, s.y - h - 12, '#bd00ff', 1);
}

function drawCursor(c) { const s = G.mouse; c.strokeStyle = '#e8f6ff'; c.lineWidth = 1; c.beginPath(); c.arc(s.sx, s.sy, 4, 0, 7); c.stroke(); c.fillRect(s.sx - 0.5, s.sy - 0.5, 1, 1); }

function drawDead(c) { c.fillStyle = 'rgba(40,0,8,0.55)'; c.fillRect(0, 0, VIEW_W, VIEW_H); drawTextC(c, 'FLATLINED', VIEW_W / 2, 150, '#ff2a3c', 4); drawTextC(c, 'REBOOTING IN ' + Math.ceil(G.deadT), VIEW_W / 2, 186, '#cfd6e4', 1); G.deadT -= 1 / 60; if (G.deadT <= 0) respawn(); }
function respawn() { G.state = 'play'; G.p.hp = G.p.maxhp; G.p.x = WORLD.spawn.x; G.p.y = WORLD.spawn.y; G.p.iframes = 2; G.enemies = []; snapCam(); banner('BACK ONLINE', null, '#05d9e8'); }

function handleCharUI() {
  // click backpack item to equip
  if (G.mouse.click) charClick(G.mouse.sx, G.mouse.sy);
}

addEventListener('load', boot);
window.__boot = boot; window.__step = step; window.__G = () => G;
