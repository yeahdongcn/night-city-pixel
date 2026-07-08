// hud.js — DOM overlay: operative plate, objective, alarm, toasts, crate
// progress, extraction arrow, dossier briefing and the debrief (which banks
// the haul into the shared record).
import { G } from './state.js';
import { MAPD } from './map.js';
import { saveRecordBack } from './record.js';
import { resetMission, note } from './sim.js';

const els = {};
let hintT = 22;

function div(parent, css, html) {
  const d = document.createElement('div');
  d.style.cssText = css;
  if (html != null) d.innerHTML = html;
  parent.appendChild(d);
  return d;
}

const PLATE = 'position:absolute;background:rgba(16,18,12,0.78);border:1px solid rgba(216,208,184,0.28);'
  + 'border-radius:3px;color:#d8d0b8;padding:8px 12px;letter-spacing:0.04em;';

function portraitCanvas(rec) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 92;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 92);
  g.addColorStop(0, '#2c3040'); g.addColorStop(1, '#171a24');
  x.fillStyle = g; x.fillRect(0, 0, 92, 92);
  const f = rec && rec.gender === 'f';
  x.fillStyle = '#20140e';                                       // hair mass
  x.fillRect(24, 14, 44, f ? 66 : 34);
  x.fillStyle = f ? '#cfa483' : '#c99f7c';                       // face
  x.fillRect(28, 22, 36, 34);
  x.fillStyle = '#20140e';                                       // fringe
  x.fillRect(28, 18, 36, 8);
  x.fillStyle = rec && rec.kiroshi ? '#c8b830' : '#2a2620';      // eyes (kiroshi glint)
  x.fillRect(34, 36, 7, 3.5); x.fillRect(51, 36, 7, 3.5);
  x.fillStyle = '#8a6a58'; x.fillRect(43, 44, 6, 5);             // nose shade
  x.fillStyle = '#3a3f53';                                       // jacket
  x.fillRect(18, 60, 56, 32);
  x.fillStyle = '#8c2433'; x.fillRect(18, 66, 56, 5);            // crimson stripe
  x.fillStyle = f ? '#cfa483' : '#c99f7c';                       // neck
  x.fillRect(40, 54, 12, 8);
  return cv;
}

