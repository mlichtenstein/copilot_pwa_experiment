<!-- Purpose: Document independent layer/shape contracts and linked geometry inspection.
Consumers: contributors and reviewers. Dependencies: cloud-shapes.js, cloud-geometry.js, cloud-side-view.js, normal-lighting experiment. -->
# Cloud layers and shapes

The world has three layer records: near, middle and far. Each owns a centre, nonuniform scale, yaw and a reference to a reusable local-space solid. Shape is independent of placement: `nearShape`, `middleShape` and `farShape` each choose ellipsoid, cluster, wisps, teardrop or image. `nearYaw`, `middleYaw` and `farYaw` rotate their own bodies about the vertical axis. Fresh scenes use cluster / wisps / teardrop. No shape disables the side view or uses a separate renderer.

`cloud-shapes.js` owns local-space solids and ray intervals. `cloud-geometry.js` transforms rays/normals, shades the world and projects the very same solids for inspection. `cloud-side-view.js` only draws those projections and handles selection. Scene records are treated as immutable: changing geometry creates a new scene, while lighting/color changes reuse it. Camera intersections and side silhouettes are cached against scene identity.

## Shape representations

- **Ellipsoid:** one analytic solid.
- **Cluster:** union of three overlapping ellipsoids. Ray intervals merge so overlaps do not double the cloud density.
- **Wisps:** three closed, curved, tapered ribbon/tube meshes.
- **Teardrop:** closed swept mesh with a narrow tip and broad base.
- **Image:** 32×20 front/back relief mesh from the existing 96×60 baked image geometry. Coverage above 0.18 and thickness above 0.25 baked pixels define its footprint. Outline walls close the solid. It is an inferred relief volume with an approximate outline, not recovered photographic geometry.

Meshes use a bounding-volume hierarchy for ray queries. Entry normals interpolate mesh vertex normals for broad color/shading; geometric face normals offset shadow rays away from the surface. Fine normals add a small tangent perturbation independently of geometry. Shape meshes and source data are shared; layers hold independent transforms.

World units are illustrative, not kilometres. +X is right, +Y up, +Z away from the camera. The camera is at (0,1,0), pitched up 12°, vertical field of view 58°, aspect 1.6. `cloudThickness` scales vertical radii, `layerSpacing` scales distances, `cloudDensity` controls extinction and `transmissionStrength` scales scattered light. All apply to every shape. Yaw is saved/randomizable but does not Drift. Old links with `cloudShape=layers` migrate to three ellipsoids; other old global shapes migrate to that shape on all layers. Explicit per-layer choices take precedence. Removed screen-space diffusion sliders are ignored when loading old links.

## Two views, one geometry

The side inspector is an elevation with X collapsed, not an X=0 planar slice. It projects each solid using rays along X and uses the same ray queries for side picking. Distance/altitude axes have equal scale. Front picking, side picking, camera depth, normals, obstruction and transmission all query the same solids. Select with a tap or near/middle/far buttons; the front scene outlines the selected visible body and the side view emphasizes its silhouette. Inspection selection and collapsed panels do not randomize.

All three cloud centres are at altitude 6, with depth and lateral separation. Perspective alone determines their screen heights.

The side plot's translucent color field samples the same `gradientCoordinate` and palette controls as the renderer at X=0. The color axis rotates with source elevation and azimuth, perpendicular to its rays, about the reference point (0,6,20). At the horizon it is vertical; as the source rises it tilts across depth, so equal-altitude clouds sample different colors. This is a local artistic approximation to a rotating solar illumination field, not a spherical Earth atmosphere. The overlay shows spatial palette selection before broad-normal offsets, extinction, brightness and surface shading; it remains visible at night for inspection. X is collapsed for cloud silhouettes, so bodies away from X=0 can sample different colors from the displayed slice.

The **Sun / Moon · ∞** marker uses a separate, labelled angular inset with a fixed-radius circle and horizon. It no longer intersects a rectangular world-plot boundary or appears to approach the camera. The radius is schematic; the angle is the source vector projected into YZ, matching the parallel incoming arrows. A source perpendicular to YZ is labelled out of plane (+X/−X). White is the selected viewing ray; green is its surface normal; gold arrows show propagation.

## Transport and limits

Perspective camera rays intersect closed solids. Source direction points toward the source; propagation is its negative. A sun ahead cannot directly illuminate a camera-facing −Z surface like a foreground lamp. Camera extinction attenuates the sky and sun/moon disc. Intervening cloud solids attenuate shadow and scattering paths. Broad normal plus position in the rotating solar frame chooses the artistic ramp; fine normals affect surface brightness separately.

Six midpoint samples per interval approximate single scattering with an artistic forward bias. Direct surface response, ambient fill and volume scattering are separately inspectable; historical `diffusion`/`diffusionAdded` field IDs now consistently mean volume scattering for all shapes. `transmission` is the nearest interval's unscaled transport coefficient. A camera-facing surface can stay dark while thinner paths glow.

These are homogeneous solids with a fixed camera, flat ground and stylized colors. Mesh tessellation, image thresholding, six-sample integration and surface-plus-volume blending are approximations. Intersecting separate layers are composited as successive intervals rather than solved as a combined participating medium. No Earth curvature, multiple scattering, calibrated atmospheric colors or energy-conserving surface/volume coupling is claimed.

## Verification

`node --test apps/cloud-simulator/cloud-shapes.test.js apps/cloud-simulator/cloud-geometry.test.js apps/cloud-simulator/normal-lighting-model.test.js apps/cloud-simulator/sw.test.js`

Tests cover closed volumes from front/side/inside, cluster-union thickness, independent layer choices/transforms, yaw-aware picking and obstruction, distinct side silhouettes including image relief, legacy-link migration, finite mixed-shape fields and source-marker edge cases. Browser review: mix three shapes, rotate one, select from either view, change thickness/spacing, move the source and switch Sun/Moon, inspect fields, then reload a shared link. Also check phone layout and offline reload after worker activation.
