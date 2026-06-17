'use strict';
// Headless smoke test for the isometric ARPG (v2). Stub DOM/canvas, drive every system.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctxH = { get(t, k) { if (k === Symbol.toPrimitive) return () => '[ctx]'; if (!(k in t)) t[k] = (...a) => new Proxy({}, ctxH); return t[k]; }, set(t, k, v) { t[k] = v; return true; } };
function canvas() { return { width: 0, height: 0, style: {}, getContext: () => new Proxy({}, ctxH), addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }; }
const store = {};
global.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => store[k] = '' + v, removeItem: k => delete store[k] };
global.window = global; global.innerWidth = 1280; global.innerHeight = 720;
global.addEventListener = () => {}; global.removeEventListener = () => {}; global.requestAnimationFrame = () => 0;
global.performance = { now: () => 0 };
const mainCv = canvas();
global.document = { getElementById: () => mainCv, createElement: () => canvas(), addEventListener() {}, body: { appendChild() {} } };

const files = ['js/font.js', 'js/data.js', 'js/sfx.js', 'js/iso.js', 'js/sprites.js', 'js/world.js', 'js/ui.js', 'js/game.js'];
vm.runInThisContext(files.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n'), { filename: 'v2.js' });

const steps = (n, dt) => { for (let i = 0; i < n; i++) window.__step(dt || 1 / 60); };
const assert = (c, w) => { if (!c) throw new Error('FAIL: ' + w); };

window.__boot();
const G = window.__G();
assert(WORLD && WORLD.W === 56, 'world generated');
assert(!WORLD.solidAt(WORLD.spawn.x, WORLD.spawn.y), 'spawn open');
assert(G.p && G.equip.WEAPON, 'player + starter weapon');

// projection round-trips
{ const s = proj(WORLD.spawn.x + 3, WORLD.spawn.y + 1, 0); const w = invScreen(s.x, s.y); assert(Math.hypot(w.x - (WORLD.spawn.x + 3), w.y - (WORLD.spawn.y + 1)) < 0.1, 'iso projection inverts'); }

// movement (iso WASD)
const sx = G.p.x, sy = G.p.y;
G.keys.add('KeyW'); steps(30); G.keys.delete('KeyW');
assert(Math.hypot(G.p.x - sx, G.p.y - sy) > 0.3, 'WASD moves player');

// combat: spawn an enemy in front, aim, fire
G.enemies = [];
const en = makeEnemy('grunt', G.p.x + 3, G.p.y, false); G.enemies.push(en);
G.mouse.sx = proj(en.x, en.y, 0).x; G.mouse.sy = proj(en.x, en.y, 0).y; G.mouse.down = true;
steps(60);
assert(en.hp < en.maxhp || en.dead, 'bullets damage enemy');
G.mouse.down = false;

// kill → xp + drops (eddies may be auto-collected if the dying enemy was close)
hurtEnemy(en, 9999, false, 0, 0);
steps(3);
assert(G.stats.kills >= 1, 'kill counted');
assert(G.eddies > 0 || G.orbs.length > 0 || G.loot.length > 0, 'kill yields eddies/loot');

// loot equip path
const before = G.equip.WEAPON.score;
const good = rollItem(20, 5, 'WEAPON'); good.affixes = [{ k: 'dmg', v: 99 }, { k: 'crit', v: 30 }]; good.score = itemScore(good);
G.loot.push({ it: good, x: G.p.x, y: G.p.y, t: 60, bob: 0 });
steps(4);
assert(G.equip.WEAPON.score >= before, 'better weapon auto-equips on pickup');
assert(G.p.dmgMult > 1, 'affixes raise damage multiplier');

// backpack + manual equip
const stash = rollItem(10, 1, 'ARMOR'); backpackPush(stash);
assert(G.backpack.length > 0, 'item stashed to backpack');
const aff0 = G.p.maxhp; G.equip.ARMOR = null; recalc();
equipFromBackpack(G.backpack.findIndex(i => i.slot === 'ARMOR'));
assert(G.equip.ARMOR, 'equip from backpack works');

// skills
G.p.energy = 100; G.p.skillCd.sandevistan = 0; useSkill('sandevistan');
assert(G.p.sandT > 0, 'sandevistan engaged'); steps(2); assert(G.timeScale < 1, 'time dilation active');
G.p.energy = 100; G.p.skillCd.overload = 0; G.enemies.push(makeEnemy('grunt', G.p.x + 1, G.p.y, false));
const eh = G.enemies[G.enemies.length - 1].hp; useSkill('overload');
assert(G.enemies[G.enemies.length - 1].hp < eh, 'overclock nova hits');
G.p.energy = 100; G.p.skillCd.grenade = 0; G.mouse.sx = 360; G.mouse.sy = 180; useSkill('grenade');
assert(G.bullets.some(b => b.nade), 'grenade thrown');

// level up
gainXp(xpFor(G.lvl) * 3); assert(G.lvl >= 2, 'leveled up');

// char screen renders + closes
G.ui = 'char'; steps(4); G.ui = null;

// elite + horde soak
for (let i = 0; i < 8; i++) G.enemies.push(makeEnemy(pick(ENEMY_TIERS), G.p.x + rnd(-4, 4), G.p.y + rnd(-4, 4), i === 0));
G.mouse.down = true; G.keys.add('KeyA'); steps(400); G.mouse.down = false; G.keys.delete('KeyA');

// death + respawn
G.p.iframes = 0; G.p.hp = 5; hurtPlayer(99999);
assert(G.state === 'dead', 'player can die');
steps(200);
assert(G.state === 'play' && G.p.hp === G.p.maxhp, 'respawn restores');

console.log('SMOKE OK —', 'kills:' + G.stats.kills, 'lvl:' + G.lvl, 'items:' + G.stats.items, 'enemies:' + G.enemies.length, 'eddies:' + G.eddies, 'dps_mult:' + G.p.dmgMult.toFixed(2));
