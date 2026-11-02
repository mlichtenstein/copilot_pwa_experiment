<!-- Purpose: Record the combined layers/fields sketch and the boundaries it tests.
     Consumers: weather experiment users, contributors and PR reviewers.
     Dependencies: weather-fields.js, weather-model.js, weather-experiment.js and existing optical/lightning helpers. -->
# Weather layers: an integration sketch

Related to #74. The starting point is Max's saved **Cloud simulator: planning notes**, 30 October 2026. This implements a small experiment from that discussion, not a final common architecture or a migration of the earlier studies.

## What is shared

A scene has a clock, a sun, wind/reveal offsets and three distance-layer records. Each layer holds its geometry, normalized humidity/cloud-water/rain grids, fixed terrain props, and lightning charge/channel state. The coordinator advances fixed 0.05-second ticks in an explicit order: update cloud suppliers, transport rain, measure each charge cell's cloud support, then advance each enabled charge/channel system. The existing browser host owns controls, pause, frame scheduling and settings links.

One cloud-water grid feeds four consumers: optical cloud opacity/color, thresholded visibility polygons, rain generation and charge buildup. There is no separately generated shaft mask that can drift away from the visible cloud. Fixed grayscale Horizon bitmaps blend with evolving 3D Perlin slices; wind advects both suppliers together. Humidity is currently a diagnostic reveal field, not a conserved vapor budget.

| Scene layer | Distance | Cloud/rain grid | Charge grid | World extent |
| --- | --- | --- | --- | --- |
| Near | 8 km | 24×15 | 12×6 | Camera frustum at 8 km |
| Middle | 24 km | 32×20 | 12×6 | Camera frustum at 24 km |
| Far | 65 km | 48×30 | 12×6 | Camera frustum at 65 km |

The camera uses a 58° vertical frustum and a 1.6 aspect ratio, shifted upward by tan(8°) in the projection plane to leave more room for sky. Field sampling, sun projection and terrain share that offset. Grid cell sizes derive from distance and extent. Altitudes and atmospheric paths use km; cloud water, humidity, rain and charge are normalized artistic quantities. Output is 160×100; interpolated sky optics use 32×20 and per-depth atmospheric colors use 12×8 source samples; Full resolution uses 160×100 for both. Visibility coverage is 160×100 in either mode. Resolution choices are explicit and provisional.

## Scene layers versus render passes

1. Atmospheric sky from Horizon's spherical-atmosphere helpers, with output-resolution sun and moon.
2. All three-band visibility light veils, colored with altitude-dependent direct sunlight.
3. Far cloud body, rain, channel light, opaque terrain.
4. Middle cloud body, rain, channel light, opaque terrain.
5. Near cloud body, rain, channel light, opaque terrain.
6. Fixed tree/rock silhouettes, clipped against nearer terrain.

Cloud bodies cover the light veils, keeping their shape legible. Cloud silhouettes and visibility share a perspective adapter to the same density grid. Atmospheric transmission changes with height and distance, rather than applying one global sunset tint. The native terrain profile is defined in km and projected through that camera (with a small-angle Earth-curvature approximation).

Lightning reuses the existing deterministic charge/growth model, coupled to the visible clouds through `denseCloudWater` (default 0.65, the old fixed rain threshold). Each of a layer's 12×6 charge cells averages cloud water over a 3×3 sample of its projected footprint; support is that mean over `denseCloudWater`, capped at 1. Buildup scales with support, clear air drains charge about ten times faster, and a channel starts only from a fully supported (dense) cell; a cloud-to-cloud target must be dense too, while ground channels and rain still cross clear air. The standalone Lightning page passes no support, so its fields are unchanged. The one strike prepared at load is dropped unless both its ends are dense. Its normalized geometry is warped from its original ground profile into the combined layer's projected cloud/terrain region. Ground flashes illuminate only that terrain pass; trees/rocks cast contact-light shadows there. **Charge is not yet coupled to visible cloud water.** This adapter is an exposed integration seam, not evidence that all weather already shares a physical geometry/model.

