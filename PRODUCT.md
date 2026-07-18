# Patchscope product direction

## Position

Patchscope is a private, evidence-first review cockpit for large and AI-heavy
changes. It helps a reviewer understand the shape of a change, keep a durable
place, and turn observations into a useful review without requiring an account
or sending local patches to a server.

It is not another bot that posts speculative comments. The human reviewer owns
the conclusion; Patchscope improves orientation, memory, and evidence.

## Primary user

A maintainer or senior reviewer opening a change that is too broad for a flat
file list. They need to decide where to start, separate behavior from supporting
work, and resume later without rebuilding their mental model.

## Product principles

1. Local-first is the default. Pasted and uploaded code stays in the browser.
2. Guidance must be inspectable. Heuristics expose their reason and uncertainty.
3. AI is optional and evidence-bound. It may assist; it may not pronounce a
   change safe or flood a provider with comments.
4. Progressive disclosure beats dashboards. The next useful action stays clear.
5. Review state belongs to the reviewer and must be portable before it becomes
   social.
6. Accessibility, keyboard use, and narrow screens are product behavior, not a
   polish phase.

## Success signals

- Time from import to the first meaningfully reviewed file.
- Percentage of started reviews resumed and completed.
- Suggested-route overrides, which reveal weak classifications.
- Notes promoted into exported review feedback.
- AI findings kept versus dismissed, once optional AI exists.

## Boundaries

- No account, provider write access, or server-side patch storage for the core
  workflow.
- No unexplained risk, quality, or safety score.
- No diff-only AI presented as authoritative review.
- No integration that makes the one-action import path harder.
