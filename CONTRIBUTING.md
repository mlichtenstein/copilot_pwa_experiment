<!--
Purpose: Define the issue-to-merge workflow.
Consumers: Contributors, reviewers, and coding agents.
Dependencies: CODING_STANDARDS.md, GitHub templates, and the deployment workflow.
-->
# Contributing

Follow the [coding standards](CODING_STANDARDS.md). Agents also follow [AGENTS.md](AGENTS.md). Use the [README](README.md) for repository layout and deployment, and the relevant [adventure guide](apps/adventure/README.md), [Waiting Game design](docs/waiting-game-design.md), and [milestones](docs/waiting-game-milestones.md) for game work.

## Issues: what changed and why

Keep the issue body short:

1. **Problem:** a succinct description of the problem and why it matters.
2. **Change summary:** a task list of deliverables.
3. **Pull requests:** links to every associated PR, each with a short description.

One issue can have multiple PRs. Add each PR to the issue body when opening it, and link back to the issue from the PR. Keep the change summary current as scope evolves. During work it describes planned and delivered work; before human closure it must accurately summarize what was delivered. Split unrelated follow-up work into another issue.

Technical specifications, detailed acceptance checks, investigation history, and verification evidence belong in the relevant PRs. Issues should remain useful as a quick overview without reading those details. Use the [issue template](.github/ISSUE_TEMPLATE/change.md).

## PRs: technical detail and evidence

Read the relevant design documents and affected code, then work on a branch. Use the [PR template](.github/pull_request_template.md) to explain this PR's portion of the issue:

- Link the issue using “Related to #N”.
- Briefly state motivation and describe the final technical changes: affected files/components, behavior and contracts, relevant acceptance checks, and important implementation choices.
- Explain significant architectural decisions or consequential tradeoffs when applicable.
- Record verification evidence and limitations in the PR description.

Before final review, rewrite the title and description around the final diff. Keep them current as revisions change the work; do not leave a chronological account of abandoned approaches. Reconcile scope changes with the issue summary and its PR list.

Do not use automatic issue-closing keywords in PR titles, descriptions, or commits. Humans close issues.

## Agent commit identity

AI coding agents must prefix every commit subject they create with their identity, using `<Agent identity>: <summary>`. For example:

- `ChatGPT: Add shared coding standards`
- `GitHub Copilot: Update card styles`

Use the actual agent or product identity; do not invent a model version. This convention identifies agent-created work even when the connector records the human account as the Git author. It does not change Git author/committer metadata. Apply it to new commits; rewriting existing history is separate work.

## Progress checkboxes

Use `- [ ]` for pending work and `- [x]` for completed work.

**Issue checkboxes track delivered work.** Check a deliverable only after its PR(s) have merged and verification evidence is recorded. A proposal, open PR, or partial implementation remains unchecked; a short status note or PR link can explain progress. Split a task when independently deliverable parts make that helpful.

**PR checkboxes track branch work.** Check implementation or verification tasks when actually completed on the PR branch, with supporting evidence in that PR. A checked PR task does not complete the issue deliverable before merge.

Update checkboxes at meaningful progress points and before final review. Reopen items if later changes invalidate completion. Remove canceled work with a brief explanation instead of marking it completed. Keep the issue's PR index as ordinary links. Checkboxes track status; they never replace evidence.

## Verification evidence

State what you checked, how to repeat it, expected and observed results, and what remains unverified. Include commands/results, manual steps, screenshots, or preview links as appropriate. Distinguish checks you executed from suggested reviewer steps. Never claim unrun checks passed.

Inspect the current checkout for available tools. This repository currently has no automated test runner or build step. The Waiting Game design describes planned unit and integration tests; those requirements do not mean the tests already exist. Run available relevant checks and record exact results; do not invent test commands.

For local browser checks, with Python 3 installed, run from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/app/` or the affected app under `http://localhost:8000/apps/<name>/`. Stop the server with Ctrl+C. Localhost supports service-worker testing; opening HTML directly via file URLs does not provide equivalent PWA behavior.

As relevant to the change:

- Exercise the affected actions and expected outcomes; check browser console/network errors.
- Check mobile-width layout and readable, usable controls.
- Check persistence across reloads where implemented; do not assume all games persist.
- Load online, wait for the worker to activate/control the page, then test offline reload and cached assets. Check updated assets/cache behavior and app/preview isolation when service workers change.
- For game logic, verify relevant rules and state transitions; use the design's planned tests as acceptance guidance, without claiming unimplemented features exist.

For documentation-only work, inspect links, template structure, policy consistency, and the diff. Explain why app checks do not apply.

### Deployments

Check the Deploy workflow and its “Review deployments” comment. Link affected-app previews only after successful deployment. Report pending/failed/unavailable accurately; never construct a URL and imply it is live without evidence. No preview is expected when no deployable app changes. Fork PRs skip the preview deploy and do not get a preview. The workflow does not fail for that reason. Production and previews use different paths; see the README.

## Review and readiness

Read and address all PR conversation comments, review summaries, and inline comments/replies/threads, including outdated threads and every page of results. Do not rely only on the conversation feed or overall review status.

For actionable feedback, make and validate the change or respond with reasoning or a clarification request. Acknowledge comments requiring no change. Recheck feedback after updates; summarize unresolved items. Resolve a thread only when its feedback has been addressed.

A PR is ready to merge when its purpose is clear, its changes match the issue's scope, its technical description is current, verification evidence and limitations are recorded, and actionable feedback is addressed. After merge, update issue progress; humans decide when to close the issue.

These documents and templates guide contributors. They do not add automated merge enforcement.
