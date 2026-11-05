<!-- Purpose: Point to the shared experiment contract (core/experiment.js), summarise its rules, and record its first test case.
     Consumers: experiment authors and reviewers. Dependencies: core/experiment.js (the contract), core/host.js, core/sun-path.js, core/moon-path.js,
     docs/cloud-simulator-combined.md, experiment-session.js, lightning-experiment.js and lightning-model.js. -->
# A scene module and a browser host

The first library explored effects with independent page controllers. Round two tested a small module contract, beginning with Lightning. Every experiment now runs on the shared core host under one contract, below.

## Design principles

1. **State describes the scene now.** Store geometry, phase, clock and random-generator state as plain JSON data. No DOM, canvas or hidden random globals belong in it. Seed plus the same steps/settings yields the same sequence; a serialized state can continue exactly.
2. **Dynamics change state; rendering reads it.** A scene's fixed-step rule mutates only its own state. Rendering returns pixels without moving the simulation or consuming randomness. Illumination parameters can redraw an unchanged channel.
3. **Parameter metadata is canonical.** Each parameter declares key/default/min/max/step/description once. The session normalizes inputs, the host generates controls, and presets share the same values. A parameter change affects subsequent steps/redraws. (The old host's Reset, default parameters on the same seed, is replaced by the common Randomize.) Numeric seeds are not UI controls; fresh setups choose random internal seeds.
4. **The host owns time and presentation.** One generic host (now the shared `core/host.js`) handles play/step, Randomize and Drift, seeds, frame scheduling, visibility changes, parameter controls, rating/preset hooks and canvas fitting. It has no conditional logic for a particular weather effect. Catch-up is capped at 250 ms; background time is discarded.
5. **Resolution and cost are explicit.** Each scene declares native width/height and dt. Display enlargement does not change simulation stepping. The host reports render milliseconds. Separate CPU/GPU timing and multiple resolutions remain future experiments, not abstractions invented ahead of evidence.

## Contract

Every experiment, Lightning included, now follows one contract: the experiment module and instance described at the top of [`core/experiment.js`](core/experiment.js), which `validateExperiment` and `validateInstance` check and [`core/host.js`](core/host.js) runs. That comment is the reference; this file does not repeat it. Its words (fields, rules, render passes, lights, evolve then draw) are defined in [the cloud simulator common language](../../docs/cloud-simulator-combined.md) (added in #80). In short:

- **The frame carries the sky lights.** `step(dt, frame)` and `render(frame)` get `frame = { time, sun, moon }`, all on the shared clock (`core/sun-path.js`, `core/moon-path.js`). Experiments light from these and never work out their own sun or moon.
- **Scene lights report their brightness.** An instance that draws its own light (a lightning flash) returns it from `selfLight()`, so the host's night step spares it.
- **Evolve, then draw.** `step` is the only place the simulation changes or draws random numbers, from the seed; `render` reads state and the frame. The same seed and steps give the same picture.
- **Params are declared once.** The params schema drives controls, Randomize, Drift, ratings and `?p=` links. A param may declare `affects` (`fields`, `lighting` or `draw`), and the experiment's caches follow `paramsAffecting` instead of hand-kept key lists.

Lightning keeps a smaller scene/session contract inside its adapter: `lightning-model.js` provides `create({seed, params, start}) → state`, `step(state, dt, params)`, a read-only `render(state, params)`, a `parameters[]` schema and optional `starts[]`/`actions[]`. `experiment-session.js` is the DOM-free coordinator, and `lightning-experiment.js` adapts it to the core contract: parameters become core range params, the seed and starting mode are hidden params, starts become buttons in the experiment's own section, the session advances in fixed `dt` steps on the shared clock, and the flash is reported through `selfLight()`. Old `{version: 1, seed, params, start}` ratings and links still load (`migrate`). Presets restart the starting mode; they do not capture the exact animation frame. Full-state continuation is verified at model level but has no save/load UI yet.

### Named weather states

A core experiment may declare `weatherStates`: named, checked-in states, each `{ id, help, params, timeOfDay? }`, where `params` are the state's own values and everything else takes its default. `validateExperiment` checks them (code-name ids that no control uses, known and valid params). The common panel shows them in its Jump to weather state row (`jumpToWeatherState`), one button per state (Weather layers: `thunderstorm`, `clearDay`, `overcast`, `gentleClouds`). `weatherStateParams(experiment, state, params, random)` in `core/experiment.js` turns a state into full params (fresh seeds; `randomize: false` settings and the grid size kept), and the host applies them like a loaded link. A later forcing function or pull-toward can target a state through that same helper, for example by pulling Drift's walk toward `weatherStateParams(...)` instead of letting it roam, or by easing `storminess` toward the state's value to set a lightning rate. Neither is built yet.

## Lightning: first pressure test

Three scene-owned far/middle/near records each hold fixed cloud density, a 12×6 charge-potential proxy, its random state, channel graph and flash state. Quiet layers advance stochastic drift, relaxation and diffusion every 0.1 seconds. chargeBias adds a tunable signed mean to buildup inside the chargeRate multiplier; either polarity can favor neutral-ground connections, while zero bias preserves unbiased evolution. Regional potential difference divided by separation selects a cloud/ground or opposite-sign cloud/cloud target when it exceeds breakdownGradient. A seeded direction score grows toward that target; short branches attach to existing nodes. Connection marks the ancestor path, discharges the layer (especially the path neighborhood), flashes, then resumes field evolution. No global strike timer exists. Each layer evolves independently.

Next shape and Before strike prepare just one naturally triggered event, at flash peak or immediately before growth. Other layers retain their own quiet fields. Preparation uses unit buildup when live chargeRate is zero, then live quiet potentials freeze. Starting modes remain scene metadata, without host conditionals. Render composites each depth’s clouds/channel/opaque terrain in order. Ground connections light a small local patch only on their own terrain; cloud connections have no terrain pool. Fixed seeded trees/rocks belong to each depth’s terrain. A low point light at a ground contact projects shadows away from prop footprints on that depth’s ground plane; the wider local pool and its shadow contrast fade with the flash. Props use a separate seeded generator so they do not change charge or channel randomness. Foreground hills occlude farther light.

Charge is a normalized artistic potential proxy; no Poisson solve, charge conservation, physical units, polarity-specific leaders, streamers, thunder or volumetric shadow transport is claimed. Cloud-to-cloud means between regions in the same depth’s cloud band, not between depth planes. The scene owns these records; a generic ECS/layer manager is still unnecessary.

## Open limits to test next

- Shared composition across different effect modules; Lightning currently owns its three internal depth passes.
- State migrations/versioning beyond parameter preset version 1.
- A richer parameter schema (enums, vectors, multiple resolutions) when a second real effect needs it.
- Stable composition with the older Horizon/Shafts studies. Shared sky lights (`frame.sun`, `frame.moon`) are in place.
