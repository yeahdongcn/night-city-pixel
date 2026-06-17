'use strict';
// ============ sprite registry (built once at boot) ============
const SPR = { player: null, tiles: {}, crate: null, tree: null, _enemy: {}, _wallPal: [] };

function buildSprites() {
  SPR.player = makeActor({ H: '#1b1b28', S: '#e8b88a', E: '#05d9e8', J: '#16323f', T: '#05d9e8', P: '#23232c', B: '#101014' });
  // ground tiles by type
  SPR.tiles[0] = tileSprite('#15151c', '#1b1b24');   // street
  SPR.tiles[1] = tileSprite('#23232e', '#2c2c38');   // sidewalk
  SPR.tiles[2] = tileSprite('#1d1d28', '#26263200');  // plaza
  SPR.tiles[3] = tileSprite('#16271b', '#1d3324');   // park
  // building wall palettes (varied per building)
  SPR._wallPal = [
    { top: '#33333f', lt: '#262630', dk: '#181820' },
    { top: '#383040', lt: '#2a2434', dk: '#1a1622' },
    { top: '#2c3440', lt: '#222a34', dk: '#161c24' },
    { top: '#3a3340', lt: '#2c2632', dk: '#1c1822' },
  ];
  // crate (small iso box)
  {
    const cv = mkCanvas(14, 16), c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(7, 14, 6, 2.5, 0, 0, 7); c.fill();
    drawIsoBlock(c, 7, 2, 0.7, '#5a4632', '#46341f', '#2f2415');
    c.fillStyle = '#f9f002'; c.fillRect(6, 6, 2, 2);
    SPR.crate = cv;
  }
  // tree (billboard)
  {
    const cv = mkCanvas(16, 22), c = cv.getContext('2d');
    c.fillStyle = '#2a1c12'; c.fillRect(7, 14, 2, 8);
    c.fillStyle = '#1d4030'; c.beginPath(); c.ellipse(8, 9, 7, 8, 0, 0, 7); c.fill();
    c.fillStyle = '#2a5a40'; c.beginPath(); c.ellipse(6, 7, 3, 3, 0, 0, 7); c.fill();
    SPR.tree = cv;
  }
}

SPR.enemyAx = function (type, col) {
  if (!this._enemy[type]) this._enemy[type] = makeActor(col);
  return this._enemy[type];
};
SPR.wallAt = function (i, j) {
  // stable per-building-ish variation via coarse hash
  const k = (((i / 6) | 0) * 31 + ((j / 6) | 0) * 17) & 3;
  return this._wallPal[k];
};
