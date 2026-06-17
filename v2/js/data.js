'use strict';
// ============ NIGHT CITY: DIABLO EDITION (v2, isometric ARPG) — data ============
// World is a flat tile plane (sim space); the renderer projects it isometrically.
const VIEW_W = 640, VIEW_H = 360;

const RAR_NAME = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ICONIC'];
const RAR_COL  = ['#9aa0a6', '#2ecc71', '#3da9fc', '#bd00ff', '#ff9f1c', '#f9f002'];
const KIND_COL = { power: '#ff9f1c', tech: '#05d9e8', smart: '#ff2a6d' };

// ---- weapons (the LMB attack). dmg per shot, rof shots/s, spd world-units/s ----
const WEAPONS = [
  { id:'lexington', name:'M-10AF LEXINGTON', cls:'pistol',  kind:'power', base:0, dmg:7,  rof:7,   mag:18, rel:0.9, spd:14, spread:6,  pellets:1 },
  { id:'nue',       name:'HJKE-11 NUE',      cls:'pistol',  kind:'power', base:1, dmg:12, rof:4.5, mag:12, rel:1.0, spd:15, spread:4,  pellets:1 },
  { id:'saratoga',  name:'DIAN SARATOGA',    cls:'smg',     kind:'power', base:1, dmg:5,  rof:12,  mag:30, rel:1.2, spd:13, spread:9,  pellets:1 },
  { id:'shingen',   name:'TKI-20 SHINGEN',   cls:'smg',     kind:'smart', base:2, dmg:5,  rof:13,  mag:36, rel:1.3, spd:11, spread:7,  pellets:1, homing:6 },
  { id:'copperhead',name:'D5 COPPERHEAD',    cls:'rifle',   kind:'power', base:1, dmg:8,  rof:8,   mag:24, rel:1.4, spd:16, spread:5,  pellets:1 },
  { id:'masamune',  name:'HJSH-18 MASAMUNE', cls:'rifle',   kind:'power', base:3, dmg:11, rof:10,  mag:30, rel:1.4, spd:17, spread:4,  pellets:1 },
  { id:'omaha',     name:'JKE-X2 OMAHA',     cls:'tech',    kind:'tech',  base:2, dmg:16, rof:3.6, mag:10, rel:1.0, spd:20, spread:2,  pellets:1, pierce:2 },
  { id:'igla',      name:'TESTERA IGLA',     cls:'shotgun', kind:'power', base:1, dmg:5,  rof:1.9, mag:6,  rel:1.7, spd:12, spread:15, pellets:7, kb:3 },
  { id:'carnage',   name:'M2038 CARNAGE',    cls:'shotgun', kind:'power', base:3, dmg:7,  rof:1.4, mag:5,  rel:1.8, spd:12, spread:17, pellets:9, kb:4 },
  { id:'nekomata',  name:'ACHILLES NEKOMATA',cls:'sniper',  kind:'tech',  base:3, dmg:60, rof:0.9, mag:4,  rel:2.2, spd:30, spread:0,  pellets:1, pierce:4 },
  { id:'defender',  name:'L-69 ZHUO DEFENDER',cls:'lmg',    kind:'power', base:3, dmg:6,  rof:12,  mag:70, rel:2.8, spd:15, spread:8,  pellets:1 },
];
const WPN = {}; WEAPONS.forEach(w => WPN[w.id] = w);

