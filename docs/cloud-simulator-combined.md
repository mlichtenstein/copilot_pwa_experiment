<!--
Purpose: Design for the combined layered cloud simulator: layers, dynamics rules, shadowbox rendering, core integration, migration, phone budget and a first PR.
Consumers: Maxwell, contributors and reviewers planning the combined-simulator PRs (issue #72; behavior work under #74).
Dependencies: describes, without changing, apps/cloud-simulator/core/*.js, the weather-*.js prototype, the six #57 study models, weather-design.md and experiment-architecture.md.
-->
# Combined layered cloud simulator: design

Related to #72, #74, #68 and #57. This is a design, not an implementation. Nothing in it changes runtime behavior.

## Where we start

#72 was written before #75 merged. `main` now has a working prototype of most of this idea: **Weather layers** (`weather.html`, registered in `core/registry.js` as `weather`, nav "Combined layers").

- `weather-fields.js`: three distance planes (near 8 km, 24×15; middle 24 km, 32×20; far 65 km, 48×30). Each plane has `humidity`, `cloudWater` and `rain` grids plus a 12×6 lightning charge grid. A fixed 0.05 s tick runs in the order cloud supplier → rain → charge/channels.
- `weather-model.js`: an explicit `renderOrder`: sky → all light veils → far → middle → near (cloud body, rain, channel light, terrain) → terrain props. It reuses Horizon's `atmosphere-model.js`, Shafts' `visibility-model.js`/`shafts-model.js` and Lightning's `lightning-model.js`/`lightning-terrain.js`.
- `weather-inspection.js` / `weather-inspector.js`: a read-only field graph with live previews. Its edges are written by hand and checked by `weather-inspection.test.js`.
- `weather-design.md`: geometry, grid sizes, pass order, costs and known gaps (humidity is diagnostic, rain does not conserve water, charge is uncoupled).

So this design **grows Weather layers into the combined simulator** rather than starting a second framework. Where the prototype made a choice, the doc keeps it unless there is a reason to change it. Where the prototype only has a stand-in, the doc says what replaces it.

## 1. Layer model

A **layer** is one named grid field on one depth plane. Each field is declared once, the way `core/experiment.js` declares params:

```js
// A field declaration: data, not code. Planes allocate from it.
{ key: "cloudWater", units: "normalized 0..1", kind: "state", grid: "plane",
  boundary: "wrap-x", range: [0, 2], help: "Condensed water; feeds opacity, visibility, rain and charge." }
```

- **`kind`**:
  - `state` is carried between ticks and is part of the JSON-serializable scene, as in experiment-architecture.md principle 1.
  - `forcing` is recomputed each tick from the clock and seed, such as Noise's Perlin humidity, temperature and pressure slices.
  - `derived` is recomputed from other fields and never stored, such as capacity, relative humidity, opacity and the visibility mask.
- **`grid`**:
  - `plane` is the plane's native cloud grid. Its size comes from the plane's distance, so cells are roughly equal in km, as in Weather today.
  - `coarse` is a fixed small grid, like the 12×6 charge grid.
  - `column` is one value per floor column, for puddles.
  - `screen` is output resolution, used by render-only data such as the visibility coverage.
- **`boundary`**: `wrap-x` for horizontal scrolling (wind), `closed` for floor and lid (Convection), `open` for rain leaving the bottom.
- **Allocation**: the scene allocates `Float32Array`s from the declarations in `create()`. Rules never allocate. Weather's plain arrays move to typed arrays. The JSON snapshot turns them into number arrays, which keeps experiment-architecture.md's serialization promise.
- **Per-plane copies**: every plane gets the same field set at its own grid size. Rules run per plane, and cross-plane rules are explicit (see below). This is what Weather does: `layer.fields` is the same shape for each of `state.layers`.

### Candidate layers

| Field | Kind / grid | Comes from today | Notes |
|---|---|---|---|
| `temperature`, `buoyancy` | state / plane | `convection-model.js` | Only if a Convection plane ships; otherwise forcing from Noise |
| `vapor` (humidity) | state / plane | Noise `humidity` (forcing), Convection vapor (state) | Becomes a conserved budget once condensation is a rule; today a diagnostic in Weather |
| `pressure` | forcing / plane | `noise-model.js` Perlin slice | Raises or lowers capacity |
| `capacity`, `relativeHumidity` | derived / plane | `noise-model.js` | Never stored |
| `cloudWater` | state / plane | `weather-fields.js` supplier (bitmap × noise) | The one field every renderer reads |
| `rain` | state / plane | `weather-fields.js` `rainStep`, Noise rain charge/rain | Transport down; `open` bottom |
| `charge` | state / coarse 12×6 | `charge-field.js` via `lightning-model.js` | Coupled to cloudWater under #74 |
| `puddles` | state / column | Noise and Convection floors | Closes the water budget |
| `vorticity`, `streamFunction` | state / plane | `convection-model.js` | Convection plane only |
| `windOffset`, `evolution` | state / scalar | `weather-fields.js` | Shared by all planes, parallax by distance |
| `terrainHeight`, `clearance` | derived / column | `weather-fields.js` `terrainY`, `valley-model.js` clearance mask | Clearance drives orographic lift or suppression |
| `textureOpacity`, `textureShade` | derived / plane | `valley-textures.js`, `valley-sampling.js` | Optional supplier for cloudWater detail |
| `sky`, `transmittance`, `veils` | derived / coarse and screen | `weather-model.js` `buildWeatherLighting` | Render inputs, cached (section 6) |

## 2. Dynamics rules

A **rule** is a small coupling with declared reads and writes:

```js
{ id: "rain", reads: ["cloudWater", "rain"], writes: ["rain", "puddles"], params: ["rainAmount", "denseCloudWater"],
  step(plane, dt, p, scene) { /* mutate only plane.fields[writes] */ } }
