# NIGHT CITY: COMMANDOS (v3)

A from-scratch, Commandos-style stealth mission set in Night City's outskirts.
**Zero code is shared with v1/v2** — new engine, new art, new UI, one hand-crafted
map — the only link is the shared record: it **reads** `localStorage` key
`ncpx2077_v1` (V's gender, street cred, arsenal, Kiroshi optics become mission
perks) and on a successful extraction **writes back** eddies and kills with a
read-modify-write that leaves the v1/v2 save schema untouched.

## The mission — OPERATION DEAD MAIL

Barghest runs stolen cargo through a walled freight depot on the old coast road.
Crack the 3 cargo crates, then reach the SW extraction. A checkpoint with a boom
barrier guards the road; patrols sweep the depot yard; the farmstead porch has eyes.

- **WASD** move · **SHIFT** sneak (quieter, harder to spot)
- **Mouse** aim/shoot (loud — everyone within earshot comes running)
- **E** silent takedown from behind · hold **E** to crack crates
- **R** reload
- Guard view cones are drawn on the ground, **clipped by real line-of-sight**
  (walls and buildings cut them — classic Commandos). Suspicion turns them
  amber, alert turns them red; two alerted guards raise the alarm and
  reinforcements arrive. Kiroshi optics on your record reveal calm cones too.

## Tech (fresh, zero-dep)

- `boot.js` — fullscreen dpr-aware canvas, loop, input, 45° military projection
- `paint.js` — the whole look: painterly terrain baked once in plan space
  (grass drifts, dirt aprons, rutted roads, furrowed fields, soft SE shadows),
  buildings baked as complete sprites (gabled tile/slate roofs, chimneys,
  ivy, shuttered windows, striped awnings), lobed tree crowns, props
  (crate depots, barrels, tank traps, wagon, spool, boom barrier), 3×-baked
  46px actors with 4-phase walk
- `map.js` — one hand-composed map + rect/segment collision, LOS, cone raycasts
- `sim.js` — patrols, suspicion→alert→alarm, combat, takedowns, loot, extraction
- `ui.js` — dossier briefing / operative HUD / debrief + the record bridge

## Test

```bash
node test/smoke.js   # headless: record perks, vision, takedown, loot, extraction, write-back, death
```
Debug: `?play` skips the briefing · `?play&at=gate|checkpoint|farm|depot|insert`.
