<!-- Purpose: Specify the baked-normal cloud lighting workbench. Consumers: implementers and reviewers of issue #85. Dependencies: core/experiment.js, core/host.js, weather inspection architecture. -->
# Baked cloud lighting experiment

Related to #85. This is a proposed experiment; no runtime implementation is included in this document.

## Visual target
A thin red-orange illuminated edge, a cool purple fold immediately beside it, and murky violet sky visible through a nearby gap. Shape presets stay fixed while lighting changes, allowing comparisons within a few output pixels.

## Baked asset contract
Ship matching bitmap sets for a sphere, a union of spheres, thin wisps, and a cloud image with an explicitly approximate authored relief. Generate maps offline, never derive normals at runtime. Record dimensions, coordinate convention, scale, provenance/license, and baking recipe beside the assets. Photo brightness must not silently become geometry: document the interpretation and avoid retaining baked illumination in albedo.

Each set contains coverage, thickness, front-surface depth, and RGB normals. Use a shared orthographic frame: +X right, +Y up, +Z toward viewer. Decode normals as 2*RGB-1 and normalize after filtering; do not apply sRGB conversion to data maps. Zero-coverage pixels have no meaningful normal. Thickness and depth have documented common length units. An approximate back surface can be formed from front depth and thickness; this representation cannot express arbitrary overhangs or disconnected depth intervals.

Normals describe facing, not obstruction. Compute approximate light visibility using the baked depth/thickness representation. A normal alone must never be presented as evidence of self-shadowing.

## Lighting model
Keep incoming sunlight RGB, cool ambient illumination, facing response, light visibility, transmission, and diffusion as separate fields. Perform color arithmetic in linear light and apply display conversion only at output.

For normalized direction l toward the sun and baked normal n, mu=dot(n,l). Compare three selectable modes on identical assets:

- Lambert: max(0,mu).
- Wrapped diffuse: clamp((mu+wrap)/(1+wrap),0,1), with wrap >= 0.
- Artistic ramp: an authored color lookup over mu. Label it an artistic model and expose its output independently; avoid unintentionally multiplying two color palettes together.

Lambert baseline: ambientRGB + sunlightRGB * visibility * facing, before coverage/composition. Cloud transmission uses thickness and attenuation independently of surface facing. If a phase-function approximation is included, define propagation directions explicitly and expose its contribution: the scattering cosine is dot(-l,v), where v points toward the viewer. A distant sun/fixed camera makes this nearly spatially constant; it cannot supply fold shadows by itself.

Diffusion is an artistic approximation to repeated scattering, with separate amount and distance controls. Blur or spread illumination within cloud coverage with normalized weights, not the final sky/cloud composite. Zero amount disables the contribution, and zero distance is a local limit. Preserve direct-light detail so diffusion does not erase the target red/purple boundaries. Do not claim a physical multiple-scattering solver.

## Controls
Use the existing generated-controls host, shared sun controls, hold-help, ratings, links, and responsive layout. Shape and lighting model use radio groups.

| Key | Meaning |
| --- | --- |
| cloudShape | Sphere, cluster, wisps, image interpretation |
| lightingModel | Lambert, wrapped diffuse, artistic ramp |
| gradientPosition | Position of incoming sunlight color transition |
| gradientCompression | Width/compression of transition |
| gradientStrength | Strength of warm/cool color variation |
| wrap | Wrapped-diffuse reach around the surface |
| diffusionAmount | Strength of indirect fill |
| diffusionDistance | Spatial spread in reference image pixels |
| view | Selected diagnostic or composition output |

Describe gradient mapping explicitly as artistic until tied to atmospheric optical depth. Expose incoming RGB independently of cloud coverage. View selection must have randomize:false and must not drift. Switching shape preserves lighting settings. Saved links must reproduce both asset and model selections.

## Inspection architecture
Reuse the field/dependency and accumulated-composition viewer from weather.html. Inspect its actual UI coupling before extracting the smallest shared adapter; do not copy the weather-specific dynamics or invent a competing viewer. Keep the existing weather page working.

Nodes: coverage, thickness, depth, normals, incoming sunlight, facing response, sunlight visibility, ambient, transmission, diffusion, and final composite. Composition stages: sky, ambient cloud, direct lighting, transmission, diffusion, final output. Distinguish scalar fields, RGB contributions, and accumulated images. Normals display as encoded RGB; show units and conventions in contextual help. Diagnostic selection must not change the computed scene.

## Acceptance and verification
- Sphere: facing sun gives 1, 60 degrees gives 0.5, tangent/back-facing gives 0 in Lambert mode.
- Baked normals are finite and approximately unit length on covered pixels; all maps align and decode consistently.
- Cluster: a sun-facing but obstructed patch differs from an exposed patch; inspect visibility separately from facing.
- Gradient controls change incoming RGB without changing geometry or normals.
- Diffusion amount zero removes fill; distance changes spread, not geometry. Transparent surroundings do not create halos from invalid normal/depth samples.
- Compare all modes with identical shape and lighting; inspect near-adjacent warm/cool boundaries without relying on a particular procedural seed.
- Model tests cover finite values, limits, view independence, and shape-switch preservation. Follow existing Node test conventions.
- Run relevant shared host/viewer tests and worker precache checks after implementation.
- Browser review covers phone controls, radio changes, diagnostic previews, console/network errors, saved-link round trips, and offline reload after service-worker activation.
- Inspect the successful Deploy comment before reporting a live preview. Record unavailable or unperformed checks honestly.

## Review sequence
1. This contract and acceptance plan.
2. Baked assets plus the lighting model and numerical tests.
3. Host/viewer integration, navigation, offline assets, and browser verification.

Keep implementation PRs focused, link every PR from #85, and leave issue deliverables unchecked until merged with evidence.
