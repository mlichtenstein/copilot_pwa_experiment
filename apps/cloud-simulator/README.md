<!-- Purpose: Explain cloud experiments and reproducible checks.
Consumers: contributors and experimenters. Dependencies: experiment pages, models and bitmap data. -->
# Cloud simulator: rain study

Open `index.html` through an HTTP server, or use the PR's Review deployments link. The app is a standalone PWA with relative paths and scope-isolated offline caching.

**Seeds are incidental.** In every experiment, no specific seed is meant to matter: behavior should look alike on any seed, and a result that only shows up on a hand-picked seed is a bug. Seeds exist only so a run can be reproduced and tested. Tests should check several random seeds rather than favorites.

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

Open [convection.html](convection.html). A 128 × 96 closed box of moist air is heated at the floor and cooled at the lid. `convection-model.js` owns the rules and the pixel colors; `convection.js` owns UI and playback only. Each pixel holds temperature, vapor, cloud, rain and vorticity; each floor column also holds a puddle.

Per tick: the floor relaxes toward a hot temperature with a random per-column flicker, the lid toward cold. Puddles evaporate into the floor row. Vapor above an altitude-dependent capacity condenses and releases latent heat; cloud and rain in subsaturated air evaporate and cool. Cloud above 0.005 per pixel gathers into rain at `autoconversion` per tick. Sideways differences in `temperature − 0.4 × (cloud + rain)` spin the air (a 2D Boussinesq vorticity rule with drag and viscosity). A stream-function solve turns spin into divergence-free edge flows, capped at 0.24 pixels per tick. Heat, water and spin move by conservative upwind fluxes. Rain falls one pixel per tick at the default `fallSpeed` of 1, outrunning the strongest updraft, so it comes down in shafts; rain reaching the floor refills the puddles.

The feedback loop keeps it going: warm floor air rises and condenses, latent heat makes the cloud more buoyant, the lid cools it, rain falls out and evaporative cooling below drives downdrafts, and the puddles re-wet the floor. Nothing drains, so vapor + cloud + rain + puddles is conserved up to floating-point rounding. The flicker stops the flow from locking into steady rolls. The page picks a random seed; Reset repeats that run and New seed starts another. The units are experimental; no calibrated meteorology is claimed.

**Inversion (Options, on by default).** Real cumulus rarely grow without limit. Over much of the ocean, air sinking in the subtropical highs warms as it is compressed, leaving a warm, dry layer over a cooler, moist mixed layer: the trade-wind or subsidence inversion. A rising parcel stays buoyant only while it is warmer than the air around it; at its level of neutral buoyancy, here the base of the warm layer, it stops and spreads sideways. That is why clouds pave out into flat sheets: stratocumulus decks under an inversion, cumulus whose tops flatten at the trade inversion, and thunderstorm anvils spreading under the tropopause, the stable layer at the top of the troposphere. Their flat bases are a separate effect: air everywhere condenses at about the same lifting condensation level. The model's version is the simplest one that does real work: at and above `inversionHeight` (default 0.6) the temperature relaxes at 0.02 per tick toward a fixed sounding, 0.4 at the base rising to 0.75 over 0.1 of the height and warm up to the lid. The cool base stands in for the cloud-top cooling that keeps a real capped layer overturning. Plumes arriving from below are colder than the layer, so they stall and spread into a flat-topped cloud layer just under it; the warm air above holds more vapor and stays clear. The cloudiest row moves from near the lid (off) to just under the inversion, and follows the height slider. Water is untouched, so it is still conserved. Inside the stable layer the air is quiet by design; the mixed layer below keeps overturning.

**Options** are plain run parameters (saved with a preset): `inversion` and `inversionHeight`; `cloudStyle`, Cumulus (the shaped cloud below) or Raw cloud water (the earlier smoky drawing of every bit of cloud by its own amount, shadowed toward the sun); and `feather`, frayed cloud edges. Only the inversion changes the simulation; the rest is drawing only.

