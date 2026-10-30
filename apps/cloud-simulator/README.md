<!-- Purpose: Explain the rain experiment and reproducible checks.
Consumers: contributors and experimenters. Dependencies: index.html and simulation.js. -->
# Cloud simulator: rain study

Open `index.html` through an HTTP server, or use the PR's Review deployments link. The app is a standalone PWA with relative paths and scope-isolated offline caching.

A 128 × 96 vertical slice holds dimensionless temperature and water content. Temperature increases downward, perturbed by smooth seeded value noise. Independent water noise seeds moist upper patches over nearly dry lower air. Temperature remains fixed.

At each synchronous tick, a cell with water above `baseThreshold * (0.55 + 0.9 * temperature)` sends `water * transfer` to its lower neighbor. Transfers read the previous grid: water moves at most one row per tick. The bottom is an open drain, with cumulative outflow reported. There is no replenishment; a run eventually settles. Total water plus drained water is conserved up to floating-point rounding.

This deliberately conflates vapor, condensation and falling liquid. It explores threshold cascades rather than simulating realistic precipitation. Warm regions can arrest a streak. No wind, diffusion, latent heat or droplet state is included.

## Exploring

- Pause, then Step to follow propagation. Step always pauses playback.
- Transfer and threshold affect the existing field immediately. Zero transfer freezes transport.
- Starting-field sliders and seed changes reset the simulation. Reset seed repeats the same fields; New seed changes their arrangement. Playback state is retained.
- Water view uses a fixed 0–3 scale; temperature uses blue–red; saturation highlights cells above threshold in orange. These views show current values without artificial motion trails.
- Reduced-motion users start paused. Background tabs do not accumulate simulation catch-up.

## Files

`simulation.js` contains browser-independent rules; `app.js` handles controls and rendering. `manifest.json` describes installation metadata, uses relative start/scope URLs, and depends on `icon.svg`. `cloud-sw.js` precaches every runtime asset in a cache named for its registration scope.

## Checks

Run `node --test apps/cloud-simulator/simulation.test.js` from the repository root. For browser checks, serve the root with `python3 -m http.server 8000 --bind 127.0.0.1`, then open `/apps/cloud-simulator/`. Check playback, all views and controls, narrow layout, and offline reload after the service worker controls the page. Production and preview scopes should have separate caches.

## Experiment 02: sunset study

Open [sunset.html](sunset.html). Droplet density is fixed, seeded Gaussian patches extruded along camera depth into a 2.5D slab. `sunset-model.js` owns density generation and all lighting; `sunset.js` owns UI/playback only. The only animation is a distant sun moving along an arc; playback starts paused. Manual sun positioning, repeatable density seeds, parameter descriptions and collapsed formulas support experimentation. Density, sunlight transmission and camera transmission views isolate the terms.

Beer–Lambert attenuation and Henyey–Greenstein single scattering follow the ideas in [PBRT transmittance](https://www.pbr-book.org/4ed/Volume_Scattering/Transmittance) and [phase functions](https://www.pbr-book.org/4ed/Volume_Scattering/Phase_Functions). Our cosine convention uses propagation directions (forward is +1). RGB atmospheric extinction, sky backdrop, neutral ambient fill, fixed solar depth direction and horizon fading are deliberate approximations. The finite slab has open lateral edges; rays outside the density grid see vacuum. Six depth samples and eight sun-path samples approximate the integrals; dense settings can show quadrature error. No multiple scattering or calibrated meteorology is claimed.

`extinction` is per density unit per pixel length, `slabDepth` is in pixel lengths; remaining radiometric quantities use relative units. Neither rain state nor density evolves in this experiment. The shared cloud service worker precaches sunset assets in the existing app scope; installation still opens Rain study, which links to Sunset study.

Run `node --test apps/cloud-simulator/*test.js` for both experiments. Browser review: compare density before/after sun playback; scrub the sun toward the horizon; vary extinction/albedo/exposure and compare diagnostic views; check phone-width labels, pause/reset/new seed, and offline reload of both pages after worker activation. Browser verification must be recorded separately from model checks.

Both experiment pages keep the field in a separate visible pane while controls and formulas scroll independently. Wide screens use side-by-side panes; phones stack the field above the controls. The controls region can receive keyboard focus for scrolling.

## Experiment 03: layered light shafts

[shafts.html](shafts.html) uses three fixed cloud pictures (32×20, 64×40, 96×60) at depths 22/50/78 and two 64×40 illuminated-air pictures, one between each pair. The camera has fixed 58° perspective. `shafts-model.js` owns cloud generation, projected shadows, air pictures and back-to-front compositing; `shafts.js` owns five sliders, a shadow-smoothing toggle, pattern buttons and paused sun playback. Simulation and controls retain separate panes.

Each air pixel projects toward the sun onto farther cloud pictures and multiplies their Beer–Lambert transmissions. Its color is sunlight times the blocked fraction of the haze slab. Background, clouds and air are composited far to near. There is no 3D lighting grid, depth slice, phase function control or volume march. This is an artistic layered approximation, not a volumetric transport solution: midpoint air lighting, fixed cloud illumination scale, approximate solar RGB and sky, and fixed display tone mapping are deliberate simplifications.

Controls are sunElevation/sunAzimuth, cloudOpacity, haze, cloudSharpness and shadowSmoothing, with descriptions and formulas on-page. Pattern buttons increment one layer’s seed; displayed seeds identify the current patterns. Reset restores all original patterns and lighting. Haze=0 removes the air pictures; cloudOpacity=0 removes both cloud occlusion and shadows.

Run `node --test apps/cloud-simulator/*test.js`. Review sun movement, zero haze/opacity, independent pattern changes, reset, phone scrolling and offline navigation after worker activation. Browser checks remain separate from model and GUI-harness checks.

Shadow controls: cloudSharpness=1 preserves the mask; larger values increase density contrast around 0.35, clipped to 0–2. shadowSmoothing chooses bilinear (default) or nearest-cell sampling for projected shadows only. Visible cloud surfaces retain smooth density. Reset restores sharpness=1 and smoothing on. The two 64×40 air pictures remain unchanged in resolution.
