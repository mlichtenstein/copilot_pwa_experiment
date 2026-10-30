<!-- Purpose: Repository overview and app navigation. Consumers: users and contributors. Dependencies: app folders and contribution documents. -->
# copilot_pwa_experiment

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue/PR workflow and verification, [CODING_STANDARDS.md](CODING_STANDARDS.md) for code conventions, and [AGENTS.md](AGENTS.md) for agent instructions.

One UI guideline worth knowing up front: **explanatory text sits next to the thing it explains**, for example a tooltip on each button or an About expander beside the rating bar, rather than in a separate help page. See [Explanatory text](CODING_STANDARDS.md#explanatory-text).

## Apps

- [Cloud simulator · Noise weather](apps/cloud-simulator/)

- [Counter](https://mlichtenstein.github.io/copilot_pwa_experiment/apps/counter/)
- [Dice roll / coin flip](https://mlichtenstein.github.io/copilot_pwa_experiment/apps/dice/)
- [Fizz & Fortune text adventure](https://mlichtenstein.github.io/copilot_pwa_experiment/apps/adventure/)
- [Waiting Game](https://mlichtenstein.github.io/copilot_pwa_experiment/apps/waiting-game/)
- [Text adventure engine guide](apps/adventure/README.md)

Each file has a header comment explaining its job. Everything uses **relative paths**, so the same files work at any URL.

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
| `apps/cloud-simulator/` | Cloud and weather experiments (noise weather, sunset, convection, horizon); see its [guide](apps/cloud-simulator/README.md) |
| `apps/counter/` | A standalone counter PWA |
| `apps/dice/` | Dice roller and coin flip PWA |
| `apps/adventure/` | Button-driven, three-room text adventure |
| `apps/waiting-game/` | Waiting Game daily-loop prototype |

## How deployment works

The workflow publishes to a branch called `gh-pages`, which GitHub Pages serves.

| Event | Result |
| --- | --- |
| Push/merge to `main` | `app/` is published at the site root and `apps/` at `/apps/`. Previews are left alone. |
| Pull request opened or updated | The same layout is published at `/previews/pr-N/` (N is the PR number), and a "Review deployments" comment on the PR lists a preview URL for each affected app. The comment is created on the first run and refreshed on every update; it only shows links after the deploy succeeds and otherwise says the deployment failed or that no preview exists. |
| Pull request closed | `/previews/pr-N/` is deleted. |

Production and previews coexist because each run only replaces its own folder. Runs are queued one at a time (a `concurrency` group) so they can't collide.

**Why previews don't clash:** a service worker only controls pages under the folder it was registered from. Each app registers its worker with a relative path, and each manifest uses `"scope": "./"`. If more than one worker matches a URL, the browser uses the longest scope, so the worker for that folder controls the page. On the deployed site the site-root worker's folder also contains `apps/` and `previews/`; a nested page switches to its own worker once that worker has been registered.

Cache Storage is shared by the whole origin, including every app and every `/previews/pr-N/` folder. Folder scope alone does not isolate caches. Each worker therefore names its bucket with its own registration scope, for example `counter::/copilot_pwa_experiment/apps/counter::v1` in production and `counter::/copilot_pwa_experiment/previews/pr-12/apps/counter::v1` for a preview. On activate, a worker deletes only older names that start with its own scope prefix. It does not delete another app's or preview's caches, and it leaves older shared names (such as `waiting-game-v2`) in place so a deployment that has not picked up this scheme yet can still read them.

Online loads use the network (`cache: "no-cache"`) and then store that response in the scope's bucket, so a deploy shows fresh pages without renaming the cache. If the network fails, the worker serves the last copy it stored. New files still need to be added to that worker's precache list so the first offline visit has them.

## One-time setup

1. Merge to `main` (or push) so the workflow runs once and creates the `gh-pages` branch.
2. **Settings → Pages**: set source to *Deploy from a branch*, branch `gh-pages`, folder `/ (root)`.
3. **Settings → Actions → General → Workflow permissions**: choose *Read and write permissions*.

## URLs

- Production: `https://<owner>.github.io/<repo>/`
- Counter: `https://<owner>.github.io/<repo>/apps/counter/`
- Dice and coin: `https://<owner>.github.io/<repo>/apps/dice/`
- Fizz & Fortune: `https://<owner>.github.io/<repo>/apps/adventure/`
- Waiting Game: `https://<owner>.github.io/<repo>/apps/waiting-game/`
- PR previews use the same paths under `/previews/pr-N/`.

## Trying it from your phone

1. Open a PR and wait for the workflow to finish (Actions tab).
2. Tap the preview link in the PR comment.
3. In Chrome on Android, use menu → *Install app* / *Add to Home screen*.

## Limitations

PRs from forks can't push to `gh-pages`, so they get no preview.
