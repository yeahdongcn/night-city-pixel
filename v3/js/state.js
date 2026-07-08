// state.js — the one shared game-state object (pure module: no THREE, no DOM,
// so the node smoke test can import it alongside map.js/sim.js).
export const G = {
  mode: 'brief',              // brief | play | debrief
  t: 0, frame: 0,
  cam: { x: 0, y: 0 },
  keys: new Set(), pressed: new Set(),
  mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, click: false },
  p: null, guards: [], bullets: [], fx: [], bodies: [],
  alarm: 0, alarmed: false, reinforced: false,
  crates: [], looted: 0, lootEddies: 0, kills: 0,
  extractOpen: false, done: null,                     // done: 'out' | 'dead'
  rec: null,                                          // the shared Night City record
  shake: 0, noteT: 0, note: '', debriefSaved: false,
};
