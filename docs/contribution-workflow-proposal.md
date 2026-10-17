# Shared standards and contribution workflow proposal

Status: proposal for issue #38. This document specifies expected contents; it does not establish the final standards or replace existing instructions.

## Motivation

As this repository has grown through an AI-assisted workflow, issues and PRs have become long and difficult to reconcile. The original motivation, delivered changes, and evidence that those changes work are not consistently clear or aligned. Establish shared coding standards and a lightweight contribution process so reviewers can quickly understand why a change exists, what it does, and how it was verified.

## CODING_STANDARDS.md

Audience: all contributors and reviewers. Purpose: shared code requirements, independent of which tool or agent writes the code.

Expected sections:

1. **File headers.** Every source/configuration file that supports comments begins with a short header describing:
   - Purpose: the responsibility of this file.
   - Consumers: files, components, tools, or runtime entry points that use it.
   - Dependencies: modules, globals, DOM contracts, runtime APIs, or tools it requires. Say “none” where appropriate.
   Use the native comment syntax. Describe important contracts rather than every standard-library call. Keep headers accurate as relationships change. Document equivalent information for comment-free formats such as JSON in adjacent documentation; do not invalidate formats or modify binary assets.
2. **Style and naming.** Follow existing file-local indentation, quoting, naming, and organization; avoid incidental formatting churn. Prefer clear names and small, straightforward functions.
3. **Architecture boundaries.** Keep game rules/state separate from browser UI and authored content. Preserve static GitHub Pages compatibility. Distinguish today's browser JavaScript implementation from proposed TypeScript or future tooling; do not introduce a framework or build system solely to comply with this document.
4. **PWA conventions.** Preserve relative asset URLs, app/preview scopes, manifests, service-worker asset lists and cache update behavior. Account for installed/offline clients when changing assets.
5. **State and content.** Keep canonical game state serializable where required by the design. Prefer authored data over story-specific branches in UI code. Preserve existing behavior outside the issue's scope.
6. **Dependencies and documentation.** Explain consequential dependencies and architectural changes. Update documentation alongside changed contracts. Avoid unrequested features and unnecessary dependencies.

Include a short native-comment example:

```js
/*
 * Purpose: Render the Waiting Game's current phase.
 * Consumers: index.html loads this script in the browser.
 * Dependencies: WaitingGame from game.js; the page's <main> element.
 */
```

## CONTRIBUTING.md

Audience: humans and agents. Purpose: one lightweight issue-to-merge process.

Expected sections:

1. **Start with an issue.** State the observed problem and why it matters in a short paragraph. Specify observable acceptance criteria and material scope boundaries. Separate the desired result from a suggested implementation. Avoid chat transcripts and chronological investigation logs.
2. **Implement the agreed scope.** Read relevant architecture/design documents and coding standards first. Work on a branch. When discoveries change the scope, update the issue or split follow-up work; do not let the PR silently drift.
3. **Write the PR for a reviewer.** Reference the issue, explain motivation, summarize the final changes, and record verification evidence. Before final review, rewrite the title and description around the final implementation. Explain significant architectural decisions or tradeoffs when applicable, without requiring boilerplate for routine changes.
4. **Provide verification evidence.** State what was checked, how to repeat it, expected versus observed results, and what remains unverified. Appropriate evidence can include automated test results, manual steps, screenshots, or successful app preview links. Explicitly distinguish executed checks from instructions supplied for a reviewer.
5. **Use current tooling honestly.** Inspect the checkout for available tooling. The repository currently has no automated test runner or build step; do not invent test commands. Describe local HTTP serving and browser checks for affected behavior, mobile layout, persistence where implemented, and service workers/offline behavior when relevant. Link planned game tests without claiming they exist.
6. **Verify deployments.** Use the Deploy workflow and its “Review deployments” comment. Only present a preview as available after successful deployment; otherwise state failed, pending, or unavailable. Note fork preview limitations. Documentation-only PRs should explain why app verification is not applicable.
7. **Address review feedback.** Read conversation comments, review summaries, and inline threads, including outdated comments and all pagination. Make and validate changes or reply with reasoning/questions. Recheck after updates, summarize unresolved items, and resolve threads only after addressing feedback.
8. **Readiness and closure.** A PR is ready when purpose and scope are clear, verification evidence is recorded, and actionable review feedback is addressed. Preserve the current repository rule: reference issues with “Related to #N”; do not use automatic issue-closing keywords. Humans close issues.
9. **Document relationships.** Link CODING_STANDARDS.md, AGENTS.md, the README, relevant game design documents, and GitHub templates. Keep policy in shared documents rather than duplicating long rules in templates.

## GitHub issue template

Use a concise template under .github/ISSUE_TEMPLATE/ with these prompts:

- **Problem and motivation:** what is wrong or missing, why it matters, and a short example where useful.
- **Acceptance criteria:** observable outcomes a reviewer can verify.
- **Scope:** important boundaries; optional when there are none worth stating.
- **Suggested approach:** optional, clearly separated from requirements.

Keep instructions short. Do not require contributors to invent implementation details before investigation. Decide on a Markdown template or issue form based on the existing repository; either is sufficient.

## .github/pull_request_template.md

Replace the generic Summary prompt with:

- **Related issue:** plain reference/link, without automatic closing keywords.
- **Motivation:** a short description of the problem and its consequence.
- **Changes:** a concise account of the final implementation.
- **Verification evidence:** executed checks and results, reproduction steps or supporting artifacts, and explicit limitations.
- **Significant design decisions:** optional explanation of architecture changes or consequential tradeoffs.
- **Review deployments:** preserve the existing guidance about workflow success and affected-app preview URLs.

Provide short HTML-comment prompts, not lengthy policy text. A compact readiness checklist may link to CONTRIBUTING.md and ask whether scope, verification, and review feedback are reconciled. Do not treat checking a box as evidence that a check was run.

## AGENTS.md

Keep this file short and agent-specific:

- Require reading and following CONTRIBUTING.md and CODING_STANDARDS.md before changes.
- Require completing the issue/PR templates and reconciling final descriptions with delivered scope.
- Preserve existing requirements for verification evidence, honest preview reporting, human issue closure, and responding to all outstanding review comments.
- Explicitly include inline review comments/replies, outdated threads, review summaries, and pagination. Agents must not infer that an empty conversation feed means no review feedback exists.
- Require a clear account of checks run, checks not run, and unresolved feedback.
- Link shared rules rather than reproducing them in full.

## Scope and verification of this proposal

This proposal adds documentation only. It does not change application code, templates, existing AGENTS.md instructions, repository settings, or merge enforcement.

Reviewer verification:
1. Compare the proposed file responsibilities with issue #38.
2. Confirm that each required topic has a clear home and templates remain concise.
3. Confirm preservation of existing AGENTS.md rules, particularly human issue closure and all review comments.
4. Check that proposed verification distinguishes actual evidence from unexecuted instructions.

Follow-up implementation should replace this proposal with the agreed documents/templates, avoiding a stale second source of policy. Automated merge enforcement remains outside issue #38.
