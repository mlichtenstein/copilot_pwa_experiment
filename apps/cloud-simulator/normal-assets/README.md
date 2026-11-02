<!-- Purpose: Explain baked normal-map data and reproduction. Consumers: contributors and lighting experiment. Dependencies: bake.py, Pillow, existing CC0 texture. -->
# Fixed cloud data maps
Run `python apps/cloud-simulator/normal-assets/bake.py` with Pillow installed to reproduce all twelve PNGs. No geometry or normals are generated at runtime.

96×60 maps use X right, Y up, Z toward the viewer. Length units are image pixels. Normal RGB encodes (n+1)/2; decode as data, then normalize. Geometry RGBA encodes front depth as (z+32)/64, thickness/64, unused blue, and coverage. Eight-bit depth quantization is about 0.25 pixels. Transparent normals have no meaning.

Cluster uses ellipsoids with a central lobe projecting toward the viewer and recessed side lobes. It stores a front/back envelope, filling gaps along depth; this is an approximation, not exact union ray intersection. Wisps are three thin, curved ribbons with feathered coverage. Teardrop is a continuous pointed relief surface. Its normals and ribbon normals are baked from their analytic height fields. The former sphere preset is removed; old sphere selections fall back to cluster through schema cleaning.

Image preset uses the existing CC0 WickedInsignia CloudAlpha01 opacity map; provenance is in ../textures/README.md. The grayscale asset is interpreted as coverage and a 30-pixel relief with a 0.55-pixel blur, nonlinear height contrast and strengthened coverage. Its gradient is baked offline into normals. This is an intentionally naive artistic interpretation, not recovered 3D geometry or a photograph reconstruction. Source lighting may bias it. Compare against the analytic presets before drawing conclusions.

Surface shading, artistic color ramps, depth-slab shadow sampling and coverage-normalized box diffusion are independent approximations. Transmission and physically based atmospheric color remain follow-up work. The experiment uses a fixed violet sky and a controllable vertical sunlight color gradient. A yellow sun-direction marker overlays composition views, using the same azimuth/elevation as illumination. Azimuth ±90° spans the image width and elevation ±45° spans its height; off-screen directions clamp to the border. It is a diagnostic marker, always drawn over clouds, not a physically occluded sun disc. Raw field views stay marker-free.

The main viewport follows the shared host night filter; inspector thumbnails show raw field values.

## Lighting controls and inspection

`lightSource` selects exactly one Sun or Moon, independently of time of day. The shared clock moves that source; auto palette selects sunset or moon colors. Moon brightness/saturation are artistic appearance controls, not different atmospheric scattering physics. Other palette choices override auto. Range start/end can reverse; position/compression locate the transition, and warp redistributes its interior. The preview strip shows the sampled illumination palette from bottom to top, before brightness, saturation and strength adjustments.

The workbench starts with an 85° × 58° figure-eight centered at azimuth +15°, elevation +2°. Its explicit shape overrides cross-page carry, while saved links still restore their recorded shape. Other experiments retain their defaults.

View remains serialized but its redundant dropdown is hidden. Field tiles isolate quantities. Composition tiles now show accumulated stages and added contributions; direct/diffusion toggles affect the accumulated scene. Ambient addition is shown separately from the background attenuation caused by cloud coverage. Disabled direct lighting still feeds diffusion, allowing independent inspection of the two contributions. Each lighting mode has plain-language hold/hover/focus help. Mobile canvas rows use their actual aspect-ratio height.

## Broad color normals and fine shading normals

Every preset now has a `*-broad-normal.png` alongside `*-normal.png`. Smooth analytic surfaces supply broad normals; cluster/teardrop fine normals include small deterministic shading-only ripples. The image broad map comes from its height interpretation smoothed at 3 pixels, while fine relief retains the 0.55-pixel filter. Wisps retain matching maps as a thin-shape control. Never blur encoded normal RGB. Runtime only decodes and normalizes baked fields.

Color coordinate = 0.5 + heightInfluence × (normalizedHeight − 0.5) + broadNormalInfluence × dot(broadNormal, lightDirection). Position/compression, clamping, warp and ramp range are applied after combining these inputs. `colorCoordinate` displays the clamped pre-warp coordinate; `incoming` shows the resulting color. The ramp preview is a reference at zero normal offset.

Fine shading blends between unity and the fine-normal facing response using `detailShadingStrength`. Lambert/wrapped multiply the selected color by that factor and the unchanged depth-slab visibility. Artistic ramp skips facing modulation but retains the same combined color selection and geometric shadows. `broadNormalInfluence=0` restores height-only selection. Fine shading changes cannot alter ramp selection, and color controls cannot alter shadow visibility. This is an artistic two-scale model, not physical atmospheric scattering. Geometry/coverage/shadow maps are unchanged by the fine shading ripples.
