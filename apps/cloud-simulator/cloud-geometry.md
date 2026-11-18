<!-- Purpose: Document independent layer/shape contracts and linked geometry inspection.
Consumers: contributors and reviewers. Dependencies: cloud-shapes.js, cloud-geometry.js, cloud-side-view.js, normal-lighting experiment. -->
# Cloud layers and shapes

The world has five layer records: near, nearMiddle, middle, farMiddle and far. Each layer holds two distinct cloud bodies, for ten clouds total. Each owns a centre, nonuniform scale, yaw and a reference to a reusable local-space solid. Shape is independent of placement: `nearShape`, `middleShape` and `farShape` each choose ellipsoid, cluster, wisps, teardrop or image. `nearYaw`, `middleYaw` and `farYaw` rotate their own bodies about the vertical axis. Fresh scenes use cluster / teardrop / wisps / cluster / teardrop. Each layer has its own Shape and Yaw controls; both clouds inherit those settings. No shape disables the side view or uses a separate renderer.

`cloud-shapes.js` owns local-space solids and ray intervals. `cloud-geometry.js` transforms rays/normals, shades the world and projects the very same solids for inspection. `cloud-side-view.js` only draws those projections and handles selection. Scene records are treated as immutable: changing geometry creates a new scene, while lighting/color changes reuse it. Camera intersections and side silhouettes are cached against scene identity.

## Shape representations

- **Ellipsoid:** one analytic solid.
- **Cluster:** union of three overlapping ellipsoids. Ray intervals merge so overlaps do not double the cloud density.
- **Wisps:** three closed, curved, tapered ribbon/tube meshes.
- **Teardrop:** closed swept mesh with a narrow tip and broad base.
- **Image:** 32×20 front/back relief mesh from the existing 96×60 baked image geometry. Coverage above 0.18 and thickness above 0.25 baked pixels define its footprint. Outline walls close the solid. It is an inferred relief volume with an approximate outline, not recovered photographic geometry.

Meshes use a bounding-volume hierarchy for ray queries. Entry normals interpolate mesh vertex normals for broad color/shading; geometric face normals offset shadow rays away from the surface. Fine normals add a small tangent perturbation independently of geometry. Shape meshes and source data are shared; layers hold independent transforms.

World units are illustrative, not kilometres. +X is right, +Y up, +Z away from the camera. The camera is at (0,1,0), pitched up 12°, vertical field of view 58°, aspect 1.6. `cloudThickness` scales vertical radii, `layerSpacing` scales distances, `cloudDensity` controls extinction and `transmissionStrength` scales scattered light. All apply to every shape. Yaw is saved/randomizable but does not Drift. Old links with `cloudShape=layers` migrate to five ellipsoid layers; other old global shapes migrate to that shape on all layers. Explicit per-layer choices take precedence. Removed screen-space diffusion sliders are ignored when loading old links.

## Two views, one geometry

The side inspector is an elevation with X collapsed, not an X=0 planar slice. It projects each solid using rays along X and uses the same ray queries for side picking. Distance/altitude axes have equal scale. Front picking, side picking, camera depth, normals, obstruction and transmission all query the same solids. Select individual clouds with a tap in either view, or select the first cloud in a layer with its button. Selection outlines appear only in the side view; the final rendered scene contains no inspection overlay. Inspection selection and collapsed panels do not randomize.

All ten cloud centres are at altitude 6, with depth and lateral separation. Two clouds per layer have staggered horizontal positions and slightly offset depths; their widths leave sky gaps. Perspective alone determines their screen heights.

The lighting field has two independent perpendicular gradients, both rotating with the source:

