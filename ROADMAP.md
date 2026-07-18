# Patchscope roadmap

Each phase must remain useful on its own, pass the full local verification
suite, be pushed as one reviewable release, and be smoke-tested in production.

## Phase 1: Change Atlas — shipped

Turn a flat file list into a conservative suggested review route. Stable layers
separate contracts, data, behavior, interface, tests, delivery, and low-signal
artifacts. General, security, and test-focused lenses change the route, not the
underlying classification. Every layer explains itself.

## Phase 2: Review Notebook — shipped

Add private, line-anchored questions, concerns, notes, and bookmarks. Save them
locally, include chosen findings in Markdown export, and define a versioned
portable review capsule without uploading code by default.

## Phase 3: Delta Time Machine — shipped

Model revisions explicitly. Import commit ranges, show changes since the last
review, retain unaffected progress, invalidate stale anchors honestly, and let
reviewers move through a stack one slice at a time.

## Phase 4: Review OS — shipped

Add public GitLab and Forgejo/Gitea imports behind the same bounded provider
contract. Offer editor deep links, a command palette, and deliberate exports to
issue trackers and team documents without gaining provider write access by
default.

## Phase 5: Trust-calibrated AI

Offer opt-in BYOK and local-model adapters. AI receives explicit context and
returns cited claims with evidence, confidence, and a reason the claim may be
wrong. Reviewers can dismiss, keep, or convert a claim into a private finding;
Patchscope never auto-posts it.

## Phase 6: Identity and teams

Add profiles, encrypted review sharing, team review rules, and hosted
collaboration only after portable artifacts prove the workflow. Keep personal
drafts private until explicitly published.

## Phase 7: Visual system expansion

Add paper, terminal, high-contrast, and color-vision-safe themes plus density,
type scale, code font, and motion controls. Themes share semantic tokens and the
same contrast and interaction tests.

## Ideas deliberately deferred

- Structural AST diffs: valuable, but browser language runtimes are too costly
  before demand is proven.
- A cross-repository dashboard: useful for teams, but it requires identity and
  provider authorization that the core workflow does not need.
- Automatic review verdicts: false precision conflicts with the product.