## Playing and inspecting

New seed uses a fresh internal seed, with no numeric seed field. Layer checkboxes reveal each depth's visual contribution; hidden layers still retain their allocated fields and cloud supplier, while their rain/charge stepping is skipped. View shows cloud water, humidity, rain or signed charge from a selected layer. Parameters redraw while paused. Play evolves weather and the common sun path together; timeOfDay scrubs the shared sun while paused. Step advances two ticks. Reset restores defaults and fresh weather.

Opening a settings link starts a fresh page at t=0 with the saved internal seed/settings. Loading settings into an already running page with the same seed retains that page's dynamics; exact live-moment replay is not implemented. The full model state is JSON-serializable and continuation is tested, but there is no state-snapshot UI/backend addition in this PR. The existing rating bar is reused without backend writes during verification.

## Cost and things to learn

The host targets at most four new images/second while playing. The instance caches lighting between redraws while paused and reuses it for repeated render calls. Changing parameters or advancing fields invalidates it. The readout reports rolling median/p95 CPU milliseconds for dynamics calls, lighting updates and pixel drawing, plus allocated cloud cells, silhouette edges and actual images drawn. Dynamics timings are per host call, which can include several fixed ticks; this is not a controlled per-tick benchmark. Initial warm-up may dominate early samples.

Toggles hide content; they are not a fixed-budget resolution benchmark. This sketch does not implement five-layer comparisons, GPU timing, input latency tracking, a measured images/second meter, or a phone performance target. Those should follow observed bottlenecks rather than another framework first.

Rain is an illustrative source/transport/decay field, without water conservation or full convection. The module uses the same host sun path as the other sun-bearing studies. No cross-depth charge transfer, full volumetric lighting, photo loading, or learned weather-path exploration is included. The bitmap supplier seam can accept the Valley photograph masks later; this first pass uses the already shipped literal Horizon masks.

## Read-only field graph and composition inspector

The expandable **Fields & rendering graph** panel is part of the combined experiment. Field graph shows three depth columns with live previews of supplier bitmap/noise, humidity, cloud water, opacity, the middle-band threshold mask/visibility, cloud color, rain, light veil, charge, channel light, terrain and contact light/shadows. Clicking a tile enlarges that field/intermediate in the main viewport, names it and explains what it represents. The same View selector and settings links retain the selection. Black light tiles mean inactive contributions, not failed previews.

Arrows are authored from the current implementation: blue for same-depth inputs and gold for visibility from farther depths. In particular, humidity has no outgoing dependency and cloud-body illumination reads farther visibility rather than its own mask. These gaps are shown explicitly; stronger weather rules and cross-layer interactions remain next-PR work under #74. The graph is a viewer, not a node editor.

Composition shows six accumulated images produced by the existing renderer's stop points: sky, all light veils, far depth, middle depth, near depth, and terrain props/final image. These are real intermediate composites from the current frame, not recreated mockups or pictures of different random scenes. Surface/veil contribution tiles are shown on black; opacity/mask tiles use the native field grid and visibility uses the camera plane.

Thumbnails are 32×20 and update with each new displayed frame while the panel is open. Closing it skips preview generation. The `inspect` median/p95 readout records its extra CPU cost separately from drawing; its first derived preview reuses or fills the same lighting cache. The sky canvas remains visible above the independently scrolling graph. On phones the depth sections stack vertically; phone layout/performance still needs device verification.

The supplier sample was extracted into one read-only helper, so bitmap/noise thumbnails use the same calculation as cloud-water updates. No dynamics rules changed. Replay comparisons against the preceding revision verified identical scene state and final pixels on three runs.

The inspector uses collapsible depth frames (near open initially). On mobile they stack at full width, with two field cards per row. Closed frames retain their dependency endpoints at the summary and skip preview work. Selecting a field highlights incoming links amber and outgoing links mint, fading unrelated edges. Descriptions distinguish scalar, boolean, RGB and geometry data, list inputs, and explain ingestion/update/render rules.

