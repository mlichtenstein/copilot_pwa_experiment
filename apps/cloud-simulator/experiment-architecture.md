<!-- Purpose: Define the next-round experiment contract and its first test case.
     Consumers: experiment authors and reviewers. Dependencies: experiment-session.js, experiment-host.js and lightning-model.js. -->
# A scene module and a browser host

The first library explored effects with independent page controllers. Round two tests a small module contract, beginning with Lightning. This is separate from #68's integration/player work: existing experiments are not migrated in this PR.

## Design principles

1. **State describes the scene now.** Store geometry, phase, clock and random-generator state as plain JSON data. No DOM, canvas or hidden random globals belong in it. Seed plus the same steps/settings yields the same sequence; a serialized state can continue exactly.
2. **Dynamics change state; rendering reads it.** A scene's fixed-step rule mutates only its own state. Rendering returns pixels without moving the simulation or consuming randomness. Illumination parameters can redraw an unchanged channel.
3. **Parameter metadata is canonical.** Each parameter declares key/default/min/max/step/description once. The session normalizes inputs, the host generates controls, and presets share the same values. A parameter change affects subsequent steps/redraws; Reset rebuilds the current internal seed and selected starting mode with default parameters. Numeric seeds are not UI controls; fresh setups choose random internal seeds.
4. **The host owns time and presentation.** One generic host handles play/step/reset, seeds, frame scheduling, visibility changes, parameter controls, rating/preset hooks and canvas fitting. It has no conditional logic for a particular weather effect. Catch-up is capped at 250 ms; background time is discarded.
5. **Resolution and cost are explicit.** Each scene declares native width/height and dt. Display enlargement does not change simulation stepping. The host reports render milliseconds. Separate CPU/GPU timing and multiple resolutions remain future experiments, not abstractions invented ahead of evidence.

## Contract

| Member | Responsibility |
| --- | --- |
| `id`, `title`, `width`, `height`, `dt` | Scene identity, native image size and fixed simulation step in seconds |
| `parameters[]` | Numeric parameter schema with nearby control descriptions |
| `create({seed, params, start}) → state` | Reproducible JSON-serializable initial scene |
| `step(state, dt, params)` | Advance scene dynamics; no DOM or rendering |
| `render(state, params) → Uint8ClampedArray` | Read-only RGBA, exactly width × height × 4 bytes |
| `starts[]`, `defaultStart` (optional) | Named paused starting points; the host generates fresh-setup buttons from their labels/descriptions |
| `actions[]` (optional) | Named scene commands; description, `run(state,params)` and optional explicit playback on click |

`experiment-session.js` is a DOM-free coordinator. `experiment-host.js` is the browser adapter. `lightning.js` only chooses the scene and mounts it. Another effect can use the same host with a different module; session/host tests include a tiny counter-field scene with another resolution, schema and action. This tests decoupling, not broad physics reuse.

The session's `getParams`/`applyParams` powers the existing shared rating bar and `?p=` links. Presets store version, internal seed, parameters and starting mode and restart that mode; they do not capture the exact current animation frame. Full-state continuation is verified at model level but has no save/load UI yet. Rating backend availability is independent of scene playback.

## Lightning: first pressure test

Three scene-owned far/middle/near records each hold fixed cloud density, a 12×6 charge-potential proxy, its random state, channel graph and flash state. Quiet layers advance stochastic drift, relaxation and diffusion every 0.1 seconds. Regional potential difference divided by separation selects a cloud/ground or opposite-sign cloud/cloud target when it exceeds breakdownGradient. A seeded direction score grows toward that target; short branches attach to existing nodes. Connection marks the ancestor path, discharges the layer (especially the path neighborhood), flashes, then resumes field evolution. No global strike timer exists. Each layer evolves independently.

Next shape and Before strike prepare just one naturally triggered event, at flash peak or immediately before growth. Other layers retain their own quiet fields. Preparation uses unit buildup when live chargeRate is zero, then live quiet potentials freeze. Starting modes remain scene metadata, without host conditionals. Render composites each depth’s clouds/channel/opaque terrain in order. Ground connections light a small local patch only on their own terrain; cloud connections have no terrain pool. Foreground hills occlude farther light.

Charge is a normalized artistic potential proxy; no Poisson solve, charge conservation, physical units, polarity-specific leaders, streamers, thunder or volumetric shadow transport is claimed. Cloud-to-cloud means between regions in the same depth’s cloud band, not between depth planes. The scene owns these records; a generic ECS/layer manager is still unnecessary.

## Open limits to test next

- Shared composition across different effect modules; Lightning currently owns its three internal depth passes.
- State migrations/versioning beyond parameter preset version 1.
- A richer parameter schema (enums, vectors, multiple resolutions) when a second real effect needs it.
- Shared lighting inputs and stable composition with the older Horizon/Shafts studies.
