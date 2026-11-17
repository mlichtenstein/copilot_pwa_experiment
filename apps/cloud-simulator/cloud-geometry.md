<!-- Purpose: Document the workbench world and side-view contracts.
Consumers: contributors and reviewers. Dependencies: cloud-geometry.js, cloud-side-view.js, normal-lighting experiment. -->
# Perspective cloud geometry

`cloudShape=layers` is the default in Normal lighting. Three flattened ellipsoids occupy distinct distances and altitudes above flat ground. World units are illustrative, not kilometres. +X is right, +Y up, +Z away from the camera. Camera position is (0,1,0), pitch 12°, vertical field of view 58°, aspect 1.6. The near/middle/far records own each body's centre, radii and identity. Both views consume these records; the side view does not reconstruct a shape from image brightness.

The side inspector is a side **elevation**, projecting all bodies onto the distance/altitude plane (X collapsed), not a literal slice through X=0. Axes use the same scale. It displays the camera, vertical field-of-view bounds, the selected body's viewing ray and surface normal, and parallel incoming sunlight arrows. Left/right light motion is foreshortened in this projection; the azimuth readout makes that explicit. Tap a cloud in either view or use the near/middle/far buttons. The selected body's centre gets a small white mark in the front scene. Selection is inspection state: Randomize does not change it or the open/closed inspectors. The field graph starts collapsed to leave space for the two geometry views.

`cloudThickness` scales vertical radii, `layerSpacing` changes distance, `cloudDensity` controls extinction per world unit, and `transmissionStrength` scales single-scattered light. These controls are disabled for baked presets. The old diffusion amount/distance controls are disabled for layers. Sun/Moon remains an explicit appearance choice. A 60°×50° source path centred at −15° azimuth/+5° elevation keeps the initial source in the perspective field of view. Saved links still restore their own path.

## Rendering contract

- Camera rays intersect analytic ellipsoids; nearest surfaces provide inspector normals and depth. The same perspective projection positions the distant sun/moon disc. A disc behind the camera or outside the viewport is not clamped into view.
- Source direction points toward the source. Incident rays travel in its negative direction. Azimuth/elevation define one parallel direction shared by every body. The camera-facing normal points mainly toward −Z, so a source ahead (+Z) cannot directly illuminate that face as a foreground lamp would.
- Exact intersection lengths determine Beer–Lambert extinction along camera and light paths, including obstruction by other bodies. Front-to-back compositing attenuates the sky and source disc with the same cloud optical depth.
- Broad analytic normals and world altitude choose the artistic color ramp. A small tangent perturbation supplies separate fine shading normals without changing the body or its shadows.
- Six midpoint samples per cloud interval approximate single scattering, with a modest artistic forward bias. Dense paths darken, thin paths transmit. Direct surface reflection, ambient fill and volume scattering remain separately inspectable contributions. The existing `diffusion`/`diffusionAdded` field IDs carry volume scattering in layers mode for compatibility; their composition label names transmission as well. `transmission` displays the nearest body's unscaled transport coefficient.

This is deliberately a geometry study: smooth homogeneous ellipsoids, fixed camera, flat ground, stylized colors, no Earth curvature or atmospheric shells, no multiple scattering, no recovered photo geometry. Surface reflection plus single scattering is artistic rather than an energy-conserving cloud solver. Six samples can miss very small shadow features. Baked presets retain their old image projection and diffusion, but their source Z sign and coverage occlusion are corrected.

## Checks

`node --test apps/cloud-simulator/cloud-geometry.test.js apps/cloud-simulator/normal-lighting-model.test.js apps/cloud-simulator/sw.test.js`

Checks cover perspective round trips, body intervals, normal orientation, picking, source occlusion, optical depth, backlighting/transmission, finite fields and independent color/shading/transport terms. In the browser: select each cloud in both views, vary thickness/spacing, move time and Sun path, inspect normals and transmission, toggle the added contributions, switch to/from a baked preset, and reload a shared link. Check a phone-width viewport and offline reload after service-worker activation.
