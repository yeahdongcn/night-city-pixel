'use strict';
// Headless smoke: stub the browser, load the 5 scripts, drive a full mission.
const fs = require('fs'), path = require('path'), vm = require('vm');

const ctxHandler = {
  get(t, k) { if (k === Symbol.toPrimitive) return () => '[ctx]'; if (!(k in t)) t[k] = (...a) => new Proxy({}, ctxHandler); return t[k]; },
  set(t, k, v) { t[k] = v; return true; },
};
function makeCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => new Proxy({}, ctxHandler), addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
}
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.window = global;
global.innerWidth = 1280; global.innerHeight = 720;
global.devicePixelRatio = 1;
global.addEventListener = () => {}; global.removeEventListener = () => {};
global.requestAnimationFrame = () => 0;
global.performance = { now: () => 0 };
global.location = { search: '' };
global.AudioContext = function () { return new Proxy({}, ctxHandler); };
global.document = { getElementById: () => makeCanvas(), createElement: () => makeCanvas() };
const assert = (cond, what) => { if (!cond) throw new Error('ASSERT FAIL: ' + what); };

// a level-25 record from the other editions
store['ncpx2077_v1'] = JSON.stringify({
  v: 1, gender: 'f', eddies: 184500, lvl: 25, xp: 10, maxdocs: 3, px: 1, py: 1, hp: 100,
  weapons: new Array(31).fill(0).map((_, i) => 'w' + i), loadout: ['w1', null, null], slot: 0,
  cars: ['a', 'b'], activeCar: 'a', cyber: { kiroshi: 2 }, os: null,
  stats: { kills: 500, psychos: 3, bounties: 9, crates: 40, dist: 9000, playT: 3600 },
  skippyFound: false, bountyCount: 4, dens: [],
});

const dir = path.join(__dirname, '..');
const files = ['js/boot.js', 'js/paint.js', 'js/map.js', 'js/sim.js', 'js/ui.js'];
vm.runInThisContext(files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'), { filename: 'bundle.js' });

boot();
const steps = (n, dt) => { for (let i = 0; i < n; i++) window.__tick(dt || 1 / 60); };

// ---- boot / record ----
assert(MAPD && MAPD.bldgs.length >= 4 && MAPD.crates.length === 3, 'map built');
assert(TER, 'terrain baked');
assert(G.rec && G.rec.gender === 'f' && G.rec.lvl === 25 && G.rec.weapons === 31 && G.rec.kiroshi === 2, 'record loaded');
assert(G.p.gun === 'rifle' && G.p.maxhp > 100 && G.p.dmg > 30, 'record perks applied');
assert(G.mode === 'brief', 'briefing first');
steps(5);
G.mouse.click = true; steps(1);
assert(G.mode === 'play', 'briefing dismisses into play');

// ---- soak: nothing explodes ----
G.keys.add('KeyW'); steps(240); G.keys.delete('KeyW');
assert(G.p.hp > 0 && G.mode === 'play', 'walking soak ok');

// ---- guard vision: staring guard ramps suspicion; back turned does not ----
const g0 = G.guards[0];
G.p.x = g0.x + 120; G.p.y = g0.y; g0.dir = 0; g0.pts = [{ x: g0.x, y: g0.y }];
steps(50);
assert(g0.sus > 0.15, 'guard facing V grows suspicious (' + g0.sus.toFixed(2) + ')');
const susA = g0.sus;
g0.dir = Math.PI; G.p.x = g0.x + 200; steps(160);
assert(g0.sus < susA || g0.alert, 'suspicion decays or resolves');

// ---- takedown from behind ----
const g1 = G.guards[1];
g1.alert = false; g1.sus = 0; g1.dir = 0;
G.p.x = g1.x - 24; G.p.y = g1.y;
G.pressed.add('KeyE'); steps(1);
assert(g1.dead, 'silent takedown from behind');
assert(G.kills === 1 && G.bodies.length === 1, 'body on the ground');

// ---- gunfire alerts ----
const g2 = G.guards[2];
G.p.x = g2.x + 150; G.p.y = g2.y + 10;
G.mouse.x = 0; G.mouse.y = 0;
G.mouse.down = true; steps(3); G.mouse.down = false;
assert(g2.alert || g2.sus >= 1, 'shot alerts nearby guards');
steps(120);

// ---- loot all crates (teleport + hold E) ----
for (const cr of G.crates) {
  G.p.x = cr.x + 30; G.p.y = cr.y + 30;
  G.keys.add('KeyE'); steps(80); G.keys.delete('KeyE');
  assert(cr.looted, 'crate looted');
}
assert(G.looted === 3 && G.extractOpen, 'all crates → extraction open');

// ---- extract + record write-back ----
G.p.x = MAPD.extract.x; G.p.y = MAPD.extract.y;
steps(2);
assert(G.done === 'out' && G.mode === 'debrief', 'reached extraction → debrief');
steps(2); // debrief render triggers saveRecordBack
const after = JSON.parse(store['ncpx2077_v1']);
assert(after.eddies === 184500 + G.lootEddies, 'eddies banked to the shared record (' + after.eddies + ')');
assert(after.stats.kills === 500 + G.kills, 'kills merged into record stats');
assert(after.weapons.length === 31 && after.gender === 'f' && after.cyber.kiroshi === 2, 'record schema untouched');

// ---- restart from debrief ----
G.mouse.click = true; steps(1);
assert(G.mode === 'play' && G.looted === 0 && G.p.hp === G.p.maxhp, 'debrief restarts a clean run');

// ---- player death path ----
G.p.hp = 1;
G.guards.forEach(g => { if (!g.dead) { g.alert = true; g.lastX = G.p.x; g.lastY = G.p.y; g.x = G.p.x + 60; g.y = G.p.y; g.cd = 0; } });
let dead = false;
for (let i = 0; i < 600 && !dead; i++) { window.__tick(1 / 60); dead = G.mode === 'debrief'; }
assert(dead && G.done === 'dead', 'guards can flatline V → debrief');

console.log('SMOKE OK — record perks, vision, takedown, loot, extraction, write-back, death all green');
