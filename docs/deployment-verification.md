<!--
Purpose: Explain validation/publishing responsibilities and evidence limits.
Consumers: Contributors and workflow reviewers.
Dependencies: .github/workflows/test.yml and deploy.yml.
-->
# Validation and deployment

`Test` runs on a push to any branch and on PR opened, synchronize (new commits),
and reopened events. An open PR's new commit may produce both push and PR test
runs. It reports checks independently; it does not directly authorize deployment.

`Deploy` repeats the checks inside a read-only `validate` job. Keeping the gate
within the publishing workflow ties the result to that workflow's checkout rather
than trusting the status of a separate run.

| Deploy event | Validate | Publish/cleanup |
| --- | --- | --- |
| Push to main | Run content validation and tests | Publish production only after success |
| PR opened, synchronized, reopened | Run content validation and tests | Publish that PR's preview only after success |
| PR closed | Skip | Remove only that PR's preview |
| Validation failure | Fail | Skip publishing; inspect the failed check |

The workflow previously granted write permission to every job. That was unnecessary
for tests; adding execution of repository game code makes the separation matter.
`validate` has `contents: read`, no write permissions, and checkout does not persist
credentials. `deploy` explicitly retains `contents: write` for gh-pages commits and
`pull-requests: write` for preview comments. Each job has a separate runner/token;
changing the default does not remove deploy's explicit grants.

Production copy paths, preview copy paths, cleanup paths, and publish/comment shell
commands are unchanged by this permission separation. The local copy/cleanup smoke
check exercises those actual commands against temporary directories: production
preserves previews; a preview update preserves production and other previews;
closing that preview removes only its directory. This does not simulate GitHub's
event evaluator or permission enforcement.

Successful hosted PR validation, gh-pages push, and preview-comment steps provide
evidence for the PR-update path and deploy's write permissions. They do not prove
the main-push and closed-PR paths ran. Until those events actually occur, their
hosted behavior remains unverified; local filesystem checks and workflow inspection
are narrower evidence. No merge or production publication is performed just to
claim that verification. Existing fork-preview restrictions still apply.
