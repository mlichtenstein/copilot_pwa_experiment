<!--
Purpose: A common language for cloud simulator experiments: the objects a simulator is made of, how they may and may not interact, and the algorithm that turns state into a picture.
Consumers: Maxwell, contributors and reviewers designing new or combined cloud experiments (issue #72).
Dependencies: describes, without changing, apps/cloud-simulator/core/experiment.js, core/host.js and experiment-architecture.md.
-->
# Cloud simulator: a common language

Related to #72. These are the building blocks new experiments should share, so they stay compatible with earlier ones. It describes no particular scene. Terms already defined in `core/experiment.js` or `experiment-architecture.md` keep their meaning.

## The render algorithm in brief

From scene state to the image on screen, every frame:

1. **Read the state** at the current clock time. Rendering never advances it.
2. **Derive render inputs** from state and params, such as opacity, masks and sky color. Cache them until what they depend on changes.
3. **Light** them from the shared sun in `frame.sun`.
4. **Compose the layers back to front**, farthest first, each covering what lies behind it.
5. **Apply display effects**, such as tone mapping, palette or dither, at the native size.
6. **Hand the pixels to the host.** The host applies night dimming, then scales them to the screen without smoothing.

## 1. Objects

- **Scene**: everything one experiment simulates. It owns only its state.
- **State**: the plain JSON data that describes the scene now, including random-generator state. Seed + params + the same steps always produce the same state.
- **Field**: a named grid of numbers with one meaning. It must declare:
  - its key;
  - its units, or "normalized";
  - its grid size;
  - its boundary behaviour (wraps, closed or open);
  - its kind (below).
- **Field kinds**:
  - *stored*: part of state, carried from tick to tick.
  - *forcing*: recomputed from clock, seed and params alone (noise, for example), so it is never saved.
  - *derived*: recomputed from other fields, never saved.
- **Layer**: a group of fields at one depth, with its own resolution. A scene has one layer or several. The number of layers, their depths and their grids are each experiment's choice.
- **Rule**: one dynamics step, such as condensation, rain fall or charge buildup. It must declare the fields it reads, the fields it writes and the params it uses. It may sub-step internally.
- **Render rule (pass)**: one drawing step, such as sky, light veils, cloud body or terrain. It must declare the fields and render inputs it reads, and its place in the draw order.
- **Param**: one control, declared once in the schema `core/experiment.js` defines. Each param has a key (also its label), kind, default, range or options, group and one sentence of help.
- **Clock**: shared time in seconds, owned by the host. A scene with a fixed tick turns clock time into ticks with its own accumulator.
- **Sun**: `frame.sun = { phase, azimuth, elevation }` on the shared figure-eight path (`core/sun-path.js`). It is the one light source unless the scene lights itself, as a lightning flash does (`selfLight`).
- **Seed**: the only source of randomness. Each consumer derives its own stream from it, so adding a consumer doesn't shift the others.
- **Host**: `core/host.js`. It owns play/step, the clock, the sun controls, Randomize, Drift, New seed, the rating bar, `?p=` links, the common panel and canvas scaling.

## 2. Allowed and forbidden interactions

**Dynamics**
- A rule reads and writes only the fields it declares. Rules run in one declared order every tick. A rule may read a field that is forcing, that the previous tick stored, or that an earlier rule wrote this tick.
- Two rules that write the same field must be next to each other in the order, on purpose.
- A rule that's turned off writes nothing. Its stored fields keep their values, and its derived fields still update.
- Rules clamp to declared ranges and cap their own speeds. A rule that conserves something, like water, has a test that checks it.

**Rendering**
- Render rules read state and render inputs. They never write state, consume randomness or advance time. A cache is fine if it is invalidated when its inputs change.

**Between layers**
- Each layer's dynamics read and write only that layer's fields, unless a rule names the cross-layer field it reads.
- In rendering, only light and occlusion pass between layers.

**Determinism and saving**
- No `Math.random`, wall-clock time or DOM in state or rules.
- A serialized state continues exactly where it left off.
- Tests use pinned seeds and print the seed when they fail.

**Host and experiment**
- The experiment declares capabilities and draws pixels, and the host builds everything shared.
- The host never branches on a particular experiment.

**Compatibility**
- Params stay one flat object.
- A new param has a default, so old links and ratings load unchanged (`cleanParams`).
- Renaming or reshaping a param needs a `migrate(raw)`. Old keys are never reused with a new meaning.
- A registered experiment keeps its id, page and rating app id.
- Shared building blocks change only in ways that keep existing experiments passing their tests.

## 3. Producing a view

**Per tick** (dynamics, host-driven):
1. The host advances the clock by `dt`. Catch-up is capped, and background time is discarded.
2. The scene adds `dt` to its accumulator. For each whole tick, it recomputes forcing fields, then runs the enabled rules in declared order on each layer.
3. `step` reports whether anything visible changed.

**Per frame** (rendering, at most once per `frameInterval`):
1. Rebuild render inputs only if their inputs changed: stored fields, params or `frame.sun`.
2. Light the inputs from `frame.sun`. Sky and atmosphere may be computed coarse and interpolated; geometry edges stay at output resolution.
3. Composite back to front: sky first, then each layer from farthest to nearest, its passes in declared order. Each pass covers what is behind it by its opacity, so light veils and shadows from farther layers sit under nearer bodies.
4. Apply display effects at the native size. `render()` returns RGBA, width × height × 4 bytes.
5. The host dims by the darker of daylight and `selfLight`, draws the pixels, and scales them with nearest-neighbour to fill the screen.

Resolution is explicit and offered as a param (a `size` param, for example). Changing the display size never changes the simulation.

## How existing experiments map onto this

Noise weather and Convection are single-layer scenes whose rules write stored fields. Horizon, Shafts and Sunset are scenes with no rules, where only the sun moves. Lightning and Weather layers are multi-layer scenes. Weather layers is one exploratory arrangement, not a template.

## Open questions

- Should field and rule declarations live in `core/experiment.js` (a generic `fields`/`rules` member) or stay inside each experiment until two experiments share them?
- Should params declare what they invalidate (fields, lighting, draw), so caching can be generic?
- `experiment-architecture.md`'s session contract has numeric-only `parameters[]` and whole-scene `create/step/render`. Should it grow the object vocabulary above, or give way to `core/experiment.js`?
- Should cross-layer dynamics ever be allowed, and how would they be declared?
