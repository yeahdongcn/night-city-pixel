# NIGHT CITY — v3 (tactical / Commandos-style fake 3D, realistic — no pixel art)

**Presentation:** unlike v1/v2 this edition is *not* pixel art. Logic stays 640×360, but the
backing store renders up to 3× denser with smooth sampling; the ground/facades/actors are baked
2–3× dense; text is real typography (system fonts via `fillText`, still zero-dep); the CRT
scanlines and pixel cursor are gone (cinematic vignette + vector pointer instead).

**v3 is v1, re-skinned — again.** The *exact same game* as the top-down and isometric builds —
all 39 weapons, iconics, 12 cars, 17 cyberware, bounties, cyberpsychos, shops, districts,
weather, airdrops, Dogtown, Jig-Jig, stealth, the economy — with **only the rendering changed**
to a Commandos-style *military projection*: the city plan rotated 45° with **no foreshortening**
(the classic "impossible camera" of Commandos: Behind Enemy Lines), buildings extruded straight
up, and the whole ground **pre-rendered** once with realistic asphalt, curbs, crosswalks, neon
spill and **baked long shadows** — then rotate-blitted every frame like a pre-rendered backdrop.

> Lives on the **`v3` branch**. `/` on the branch is still v1; `v2/` the isometric build.

## Saves carry over

v3 uses the **same save** as v1 and v2 (`localStorage` key `ncpx2077_v1`, identical format).
Level 25 in one edition is level 25 in all three, as long as they're served from one origin.

## How it works

Military projection is a *pure rotation* (det = 1): `screen = rotate45(plan) − z·up`. That one
property does most of the work:

- **`mil.js`** — the projection (`proj`/`invProj`, same API the sim seam already uses), plus
  everything baked at first frame: the 2048² realistic ground plan (per-tile asphalt/concrete
  coats, lane paint, zebra crossings, manholes, puddles with neon rims, tree canopies, wrecks,
  street-light pools, per-theme shop interiors, district color grading, and building shadows
  projected from a fixed NW key light), per-building **facade textures** (window grids, AC
  units, pipes, storefronts, roll-up doors, graffiti, neon trim) and **roof canvases**
  (parapets, vents, water tanks, blinking antennas), and painterly ~18px actors with
  realistic proportions.
- **`game.js`** — `render()` overridden: blit the visible slice of the baked plan under a 45°
  rotation, draw live plan-space bits in the same transform (water sparkle, puddle shimmer,
  Commandos-style **view cones**, headlight beams), then depth-sort whole building rects +
  mountains + actors by `wx+wy` and paint back-to-front. Facades land on their slanted quads
  via one `setTransform` each — no per-tile columns. Blood decals and bloody tire tracks bake
  into the *tactical* ground (`worldCtx()` override), so gore persists in the new art too.
- **Ghosting** — a building only fades when an actor's sprite actually overlaps its front
  silhouette (wall-base line sampled at the actor's screen x), so walking past a facade never
  X-rays the block; indoor vendors/loot stay hidden until the roof actually lifts.
- **Cars** — in a pure-rotation projection a car is a *top-down painting rotated rigidly* plus
  a screen-up body lift: per-shape silhouettes, glasshouse gradients, hood speculars, mirrors,
  stripes. Every heading looks right by construction (no wheel-visibility case analysis).
- **`ui.js`** — op-briefing title over the real city map (rotated, radar-swept, objective
  reticles on live POIs), tactical vitals plate, and a circular **radar minimap** rotated 45°
  so its north matches the camera.

## Debug URLs (double as screenshot hooks)

`?demo` action scene · `?carspin` driving w/ headlight beams · `?cones` Kiroshi view cones on
an unaware patrol · `?doorstep` interior reveal · `?edge` coast · `?mtn` badlands ·
`?cargrid[&car=id]` one car at 12 headings · `?charsel` operative select.

## Test

```bash
node test/smoke.js   # v1's full-systems gate driving this renderer headless
```
