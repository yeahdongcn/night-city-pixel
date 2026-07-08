// Headless smoke: drive a full mission through the PURE modules (state, map,
// sim, record) — no THREE, no DOM. Mirrors the proven old-build test:
// record perks, vision ramp, takedown, noise, loot, extraction, write-back,
// reinforcements, death.
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

// a level-25 record from the other editions
store['ncpx2077_v1'] = JSON.stringify({
  v: 1, gender: 'f', eddies: 184500, lvl: 25, xp: 10, maxdocs: 3, px: 1, py: 1, hp: 100,
  weapons: new Array(31).fill(0).map((_, i) => 'w' + i), loadout: ['w1', null, null], slot: 0,
  cars: ['a', 'b'], activeCar: 'a', cyber: { kiroshi: 2 }, os: null,
  stats: { kills: 500, psychos: 3, bounties: 9, crates: 40, dist: 9000, playT: 3600 },
  skippyFound: false, bountyCount: 4, dens: [],
});

const { G } = await import('../js/state.js');
const MAP = await import('../js/map.js');          // namespace: MAPD is a live binding
const { buildMap, losClear, blocked } = MAP;
const { loadRecord, saveRecordBack } = await import('../js/record.js');
const { resetMission, simStep } = await import('../js/sim.js');

const assert = (cond, what) => {
  if (!cond) { console.error('ASSERT FAIL: ' + what); process.exit(1); }
  console.log('  ok — ' + what);
};
const steps = (n, dt) => { for (let i = 0; i < n; i++) { G.t += dt || 1 / 60; simStep(dt || 1 / 60); } };

// ---- boot / record ----
loadRecord();
buildMap();
resetMission();
G.mode = 'play';
G.mouse.wx = G.p.x + 50; G.mouse.wy = G.p.y;    // aim somewhere harmless
assert(MAP.MAPD.bldgs.length >= 4 && MAP.MAPD.crates.length === 3, 'map built (bldgs + 3 objective crates)');
assert(MAP.MAPD.towers.length === 4 && MAP.MAPD.poles.length >= 6, 'watchtowers and telegraph poles placed');
assert(G.rec && G.rec.gender === 'f' && G.rec.lvl === 25 && G.rec.weapons === 31 && G.rec.kiroshi === 2, 'record loaded');
assert(G.p.gun === 'rifle' && G.p.maxhp > 100 && G.p.dmg > 30, 'record perks applied');

// ---- collision sanity ----
const wh = MAP.MAPD.bldgs[0];
assert(blocked(wh.x + 5, wh.y + 5, 11), 'building blocks movement');
assert(!losClear(wh.x - 40, wh.y + wh.d / 2, wh.x + wh.w + 40, wh.y + wh.d / 2), 'building blocks sight');

// ---- soak: nothing explodes ----
G.keys.add('KeyW'); steps(240); G.keys.delete('KeyW');
assert(G.p.hp > 0 && G.mode === 'play', 'walking soak ok');

// ---- guard vision: staring guard ramps suspicion; back turned does not ----
G.bullets.length = 0;                              // no stale lead in the air
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
G.pressed.add('KeyE'); steps(1); G.pressed.delete('KeyE');
assert(g1.dead, 'silent takedown from behind');
assert(G.kills === 1 && G.bodies.length === 1, 'body on the ground');

// ---- gunfire alerts + alarm → reinforcements ----
const g2 = G.guards[2];
G.p.x = g2.x + 150; G.p.y = g2.y + 10;
G.mouse.wx = G.p.x + 100; G.mouse.wy = G.p.y;
G.mouse.down = true; steps(3); G.mouse.down = false;
assert(g2.alert || g2.sus >= 1, 'shot alerts nearby guards');
steps(30);
assert(G.alarmed, 'alarm raised');
assert(G.reinforced && G.guards.filter(g => g.heavy).length === 4, 'reinforcements arrive (+4 heavies)');
steps(120);

// ---- loot all crates (teleport + hold E) ----
for (const cr of G.crates) {
  G.p.x = cr.x + 30; G.p.y = cr.y + 30;
  G.keys.add('KeyE'); steps(80); G.keys.delete('KeyE');
  assert(cr.looted, 'crate looted (+€$' + cr.loot + ')');
}
assert(G.looted === 3 && G.extractOpen, 'all crates → extraction open');

// ---- extract + record write-back ----
G.p.x = MAP.MAPD.extract.x; G.p.y = MAP.MAPD.extract.y;
steps(2);
assert(G.done === 'out' && G.mode === 'debrief', 'reached extraction → debrief');
saveRecordBack();                                   // (the debrief screen does this in-browser)
const after = JSON.parse(store['ncpx2077_v1']);
assert(after.eddies === 184500 + G.lootEddies, 'eddies banked to the shared record (' + after.eddies + ')');
assert(after.stats.kills === 500 + G.kills, 'kills merged into record stats');
assert(after.weapons.length === 31 && after.gender === 'f' && after.cyber.kiroshi === 2, 'record schema untouched');
saveRecordBack();                                   // must be once-only
assert(JSON.parse(store['ncpx2077_v1']).eddies === after.eddies, 'write-back is once-only');

// ---- restart → death path ----
resetMission();
G.mode = 'play';
assert(G.looted === 0 && G.p.hp === G.p.maxhp && !G.extractOpen, 'mission resets clean');
G.p.hp = 1;
G.guards.forEach(g => { if (!g.dead) { g.alert = true; g.lastX = G.p.x; g.lastY = G.p.y; g.x = G.p.x + 60; g.y = G.p.y; g.cd = 0; } });
let dead = false;
for (let i = 0; i < 900 && !dead; i++) { G.t += 1 / 60; simStep(1 / 60); dead = G.mode === 'debrief'; }
assert(dead && G.done === 'dead', 'guards can flatline V → debrief');

console.log('SMOKE OK — record perks, vision, takedown, alarm+reinforcements, loot, extraction, write-back, death all green');
