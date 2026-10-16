# AGENTS.md — Instructions for AI coding agents

Persistent, repository-specific guidance. Read this file, the relevant docs, the issue, and the affected code before changing anything. If something here disagrees with the current checkout, trust the checkout and say so in your PR.

## Architecture

This is a static Progressive Web App (PWA) experiment: plain HTML, CSS, and browser JavaScript. On `main` there is **no package manifest, build configuration, or automated test suite**.

| Path | Purpose |
| --- | --- |
| `app/` | The "Hello World" counter PWA, published at the site root. |
| `apps/counter/`, `apps/dice/` | Independent single-page PWAs. |
| `apps/adventure/` | Fizz & Fortune text adventure. See [apps/adventure/README.md](apps/adventure/README.md): reusable engine (`game-engine.js`), authored world data (`world.js`), and browser UI (`adventure-ui.js`). |
| `apps/waiting-game/` | Waiting Game prototype: rules/state in `game.js` (no DOM), browser UI in `ui.js`. |
| `docs/` | [waiting-game-design.md](docs/waiting-game-design.md) and [waiting-game-milestones.md](docs/waiting-game-milestones.md). |
| `.github/workflows/deploy.yml` | GitHub Pages deployment. |
| `.github/pull_request_template.md` | PR template with a "Review deployments" section. |

Each app is self-contained: its own `index.html`, manifest, icon, and uniquely named service worker (for example `adventure-sw.js`, `waiting-game-sw.js`). Do not make apps depend on each other.

### Separation of concerns

Keep game rules and state separate from UI and from authored content. The UI calls into the rules and renders results; rules never touch the DOM. In `apps/adventure/`, world data is separate from the engine. In `apps/waiting-game/`, `game.js` holds the implemented state and daily loop (apartment, outfit, shift, encounters, end shift, day advance) with placeholder customer interactions.

**Implemented vs. planned:** the Waiting Game design document proposes TypeScript, a build system, a card engine, a narrative/storylet engine, persistence, and unit/integration tests. These are **planned, not implemented** unless the current checkout shows otherwise. Do not describe them as existing and do not introduce them outside the relevant milestone.

### Static hosting, paths, and PWA behavior

- The site is served statically from GitHub Pages, at `https://<owner>.github.io/<repo>/` (production) and `/previews/pr-N/` (PR previews). Always use **relative URLs** (`./`, `icon.svg`) so apps work under any prefix. Never use root-absolute paths such as `/apps/...`.
- Manifests use relative `start_url`/`scope` (for example `"scope": "./"`); the service worker is registered with a relative URL from the app's `index.html`. A worker only controls its own folder, so production and each preview get isolated workers and caches.
- Each service worker has a versioned cache name (for example `waiting-game-v1`) and a list of precached files. When adding, renaming, or removing an app asset, update that list; when cached assets change, bump the cache version so old caches are deleted.
- Deployment (`deploy.yml`): a push to `main` copies `app/` to the `gh-pages` root and `apps/` to `/apps/`, leaving `previews/` alone. A pull request copies the same layout to `previews/pr-N/` and posts/refreshes a "Review deployments" comment; closing the PR deletes that folder. Runs are serialized by a concurrency group. If you add an app, check whether the app list in the workflow's comment step needs updating (currently it lists the root app, Counter, Dice, and Fizz & Fortune; Waiting Game is not in that list, so verify before relying on it for a preview link).

## Coding conventions

- Follow the formatting and naming conventions of the file you are editing.
- Every file keeps a header comment stating its purpose, dependencies, and consumers; update it if those change.
- Preserve relative paths, existing apps, mobile usability (viewport, touch-sized controls, no horizontal overflow), and offline/PWA behavior.
- Keep game logic independently testable (pure functions over a state object, no DOM access) and keep state serializable (plain data, no functions or DOM references) where the design requires it.
- Avoid new dependencies, architectural rewrites, and unrequested features. Do not add a build step or package manager unless the issue asks for it.
- For Waiting Game work, follow the milestones in [docs/waiting-game-milestones.md](docs/waiting-game-milestones.md) **in order** (M1 to M5), and only implement what the assigned milestone covers.
- Keep READMEs, docs, service-worker asset lists, and cache versions consistent with your changes. Documentation-only issues must not change application code.

## Testing procedures

### Current tooling

There is currently **no automated test runner, linter, or build step**. Do not invent commands (`npm test`, etc.) and never report tests as passing when they were not run. Before running any check, inspect the current checkout (for example for `package.json`, test files, or workflow steps) to see what exists. The Waiting Game design (sections 10, 11, 16) and milestone M5 plan unit and integration tests and production build validation; consult [docs/waiting-game-design.md](docs/waiting-game-design.md) for those plans, and run them only if they exist in your checkout.

### Local serving and browser smoke test

1. From the repository root run a static server, e.g. `python3 -m http.server 8000`.
2. Open `http://localhost:8000/app/` or `http://localhost:8000/apps/<name>/` (`counter`, `dice`, `adventure`, `waiting-game`). Service workers work on `localhost`.
3. Exercise the changed app's behavior end to end (for Waiting Game: choose an outfit, go to work, finish encounters, end the shift, advance a day). Confirm the browser console has no errors.
4. Check mobile layout using device emulation at a narrow width (about 360 px): no horizontal scrolling, controls tappable.
5. If the app persists data (for example Counter uses `localStorage`; Waiting Game persistence is planned in M4), reload and confirm state survives.
6. Check offline behavior: load the page once, confirm the service worker is registered (DevTools → Application), switch to offline, reload, and confirm the app still works. After changing cached assets, confirm the new cache version is active and no stale files are served.
7. Spot-check that the other apps still load.

### Deployment and preview verification

- Open the Actions tab (or use the GitHub API/tools) and confirm the **Deploy** run for the PR's latest commit succeeded.
- Find the "Review deployments" PR comment and use only the preview links it lists for affected apps (`/previews/pr-N/apps/<name>/`). Only report a preview as available after that deployment succeeded; if it failed or no link was listed, say so. Links may take a minute to go live after Pages rebuilds.
- PRs from forks cannot push to `gh-pages`, so they get no preview.
- After merging, production lives at `https://<owner>.github.io/<repo>/`.

### Reporting

Every PR description must list the checks performed, their results, and any checks that could not be performed (and why).

## Expectations for AI coding agents

- Read this file, the relevant docs, the issue requirements, and the affected code before making changes.
- Keep changes scoped to the assigned issue. State conflicts between sources and any assumptions you made.
- **Read and address ALL pull request review feedback, including inline review comments.** That means top-level conversation comments, review summaries, and inline review comments, replies, and threads. Do not rely only on the PR conversation feed or the overall review status (for example "approved" or "changes requested").
- Fetch **every page** of review comments and threads, including outdated inline comments. Re-check reviews after each update you push, because new comments may arrive. No comment may be silently skipped.
- For each actionable comment, either implement the fix and validate it, or reply with reasoning for a different approach or a clarifying question. Acknowledge comments that need no code change.
- Summarize how each piece of feedback was addressed and list unresolved items. Do not mark a thread resolved unless the feedback was actually addressed, and do not claim completion while actionable feedback remains.
- Never claim that checks, deployments, or review work were completed without evidence.
