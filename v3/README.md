# NIGHT CITY — v3 (Commandos-style tactical edition, rebuilt)

**v3 is a REBUILD, not a reskin.** After two render-only attempts, this edition got a new
"engine": a new world generator and all-new art, modeled directly on *Commandos: Behind
Enemy Lines* screenshots. Only the **game logic** carries over — every system (39 weapons,
iconics, 12 cars, 17 cyberware, bounties, cyberpsychos, shops, stealth FOV, weather,
airdrops, the economy) and the **shared save** (`localStorage` key `ncpx2077_v1`, same
format as v1/v2 — your records carry across editions on one origin).

## The world (new)

No city grid. The map is Night City's outskirts, Commandos-style: three lazy roads curve
across open dirt-and-grass country; ~14 walled or wire-fenced **compounds** hug the routes
(the five shops among them — Afterlife, 2nd Amendment, Vik's Clinic, NC Autofixer, CLOUDS),
each with a paved yard, gabled or shed-roofed buildings, gates, crate depots, barrels,
containers, cable spools and barriers; gang dens hide in the warehouses; big billowy trees,
hedgerows, crop fields, wrecks and lamp posts dress the country; a noisy coast walls the W/S
and a rocky ridge the N/E. Same fixed seed → deterministic map; the save's position falls
back to spawn if it predates the rebuild.

## The look

- **Camera**: military projection (45°-rotated plan, no foreshortening) at 2.25× — the
  classic Commandos view, one compound fills the screen, ~45px characters.
- **Terrain**: baked painterly plan — packed dirt with fine grain, ragged grass meadows,
  aged-concrete yards, stroked roads with wheel ruts and potholes, furrowed fields, sea
  with foam and sun glitter. No tile boundary is ever visible.
- **Buildings**: low, pitched — terracotta/slate **gabled roofs** (tile courses, ridge caps,
  chimneys, moss) with wall-pediment gable ends, or corrugated mono-pitch sheds; stucco and
  stone facades with sky-glass windows, striped shop awnings, roll-up doors, drainpipes,
  AC units and small gang tags. Enterable buildings still fade to their furnished interiors.
- **Light**: soft overcast key from the NW, short SE shadows, heavy contact AO — the
  richness lives in texture, not sun drama (exactly like the refs).
- **Stealth**: view cones are big **solid Commandos green/orange sectors** on the ground.
- Walls show masonry joints and weathered coping; wire fences are posts + sagging runs that
  block movers but not bullets or sight — cover matters.

## Test / debug

```bash
node test/smoke.js   # the full-systems gate, green against the rebuilt map
```
`?autostart` spawn yard · `?cones` suspicious patrol · `?carspin` parked ride ·
`?doorstep` interior reveal · `?cargrid` cars at 12 headings · `?wx=clear` force weather.
