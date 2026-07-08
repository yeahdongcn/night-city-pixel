# v3 REBUILD PLAN — Night City: Commandos, on a real engine

## Why the last three attempts failed

The visual bar is two Commandos: Behind Enemy Lines screenshots (walled compound
with corner towers / manor with obstacle yard). Their backgrounds were **pre-rendered
3D scenes**: real geometry, real sunlight, heavy surface texture, dense clutter.
Every failed attempt tried to reach that with hand-painted 2D canvas art — flat
fills, weak shadows, toy proportions. Painting at that level is an artist's job;
generating it is an engine's job.

## The fix — render actual 3D, live

**Engine: three.js 0.160** (vendored at `vendor/three.module.js`, ES modules via
importmap, no bundler — same stack as the cloudvale project, proven on this box
incl. headless-WebGL screenshots).

- **OrthographicCamera**, yaw 45°, pitch ≈ 50–55° — the Commandos axonometric view.
  Frustum sized so a human ≈ 50–60 px at 720p (close tactical camera).
- **Real sunlight**: warm DirectionalLight + PCFSoft 4096 shadow map over the play
  area, hemisphere sky fill, ACES tone mapping. Deep pooled shadows for free.
- **No flat colors anywhere**: every material gets a canvas-painted texture
  (grass drifts, dirt, rutted road, stone courses, brick, tile-by-tile roofs,
  planks) plus a bump map from the same painter for surface response.
- **Real geometry**: gabled buildings with chimneys/dormers, depot walls with
  corner towers, wire fences, telegraph poles, truck/cart, crate stacks,
  sandbags, tank traps, big lobed trees. Density is half the look.
- **Contact AO blobs** under everything + grime decals — pre-rendered feel.
- **View cones**: ground fan meshes, LOS-clipped by raycasts, green/amber/red.

## What survives (proven, invisible to the eye)

- The stealth sim from the last build (patrols → suspicion → alert → alarm →
  reinforcements, sneak, behind-takedown, hold-E loot, extraction) — ported as
  **pure plan-space logic** (`sim.js`/`map.js`, zero THREE imports) so the node
  smoke test still drives a full mission headless.
- The `ncpx2077_v1` record bridge: read gender/lvl/weapons/kiroshi as perks,
  write back eddies + kills read-modify-write, schema untouched.
- World units = plan px (map coords, speeds, ranges unchanged); the renderer
  just maps plan (x,y) → world (X,Z).

## Files

```
index.html          canvas + DOM HUD layers + importmap
vendor/three.module.js
js/main.js          boot, loop, input, camera rig, ground raycast picking
js/tex.js           canvas texture painters (+bump variants)
js/map.js           hand-authored map data + collision/LOS/raycast   [pure]
js/sim.js           stealth sim                                      [pure]
js/world.js         terrain/roads/buildings/walls/props/trees builders
js/actors.js        low-poly articulated humanoids + procedural walk
js/fx.js            cones, tracers, muzzle light, blood decals, bodies
js/hud.js           DOM HUD, briefing/debrief, record bridge
test/smoke.js       node-only full-mission drive on the pure modules
test/shot.js        headless WebGL screenshots (ANGLE/llvmpipe recipe)
```

## Milestones (each gated by screenshots vs the refs)

1. **M0** scaffold: renderer + camera + sun/shadows + textured ground → screenshot proves pipeline
2. **M1** static world: full map dressed & lit → iterate until frames read Commandos
3. **M2** actors + sim: patrols, cones, movement, combat
4. **M3** HUD + briefing/debrief + loot/extraction + record bridge
5. **M4** smoke green, screenshot suite, README, ship on port **35464** (new port = no stale cache)