Inspector previews offer small full thumbnails, cropped central strips and labels only. Labels mode skips preview rasterization. Selected-field contracts remain in a separate visible panel; the main viewport caption stays short. Mobile reserves a bounded simulation row so the inspector cannot consume the canvas.

The default inspector is the Field graph with small 48px full thumbnails. Strip and label modes change only card presentation; arrow connections, selection and main-field inspection remain active in every mode.

The selected field/pass description now occupies a permanently visible panel above an independently scrolling graph/composition area. The inspector has a larger bounded height (44dvh desktop, 34dvh mobile); long descriptions scroll within their own panel.

Weather now consumes the common host frame.sun for sky, visibility and cloud illumination, with lighting cache invalidation on changes even while paused. Its old local sun controls are removed from the module UI; legacy links use the host’s nearest-phase migration. The pure weather model retains its optional local-sun fallback for standalone callers. Atmospheric scattering stays coarse, but the 0.55-degree sun disc is sampled separately at final pixel resolution before cloud/terrain occlusion.

## Lighting resolution comparison

`lightingMode` is a radio control: Interpolated (default) calculates atmospheric scattering on 32×20 and direct light/transmission on 12×8 per depth, then bilinearly reconstructs linear RGB at output resolution. Full resolution calculates the same optical equations at every output pixel. Both use the same weather grids, time, sun disc, exposure and output-resolution visibility polygons; ray edges are never interpolated. Switching modes preserves weather state, rebuilds lighting, and resets the optical/drawing/inspection timing windows. The readout includes mode and optical sample counts. The control is excluded from Randomize so it remains a deliberate performance choice. Pause and disable Drift for visual comparisons. Full resolution can take hundreds of milliseconds or more per lighting update depending on device.

The inspector and accumulated composition previews read the same reconstructed lighting maps as the final scene. Raw field previews retain their native grid presentation.

Randomize changes scene parameters and the internal seed, while preserving the current field/composition view, inspection depth, layer-visibility toggles and lighting comparison mode. Graph tab, compact-preview style and expanded sections are UI state and also remain as chosen. The older studies likewise preserve their diagnostic View selection.


## Moon detour

The combined scene adds a stylized full moon on the same 90-second day clock. Its independent ellipse is `azimuth = −22 cos(2π(phase − 0.57))`, `elevation = 24 sin(2π(phase − 0.57))`, in degrees. It rises about 19:41, peaks about 01:41 and sets about 07:41. With the default sun path this leaves roughly 50 minutes of moonless evening and an early-morning overlap. Randomized sun shapes can change those intervals; the moon’s fixed path keeps it within the camera rather than inheriting extreme sun settings. The offset is timing, not a lunar illumination phase or astronomical ephemeris.

A 1.1-degree disc matching the sun, faint halo and analytic crater shading are sampled on the final pixel grid in both lighting modes. Moonlight fades near the horizon and is subdued in daylight. It belongs to the sky composition pass, behind all cloud opacity and terrain, and appears in sky/composition previews. Clouds in front of it receive cool backlighting within 9°, with smooth radial falloff and exponential attenuation through thick cloud cores. The cloud-color inspector uses the same calculation. This is an artistic forward-scattering approximation, with faint cool terrain fill but without a second set of visibility shafts. No extra optical grids, settings or randomization exclusions are introduced. Scrubbing, pausing, saved sun phase and Play use the shared clock; moon geometry does not modify weather state.

The lunar disc is three times its original radiance, preserving crater contrast. Terrain receives a local cool highlight that fades with lunar elevation, disappears in daylight or below the horizon, and is attenuated by the accumulated cloud optical depth toward the moon. The highlight is concentrated below the moon's projected position, fades down from each ridge, and is weighted by the ridge slope normal facing the moon. Terrain props remain silhouettes; this approximation does not add lunar cast shadows.

Terrain highlight strength is amplified fourfold. A narrow exponential rim (about one to two output pixels) makes moon-facing ridge edges much brighter than the interior, with a weaker broad falloff beneath it. The same local footprint and cloud attenuation still apply.
