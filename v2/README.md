# NIGHT CITY: DIABLO EDITION — v2 (isometric ARPG)

A from-the-ground-up **2.5D isometric** reimagining of Night City — Pixel Edition as a
**Diablo-style action RPG**. Same cyberpunk soul (your weapons, gangs, the neon city),
now viewed through a true isometric camera with hordes, loot beams, and an affix grind.

> This lives on the **`v2` branch** and is fully separate from the shipped top-down game on
> `main` (which still serves at yeahdongcn.github.io). Nothing here touches the live build.

## Run / test

```bash
cd v2 && python3 -m http.server 8080      # → http://localhost:8080
node test/smoke.js                        # headless sim of every system
```
Debug URLs: `?demo` (spawns a horde + loot), `?demo&char` (opens the character sheet).

## What's in it

- **True isometric engine** — the sim runs on a flat tile plane; the renderer projects it
  to a 2:1 diamond grid. Buildings rise as 3-D blocks with lit windows; everything is
  depth-sorted (you walk behind buildings, in front of others), with blob shadows.
- **Your controls, kept** — WASD moves along the iso axes, mouse aims, LMB fires, Space dashes.
- **Diablo HUD** — red **health orb** (bottom-left), cyan **energy orb** (bottom-right),
  **skill hotbar** (LMB weapon + Q/F/E abilities with cooldowns), XP bar, minimap.
- **ARPG loot grind** — enemies drop gear with **colored loot beams** by rarity
  (common → iconic). Items roll **random affixes** (% damage, crit, max HP, move speed,
  HP-on-kill, …). Walk over loot to grab it; better gear auto-equips, the rest goes to your
  **stash** (TAB) where you compare tooltips and click to equip. Three slots: WEAPON / ARMOR / IMPLANT.
- **Skills** — Q **Sandevistan** (time dilation), F **Overclock** (EMP nova), E **Frag Grenade** (lobbed AoE).
- **Hordes & elites** — endless scaling waves; periodic **elite** packs with affixes
  (JUGGERNAUT / VOLATILE / SWIFT / VAMPIRIC) that drop far better loot.
- **Progression** — XP/levels raise your base power; gear drives the rest. Eddies + health/energy globes drop.

## Deferred (next iterations)

The top-down v1's deeper systems aren't ported yet: vehicles, the full cyberware tree,
shops/economy, weather, airdrops, Dogtown/Jig-Jig, and mobile touch controls. The v2 core
is the foundation; these get layered on the same way v1 was built up.

## Architecture

Vanilla JS, zero deps, procedural art/audio (same rules as v1). Load order:
`font · data · sfx · iso · sprites · world · ui · game`.
- `iso.js` — projection math (`isoX/isoY`, `screenToWorld`, `drawIsoBlock`) + iso sprite builders.
- `world.js` — tile + height city grid (deterministic seed).
- `game.js` — sim, ARPG loot/affixes, skills, depth-sorted render pipeline.
- `ui.js` — orbs, skill bar, character/stash sheet.

Sim is input-agnostic and screen-agnostic: it's a flat-plane world, so the isometric look is
purely a rendering transform — which keeps collision, AI, and combat simple.