export function initHUD() {
  const hud = document.getElementById('hud');
  hud.innerHTML = '';

  // subtle vignette
  els.vig = div(hud, 'position:absolute;inset:0;pointer-events:none;'
    + 'box-shadow:inset 0 0 180px rgba(8,10,4,0.55);transition:box-shadow 0.3s;');

  // operative plate
  els.plate = div(hud, PLATE + 'left:14px;top:14px;display:flex;gap:10px;align-items:center;min-width:230px;');
  const port = document.createElement('div');
  port.style.cssText = 'width:46px;height:46px;border:1px solid rgba(216,208,184,0.35);border-radius:2px;overflow:hidden;flex:none;';
  const pc = portraitCanvas(G.rec);
  pc.style.cssText = 'width:100%;height:100%;image-rendering:auto;';
  port.appendChild(pc);
  els.plate.appendChild(port);
  const col = div(els.plate, 'flex:1;');
  els.opName = div(col, 'font-size:13px;font-weight:700;color:#e8e2cc;white-space:nowrap;');
  els.hpWrap = div(col, 'height:7px;background:#26291d;border:1px solid rgba(216,208,184,0.25);border-radius:2px;margin:4px 0 3px;');
  els.hp = div(els.hpWrap, 'height:100%;width:100%;background:linear-gradient(90deg,#7fae3f,#a9c94f);border-radius:1px;transition:width 0.15s;');
  els.opSub = div(col, 'font-size:11.5px;color:#b9b198;white-space:nowrap;');

  // objective plate
  els.obj = div(hud, PLATE + 'right:14px;top:14px;text-align:right;');
  div(els.obj, 'font-size:10px;color:#98a06e;font-weight:700;letter-spacing:0.14em;', 'OBJECTIVE');
  els.objLine = div(els.obj, 'font-size:13px;font-weight:700;color:#e8e2cc;margin-top:2px;');

  // alarm banner
  els.alarm = div(hud, 'position:absolute;top:14px;left:50%;transform:translateX(-50%);'
    + 'font-size:14px;font-weight:800;letter-spacing:0.2em;color:#ff5040;'
    + 'text-shadow:0 0 14px rgba(255,60,40,0.8);display:none;', '⚠ ALARM RAISED');

  // note toast
  els.note = div(hud, 'position:absolute;left:50%;bottom:72px;transform:translateX(-50%);'
    + PLATE.replace('position:absolute;', '') + 'font-size:13.5px;font-weight:700;white-space:nowrap;display:none;');

  // controls hint
  els.hint = div(hud, 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);'
    + 'font-size:11.5px;color:rgba(216,208,184,0.6);letter-spacing:0.08em;white-space:nowrap;',
    'WASD MOVE · SHIFT SNEAK · MOUSE SHOOT · E TAKEDOWN / HOLD E LOOT · R RELOAD');

  // crate progress bar (floats over the crate)
  els.prog = div(hud, 'position:absolute;width:64px;height:8px;background:#20231a;'
    + 'border:1px solid rgba(216,208,184,0.4);border-radius:2px;display:none;transform:translate(-50%,-50%);');
  els.progFill = div(els.prog, 'height:100%;width:0%;background:linear-gradient(90deg,#c8a72e,#f2d233);');

  // extraction edge arrow
  els.arrow = div(hud, 'position:absolute;width:0;height:0;display:none;'
    + 'border-left:11px solid transparent;border-right:11px solid transparent;'
    + 'border-bottom:17px solid #5ad06e;filter:drop-shadow(0 0 6px rgba(90,208,110,0.9));');

  // ---- briefing ----
  els.brief = div(hud, 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'background:rgba(8,9,5,0.72);');
  const bp = div(els.brief, 'width:min(620px,86vw);background:linear-gradient(160deg,#20221a,#15170f);'
    + 'border:1px solid rgba(216,208,184,0.35);border-radius:4px;padding:30px 36px;'
    + 'box-shadow:0 30px 80px rgba(0,0,0,0.7);color:#d8d0b8;');
  div(bp, 'font-size:11px;letter-spacing:0.28em;color:#98a06e;font-weight:700;', 'NIGHT CITY OUTSKIRTS — BARGHEST TERRITORY');
  div(bp, 'font-size:30px;font-weight:800;color:#eee8d2;margin:6px 0 14px;letter-spacing:0.06em;', 'OPERATION DEAD MAIL');
  els.briefBody = div(bp, 'font-size:14px;line-height:1.55;color:#c6bda2;');
  els.briefGo = div(bp, 'margin-top:22px;font-size:14px;font-weight:800;letter-spacing:0.16em;color:#a9c94f;', '[ CLICK OR PRESS ENTER TO INSERT ]');

  // ---- debrief ----
  els.debrief = div(hud, 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;'
    + 'background:rgba(8,9,5,0.66);');
  const dp = div(els.debrief, 'width:min(520px,86vw);background:linear-gradient(160deg,#20221a,#15170f);'
    + 'border:1px solid rgba(216,208,184,0.35);border-radius:4px;padding:30px 36px;'
    + 'box-shadow:0 30px 80px rgba(0,0,0,0.7);color:#d8d0b8;text-align:center;');
  els.debTitle = div(dp, 'font-size:34px;font-weight:800;letter-spacing:0.1em;');
  els.debBody = div(dp, 'font-size:14px;line-height:1.7;color:#c6bda2;margin-top:12px;');
  els.debGo = div(dp, 'margin-top:20px;font-size:13.5px;font-weight:800;letter-spacing:0.16em;color:#a9c94f;', '[ CLICK TO RE-DEPLOY ]');
}

export function refreshBriefing() {
  const r = G.rec;
  const opLine = r
    ? `Operative: <b style="color:#eee8d2">V</b> — street cred <b>${r.lvl}</b>, arsenal <b>${r.weapons}</b> irons`
      + (r.kiroshi ? ', <b style="color:#c8b830">Kiroshi optics</b> (enemy sightlines always visible)' : '')
    : 'Operative: <b style="color:#eee8d2">V</b> — <i>no Night City record found; running this cold.</i>';
  els.briefBody.innerHTML =
    'Barghest runs stolen cargo through a walled freight depot on the old coast road. '
    + 'A checkpoint bars the road south of the depot; the farmstead porch has eyes.<br><br>'
    + '<b style="color:#eee8d2">Crack the 3 cargo crates</b> in the depot, then reach the '
    + '<b style="color:#8fd08a">SW extraction</b>. Stay out of the green cones — amber means '
    + 'suspicion, red means iron. Two alerted guards raise the alarm.<br><br>' + opLine;
}

