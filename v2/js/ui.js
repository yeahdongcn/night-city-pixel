'use strict';
// ============ HUD + character/loot screen (Diablo-style) ============

function drawHUD(c) {
  const p = G.p;
  // health orb (bottom-left), energy orb (bottom-right)
  orb(c, 34, VIEW_H - 30, 26, p.hp / p.maxhp, '#c41028', Math.ceil(p.hp));
  orb(c, VIEW_W - 34, VIEW_H - 30, 26, p.energy / p.maxen, '#0a8aa0', Math.ceil(p.energy));

  // skill hotbar (center bottom)
  const slots = [
    { label: 'LMB', wpn: 1 },
    { label: 'Q', sk: 'sandevistan' },
    { label: 'F', sk: 'overload' },
    { label: 'E', sk: 'grenade' },
  ];
  const n = slots.length, sw = 34, gap = 4, total = n * sw + (n - 1) * gap, bx = VIEW_W / 2 - total / 2, by = VIEW_H - 40;
  for (let i = 0; i < n; i++) {
    const x = bx + i * (sw + gap), s = slots[i];
    c.fillStyle = 'rgba(8,10,16,0.85)'; c.fillRect(x, by, sw, 34);
    c.strokeStyle = '#2a3340'; c.strokeRect(x + 0.5, by + 0.5, sw - 1, 33);
    if (s.wpn) {
      const w = curWpn();
      c.drawImage(wiconOf(w), x + 4, by + 6);
      drawTextC(c, p.reloadT > 0 ? 'RELOAD' : p.mag + '/' + w.mag, x + sw / 2, by + 22, p.reloadT > 0 ? '#ff9f1c' : '#cfd6e4', 1);
      if (p.reloadT > 0) { c.fillStyle = '#ff9f1c'; c.fillRect(x + 2, by + 31, (sw - 4) * (1 - p.reloadT / w.rel), 2); }
    } else {
      const sk = SKILLS[s.sk], cd = p.skillCd[s.sk], ready = cd <= 0 && p.energy >= sk.cost;
      c.fillStyle = ready ? '#0e2230' : '#161616'; c.fillRect(x + 2, by + 2, sw - 4, 30);
      drawTextC(c, sk.name.slice(0, 7), x + sw / 2, by + 8, ready ? '#05d9e8' : '#5a6372', 1);
      drawTextC(c, sk.cost + ' EN', x + sw / 2, by + 18, '#3a5a66', 1);
      if (cd > 0) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x + 2, by + 2, sw - 4, (sw - 4) * (cd / sk.cd)); drawTextC(c, Math.ceil(cd), x + sw / 2, by + 14, '#fff', 2); }
    }
    c.fillStyle = '#06060a'; c.fillRect(x + 1, by - 8, textW(s.label) + 4, 8);
    drawText(c, s.label, x + 3, by - 7, '#8a93a6', 1);
  }
  if (p.sandT > 0) { c.fillStyle = 'rgba(0,255,159,0.06)'; c.fillRect(0, 0, VIEW_W, VIEW_H); c.fillStyle = '#00ff9f'; c.fillRect(0, 0, 2, VIEW_H); c.fillRect(VIEW_W - 2, 0, 2, VIEW_H); }
  if (p.hurtFx > 0) { const g = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, VIEW_W / 1.4); g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, 'rgba(255,0,30,' + (0.32 * p.hurtFx) + ')'); c.fillStyle = g; c.fillRect(0, 0, VIEW_W, VIEW_H); }

  // XP bar (very bottom edge) + level
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, VIEW_H - 3, VIEW_W, 3);
  c.fillStyle = '#f9f002'; c.fillRect(0, VIEW_H - 3, VIEW_W * (G.xp / xpFor(G.lvl)), 3);
  drawTextC(c, 'LV ' + G.lvl, VIEW_W / 2, VIEW_H - 12, '#f9f002', 1);

  // top-left: eddies + kills
  drawText(c, '€$' + fmt(G.eddies), 8, 8, '#f9f002', 1);
  drawText(c, 'KILLS ' + G.stats.kills, 8, 18, '#8a93a6', 1);
  drawTextR(c, 'ENEMIES ' + G.enemies.length, VIEW_W - 8, 8, '#ff5a7a', 1);

  // messages
  let my = VIEW_H - 70;
  for (let i = G.msgs.length - 1; i >= 0 && i >= G.msgs.length - 5; i--) { const m = G.msgs[i]; c.globalAlpha = Math.min(1, m.t); drawTextC(c, m.text, VIEW_W / 2, my, m.col, 1); c.globalAlpha = 1; my -= 10; }
  // banner
  if (G.banner) { const a = Math.min(1, G.banner.t * 2); c.globalAlpha = a; drawTextC(c, G.banner.text, VIEW_W / 2, 70, G.banner.col, 2); if (G.banner.sub) drawTextC(c, G.banner.sub, VIEW_W / 2, 90, '#cfd6e4', 1); c.globalAlpha = 1; }
  drawTextR(c, 'TAB: CHARACTER', VIEW_W - 8, VIEW_H - 14, '#5a6372', 1);
  // minimap
  drawMini(c);
}

