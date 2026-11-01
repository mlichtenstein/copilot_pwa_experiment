<!-- Purpose: Explain baked normal-map data and reproduction. Consumers: contributors and lighting experiment. Dependencies: bake.py, Pillow, existing CC0 texture. -->
# Fixed cloud data maps
Run `python apps/cloud-simulator/normal-assets/bake.py` with Pillow installed to reproduce all eight PNGs. No geometry or normals are generated at runtime.

96×60 maps use X right, Y up, Z toward the viewer. Length units are image pixels. Normal RGB encodes (n+1)/2; decode as data, then normalize. Geometry RGBA encodes front depth as (z+32)/64, thickness/64, unused blue, and coverage. Eight-bit depth quantization is about 0.25 pixels. Transparent normals have no meaning.

Cluster uses ellipsoids with a central lobe projecting toward the viewer and recessed side lobes. It stores a front/back envelope, filling gaps along depth; this is an approximation, not exact union ray intersection. Wisps are three thin, curved ribbons with feathered coverage. Teardrop is a continuous pointed relief surface. Its normals and ribbon normals are baked from their analytic height fields. The former sphere preset is removed; old sphere selections fall back to cluster through schema cleaning.

Image preset uses the existing CC0 WickedInsignia CloudAlpha01 opacity map; provenance is in ../textures/README.md. The grayscale asset is interpreted as coverage and a 30-pixel relief with a 0.55-pixel blur, nonlinear height contrast and strengthened coverage. Its gradient is baked offline into normals. This is an intentionally naive artistic interpretation, not recovered 3D geometry or a photograph reconstruction. Source lighting may bias it. Compare against the analytic presets before drawing conclusions.

Surface shading, artistic color ramps, depth-slab shadow sampling and coverage-normalized box diffusion are independent approximations. Transmission and physically based atmospheric color remain follow-up work. The experiment uses a fixed violet sky and a controllable vertical sunlight color gradient. A yellow sun-direction marker overlays composition views, using the same azimuth/elevation as illumination. Azimuth ±90° spans the image width and elevation ±45° spans its height; off-screen directions clamp to the border. It is a diagnostic marker, always drawn over clouds, not a physically occluded sun disc. Raw field views stay marker-free.

The main viewport follows the shared host night filter; inspector thumbnails show raw field values.
