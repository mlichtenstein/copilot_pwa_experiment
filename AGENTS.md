# AGENTS.md — Instructions for AI coding agents

This repo is a static PWA experiment (plain HTML/CSS/browser JavaScript, no build step or automated tests). See [README.md](README.md) for layout and how PR previews are deployed.

## Rules

1. **Include verification evidence in every PR.** Put it in the PR description. If the change affects a deployed app, link the preview from the "Review deployments" comment (`/previews/pr-N/apps/<name>/`), but only after the Deploy run succeeded. Otherwise, give step-by-step instructions a human reviewer can follow to confirm the change works. Never claim checks passed that you did not run.
2. **Do not open PRs that close issues.** Don't use closing keywords (`Closes`, `Fixes`, `Resolves`) in PR titles, descriptions, or commits. Reference issues with plain links like `Related to #123`; humans close issues.
3. **Respond to all outstanding comments when assigned to a PR.** Cover conversation comments, review summaries, and inline review comments/threads (including outdated ones, across all pages). For each, either make the change or reply with your reasoning.