```

- **Candidate rules**:
  - `forcing` writes the Noise slices.
  - `condensation` covers condense and evaporate (`noise-model.js`'s fast condense and slow edge evaporation, Convection's saturation adjustment).
  - `rain` covers source, fall, wind advection and puddles.
  - `advection` is the wind offset now, and the Convection flow later.
  - `convection` covers vorticity, stream function and lift (Convection plane only).
  - `terrain` applies Valley's clearance as lift or suppression.
  - `inversion` covers Convection's capped layer and LCL.
  - `charge` and `channels` come from the Lightning model, gated by cloud density.
- **Timestep**: keep Weather's fixed 0.05 s tick (20 ticks/s, the same as Noise's `TICKS_PER_SECOND`) with an accumulator. The host's catch-up is already capped at 250 ms (`core/clock.js` `MAX_FRAME_MS`). Rules that need a smaller step, like Convection at `1 / speed`, sub-step inside their own `step`. A rule never changes the scene's tick.
- **Ordering**: rules run in one declared list, using operator splitting.
  - A validator (a pure function plus a unit test) checks that every read is a forcing field, state from the previous tick, or written by an earlier rule in this tick.
  - It also checks that two rules writing the same field are adjacent and named in the list on purpose.
  - The same read and write sets **generate the inspector's field graph**. Today `weather-inspection.js` hand-writes the edges, so every coupling change has to edit the code and the graph together (#79 does both). Generating the edges keeps the graph matched to the code.
- **Stability**:
  - Each rule owns its caps. Convection's `maxSpeed: 0.24` px/tick is the CFL-style model.
  - Normalized fields clamp to their declared `range`.
  - Conserving rules (condensation, rain, puddles) publish a budget, and a test checks that vapor + cloud + rain + puddles stays constant within tolerance, as Convection's tests do now.
  - Blow-up tests run a **pinned list of seeds**, and print the seed when they fail. Today's `Math.random` seeds in `noise-model.test.js` and `convection-model.test.js` sometimes fail on `main`. The seed itself is incidental, so a failure must be reproducible.
- **Turning rules off**: each rule has one toggle param named by its code name (`ruleRain`, `ruleCharge`, …), shown in a "Rules" group with hold-to-see help.
  - When a rule is off, the `state` fields it writes **freeze** (they keep their last value and still render). `derived` fields still recompute.
  - The field graph dims the rule's edges, the way Weather's Layer toggles already skip rain and charge stepping for hidden planes.

## 3. Shadowbox rendering

- **Planes**: depth planes drawn back to front in Weather's `renderOrder`, with parallax from distance. The wind offset is divided by distance in `cloudIngredients`, and terrain is projected through one 58° camera shifted up by tan 8°. Every plane is lit from `frame.sun`, the shared figure-eight from `core/sun-path.js`, which Weather already uses.
- **2D slice sims on a plane**: a Noise or Convection vertical slice becomes the **cloudWater supplier** for one plane. The slice covers the plane's frustum cross-section from floor to lid, and its grid is resampled to the plane grid.
  - Start with one slice per plane, each with its own seed, so the planes differ.
  - A real 3D coupling between planes is out of scope. The only cross-plane data stays optical (veils from farther planes), as now.
- **Render rules** (each reads fields and writes into the current composite, never into state):

  | Render rule | Source | Pass |
  |---|---|---|
  | `sky` | Horizon `atmosphere-model.js` (`skyRadiance`, coarse 32×20 + bilinear) | 1 |
  | `veils` | Shafts `visibility-model.js` layered polygons | 2 |
  | `cloudBody` | Weather's per-plane opacity and direct sunlight (Horizon) | 3–5 |
  | `rainCurtain` | Noise's display-only curtains and streaks | 3–5 |
  | `channelLight` | `weather-model.js` `boltLight` | 3–5 |
  | `cumulusShape` | Convection's buoyancy mask, blur and feather (optional per plane) | 3–5 |
  | `terrain`, `props` | `weather-fields.js` `terrainY`, `lightning-terrain.js`; Valley's terrain-last order | 3–6 |

  Sunset's slab scattering stays a standalone study (section 5).
- **Resolution**: Weather draws at 160×100. The combined simulator should offer Convection's `size` switch, `64x48` (default, pixel art) and `128x96`, using the same `adjust()` link to `pixelArt`, and keep 160×100 only if Maxwell prefers it (open question).
  - The canvas fills the screen, and the host scales it with nearest-neighbour.
  - Dithering follows Convection's `pixelArt` ordered dither and Noise's 4-shade cloud palette.

## 4. Integration with the core

- **Contract**: it fits `core/experiment.js` unchanged, as the existing `weather` experiment, not a ninth registry entry, so the "Combined layers" nav, the rating app id `cloud-simulator/weather` and existing links stay put. The rule and field registries live in new cloud-simulator modules, not in `core/`. The core gains nothing until a second experiment needs the same registry.
- **Params**: the params stay a flat object, grouped by `group` per plane or rule ("Cloud fields", "Rules", "Light and weather", …), with help text on each control. Rule params are declared once on the rule and gathered into `weather.params`.
- **Drift**: `driftableParams` already picks every `range` param that isn't marked `drift: false`. Rule toggles, `size`, `view`/`inspectLayer` and `lightingMode` don't drift, and the physical rates drift slowly. `core/host-drift.test.js`'s expected list is the guard.
- **Rating bar and `?p=` links**: new params get defaults through `cleanParams`, so old links keep loading. A breaking rename uses `migrate(raw)` with a `version` field, as `lightning-experiment.js` does.
- **Random and Start from a random ❤️** (#76): Randomize keeps the rule toggles (`randomize: false`, like Weather's layer toggles), so a random scene stays within the same rule set. A ❤️ start loads the whole rated object, toggles included.

## 5. Migration

| Study | Becomes | Why |
|---|---|---|
| Noise weather | Preset: `forcing` + `condensation` + `rain` + puddles on one plane | Cheap (~10 ms) and already field-based |
| Lightning | Preset: `charge` + `channels` with cloud gating | Already reused by Weather |
| Light shafts | Render rule `veils` (already reused) | Page stays as a study of geometric vs layered shadows |
| Horizon light | Render rule `sky` + `cloudBody` lighting (already reused) | Page stays for its full-resolution atmosphere |
| Convection | Stays standalone; optional `cumulusShape` render rule and a later 64×48 plane | Boussinesq solve is its own study; ~5 ms, so it fits later |
| Valley textures | Optional texture supplier for `cloudWater` and terrain clearance | Photo loading costs first-paint time |
| Sunset | Stays standalone | Slab scattering needs a different geometry and sample budget |

Existing pages, registry entries and rating app ids don't change. Model code is reused through adapter functions first, the way Weather calls `lightning-model.js`. A model is split into rules only when a second consumer needs one part of it.

## 6. Phone performance budget

Measured on this box in Node (8-core Xeon, not a phone), on `main`'s Weather at 160×100 with default params:

| Stage | Interpolated | Full resolution |
|---|---|---|
| One 0.05 s tick (`stepWeather`) | ~0.5 ms | ~0.5 ms |
| Lighting (`buildWeatherLighting`) | ~88 ms | ~520 ms |
| Drawing (`renderWeather`) | ~43 ms | ~38 ms |

The issue's figures for the studies: Horizon ~105 ms, layered Shafts ~150 ms, Noise ~10 ms, Convection ~5 ms per frame.

- **Target**: at 64×48 on a mid-range phone, keep ≤ 4 ms of dynamics per displayed frame and ≤ 16 ms of lighting plus drawing. Draw at most 4 images per second while playing (Weather's `frameInterval: 250`). The dynamics can then keep 20 ticks/s, while drawing stays close to the current images-per-second.
- **How to get there**, in order of payoff:
  - Re-light only when the sun moves by more than a small phase step, or when cloudWater changes by more than a threshold. Weather already caches lighting while paused.
  - Compute veils at 64×48 instead of 160×100.
  - Keep `lightingMode` interpolated by default.
  - Thin the planes at 64×48: the far plane drops to 24×15.
  - Treat `cumulusShape` and texture suppliers as optional fallbacks that turn themselves off.
- **Measure and show**: Weather's `stats` line already reports median/p95 for dynamics, lighting, drawing and inspection. Keep it, and add a per-rule breakdown in the inspector. Phone numbers must come from a real device run recorded in the PR. Node numbers aren't evidence for phones.

## 7. Open questions and first PR

**Questions for Maxwell**

1. One 2D slice per plane, or several planes sharing one simulated slice with depth offsets?
2. How much physics? Conserved vapor/condensation (Noise-style) is cheap. Convection's flow is a separate step up.
3. Default output: `64x48` pixel art, `128x96`, or keep Weather's 160×100?
4. Which rules ship first after the #74 couplings (dense-cloud rain and charge)? Puddles? Terrain lift?
5. Should rule toggles be randomizable, so Random explores rule sets, or fixed as proposed?

**Proposed first implementation PR (small, visible)**

"Weather rules declare their reads and writes":

- Turn `weather-fields.js`'s fixed tick body (supplier → rain → charge) into a three-entry rule list with `reads` and `writes`.
- Add a pure validator and its test.
- Generate `weather-inspection.js`'s same-plane edges from the list instead of hand-writing them.
- No new fields, no visual change except graph edges that already match the code. Replay tests (same seed, same pixels) prove behavior is unchanged.
- **After that**: the `ruleRain` and `ruleCharge` toggles, then the `size` switch at 64×48, then a Noise-forcing supplier on the near plane.
