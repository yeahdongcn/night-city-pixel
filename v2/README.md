# NIGHT CITY — v2 (isometric / Diablo-style 2.5D)

**v2 is v1, re-skinned.** It is the *exact same game* as the shipped top-down build — all 39
weapons, iconics, 12 cars, 17 cyberware, bounties, cyberpsychos, shops, districts, weather,
airdrops, Dogtown, Jig-Jig, stealth, the economy — with **only the rendering changed** to a
true isometric (2:1 dimetric) Diablo-style camera, plus Diablo HUD touches (health orb, skill
hotbar, loot beams on weapon drops).

> Lives on the **`v2` branch**, separate from `main` (which serves at yeahdongcn.github.io).

## Saves carry over

v2 uses the **same save** as v1 (`localStorage` key `ncpx2077_v1`, identical format). A run
started in v1 continues in v2 and vice-versa, as long as both are opened from the same origin.

## How it works

The v1 simulation is already a flat world-pixel plane — movement, collision, AI, combat,
vehicles, weather, FOV all run in 2-D world coordinates. So going isometric is purely a
**rendering transform**:

- `iso.js` — 2:1 projection (`proj` / `invProj`), depth helpers, and the iso draw primitives
  (`isoGroundTile`, `isoBlock` for 3-D building blocks, `isoBill` for billboard actors).
- `game.js` — the `render()` function is overridden (later declaration wins) to: draw the
  ground as diamond tiles from `WORLD.t`, then **depth-sort** every building tile + prop +
  entity by `x+y` and paint back-to-front (so you walk behind/in front of buildings),
  then the additive glow/sign/holo passes, then the screen-space FX and HUD.
- Buildings rise as iso blocks with lit windows; enterable ones fade their walls (via the
  existing roof-fade alpha) so you see the interior when you step inside.
- `ui.js` — vitals re-skinned as a Diablo **health orb** + ability **skill buttons**; minimap,
  weapon card, messages, banners, shops and menus are v1 unchanged (they're screen-space).

Everything else is v1 verbatim. `node test/smoke.js` is v1's full-systems test and passes
against the iso build (every system works AND the new renderer runs headless without throwing).

## Run / test

```bash
cd v2 && python3 -m http.server 8080      # → http://localhost:8080
node test/smoke.js                        # full v1 systems, green
```
Debug URLs (inherited from v1): `?demo`, `?autostart`, `?charsel`, `?airdrop`, `?jigjig`, `&wx=fog` …

## Status / next

The whole game is playable isometrically. Polish still open: billboard cars are simple iso
shapes (could be proper iso car sprites), camera zoom/height tuning, and a fuller Diablo skill
bar. None of it touches systems — it's all rendering.
