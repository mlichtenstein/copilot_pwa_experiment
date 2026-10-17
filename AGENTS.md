<!--
Purpose: Persistent coding-agent instructions.
Consumers: AI coding agents working in this repository.
Dependencies: CONTRIBUTING.md, CODING_STANDARDS.md, and relevant project documentation.
-->
# Instructions for AI coding agents

Before changes, read and follow [CONTRIBUTING.md](CONTRIBUTING.md), [CODING_STANDARDS.md](CODING_STANDARDS.md), the relevant issue, and affected code/design documents. The [README](README.md) explains the static PWA layout and deployment.

1. Use the shared issue and PR templates. Keep issues concise: problem, deliverable checkboxes, and links to every associated PR. Put technical details and verification evidence in each PR. Add PR links to the issue body and reconcile summaries with actual scope.
2. Maintain issue and PR checkboxes using CONTRIBUTING.md's completion rules. Issue deliverables stay unchecked until merged with verification evidence; PR tasks track completed branch work. Never check pending, partial, or unverified work.
3. Include verification evidence in every PR description: checks performed and results, steps a reviewer can follow, and anything unverified. For affected deployed apps, use the “Review deployments” comment's preview only after Deploy succeeds. Report failed/pending/unavailable honestly. Never claim checks passed that you did not run.
4. Do not use automatic issue-closing keywords in PR titles, descriptions, or commits. Use plain references such as “Related to #123”; humans close issues.
5. Read and address all outstanding PR feedback: conversation comments, review summaries, and inline comments/replies/threads, including outdated ones and every page. Make and validate changes or reply with reasoning; acknowledge comments requiring no change. Recheck after updates, report unresolved items, and resolve threads only after addressing feedback. Do not infer that an empty conversation feed means there are no review comments.
6. Before final review, update the PR title/description to explain the final diff, update progress and issue links, and report remaining limitations. Keep changes scoped; follow existing architecture and avoid unnecessary dependencies.

7. Prefix every commit subject you create with your identity, following [the agent commit convention](CONTRIBUTING.md#agent-commit-identity), for example `ChatGPT: Add coding standards`. This labels the work without changing Git author metadata.
8. Keep PRs short and succinct, with short, descriptive titles and one clear reviewable task each. Prefer several smaller PRs over one large PR; include the tests and documentation needed to verify each task. When steps depend on one another, state the review/merge order and target the preceding branch so each diff shows only its own changes.