function orb(c, cx, cy, r, frac, col, val) {
  frac = clamp(frac, 0, 1);
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.clip();
  c.fillStyle = '#0c0c12'; c.fillRect(cx - r, cy - r, r * 2, r * 2);
  const fh = r * 2 * frac;
  c.fillStyle = col; c.fillRect(cx - r, cy + r - fh, r * 2, fh);
  c.fillStyle = shade(col, 34); c.fillRect(cx - r, cy + r - fh, r * 2, 2);
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.4, r * 0.25, -0.6, 0, 7); c.fill();
  c.restore();
  c.strokeStyle = shade(col, -30); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); c.lineWidth = 1;
  drawTextC(c, '' + val, cx, cy - 3, '#fff', 1);
}

function drawMini(c) {
  const S = 56, mx = VIEW_W - S - 6, my = 22, sc = S / 30;
  c.fillStyle = 'rgba(6,8,14,0.7)'; c.fillRect(mx, my, S, S);
  c.strokeStyle = '#2a3340'; c.strokeRect(mx + 0.5, my + 0.5, S - 1, S - 1);
  const px = G.p.x, py = G.p.y;
  const plot = (wx, wy, col, sz) => { const dx = (wx - px) * sc + S / 2, dy = (wy - py) * sc + S / 2; if (dx < 1 || dy < 1 || dx > S - 1 || dy > S - 1) return; c.fillStyle = col; c.fillRect(mx + dx - (sz || 1), my + dy - (sz || 1), (sz || 1) * 2, (sz || 1) * 2); };
  // buildings (coarse)
  for (let j = (py - 15) | 0; j < py + 15; j++) for (let i = (px - 15) | 0; i < px + 15; i++) { if (i < 0 || j < 0 || i >= WORLD.W || j >= WORLD.H) continue; if (WORLD.height[j * WORLD.W + i] > 0) plot(i, j, '#2a2a38'); }
  for (const e of G.enemies) plot(e.x, e.y, e.elite ? '#bd00ff' : '#ff2a3c');
  for (const L of G.loot) plot(L.x, L.y, RAR_COL[L.it.rar], 1);
  plot(px, py, '#e8f6ff', 2);
}

// ---------- weapon icon ----------
const _wic = {};
function wiconOf(w) {
  if (_wic[w.id]) return _wic[w.id];
  const cv = mkCanvas(26, 12), c = cv.getContext('2d'); const col = KIND_COL[w.kind], body = '#dfe6f2', dk = '#8a93a6';
  c.fillStyle = body;
  const L = { pistol: 10, smg: 13, rifle: 18, tech: 17, shotgun: 16, sniper: 20, lmg: 17 }[w.cls] || 12;
  c.fillRect(3, 5, L, 2); c.fillStyle = dk; c.fillRect(3 + L - 2, 4, 4, 4); c.fillRect(8, 7, 2, 4); c.fillStyle = col; c.fillRect(3, 4, Math.min(8, L), 1);
  _wic[w.id] = cv; return cv;
}

