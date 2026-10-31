<!-- Purpose: Record the combined layers/fields sketch and the boundaries it tests.
     Consumers: weather experiment users, contributors and PR reviewers.
     Dependencies: weather-fields.js, weather-model.js, weather-experiment.js and existing optical/lightning helpers. -->
# Weather layers: an integration sketch

Related to #74. The starting point is Max's saved **Cloud simulator: planning notes**, 30 October 2026. This implements a small experiment from that discussion, not a final common architecture or a migration of the earlier studies.

## What is shared

A scene has a clock, a sun, wind/reveal offsets and three distance-layer records. Each layer holds its geometry, normalized humidity/cloud-water/rain grids, fixed terrain props, and independent lightning charge/channel state. The coordinator advances fixed 0.05-second ticks in an explicit order: update cloud suppliers, transport rain, then advance each enabled charge/channel system. The existing browser host owns controls, pause, frame scheduling and settings links.

One cloud-water grid feeds three consumers: optical cloud opacity/color, thresholded visibility polygons, and rain generation. There is no separately generated shaft mask that can drift away from the visible cloud. Fixed grayscale Horizon bitmaps blend with evolving 3D Perlin slices; wind advects both suppliers together. Humidity is currently a diagnostic reveal field, not a conserved vapor budget.

| Scene layer | Distance | Cloud/rain grid | Charge grid | World extent |
| --- | --- | --- | --- | --- |
| Near | 8 km | 24×15 | 12×6 | Camera frustum at 8 km |
| Middle | 24 km | 32×20 | 12×6 | Camera frustum at 24 km |
| Far | 65 km | 48×30 | 12×6 | Camera frustum at 65 km |

The camera has a 58° vertical field of view and a 1.6 aspect ratio. Grid cell sizes derive from distance and extent. Altitudes and atmospheric paths use km; cloud water, humidity, rain and charge are normalized artistic quantities. Output is 160×100; sky optics are 32×20, visibility masks 64×40, and per-depth atmospheric colors 12×8. Resolution choices are explicit and provisional.

## Scene layers versus render passes

1. Atmospheric sky from Horizon's spherical-atmosphere helpers.
2. All three-band visibility light veils, colored with altitude-dependent direct sunlight.
3. Far cloud body, rain, channel light, opaque terrain.
4. Middle cloud body, rain, channel light, opaque terrain.
5. Near cloud body, rain, channel light, opaque terrain.
6. Fixed tree/rock silhouettes, clipped against nearer terrain.

Cloud bodies cover the light veils, keeping their shape legible. Cloud silhouettes and visibility share a perspective adapter to the same density grid. Atmospheric transmission changes with height and distance, rather than applying one global sunset tint. The native terrain profile is defined in km and projected through that camera (with a small-angle Earth-curvature approximation).

Lightning reuses the existing deterministic charge/growth model. Its normalized geometry is warped from its original ground profile into the combined layer's projected cloud/terrain region. Ground flashes illuminate only that terrain pass; trees/rocks cast contact-light shadows there. **Charge is not yet coupled to visible cloud water.** This adapter is an exposed integration seam, not evidence that all weather already shares a physical geometry/model.

## Playing and inspecting

New weather uses a fresh internal seed, with no numeric seed field. Layer checkboxes reveal each depth's visual contribution; hidden layers still retain their allocated fields and cloud supplier, while their rain/charge stepping is skipped. View shows cloud water, humidity, rain or signed charge from a selected layer. Parameters redraw while paused. Play evolves weather and the small local sun arc together; sunSpeed=0 holds the sun while other weather moves. Step advances two ticks. Reset restores defaults and fresh weather.

Opening a settings link starts a fresh page at t=0 with the saved internal seed/settings. Loading settings into an already running page with the same seed retains that page's dynamics; exact live-moment replay is not implemented. The full model state is JSON-serializable and continuation is tested, but there is no state-snapshot UI/backend addition in this PR. The existing rating bar is reused without backend writes during verification.

## Cost and things to learn

The host targets at most four new images/second while playing. The instance caches lighting between redraws while paused and reuses it for repeated render calls. Changing parameters or advancing fields invalidates it. The readout reports rolling median/p95 CPU milliseconds for dynamics calls, lighting updates and pixel drawing, plus allocated cloud cells, silhouette edges and actual images drawn. Dynamics timings are per host call, which can include several fixed ticks; this is not a controlled per-tick benchmark. Initial warm-up may dominate early samples.

Toggles hide content; they are not a fixed-budget resolution benchmark. This sketch does not implement five-layer comparisons, GPU timing, input latency tracking, a measured images/second meter, or a phone performance target. Those should follow observed bottlenecks rather than another framework first.

Rain is an illustrative source/transport/decay field, without water conservation or full convection. The sun arc is local to this prototype, not a change to the existing studies' shared sun path. No cross-depth charge transfer, full volumetric lighting, photo loading, or learned weather-path exploration is included. The bitmap supplier seam can accept the Valley photograph masks later; this first pass uses the already shipped literal Horizon masks.
