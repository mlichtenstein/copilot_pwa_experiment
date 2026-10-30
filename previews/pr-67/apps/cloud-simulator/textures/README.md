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

## Real sunset photographs

Both derivatives are CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), locally hosted; no external image requests at runtime. The JPEG crop sources retain their original RGB on disk; the renderer never receives it. On load, valley-textures.js extracts scalar grayscale shading and soft cloud opacity. The originals are not bundled.

| Derivative | Original / photographer | Source | Preparation |
| --- | --- | --- | --- |
| sunset-rose.jpg | Colorful Sunset Clouds / Free Nature Stock | https://commons.wikimedia.org/wiki/File:Colorful_Sunset_Clouds.jpg (original source: https://isorepublic.com/photo/colorful-sunset-clouds/) | Original 3648×5472; crop (0,1200)–(3648,3480), resize to 768×480, JPEG quality 91. |
| sunset-embers.jpg | Sun behind the clouds during beautiful sunset / George Becker | https://commons.wikimedia.org/wiki/File:Sun_behind_the_clouds_during_beautiful_sunset.jpg (original: https://www.pexels.com/photo/silhouette-photo-of-clouds-113570/) | Original 5456×3632; crop (400,0)–(5456,2400) excludes sun disc and ground; resize to 768×365, JPEG quality 91. Commons explicitly records the pre-2018 CC0 release, not the current Pexels license. |

Downloaded and license pages checked 2026-10-30. Coordinates are source-image pixels. Runtime briefly decodes a 512×512 RGBA buffer, then discards it after extracting scalar fields, and remaps normalized coordinates to the viewport, so aspect can be artistically stretched. No synthesized image content or recoloring is baked into these derivatives.

SHA-256 records:

- `sunset-rose.jpg`: `28686a3c5305823d032e32c1d6f5b1d55614da05a670a600d3b0b1e06e78fa9b`

- `sunset-embers.jpg`: `ffe7f290cf7070f15424f05ac977bfd17e7fc6bc72203895ffaa78c3c5db0a07`

- Downloaded original `colorful`: `889a60ced430f696651e6dd4c6a68af7a9d8af5e94f803d11bcbd42b972c4957`

- Downloaded original `becker`: `e15df76c0f6cb69c10909572735a4bd651dec1db6bc2c926e392e64a0ed0b781`

### Runtime sky mattes

Sculpted bank (`rose`) uses `alpha = 1 − smoothstep(0.015, 0.12, blue − red)` to remove blue clear-sky gaps. Layered wisps (`embers`) uses `alpha = 1 − smoothstep(0.35, 0.7, red)` to remove red-bright open sky and retain dark cloud banks. Input channels are normalized to 0–1; original alpha multiplies the result. Shading is grayscale `0.2126·red + 0.7152·green + 0.0722·blue`. No source RGB reaches the renderer; its palette supplies all color. These are source-specific approximate mattes: clouds sharing the keyed sky color may vanish, and similar-colored sky may remain. They are not semantic segmentation or physical density estimates. The original grayscale maps retain their intensity-as-opacity behavior.