// =================== CHARACTER / LOOT SHEET ===================
let _bpCells = [], _eqCells = [];
function drawChar(c) {
  c.fillStyle = 'rgba(0,0,0,0.72)'; c.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(c, 24, 18, 300, 324, 'V — CHARACTER', '#bd00ff');
  panel(c, 332, 18, 284, 324, 'STASH', '#05d9e8');
  // equipped
  _eqCells = [];
  let y = 44;
  for (const slot of SLOTS) {
    const it = G.equip[slot];
    c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(34, y, 280, 40);
    c.fillStyle = it ? RAR_COL[it.rar] : '#3a414e'; c.fillRect(34, y, 3, 40);
    drawText(c, slot, 42, y + 3, '#5a6372', 1);
    if (it) {
      drawText(c, itemLabel(it), 42, y + 12, RAR_COL[it.rar], 1);
      const aff = it.affixes.map(a => '+' + a.v + AFK[a.k].suffix + ' ' + AFK[a.k].name).join('  ');
      drawText(c, aff || (it.base ? 'NO AFFIXES' : ''), 42, y + 24, '#2ecc71', 1);
    } else drawText(c, 'EMPTY', 42, y + 16, '#3a414e', 1);
    _eqCells.push({ x: 34, y, w: 280, h: 40, slot, it });
    y += 46;
  }
  // aggregate stats
  const p = G.p;
  const stats = [
    ['DPS', Math.round(curWpn().dmg * curWpn().rof * p.dmgMult * p.fireMult * (1 + p.crit * (p.critDmg - 1)))],
    ['MAX HP', p.maxhp], ['ARMOR', p.armor],
    ['CRIT', Math.round(p.crit * 100) + '%'], ['CRIT DMG', Math.round(p.critDmg * 100) + '%'],
    ['MOVE', Math.round(p.speedMult * 100) + '%'], ['XP', Math.round(p.xpMult * 100) + '%'], ['HP/KILL', p.lifeOnKill],
  ];
  let sy = y + 4; drawText(c, '— STATS —', 42, sy, '#3a5a66', 1); sy += 12;
  stats.forEach((s, i) => { const col = 42 + (i % 2) * 140, row = sy + (i >> 1) * 12; drawText(c, s[0], col, row, '#5a6372', 1); drawTextR(c, '' + s[1], col + 132, row, '#e8f6ff', 1); });

  // stash grid
  _bpCells = [];
  const gx = 344, gy = 44, cw = 64, ch = 30, cols = 4;
  drawText(c, G.backpack.length + '/16 · CLICK TO EQUIP', gx, gy - 10, '#5a6372', 1);
  for (let i = 0; i < 16; i++) {
    const x = gx + (i % cols) * cw, yy = gy + ((i / cols) | 0) * ch, it = G.backpack[i];
    c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x, yy, cw - 4, ch - 4);
    if (it) {
      c.fillStyle = RAR_COL[it.rar]; c.fillRect(x, yy, cw - 4, 1);
      if (it.base) c.drawImage(wiconOf(WPN[it.base]), x + 3, yy + 3);
      else drawText(c, it.slot.slice(0, 3), x + 4, yy + 5, '#8a93a6', 1);
      drawText(c, RAR_NAME[it.rar].slice(0, 4), x + 3, yy + 18, RAR_COL[it.rar], 1);
      drawTextR(c, '' + it.score, x + cw - 7, yy + 18, '#9fb4c4', 1);
      _bpCells.push({ x, y: yy, w: cw - 4, h: ch - 4, i });
    }
  }
  drawTextC(c, 'TAB OR ESC TO CLOSE', VIEW_W / 2, VIEW_H - 12, '#5a6372', 1);

  // tooltip on hover
  const m = G.mouse;
  let hov = null;
  for (const cell of _bpCells) if (hit(m, cell)) hov = G.backpack[cell.i];
  for (const cell of _eqCells) if (cell.it && hit(m, cell)) hov = cell.it;
  if (hov) itemTooltip(c, hov, clamp(m.sx + 8, 0, VIEW_W - 130), clamp(m.sy, 8, VIEW_H - 80));
}
function hit(m, r) { return m.sx >= r.x && m.sx < r.x + r.w && m.sy >= r.y && m.sy < r.y + r.h; }
function itemTooltip(c, it, x, y) {
  const lines = it.affixes.length + 3, h = 14 + lines * 9;
  c.fillStyle = 'rgba(6,8,14,0.96)'; c.fillRect(x, y, 128, h);
  c.strokeStyle = RAR_COL[it.rar]; c.strokeRect(x + 0.5, y + 0.5, 127, h - 1);
  drawText(c, itemLabel(it), x + 4, y + 4, RAR_COL[it.rar], 1);
  drawText(c, it.slot + ' · ILVL ' + it.ilvl, x + 4, y + 14, '#5a6372', 1);
  if (it.base) drawText(c, 'DMG ' + WPN[it.base].dmg + ' · ROF ' + WPN[it.base].rof, x + 4, y + 24, '#cfd6e4', 1);
  let ly = y + (it.base ? 34 : 24);
  for (const a of it.affixes) { drawText(c, '+' + a.v + AFK[a.k].suffix + ' ' + AFK[a.k].name, x + 4, ly, '#2ecc71', 1); ly += 9; }
}
function charClick(mx, my) {
  const m = { sx: mx, sy: my };
  for (const cell of _bpCells) if (hit(m, cell)) { equipFromBackpack(cell.i); return; }
}
function equipFromBackpack(i) {
  const it = G.backpack[i]; if (!it) return;
  const cur = G.equip[it.slot];
  G.equip[it.slot] = it; G.backpack.splice(i, 1);
  if (cur) G.backpack.push(cur);
  recalc(); msg('EQUIPPED ' + itemLabel(it), RAR_COL[it.rar]); SFX.buy && SFX.buy();
}

function panel(c, x, y, w, h, title, col) {
  c.fillStyle = 'rgba(6,8,14,0.95)'; c.fillRect(x, y, w, h);
  c.strokeStyle = col; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 1, y + 1, w - 2, 14);
  drawText(c, title, x + 8, y + 5, col, 1);
}
