# Implementation notes

## Deviations

- 2026-07-18: Product research moved optional AI behind orientation, private
  reasoning, and revision-aware review. Diff-only AI benchmarks and practitioner
  feedback do not support presenting automated findings as the first or primary
  product value.
- 2026-07-18: Phase 1 uses conservative path and file metadata classification
  instead of AST or import-graph analysis. The interface calls the result a
  suggested route and exposes its reason so it cannot be mistaken for a proven
  dependency graph.

- 2026-07-18: Chose a small parser adapter around `gitdiff-parser` instead of
  the richer `@pierre/diffs` renderer. The richer package pulls a large
  syntax-highlighting and React-oriented graph into the client. Patchscope needs
  direct control of keyboard behavior, review state, and responsive rendering
  more than it needs bundled highlighting.
- 2026-07-18: Dropped the planned bookmarklet after a live test showed GitHub's
  Content Security Policy blocks `javascript:` bookmarks. Direct URL import and
  `?github=` auto-import remain; a browser extension is the honest upgrade path.

## Discovered edge cases

- 2026-07-18: One file can plausibly fit several review purposes. Change Atlas
  therefore uses a documented first-match precedence and keeps classification
  stable while review lenses only change ordering.
- 2026-07-18: The first browser pass found that the horizontal route's intrinsic
  width pushed the lens selector outside a narrow navigator. Explicit zero
  minimum widths now keep route scrolling local; the page remains 390 CSS pixels
  wide in the automated browser check.
- 2026-07-18: Test naming is ecosystem-specific. The classifier covers test
  directories, `.test`/`.spec`, Deno and Go-style `_test`, and root-level
  `test_`/`spec_` filenames without treating every source suffix as a test.

- 2026-07-18: GitHub diff responses can omit textual hunks for binary files and
  can fail for very large diffs. The import boundary needs explicit binary and
  upstream-limit states instead of treating both as malformed input.
- 2026-07-18: A patch may contain commit mail metadata before the first
  `diff --git` marker. Parsing and document naming must tolerate that prelude.
- 2026-07-18: Public GitHub API access without a token is limited. The server
  route needs conditional caching, a clear rate-limit error, and no client-side
  token prompt.
- 2026-07-18: Real pull-request links commonly include `/files`, `/commits`, or
  `/checks`; the URL adapter normalizes those known views to the pull-request
  API resource.
- 2026-07-18: The machine started on Deno 2.2.11, which cannot run the current
  Fresh 2.3/Vite 7 build path. Deno was upgraded to the current stable 2.9.3;
  the project documents 2.9 or newer as its local prerequisite.
- 2026-07-18: The first automated accessibility pass found low-contrast
  secondary text, an unlabeled hidden file input, and invalid table-role
  composition around line links. The UI now uses darker secondary text, an
  explicit upload label, and native grouping semantics.
- 2026-07-18: Rendering a 100,000-line file at once would create 100,000 DOM
  rows. Selected files now reveal 2,000 lines at a time; parsing the full
  100,000-line limit took 66 ms in the local runtime.
- 2026-07-18: The 320 px review workspace initially expanded to 533 px because
  of intrinsic grid widths. The final responsive pass contains horizontal code
  scrolling inside the diff viewport without page-level overflow.
- 2026-07-18: Quoted Git paths expose a trailing-quote quirk in the parser
  dependency. The adapter normalizes those paths and covers added, deleted,
  renamed, binary, whitespace-only, CRLF, empty, malformed, and bounded input.
- 2026-07-18: The current `deno deploy` CLI uses `deploy.org` and `deploy.app`
  as its checked-in application context. A framework-only `deploy` object is
  valid build configuration but cannot be published locally until those fields
  identify the target app.
- 2026-07-18: Creating the app with a 1 GiB build-memory override let Vite
  finish but failed Deno's Fresh artifact finalization. The deployment now uses
  the platform's 3 GiB default instead of carrying that artificial constraint.
- 2026-07-18: The new platform exposes `DENO_DEPLOY=true` and identifies the
  active revision through `DENO_DEPLOY_BUILD_ID`. Production smoke testing
  caught the older value check and revision variable before handoff.

## Questions for review

- The working name is **Patchscope**. It is intentionally isolated to copy and
  metadata, so renaming does not affect the data model.

## Summary

- Kept the local-first review workspace and public GitHub boundary intact.
- Added a dependency-free Change Atlas with stable, explained file layers.
- Added general, security, and test-first routes without changing
  classification.
- Verified classification, filtering, keyboard flow, 390 px layout, and themes.
- Recorded later notebook, revision, integration, AI, team, and theme phases.
