# copilot_pwa_experiment

A minimal Progressive Web App (plain HTML/CSS/JS, no framework): it shows "Hello World!" and a button that increments a counter stored in `localStorage`. It is installable on Android (web app manifest + service worker).

The point is to demonstrate an entirely GitHub-hosted workflow for developing and testing a PWA from a phone.

## Layout

All app files live in [`app/`](app/). Every path is relative, so the app works from any sub-path.

## Deployment workflow

`.github/workflows/deploy.yml` publishes to the `gh-pages` branch:

| Event | Result |
| --- | --- |
| Push to `main` | `app/` is published at the site root, `/`. `previews/` is left untouched. |
| PR opened/updated | `app/` is published at `/previews/pr-N/`. Only that folder is replaced. |
| PR closed | `/previews/pr-N/` is removed. |

Production and previews coexist because each deployment only touches its own part of the branch (jobs are serialized with a `concurrency` group).

Service-worker scopes are isolated: `sw.js` is registered with a relative URL and the manifest uses `"scope": "./"` and `"start_url": "./"`, so each deployment's worker only controls its own directory.

## One-time setup

1. Run the workflow once (push to `main`) so the `gh-pages` branch exists.
2. In **Settings → Pages**, set the source to **Deploy from a branch**: `gh-pages` / `/ (root)`.
3. In **Settings → Actions → General**, allow workflows read and write permissions.

Production: `https://<owner>.github.io/<repo>/`
Preview: `https://<owner>.github.io/<repo>/previews/pr-N/` (the URL is also commented on the PR). Note that PRs from forks can't push, so they get no preview.