The default Sunset view ties the fields together over a dusk sky. Drawn as-is, the advected cloud water looks like smoke (thin stretched streamers over a uniform upper deck), so the view draws solid cloud only where cloudy air is still buoyant, as cumulus are, or pressed under warmer air, as a stratocumulus layer is; blurs it so streamers fade and masses round off; and gives it a soft-thresholded, billowed edge and rounded shading from a low sun at the lower right (peach and pink lit, grey-violet in shadow). With `feather` on, a wider blur of the same field, frayed by fixed fractal noise, adds a translucent fringe that fades out over several pixels around the solid core. Still cloud and near-saturated air show as a faint veil, and rain as soft see-through curtains. The simulation itself is unchanged. The Lava lamp view shows buoyancy (warmer or cooler than the row average) with falling rain drawn in pale cyan; cloud and faint drizzle are left out so they cannot veil the blobs. Cloud and rain (gray-white cloud, pale cyan rain, blue vapor haze), temperature, buoyancy and relative humidity views isolate the fields with fixed color scales. Rule sliders affect the current run; `water`, Reset and New seed restart it. Reduced-motion users start paused and background tabs do not accumulate catch-up. The shared service worker precaches the convection assets; installation still opens Rain study, which links to every experiment.

Model checks in `convection-model.test.js` cover water conservation, seed determinism, and sustained motion plus visible rain shafts over 4000 ticks on four fresh random seeds per run with the inversion on, and on two of them with it off (named in the test title; rerun one with `CONVECTION_SEEDS=123,456`). With the inversion on, motion is scored in the convecting layer under it. Further checks cover the sounding, the cloud piling up under the inversion and following its height, and the capped, feathered and raw drawings. Browser review: watch blobs rise and fall and puffy clouds build and drift in Sunset for a minute, switch views, vary buoyancy and flicker, toggle the inversion and move its height, switch cloud style and feathering, check pause/step/reset/new seed, phone-width layout and offline reload.

## Horizon light: six layers and atmospheric color

Open [horizon.html](horizon.html). Three terrain silhouettes alternate with three cloud planes at fixed base distances 3/8/18/30/65/90 km. Cloud shapes are literal 32×12 grayscale bitmaps in `horizon-bitmaps.js`, generated once and stored as image data. No runtime noise/density evolution occurs. `horizon-model.js` owns scene geometry and rendering, `atmosphere-model.js` owns spherical-Earth extinction/scattering, and `horizon.js` owns controls/playback. All are precached in the existing app scope.

An Earth-sized sphere blocks direct sunlight by ray/sphere intersection. An exponential 8 km molecular scale height and 1.2 km aerosol scale height determine RGB optical depth to the top of the 100 km atmosphere. More blue leaves the direct beam than red. Each visible cloud pixel has its own altitude and sunlight path; distance changes the local horizon and camera-path extinction. A coarse 64×40 single-scattered sky is enlarged behind display-resolution cloud/terrain layers. Camera is at 150 m, fixed pitch 5° and vertical FOV 40°. Kilometers and degrees are used on controls; RGB radiance/exposure are relative.

Controls vary cloudAltitude, altitudeSpread (layer/instance offsets and bitmap thickness), distanceScale, sun elevation/azimuth, atmospheric density, aerosols, exposure and playback speed. Sun remains infinitely distant; playback changes angular position, starting paused. A status summary reports cloud-center heights/distances and direct-light/shadow state. The canvas stays visible while controls scroll.

This is an independent CPU experiment inspired by [GPU Gems 2 atmospheric scattering](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering) and [Bruneton](https://ebruneton.github.io/precomputed_atmospheric_scattering/), not a port or calibrated implementation. Numerical sampling, RGB proxies, cloud/terrain shading, sky-based aerial perspective and ambient fill are explicit approximations. No ozone, refraction, multiple scattering, terrain-cast solar shadows or weather. Cloud pixels can enter Earth's shadow separately; terrain silhouettes only obscure the camera.

Run `node --test apps/cloud-simulator/*test.js`. Review the sun crossing the horizon, cloud-height/spread/distance controls, fixed shape behavior, atmosphere color, both playback axes/reset, mobile scrolling and offline navigation after service-worker activation. Model/GUI checks are separate from actual browser verification.
