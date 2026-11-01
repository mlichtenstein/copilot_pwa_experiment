<!--
Purpose: A common language for cloud simulator experiments: the objects a simulator is made of, how they may and may not interact, and the algorithm that turns state into a picture.
Consumers: Maxwell, contributors and reviewers designing new or combined cloud experiments (issue #72).
Dependencies: describes, without changing, apps/cloud-simulator/core/experiment.js, core/host.js and experiment-architecture.md.
-->
# Cloud simulator: a common language

Related to #72. These are the building blocks new experiments should share, so they stay compatible with earlier ones. It describes no particular scene. Terms already defined in `core/experiment.js` or `experiment-architecture.md` keep their meaning.

**The host** is the shared page runner, `core/host.js`, that every experiment page runs on. The experiment is the scene module it loads. The host owns the clock, the sun, the common controls, ratings and links, and putting pixels on the canvas.

## How a frame is made

On every animation frame the host runs two phases: evolve, then maybe draw.

**Evolve the state.** This happens on every animation frame, not only before a render:
1. The host advances the clock by the elapsed time. Catch-up is capped at 250 ms, and time in a background tab is discarded.
2. The experiment's `step` adds that time to its accumulator and runs zero or more whole ticks. In each tick it recomputes the forcing fields, then runs the enabled rules in their declared order.
3. `step` reports whether anything visible changed. While paused, the Step button runs exactly one step.

**Draw**, only when something changed and at least `frameInterval` has passed since the last draw. Several ticks may run between draws, and drawing never advances the state.
1. **Read the state** as it is at the current clock time.
2. **Derive render inputs** from state and params, such as opacity, masks and sky color. Cache them until what they depend on changes.
3. **Light** them from every light in the scene: sky lights from the frame, scene lights from state (see Lights).
4. **Compose the layers back to front.** Sky goes first, then each layer from farthest to nearest, with each layer's passes in their declared order. Each pass covers what is behind it by its opacity.
5. **Apply display effects**, such as tone mapping, palette or dither, at the native size. `render()` returns RGBA, width × height × 4 bytes.
6. **Hand the pixels to the host.** It dims them for night, by the darker of daylight and the scene's own light (`selfLight`), then scales them to the screen without smoothing.

## Objects

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
  - *forcing*: recomputed from clock, seed and params alone (noise, for example).
  - *derived*: recomputed from other fields.
- **Layer**: a group of fields at one depth, with its own resolution. A scene has one layer or several, and their number, depths and grids are each experiment's choice.
- **Rule**: one dynamics step, such as condensation, rain fall or charge buildup. It must declare the fields it reads, the fields it writes and the params it uses. It may sub-step internally.
- **Render pass**: one drawing step, such as sky, light veils, cloud body or terrain. It must declare what it reads and its place in the draw order.
- **Param**: one control, declared once in the `core/experiment.js` schema. It has a key (also its label), kind, default, range or options, group, one sentence of help, and what a change to it invalidates (see Decisions).
- **Clock**: shared time in seconds, owned by the host.
- **Lights**: two kinds, both read the same way by lighting.
  - *Sky lights* move on the shared clock and come in through the frame. Today that is only the sun, as `frame.sun = { phase, azimuth, elevation }` on the shared figure-eight path (`core/sun-path.js`). A moon or any other sky light should take the same route: a direction and brightness on the frame, never computed separately inside one experiment.
  - *Scene lights* come from state, such as a lightning flash. Each one is drawn by its own declared pass and reports its brightness through `selfLight`, so night dimming doesn't darken it.
- **Seed**: the only source of randomness. Each consumer derives its own stream from it, so adding a consumer doesn't shift the others.

## Allowed and forbidden interactions

**Dynamics**
- A rule reads and writes only the fields it declares. Rules run in one declared order every tick. A rule may read a field that is forcing, that the previous tick stored, or that an earlier rule wrote this tick.
- Two rules that write the same field must sit next to each other in the order, on purpose.
- A rule that's turned off writes nothing. Its stored fields keep their values, and its derived fields still update.
- Rules clamp to declared ranges and cap their own speeds. A rule that conserves something, like water, has a test that checks it.

**Rendering**
- Render passes read state and render inputs. They never write state, consume randomness or advance time. A cache is fine if it is invalidated when its inputs change.

**Between layers**
- No cross-layer dynamics. Each layer's rules read and write only that layer's fields.
- Layers affect each other only in rendering, and only through light and occlusion.

**Determinism and saving**
- No `Math.random`, wall-clock time or DOM in state or rules.
- A serialized state continues exactly where it left off.
- Tests use pinned seeds and print the seed when they fail.
- Ratings and `?p=` links save params, never state. The host adds the time of day, sun path, size and Drift. A saved look replays from its seed; it is not a snapshot of the moment.

**Host and experiment**
- The experiment declares capabilities and draws pixels, and the host builds everything shared.
- The host never branches on a particular experiment.

**Compatibility**
- Params stay one flat object.
- A new param has a default, so old links and ratings load unchanged (`cleanParams`).
- Renaming or reshaping a param needs a `migrate(raw)`. Old keys are never reused with a new meaning.
- A registered experiment keeps its id, page and rating app id.
- Shared building blocks change only in ways that keep existing experiments passing their tests.

## Decisions

- **Field and rule declarations stay inside each experiment** until two experiments share them. Only then do they move into a shared module.
- **Params declare what they invalidate**: the fields to rebuild, lighting, or only the draw, so caching can be generic. This will need an optional param member in `core/experiment.js`. That change belongs in a later code PR, not this doc.
- **No cross-layer dynamics for now.** This is a deliberate constraint. Light crossing layers in rendering is still allowed, and that includes a flash lighting a layer behind it.

## How existing experiments map onto this

Noise weather and Convection are single-layer scenes whose rules write stored fields. Horizon, Shafts and Sunset are scenes with no rules, where only the sun moves. Lightning and Weather layers are multi-layer scenes. Weather layers is one exploratory arrangement, not a template.

## Open questions

- Should `experiment-architecture.md` adopt this vocabulary and the `core/experiment.js` contract? Its contract table still describes the older session API: numeric-only `parameters[]`, and `create`/`step`/`render` over a whole-scene state.
- How should sky lights beyond the sun be added to the frame, for example as `frame.lights` or one field per light?
