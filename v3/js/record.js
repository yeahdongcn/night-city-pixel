// record.js — the ONLY bridge to the other Night City editions: reads the
// shared ncpx2077_v1 save for mission perks and banks eddies/kills back with
// a read-modify-write that leaves the v1/v2 schema untouched.
import { G } from './state.js';

export function loadRecord() {
  G.rec = null;
  try {
    const d = JSON.parse(localStorage.getItem('ncpx2077_v1'));
    if (d && typeof d === 'object') {
      G.rec = {
        gender: d.gender === 'f' ? 'f' : 'm',
        lvl: d.lvl || 1,
        eddies: d.eddies || 0,
        weapons: (d.weapons && d.weapons.length) || 0,
        cars: (d.cars && d.cars.length) || 0,
        kiroshi: (d.cyber && d.cyber.kiroshi) || 0,
      };
    }
  } catch (e) { G.rec = null; }
}

// bank the haul exactly once, from the debrief, only on a successful extraction
export function saveRecordBack() {
  if (G.debriefSaved || G.done !== 'out') return;
  G.debriefSaved = true;
  try {
    const d = JSON.parse(localStorage.getItem('ncpx2077_v1'));
    if (!d || typeof d !== 'object') return;
    d.eddies = (d.eddies || 0) + G.lootEddies;
    if (d.stats) d.stats.kills = (d.stats.kills || 0) + G.kills;
    localStorage.setItem('ncpx2077_v1', JSON.stringify(d));
  } catch (e) {}
}
