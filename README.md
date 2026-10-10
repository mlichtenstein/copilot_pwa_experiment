# copilot_pwa_experiment

Welcome! This repo is a tiny experiment: a **Progressive Web App (PWA)** that you can build, deploy and test entirely from GitHub, even from a phone, with no computer needed.

## What is this?

- **PWA**: a normal website that a phone can "install" like an app, with its own icon and full-screen window. It needs a *manifest* (a JSON file describing the app) and a *service worker* (a background script).
- **GitHub Pages**: a free GitHub feature that serves files from a branch as a website.
- **GitHub Actions**: GitHub's automation. A *workflow* file tells it what to do when something happens, such as a push.

The app itself is deliberately trivial: it says "Hello World!" and has a button that adds one to a counter. The counter is saved in your browser (`localStorage`), so it survives reloads.

## What's in the repo

| Path | Purpose |
| --- | --- |
| `app/index.html` | The page |
| `app/style.css` | Styling |
| `app/app.js` | Counter logic and service worker registration |
| `app/manifest.webmanifest` | Tells Android the app name, icons and colors so it can be installed (JSON can't hold comments, so it is explained here) |
| `app/sw.js` | Service worker: offline caching, required for installability |
| `app/icons/` | App icons (192 and 512 px) |
| `.github/workflows/deploy.yml` | The deployment automation |
| `apps/counter/` | A standalone counter PWA |
| `apps/dice/` | Dice roller and coin flip PWA |

## Apps

- [Counter](apps/counter/)
- [Dice roll / coin flip](apps/dice/)

Each file has a header comment explaining its job. Everything uses **relative paths**, so the same files work at any URL.

## How deployment works

The workflow publishes to a branch called `gh-pages`, which GitHub Pages serves.

| Event | Result |
| --- | --- |
| Push/merge to `main` | `app/` is published at the site root and `apps/` at `/apps/`. Previews are left alone. |
| Pull request opened or updated | The same layout is published at `/previews/pr-N/` (N is the PR number), and a "Review deployments" comment on the PR lists a preview URL for each affected app. The comment is created on the first run and refreshed on every update; it only shows links after the deploy succeeds and otherwise says the deployment failed or that no preview exists. |
| Pull request closed | `/previews/pr-N/` is deleted. |

Production and previews coexist because each run only replaces its own folder. Runs are queued one at a time (a `concurrency` group) so they can't collide.

**Why previews don't clash:** a service worker only controls the folder it was loaded from. Because `sw.js` is registered with a relative path and the manifest uses `"scope": "./"`, every preview has its own isolated worker and cache.

## One-time setup

1. Merge to `main` (or push) so the workflow runs once and creates the `gh-pages` branch.
2. **Settings → Pages**: set source to *Deploy from a branch*, branch `gh-pages`, folder `/ (root)`.
3. **Settings → Actions → General → Workflow permissions**: choose *Read and write permissions*.

## URLs

- Production: `https://<owner>.github.io/<repo>/`
- Counter: `https://<owner>.github.io/<repo>/apps/counter/`
- Dice and coin: `https://<owner>.github.io/<repo>/apps/dice/`
- PR previews use the same paths under `/previews/pr-N/`.

## Trying it from your phone

1. Open a PR and wait for the workflow to finish (Actions tab).
2. Tap the preview link in the PR comment.
3. In Chrome on Android, use menu → *Install app* / *Add to Home screen*.

## Limitations

PRs from forks can't push to `gh-pages`, so they get no preview.