- `earthLight`: smooth intensity across the rays, above the Earth-shadow boundary bright and below it dim. The local shadow plane is anchored at the sunward ground reference (0,0,50); `shadowHeight`, `shadowSoftness` and `shadowFloor` control its offset, transition width and residual intensity. At dusk this lets upper or sunward clouds stay illuminated while lower/near clouds darken.
- Hue: coordinate increases toward the source along its rays, referenced to (0,6,20) over 40 world units. The single sunset palette goes red → magenta → purple → blue-purple toward the source. Broad normals offset only hue. The historical `heightInfluence` control now scales this spatial hue coordinate. Palette selection is removed; old gradientKind settings are ignored. Ramp range/warp/compression controls remain available. Palette RGB is normalized to unit HSV value so the hue field does not create a second value gradient.

The side inspector's `sideField` buttons show `combined`, `earthLight` alone or `hue` alone at X=0. These are inspection-only state and do not randomize. Both direct reflection and each of the six volume scattering samples use hue × Earth-shadow intensity. The `earthLight` field tile shows intensity at the visible surface; `incoming` includes both fields before cloud obstruction and fine shading. Camera-night dimming is bypassed for this experiment: the spatial field controls cloud source brightness, while sky/ambient keep their own day/night response.

This is a local planar approximation, not spherical Earth atmospheric transport. Silhouettes collapse X, whereas the field overlay is an X=0 slice before broad-normal offsets and cloud obstruction; off-plane bodies may sample other colors. Moon mode uses the same sunset hue ramp with its brightness, using the same illustrative shadow geometry.

The **Sun / Moon · ∞** marker uses a separate, labelled angular inset with a fixed-radius circle and horizon. It no longer intersects a rectangular world-plot boundary or appears to approach the camera. The radius is schematic; the angle is the source vector projected into YZ, matching the parallel incoming arrows. A source perpendicular to YZ is labelled out of plane (+X/−X). White is the selected viewing ray; green is its surface normal; gold arrows show propagation.

## Transport and limits

Perspective camera rays intersect closed solids. Source direction points toward the source; propagation is its negative. A sun ahead cannot directly illuminate a camera-facing −Z surface like a foreground lamp. Camera extinction attenuates the sky and sun/moon disc. Intervening cloud solids attenuate shadow and scattering paths. Broad normal plus distance along the source rays chooses hue, independently of Earth-shadow intensity; fine normals affect surface brightness separately.

Six midpoint samples per interval approximate single scattering with an artistic forward bias. Direct surface response, ambient fill and volume scattering are separately inspectable; historical `diffusion`/`diffusionAdded` field IDs now consistently mean volume scattering for all shapes. `transmission` is the nearest interval's unscaled transport coefficient. A camera-facing surface can stay dark while thinner paths glow.

These are homogeneous solids with a fixed camera, flat ground and stylized colors. Mesh tessellation, image thresholding, six-sample integration and surface-plus-volume blending are approximations. Intersecting separate layers are composited as successive intervals rather than solved as a combined participating medium. No Earth curvature, multiple scattering, calibrated atmospheric colors or energy-conserving surface/volume coupling is claimed.

## Verification

`node --test apps/cloud-simulator/cloud-shapes.test.js apps/cloud-simulator/cloud-geometry.test.js apps/cloud-simulator/normal-lighting-model.test.js apps/cloud-simulator/sw.test.js`

Tests cover closed volumes from front/side/inside, cluster-union thickness, independent layer choices/transforms, yaw-aware picking and obstruction, distinct side silhouettes including image relief, legacy-link migration, finite mixed-shape fields and source-marker edge cases. Browser review: mix five layer shapes, rotate one, select from either view, change thickness/spacing, move the source and switch Sun/Moon, inspect fields, then reload a shared link. Also check phone layout and offline reload after worker activation.

## Direct illumination in the side view

Cloud fills show `directIncident`: the shared incoming hue and Earth-shadow value multiplied by cloud-path visibility, before normal-facing reflection or volume scattering. Side rays along +X cache real surface points and normals, then relight those samples whenever lighting changes. This is a view of the same solids from another direction; it need not match the front-facing surface colors pixel for pixel. Selected silhouettes have a pale outline; unselected cloud colors are not dimmed. Identity colors remain only on labels. No second illumination mode is added to the side cloud fills.