export function updateHUD(dt, project) {
  const p = G.p, r = G.rec;

  // mode panels
  els.brief.style.display = G.mode === 'brief' ? 'flex' : 'none';
  els.debrief.style.display = G.mode === 'debrief' ? 'flex' : 'none';
  const inPlay = G.mode === 'play';
  for (const k of ['plate', 'obj', 'hint']) els[k].style.display = inPlay ? '' : 'none';

  if (G.mode === 'brief') {
    els.briefGo.style.opacity = 0.55 + 0.45 * Math.sin(G.t * 4);
    if (G.mouse.click || G.pressed.has('Enter') || G.pressed.has('Space')) {
      G.mode = 'play';
      note('CRACK THE 3 CARGO CRATES IN THE DEPOT', 6);
    }
    return;
  }

  if (G.mode === 'debrief') {
    const out = G.done === 'out';
    if (out) saveRecordBack();
    els.debTitle.textContent = out ? 'EXFILTRATED' : 'FLATLINED';
    els.debTitle.style.color = out ? '#a9c94f' : '#ff5040';
    els.debBody.innerHTML =
      `Crates cracked: <b>${G.looted}/${G.crates.length}</b><br>`
      + `Eddies ${out ? 'banked' : 'lost'}: <b style="color:#f2d233">€$${G.lootEddies.toLocaleString()}</b><br>`
      + `Guards flatlined: <b>${G.kills}</b>`
      + (out && r ? '<br><span style="font-size:12px;color:#98a06e">haul + kills written to your shared Night City record</span>' : '');
    els.debGo.style.opacity = 0.55 + 0.45 * Math.sin(G.t * 4);
    if (G.mouse.click || G.pressed.has('Enter')) { resetMission(); G.mode = 'play'; }
    return;
  }

  if (!p) return;

  // operative plate
  els.opName.textContent = r ? `V — STREET CRED ${r.lvl}` : 'V — NO RECORD';
  els.hp.style.width = Math.max(0, p.hp / p.maxhp * 100) + '%';
  els.hp.style.background = p.hp / p.maxhp > 0.35
    ? 'linear-gradient(90deg,#7fae3f,#a9c94f)' : 'linear-gradient(90deg,#b8442e,#e06040)';
  els.opSub.textContent =
    `${p.gun.toUpperCase()}  ${p.reload > 0 ? 'RELOADING…' : p.ammo + '/' + p.clip}   €$${G.lootEddies.toLocaleString()}`;

  // objective
  els.objLine.textContent = G.extractOpen
    ? 'REACH THE SW EXTRACTION' : `CRACK CARGO CRATES  ${G.looted} / ${G.crates.length}`;

  // alarm
  els.alarm.style.display = G.alarmed ? '' : 'none';
  if (G.alarmed) els.alarm.style.opacity = 0.5 + 0.5 * Math.sin(G.t * 8);
  els.vig.style.boxShadow = (G.alarmed || p.hp / p.maxhp < 0.3)
    ? 'inset 0 0 190px rgba(120,16,8,0.6)' : 'inset 0 0 180px rgba(8,10,4,0.55)';

  // note toast
  if (G.noteT > 0 && G.note) {
    els.note.style.display = '';
    els.note.textContent = G.note;
    els.note.style.opacity = Math.min(1, G.noteT * 2);
  } else els.note.style.display = 'none';

  // controls hint fades out
  hintT -= dt;
  els.hint.style.opacity = Math.max(0, Math.min(0.85, hintT / 6));

  // crate progress
  const nc = G.nearCrate;
  if (nc && nc.prog > 0.02) {
    const pt = project(nc.x, 44, nc.y);
    els.prog.style.display = '';
    els.prog.style.left = pt.x + 'px';
    els.prog.style.top = pt.y + 'px';
    els.progFill.style.width = Math.min(100, nc.prog * 100) + '%';
  } else els.prog.style.display = 'none';

  // extraction edge arrow
  if (G.extractOpen) {
    const pt = project(MAPD.extract.x, 4, MAPD.extract.y);
    const SW = window.innerWidth, SH = window.innerHeight;
    const onScreen = pt.x > 30 && pt.x < SW - 30 && pt.y > 30 && pt.y < SH - 30;
    if (!onScreen) {
      els.arrow.style.display = '';
      const cx = SW / 2, cy = SH / 2;
      const dx = pt.x - cx, dy = pt.y - cy;
      const k = Math.min((SW / 2 - 46) / Math.abs(dx || 1), (SH / 2 - 46) / Math.abs(dy || 1));
      els.arrow.style.left = (cx + dx * k - 11) + 'px';
      els.arrow.style.top = (cy + dy * k - 9) + 'px';
      els.arrow.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
      els.arrow.style.opacity = 0.6 + 0.4 * Math.sin(G.t * 5);
    } else els.arrow.style.display = 'none';
  } else els.arrow.style.display = 'none';
}
