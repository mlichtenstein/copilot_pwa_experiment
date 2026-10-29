<!--
Purpose: Shared code conventions.
Consumers: Contributors, reviewers, and coding agents.
Dependencies: README.md and the referenced game design documents.
-->
# Coding standards

These rules apply to humans and agents. Follow the [contribution workflow](CONTRIBUTING.md).

## File headers

Every source and configuration file that supports comments must start with a short header stating **purpose**, **consumers**, and **dependencies**. Put it after required syntax such as a shebang, HTML doctype, or XML declaration. Use the file's native comment syntax.

- Purpose: what responsibility does this file have?
- Consumers: which files, components, tools, or runtime entry points use it?
- Dependencies: which modules, globals, DOM contracts, runtime APIs, or tools does it require? Say “none” when appropriate.

Describe meaningful contracts rather than every standard-library call. Update headers when those relationships change.

```js
/*
 * Purpose: Render the Waiting Game's current phase.
 * Consumers: index.html loads this script in the browser.
 * Dependencies: WaitingGame from game.js; the page's <main> element.
 */
```

Use HTML comments in Markdown/HTML, block comments in CSS/JavaScript, and # comments in YAML or shell files. Preserve template front matter at the beginning of GitHub issue templates; place their header after it.

JSON and other comment-free formats must remain valid. Record equivalent purpose, consumers, and dependencies in an adjacent README or the root README, identifying the file. Document binary assets there when useful; do not insert text into them. Apply these rules to new and modified files; a repository-wide retrofit is separate work.

## Style and scope

Follow existing file-local indentation, quoting, naming, and organization. Prefer clear names and straightforward functions. Avoid unrelated formatting churn, unrequested features, unnecessary dependencies, and architectural rewrites. Explain consequential dependencies or design changes in the PR.

## Architecture

The [README](README.md) describes the static HTML/CSS/browser JavaScript PWAs: `app/` serves the site root, `apps/` holds independent apps, and `docs/` holds design documents. Waiting Game uses the Node built-in test runner and the Test workflow; there is no build step; inspect the current checkout before choosing tools.

Keep game rules/state independent of the browser UI and authored content separate from engine logic. Keep canonical state JSON-serializable where required by the game design. Prefer content data over story-specific branches in UI code.

Follow the [adventure engine guide](apps/adventure/README.md) and the [Waiting Game design](docs/waiting-game-design.md) and [milestones](docs/waiting-game-milestones.md) for affected work. Follow Waiting Game milestones in order. Its proposed TypeScript structure and future tests are design targets, not evidence that such tooling exists.

## PWA behavior

Preserve static GitHub Pages compatibility and relative URLs. Keep manifests, service-worker registration scopes, and production/preview paths working. When adding or removing cached files, update that worker's precache list. Each cache name includes the worker's registration scope, and the fetch handler refreshes the bucket from the network, so a content deploy does not need a cache-name bump. On activate, delete only older cache names for that same scope. Do not delete another app's or preview's caches. Consider both installed and offline clients.

Preserve existing functionality outside the issue's scope and update documentation when behavior or contracts change. Record appropriate verification in the PR.
