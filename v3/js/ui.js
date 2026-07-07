'use strict';
// ============ ui.js — frame compositor, HUD, briefing/debrief, record bridge ============

const FONT = '"Bahnschrift","DIN Alternate","Arial Narrow","Segoe UI",sans-serif';
function ftext(c, s, x, y, size, col, align, weight) {
  c.font = (weight || 600) + ' ' + size + 'px ' + FONT;
  c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
  c.fillText(s, x, y);
}

// ---- the shared Night City record (read; written back on extraction) ----
function loadRecord() {
  G.rec = null;
  try {
    const s = localStorage.getItem('ncpx2077_v1');
    if (!s) return;
    const d = JSON.parse(s);
    G.rec = {
      gender: d.gender === 'f' ? 'f' : 'm',
      lvl: d.lvl || 1, eddies: d.eddies || 0,
      weapons: (d.weapons && d.weapons.length) || 0,
      cars: (d.cars && d.cars.length) || 0,
      kiroshi: (d.cyber && d.cyber.kiroshi) || 0,
    };
  } catch (e) { G.rec = null; }
}
function saveRecordBack() {
  if (G.debriefSaved) return;
  G.debriefSaved = true;
  if (G.done !== 'out') return;
  try {
    const s = localStorage.getItem('ncpx2077_v1');
    if (!s) return;
    const d = JSON.parse(s);                       // read-modify-write: schema stays v1-valid
    d.eddies = (d.eddies || 0) + G.lootEddies;
    if (d.stats) d.stats.kills = (d.stats.kills || 0) + G.kills;
    localStorage.setItem('ncpx2077_v1', JSON.stringify(d));
  } catch (e) {}
}