// ---- gear slots & ARPG affixes ----
const SLOTS = ['WEAPON', 'ARMOR', 'IMPLANT'];
// affix: stat key + per-roll value range, scaled by item level. shown on items + summed into player.
const AFFIXES = [
  { k:'dmg',   name:'% DAMAGE',        min:6,  max:14, suffix:'%' },
  { k:'fire',  name:'% FIRE RATE',     min:5,  max:11, suffix:'%' },
  { k:'crit',  name:'% CRIT CHANCE',   min:3,  max:8,  suffix:'%' },
  { k:'critd', name:'% CRIT DAMAGE',   min:10, max:25, suffix:'%' },
  { k:'hp',    name:'MAX HP',          min:10, max:30, suffix:'' },
  { k:'armor', name:'ARMOR',           min:6,  max:18, suffix:'' },
  { k:'speed', name:'% MOVE SPEED',    min:4,  max:9,  suffix:'%' },
  { k:'xp',    name:'% XP GAIN',       min:5,  max:12, suffix:'%' },
  { k:'lok',   name:'HP ON KILL',      min:2,  max:6,  suffix:'' },
  { k:'pickup',name:'PICKUP RADIUS',   min:1,  max:3,  suffix:'' },
];
const AFK = {}; AFFIXES.forEach(a => AFK[a.k] = a);
// how many affixes by rarity
const RAR_AFFIX = [1, 1, 2, 3, 4, 4];

// ---- skills (hotbar). cost = energy, cd seconds ----
const SKILLS = {
  sandevistan: { name:'SANDEVISTAN', key:'Q', cost:40, cd:9,  dur:3.2, desc:'TIME CRAWLS. YOU DO NOT.' },
  overload:    { name:'OVERCLOCK',   key:'W', cost:30, cd:7,  desc:'EMP NOVA: BIG AOE BURST AROUND YOU.' },
  grenade:     { name:'FRAG GRENADE',key:'E', cost:25, cd:5,  desc:'LOB AN EXPLOSIVE AT THE CURSOR.' },
};

// ---- enemies (Diablo-style hordes) ----
const ENEMIES = {
  grunt:  { name:'SCAV',      hp:24,  spd:2.4, dmg:6,  kind:'melee', r:0.32, xp:8,  col:{H:'#3a3a3a',S:'#cfa884',J:'#2c2c2c',T:'#884444'} },
  runner: { name:'TYGER',     hp:16,  spd:3.6, dmg:5,  kind:'melee', r:0.28, xp:9,  col:{H:'#101014',S:'#e0b48c',J:'#2a1130',T:'#ff2a6d'} },
  gunner: { name:'MAELSTROM', hp:20,  spd:2.0, dmg:5,  kind:'gun',   r:0.32, xp:11, shootCd:1.6, bspd:11, col:{H:'#1a1a1a',S:'#b9b3a8',J:'#16161a',T:'#ff2a3c'} },
  brute:  { name:'6TH ST BRUTE',hp:120,spd:1.7, dmg:14, kind:'melee', r:0.5,  xp:30, big:1, col:{H:'#4a3826',S:'#d8a87c',J:'#1d2a4a',T:'#f5b83d'} },
};
const ENEMY_TIERS = ['grunt', 'runner', 'gunner', 'brute'];
const ELITE_AFFIX = ['JUGGERNAUT', 'VOLATILE', 'SWIFT', 'VAMPIRIC']; // visual/behaviour spice

const GANG_NAMES = ['SCAV DEN', 'TYGER CLAW NEST', 'MAELSTROM CELL', '6TH STREET BARRACKS'];
const TIPS = [
  'WASD MOVE · MOUSE AIM · LMB FIRE · SPACE DASH',
  'KILL HORDES FOR LOOT. COLORED BEAMS = RARER GEAR',
  'WALK OVER LOOT TO GRAB IT · TAB OPENS YOUR CHARACTER SHEET',
  'Q SANDEVISTAN · W OVERCLOCK NOVA · E FRAG GRENADE',
  'GEAR ROLLS RANDOM AFFIXES. CHASE THE PERFECT BUILD',
  'RED ORB = HEALTH · CYAN ORB = ENERGY FOR SKILLS',
];

function xpFor(lvl) { return Math.floor(60 * Math.pow(lvl, 1.5)); }
function rollAffixVal(a, ilvl) { return Math.round((a.min + Math.random() * (a.max - a.min)) * (1 + ilvl * 0.06)); }
