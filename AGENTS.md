# Agent & Contributor Guide

Conventions for anyone working in this repository, human or
agent, whatever tool is used.

## Pull Request Intent & Specification Rule
Every Pull Request created across this fleet MUST provide an explicit `Intent & Problem Statement` in the PR description:
1. Ground-Truth Baseline: Define the root problem, the intended architectural change, and the expected runtime outcome.
2. Review Grounding: The skeptical review panel explicitly audits the diff against this stated intent to catch scope creep, unstated regressions, or partial implementations.

This applies to every author, human or agent, whatever tool is used. A PR
that states no intent gives the panel nothing to judge the diff against, and
it will lower confidence accordingly. `.github/pull_request_template.md`
carries the sections to fill in.