// ================= frame =================
function render(dt) {
  const c = CX;
  c.fillStyle = '#20211a'; c.fillRect(0, 0, SW, SH);

  // ---- world: rotated plan frame (terrain + ground overlays) ----
  c.save();
  c.translate(SW / 2 - G.cam.x, SH / 2 - G.cam.y);
  c.rotate(Math.PI / 4);
  const c0 = unscr(0, 0), c1 = unscr(SW, 0), c2 = unscr(0, SH), c3 = unscr(SW, SH);
  const vx0 = clamp(Math.min(c0.x, c1.x, c2.x, c3.x) - 60, 0, MAPD.W), vx1 = clamp(Math.max(c0.x, c1.x, c2.x, c3.x) + 60, 0, MAPD.W);
  const vy0 = clamp(Math.min(c0.y, c1.y, c2.y, c3.y) - 60, 0, MAPD.H), vy1 = clamp(Math.max(c0.y, c1.y, c2.y, c3.y) + 60, 0, MAPD.H);
  if (vx1 > vx0 && vy1 > vy0) c.drawImage(TER, vx0 * TD, vy0 * TD, (vx1 - vx0) * TD, (vy1 - vy0) * TD, vx0, vy0, vx1 - vx0, vy1 - vy0);

  if (G.mode !== 'brief') {
    // extraction marker
    if (G.extractOpen) {
      const e = MAPD.extract, pu = 0.6 + 0.4 * Math.sin(G.t * 3);
      c.strokeStyle = 'rgba(120,230,140,' + (0.5 * pu + 0.25) + ')'; c.lineWidth = 3;
      c.beginPath(); c.arc(e.x, e.y, e.r * (0.86 + 0.1 * pu), 0, 7); c.stroke();
      c.strokeStyle = 'rgba(120,230,140,0.3)';
      c.beginPath(); c.arc(e.x, e.y, e.r * 0.5, 0, 7); c.stroke();
    }
    // view cones — LOS-clipped, the Commandos signature
    const showAll = !!(G.rec && G.rec.kiroshi);
    for (const g of G.guards) {
      if (g.dead) continue;
      if (!showAll && !g.alert && g.sus < 0.1) continue;
      const col = g.alert ? '#e03828' : g.sus > 0.45 ? '#e09018' : '#3fae36';
      const half = 0.82, n = 15, vr = g.vr * 0.86;
      c.beginPath(); c.moveTo(g.x, g.y);
      for (let i = 0; i <= n; i++) {
        const a = g.dir - half + (2 * half) * i / n;
        const dHit = rayHit(g.x, g.y, a, vr);
        c.lineTo(g.x + Math.cos(a) * dHit, g.y + Math.sin(a) * dHit);
      }
      c.closePath();
      c.fillStyle = rgba(col, g.alert ? 0.30 : 0.26); c.fill();
      c.strokeStyle = rgba(col, 0.5); c.lineWidth = 1.6; c.stroke();
    }
    // loot rings
    for (const cr of G.crates) {
      if (cr.looted) continue;
      c.strokeStyle = 'rgba(249,240,80,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.arc(cr.x, cr.y, 26 + 3 * Math.sin(G.t * 3 + cr.x), 0, 7); c.stroke();
    }
  }
  c.restore();

  // ---- depth-sorted world objects ----
  const D = [];
  const pushD = (d, fn) => D.push({ d, fn });
  for (const b of MAPD.bldgs) pushD(b.x + b.w + b.y + b.d, () => drawBuilding(c, b));
  for (const w of MAPD.walls) pushD(w.x1 + w.y1 + w.t, () => drawWall(c, w));
  for (const p2 of MAPD.pillars) pushD(p2.x + p2.s + p2.y + p2.s, () => drawPillar(c, p2));
  for (const f of MAPD.fences) pushD(Math.max(f.x0 + f.y0, f.x1 + f.y1), () => drawFence(c, f));
  for (const tr of MAPD.trees) pushD(tr.x + tr.y, () => drawTree(c, tr));
  for (const pr of MAPD.props) pushD(pr.x + pr.y, () => drawProp(c, pr));
  for (const L of MAPD.lamps) pushD(L.x + L.y, () => drawLamp(c, L));
  for (const cr of G.crates) pushD(cr.x + cr.y, () => drawCrate(c, cr));
  for (const bd of G.bodies) pushD(bd.x + bd.y - 40, () => drawBody(c, bd));
  if (G.mode !== 'brief') {
    for (const g of G.guards) if (!g.dead) pushD(g.x + g.y, () => drawActor(c, { ...g, gun: g.gun, aim: g.dir }, g.heavy ? SPRITES.heavy : SPRITES.guard));
    if (!G.done || G.done === 'out') pushD(G.p.x + G.p.y, () => drawActor(c, { ...G.p, gun: G.p.gun, alpha: G.p.sneak ? 0.86 : 1 }, G.rec && G.rec.gender === 'f' ? SPRITES.vf : SPRITES.vm));
  }
  D.sort((a, b) => a.d - b.d);
  for (const it of D) it.fn();

  // ---- bullets & fx (screen space) ----
  for (const b of G.bullets) {
    const s0 = scr(b.x, b.y, 16), s1 = scr(b.x - Math.cos(b.a) * 16, b.y - Math.sin(b.a) * 16, 16);
    c.strokeStyle = b.from === 'p' ? 'rgba(255,240,180,0.9)' : 'rgba(255,150,90,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(s1.x, s1.y); c.lineTo(s0.x, s0.y); c.stroke();
  }
  for (const f of G.fx) {
    const s = scr(f.x, f.y, 16);
    if (f.kind === 'muzzle') { c.fillStyle = 'rgba(255,220,140,' + (f.t / 0.06) + ')'; c.beginPath(); c.arc(s.x, s.y, 7, 0, 7); c.fill(); }
    if (f.kind === 'spark') { c.fillStyle = 'rgba(255,200,120,' + (f.t / 0.15) + ')'; c.beginPath(); c.arc(s.x, s.y, 3.4, 0, 7); c.fill(); }
    if (f.kind === 'blood') { c.fillStyle = 'rgba(150,30,26,' + (f.t / 0.2) + ')'; c.beginPath(); c.arc(s.x, s.y - 14, 6, 0, 7); c.fill(); }
  }
  for (const t of G.texts) {
    const s = scr(t.x, t.y, 40 + (1.2 - t.t) * 30);
    c.globalAlpha = Math.min(1, t.t);
    ftext(c, t.s, s.x, s.y, 15, t.col || '#fff', 'center', 700);
    c.globalAlpha = 1;
  }

  // crate progress
  if (G.nearCrate && G.mode === 'play') {
    const s = scr(G.nearCrate.x, G.nearCrate.y, 46);
    if (G.nearCrate.prog > 0) {
      c.fillStyle = 'rgba(10,10,8,0.7)'; c.fillRect(s.x - 26, s.y - 6, 52, 9);
      c.fillStyle = '#f9f002'; c.fillRect(s.x - 24, s.y - 4, 48 * Math.min(1, G.nearCrate.prog), 5);
    } else ftext(c, 'HOLD [E] TO CRACK', s.x, s.y, 12, '#f4ef9a', 'center');
  }

  // vignette
  const vg = c.createRadialGradient(SW / 2, SH / 2, Math.min(SW, SH) * 0.42, SW / 2, SH / 2, Math.max(SW, SH) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(12,12,8,0.42)');
  c.fillStyle = vg; c.fillRect(0, 0, SW, SH);

  if (G.mode === 'play') drawHUD(c);
  if (G.mode === 'brief') drawBriefing(c);
  if (G.mode === 'debrief') { saveRecordBack(); drawDebrief(c); }
}

// ================= HUD =================
function drawHUD(c) {
  const p = G.p;
  // operative plate
  c.fillStyle = 'rgba(14,15,10,0.82)'; c.fillRect(14, 14, 250, 74);
  c.strokeStyle = 'rgba(190,200,150,0.35)'; c.strokeRect(14.5, 14.5, 249, 73);
  c.fillStyle = '#2a2c20'; c.fillRect(22, 22, 58, 58);
  drawPortrait(c, 51, 51, G.rec && G.rec.gender === 'f');
  ftext(c, 'V — ' + (G.rec ? 'STREET CRED ' + G.rec.lvl : 'NO RECORD'), 90, 36, 14, '#e8e6d2', 'left', 700);
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(90, 44, 160, 10);
  c.fillStyle = p.hp / p.maxhp > 0.35 ? '#7cb54a' : '#c04030';
  c.fillRect(91, 45, 158 * clamp(p.hp / p.maxhp, 0, 1), 8);
  ftext(c, (p.gun === 'rifle' ? 'CARBINE' : 'PISTOL') + '  ' + (p.reload > 0 ? '···' : p.ammo) + '/' + p.clip, 90, 72, 13, '#cfcab2');
  ftext(c, '€$' + G.lootEddies, 200, 72, 13, '#f0e468', 'left', 700);

  // objective / alarm
  const obj = G.extractOpen ? 'EXFILTRATE — SW ROAD' : 'CRACK CARGO CRATES  ' + G.looted + ' / ' + G.crates.length;
  c.fillStyle = 'rgba(14,15,10,0.82)'; c.fillRect(SW - 262, 14, 248, 40);
  c.strokeStyle = 'rgba(190,200,150,0.35)'; c.strokeRect(SW - 261.5, 14.5, 247, 39);
  ftext(c, 'OBJECTIVE', SW - 250, 30, 10, '#8a8f6e');
  ftext(c, obj, SW - 250, 46, 13, G.extractOpen ? '#9fe08a' : '#e8e6d2', 'left', 700);
  if (G.alarmed) {
    const bl = 0.6 + 0.4 * Math.sin(G.t * 6);
    ftext(c, '⚠ ALARM', SW - 40, 78, 15, rgba('#e05038', bl), 'right', 700);
  }
  // note toast
  if (G.noteT > 0 && G.note) {
    c.globalAlpha = Math.min(1, G.noteT);
    c.fillStyle = 'rgba(12,13,9,0.78)'; c.fillRect(SW / 2 - 240, SH - 96, 480, 32);
    ftext(c, G.note, SW / 2, SH - 75, 14, '#e9e6cf', 'center', 700);
    c.globalAlpha = 1;
  }
  ftext(c, 'WASD MOVE · SHIFT SNEAK · MOUSE SHOOT · E TAKEDOWN / LOOT · R RELOAD', SW / 2, SH - 14, 11, 'rgba(200,200,170,0.45)', 'center');
  // extraction pointer
  if (G.extractOpen) {
    const e = scr(MAPD.extract.x, MAPD.extract.y, 0);
    if (e.x < 0 || e.y < 0 || e.x > SW || e.y > SH) {
      const a = Math.atan2(e.y - SH / 2, e.x - SW / 2);
      const bx = clamp(e.x, 40, SW - 40), by = clamp(e.y, 40, SH - 40);
      c.save(); c.translate(bx, by); c.rotate(a);
      c.fillStyle = 'rgba(140,230,150,0.9)';
      c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -9); c.lineTo(-8, 9); c.closePath(); c.fill();
      c.restore();
    }
  }
}
function drawPortrait(c, cx, cy, fem) {
  c.save(); c.beginPath(); c.rect(cx - 27, cy - 27, 54, 54); c.clip();
  c.fillStyle = '#3a3e2e'; c.fillRect(cx - 27, cy - 27, 54, 54);
  c.fillStyle = '#22251b'; c.fillRect(cx - 27, cy + 8, 54, 20);
  const spr = fem ? SPRITES.vf : SPRITES.vm;
  c.drawImage(spr.down[1], cx - 34, cy - 18, 68, 104);
  c.restore();
  c.strokeStyle = 'rgba(190,200,150,0.4)'; c.strokeRect(cx - 27.5, cy - 27.5, 55, 55);
}

