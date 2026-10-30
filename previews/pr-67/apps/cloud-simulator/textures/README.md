<!-- Purpose: Record cloud texture provenance and runtime interpretation.
Consumers: contributors and valley.html users. Dependencies: the three original JPEG assets. -->
# Sourced cloud textures

Author: **WickedInsignia**. Pack: **Clouds with Transparency**, published 17 February 2022.

Source: https://opengameart.org/content/clouds-with-transparency

Download: https://opengameart.org/sites/default/files/fx_cloudalphas.zip

The author explicitly releases the pack under **CC0 1.0**, including commercial and non-commercial use. License: https://creativecommons.org/publicdomain/zero/1.0/

- `FX_CloudAlpha01.jpg` → Soft bank
- `FX_CloudAlpha06.jpg` → Broken puffs
- `FX_CloudAlpha08.jpg` → Thin veil

These files are unmodified originals from the pack (black-background grayscale maps). The browser downsamples to compact working buffers and interprets intensity as opacity, then tints them. Those runtime transformations do not replace the source files. The original pack also offers alpha-channel PNGs. These are pre-existing artist-created assets; no image-generated assets are used in this PR.

## Source integrity

SHA-256 of the unmodified JPEGs:

- `FX_CloudAlpha01.jpg`: `7710223cbf249bbeca86669e43e299b66798c8470aec71df6c7b794816425ab6`
- `FX_CloudAlpha06.jpg`: `8f159c7d7cb0134d52287ddd92a6814d1647a7b8b650887f7ff42189f05452c4`
- `FX_CloudAlpha08.jpg`: `c2ca4cbbc3490fd60e7dd6efa44d232ef6bef0c9f5e5fe74c90c11d104a13e3d`
