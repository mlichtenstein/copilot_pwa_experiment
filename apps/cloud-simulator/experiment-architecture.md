<!-- Purpose: Define the next-round experiment contract and its first test case.
     Consumers: experiment authors and reviewers. Dependencies: experiment-session.js, lightning-experiment.js, core/host.js, lightning-model.js, and weather-experiment.js/weather-fields.js as the second test case. -->
# A scene module and a browser host

The first library explored effects with independent page controllers. Round two tests a small module contract, beginning with Lightning. This is separate from #68's integration/player work: existing experiments are not migrated in this PR.

## Design principles

1. **State describes the scene now.** Store geometry, phase, clock and random-generator state as plain JSON data. No DOM, canvas or hidden random globals belong in it. Seed plus the same steps/settings yields the same sequence; a serialized state can continue exactly.
2. **Dynamics change state; rendering reads it.** A scene's fixed-step rule mutates only its own state. Rendering returns pixels without moving the simulation or consuming randomness. Illumination parameters can redraw an unchanged channel.
3. **Parameter metadata is canonical.** Each parameter declares key/default/min/max/step/description once. The session normalizes inputs, the host generates controls, and presets share the same values. A parameter change affects subsequent steps/redraws. (The old host's Reset, default parameters on the same seed, is replaced by the common Randomize.) Numeric seeds are not UI controls; fresh setups choose random internal seeds.
4. **The host owns time and presentation.** One generic host (now the shared `core/host.js`) handles play/step, Randomize and Drift, seeds, frame scheduling, visibility changes, parameter controls, rating/preset hooks and canvas fitting. It has no conditional logic for a particular weather effect. Catch-up is capped at 250 ms; background time is discarded.
5. **Resolution and cost are explicit.** Each scene declares native width/height and dt. Display enlargement does not change simulation stepping. The host reports render milliseconds. Separate CPU/GPU timing and multiple resolutions remain future experiments, not abstractions invented ahead of evidence.

## Contract

| Member | Responsibility |
| --- | --- |
| `id`, `title`, `width`, `height`, `dt` | Scene identity, native image size and fixed simulation step in seconds |
| `parameters[]` | Numeric parameter schema with nearby control descriptions |
| `create({seed, params, start}) → state` | Reproducible JSON-serializable initial scene |
| `step(state, dt, params)` | Advance scene dynamics; no DOM or rendering |
| `render(state, params) → Uint8ClampedArray` | Read-only RGBA, exactly width × height × 4 bytes |
| `starts[]`, `defaultStart` (optional) | Named paused starting points; lightning-experiment.js turns them into buttons in the experiment's own section, each preparing a fresh setup on a new seed |
| `actions[]` (optional) | Named scene commands; description, `run(state,params)` and optional explicit playback on click |

`experiment-session.js` is a DOM-free coordinator. Lightning first had its own browser host (`experiment-host.js`); it now runs on the shared core host (`core/host.js`) like every other experiment, so it gets the common panel (Play, Step, Randomize, Drift, New seed), the rating bar and `?p=` links. `lightning-experiment.js` is the adapter: it turns `parameters[]` into core range params, keeps the seed and starting mode as hidden params, maps `starts[]` to the experiment's own buttons, drives the session from the shared clock (Play advances it in fixed `dt` steps; Step is one step) and converts old `{version: 1, seed, params, start}` ratings and links (`migrate`). `lightning.js` only mounts it. Session tests include a tiny counter-field scene with another resolution, schema and action. This tests decoupling, not broad physics reuse.

Ratings and `?p=` links now store the core host's flat params (the ten sliders, `seed`, `start`, Drift); the session's `getParams`/`applyParams` shape (`{version: 1, seed, params, start}`) is still accepted when loading. Presets store the internal seed, parameters and starting mode and restart that mode; they do not capture the exact current animation frame. Full-state continuation is verified at model level but has no save/load UI yet. Rating backend availability is independent of scene playback.

## Lightning: first pressure test

Three scene-owned far/middle/near records each hold fixed cloud density, a 12×6 charge-potential proxy, its random state, channel graph and flash state. Quiet layers advance stochastic drift, relaxation and diffusion every 0.1 seconds. chargeBias adds a tunable signed mean to buildup inside the chargeRate multiplier; either polarity can favor neutral-ground connections, while zero bias preserves unbiased evolution. Regional potential difference divided by separation selects a cloud/ground or opposite-sign cloud/cloud target when it exceeds breakdownGradient. A seeded direction score grows toward that target; short branches attach to existing nodes. Connection marks the ancestor path, discharges the layer (especially the path neighborhood), flashes, then resumes field evolution. No global strike timer exists. Each layer evolves independently.

Next shape and Before strike prepare just one naturally triggered event, at flash peak or immediately before growth. Other layers retain their own quiet fields. Preparation uses unit buildup when live chargeRate is zero, then live quiet potentials freeze. Starting modes remain scene metadata, without host conditionals. Render composites each depth’s clouds/channel/opaque terrain in order. Ground connections light a small local patch only on their own terrain; cloud connections have no terrain pool. Fixed seeded trees/rocks belong to each depth’s terrain. A low point light at a ground contact projects shadows away from prop footprints on that depth’s ground plane; the wider local pool and its shadow contrast fade with the flash. Props use a separate seeded generator so they do not change charge or channel randomness. Foreground hills occlude farther light.

Charge is a normalized artistic potential proxy; no Poisson solve, charge conservation, physical units, polarity-specific leaders, streamers, thunder or volumetric shadow transport is claimed. Cloud-to-cloud means between regions in the same depth’s cloud band, not between depth planes. The scene owns these records; a generic ECS/layer manager is still unnecessary.

## Weather layers: second pressure test

Weather layers (#74, `weather-experiment.js`, `weather-fields.js`, `weather-model.js`) is the first later experiment that reuses another module rather than standing alone. It meets `core/experiment.js` directly, not `experiment-session.js`. It shows these concrete limits in the contract as it stands on `main`:

1. **Reuse happens below the scene contract.** Weather doesn't create a Lightning scene and composite its `render()`. Instead, it:
   - takes one record from `createLightning(...).layers` into each of its own layers;
   - empties that record's `clouds`/`objects`;
   - advances it with a one-layer stand-in scene, `stepLightning({time, layers:[layer.lightning]}, …)`;
   - warps the channel geometry from Lightning's ground profile into its own camera (`mapBolt`).

   The contract has no unit smaller than a whole scene. A reusable per-layer component (state record + step + draw-into-pass) is the missing piece.
2. **Two contracts coexist.** Lightning uses the session contract above (`parameters[]`, `create/step/render` on JSON state), adapted by `lightning-experiment.js`. Weather writes a `core/experiment.js` instance by hand. Only Lightning gets the session's `starts[]` and `actions(state)`. Weather uses the core's `actions(page)` instead.
3. **The schema can't say what a param invalidates.** Weather keeps `fieldKeys` and `lightingKeys` lists in `update()` to decide whether to refresh fields or drop the lighting cache. If a new param affects lighting but is left off `lightingKeys`, the picture silently goes stale until the next tick. An `affects` tag on each param (for example `fields`, `lighting`, `draw`) would let one generic rule replace the per-experiment lists.
4. **There's no notion of which state a derived product depends on.** Any tick drops the lighting cache (`if(changed)maps=null`), so while playing, every image rebuilds lighting (about 90 ms of about 130 ms per image at 160×100 interpolated, in Node on the agent box). The sun change is detected by comparing `frame.sun` fields inside `render()`. The contract has no "sun changed" or "fields changed by more than ε" signal for caching.
5. **Inspection hangs off the instance outside the contract.** The field graph needs `instance.preview(view, layer)`, `instance.onImage` (set by `weather.js` after mounting) and `instance.describe()`. None of these is a contract member. The graph's edges are also hand-written in `weather-inspection.js`, so a coupling change has to edit the code and the graph together.
6. **The parameter schema grew in the core, not in the session.** Weather needed radio selects, toggles excluded from Randomize, groups and a hidden seed. All of these are `core/experiment.js` features (`PARAM_KINDS`, `randomize: false`, `group`). Session `parameters[]` is still numeric-only, so a session scene can't declare them.
7. **Replay is still settings-only.** As with Lightning, the weather state is JSON-serializable, and continuation is tested (`weather-model.test.js`). Links restart at t=0, and there is no live-moment snapshot.

## Open limits to test next

- Shared composition across different effect modules: partly tested by Weather. Composition works, but only by reaching into Lightning's per-layer records (Weather limit 1).
- State migrations/versioning beyond parameter preset version 1: still untested. Weather relies on `cleanParams` defaults and the host's sun-phase migration.
- A richer parameter schema: enums and groups now exist in `core/experiment.js` (Weather limit 6). Vectors, multiple resolutions per scene and invalidation tags (Weather limit 3) are still missing.
- Shared lighting inputs: Weather consumes the host's `frame.sun` and Horizon's atmosphere helpers. Stable caching across sun and field changes is still per-experiment (Weather limit 4).
- A per-layer component contract and generated field graphs: proposed in the #72 design doc (PR #80).
