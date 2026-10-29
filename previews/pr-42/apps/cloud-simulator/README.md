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