// ================= BRIEFING / DEBRIEF =================
function panel(c, w, h) {
  const x = SW / 2 - w / 2, y = SH / 2 - h / 2;
  c.fillStyle = 'rgba(10,11,7,0.5)'; c.fillRect(0, 0, SW, SH);
  c.fillStyle = '#191a12'; c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(200,205,160,0.5)'; c.lineWidth = 1.5; c.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
  c.strokeStyle = 'rgba(200,205,160,0.2)'; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  return { x, y };
}
function drawBriefing(c) {
  const { x, y } = panel(c, 560, 380);
  ftext(c, 'NIGHT CITY: COMMANDOS', x + 40, y + 52, 26, '#e9e6cf', 'left', 700);
  ftext(c, 'OPERATION DEAD MAIL', x + 40, y + 78, 15, '#b7bd8e');
  c.fillStyle = 'rgba(200,205,160,0.25)'; c.fillRect(x + 40, y + 92, 480, 1);
  const rec = G.rec;
  const who = rec ? ('OPERATIVE: V ' + (rec.gender === 'f' ? '♀' : '♂') + '  ·  STREET CRED ' + rec.lvl + '  ·  €$' + rec.eddies.toLocaleString('en-US')) : 'OPERATIVE: V  ·  RUNNING COLD (NO CITY RECORD)';
  ftext(c, who, x + 40, y + 122, 14, '#d8d4ba', 'left', 700);
  if (rec) ftext(c, 'ARSENAL ' + rec.weapons + ' IRONS → ' + (rec.weapons > 14 ? 'CARBINE ISSUED' : 'PISTOL ISSUED') + (rec.kiroshi ? '   ·   KIROSHI OPTICS: PATROL CONES REVEALED' : ''), x + 40, y + 143, 12.5, '#9aa07c');
  const lines = [
    'Barghest runs stolen Militech cargo through an old freight',
    'depot on the coast road. Three crates still hold the good chrome.',
    '',
    '▸  CRACK ALL 3 CARGO CRATES inside the walled depot',
    '▸  Avoid the checkpoint — or don\'t. Bodies raise the alarm.',
    '▸  EXTRACT at the SW road end. Eddies bank to your record.',
  ];
  lines.forEach((ln, i) => ftext(c, ln, x + 40, y + 178 + i * 22, 13.5, i < 2 ? '#b9b49a' : '#d5d1b6', 'left', i < 2 ? 400 : 600));
  const bl = 0.55 + 0.45 * Math.sin(G.t * 2.6);
  ftext(c, '[ CLICK OR ENTER TO INSERT ]', x + 280, y + 344, 15, rgba('#9fe08a', bl), 'center', 700);
  if (G.mouse.click || G.pressed.has('Enter') || G.pressed.has('Space')) { G.mode = 'play'; beep(440, 880, 0.15, 'triangle', 0.08); }
}
function drawDebrief(c) {
  const ok = G.done === 'out';
  const { x, y } = panel(c, 520, 320);
  ftext(c, ok ? 'EXFILTRATED' : 'FLATLINED', x + 40, y + 56, 26, ok ? '#9fe08a' : '#e05038', 'left', 700);
  c.fillStyle = 'rgba(200,205,160,0.25)'; c.fillRect(x + 40, y + 72, 440, 1);
  const rows = [
    ['CRATES CRACKED', G.looted + ' / ' + G.crates.length],
    ['EDDIES LIFTED', '€$' + G.lootEddies.toLocaleString('en-US')],
    ['GUARDS DOWN', '' + G.kills],
    ['ALARM', G.alarmed ? 'RAISED' : 'NEVER SOUNDED'],
  ];
  rows.forEach((r, i) => {
    ftext(c, r[0], x + 40, y + 112 + i * 30, 13, '#9aa07c');
    ftext(c, r[1], x + 480, y + 112 + i * 30, 15, '#e8e5cd', 'right', 700);
  });
  ftext(c, ok ? (G.rec ? 'LOOT BANKED TO YOUR NIGHT CITY RECORD' : 'NO CITY RECORD FOUND — LOOT LOST TO THE VOID')
             : 'THE DEPOT KEEPS ITS SECRETS. TRAUMA TEAM DECLINED THE PICKUP.',
    x + 40, y + 246, 12.5, ok ? '#b8d49a' : '#c09088');
  const bl = 0.55 + 0.45 * Math.sin(G.t * 2.6);
  ftext(c, '[ CLICK OR ENTER TO RUN IT AGAIN ]', x + 260, y + 288, 14, rgba('#d5d1b6', bl), 'center', 700);
  if (G.mouse.click || G.pressed.has('Enter')) { loadRecord(); resetMission(); G.mode = 'play'; }
}
