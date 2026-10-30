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

Run `node --test apps/cloud-simulator/*test.js` from the repository root. For browser checks, serve the root with `python3 -m http.server 8000 --bind 127.0.0.1`, then open `/apps/cloud-simulator/`. Check playback, all views and controls, narrow layout, and offline reload after the service worker controls the page. Production and preview scopes should have separate caches.

## Experiment 02: sunset study

Open [sunset.html](sunset.html). Droplet density is fixed, seeded Gaussian patches extruded along camera depth into a 2.5D slab. `sunset-model.js` owns density generation and all lighting; `sunset.js` owns UI/playback only. The only animation is a distant sun moving along an arc; playback starts paused. Manual sun positioning, repeatable density seeds, parameter descriptions and collapsed formulas support experimentation. Density, sunlight transmission and camera transmission views isolate the terms.

Beer–Lambert attenuation and Henyey–Greenstein single scattering follow the ideas in [PBRT transmittance](https://www.pbr-book.org/4ed/Volume_Scattering/Transmittance) and [phase functions](https://www.pbr-book.org/4ed/Volume_Scattering/Phase_Functions). Our cosine convention uses propagation directions (forward is +1). RGB atmospheric extinction, sky backdrop, neutral ambient fill, fixed solar depth direction and horizon fading are deliberate approximations. The finite slab has open lateral edges; rays outside the density grid see vacuum. Six depth samples and eight sun-path samples approximate the integrals; dense settings can show quadrature error. No multiple scattering or calibrated meteorology is claimed.

`extinction` is per density unit per pixel length, `slabDepth` is in pixel lengths; remaining radiometric quantities use relative units. Neither rain state nor density evolves in this experiment. The shared cloud service worker precaches sunset assets in the existing app scope; installation still opens Rain study, which links to Sunset study.

Run `node --test apps/cloud-simulator/*test.js` for all experiments. Browser review: compare density before/after sun playback; scrub the sun toward the horizon; vary extinction/albedo/exposure and compare diagnostic views; check phone-width labels, pause/reset/new seed, and offline reload of both pages after worker activation. Browser verification must be recorded separately from model checks.

Both experiment pages keep the field in a separate visible pane while controls and formulas scroll independently. Wide screens use side-by-side panes; phones stack the field above the controls. The controls region can receive keyboard focus for scrolling.

## Experiment 03: convection study

Open [convection.html](convection.html). A 128 × 96 closed box of moist air is heated at the floor and cooled at the lid. `convection-model.js` owns the rules and the pixel colors; `convection.js` owns UI and playback only. Each pixel holds temperature, vapor, liquid (cloud and rain) and vorticity; each floor column also holds a puddle.

Per tick: the floor relaxes toward a hot temperature with a seeded per-column flicker, the lid toward cold. Puddles evaporate into the floor row. Vapor above an altitude-dependent capacity condenses and releases latent heat; liquid in subsaturated air evaporates and cools. Sideways differences in `temperature − 0.4 × liquid` spin the air (a 2D Boussinesq vorticity rule with drag and viscosity). A stream-function solve turns spin into divergence-free edge flows, capped at 0.24 pixels per tick. Heat, water and spin move by conservative upwind fluxes. Liquid above a small cloud threshold falls as rain; rain reaching the floor refills the puddles.

The feedback loop keeps it going: warm floor air rises and condenses, latent heat makes the cloud more buoyant, the lid cools it, rain falls out and evaporative cooling below drives downdrafts, and the puddles re-wet the floor. Nothing drains, so vapor + liquid + puddles is conserved up to floating-point rounding. The seeded flicker stops the flow from locking into steady rolls; the same seed always reproduces the same run. The units are experimental; no calibrated meteorology is claimed.

The default Lava lamp view shows buoyancy (warmer or cooler than the row average) with rain and thick cloud (liquid above the rain threshold) drawn in white. Water, temperature, buoyancy and relative humidity views isolate the fields with fixed color scales. Rule sliders affect the current run; `water` and seed changes reset it. Reduced-motion users start paused and background tabs do not accumulate catch-up. The shared service worker precaches the convection assets; installation still opens Rain study, which links to every experiment.

Model checks in `convection-model.test.js` cover water conservation, seed determinism and sustained motion over several thousand ticks for several seeds. Browser review: watch blobs rise and fall for a minute, switch views, vary buoyancy and flicker, check pause/step/reset/new seed, phone-width layout and offline reload.
