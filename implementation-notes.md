# Implementation notes

## Phase 3 gate

- Goal: compare adjacent diff revisions without inventing repository history or
  moving review anchors heuristically.
- Unknowns checked: normalized file IDs include parse order, GitHub compare URLs
  are already accepted by the bounded adapter, and raw patches are intentionally
  absent from IndexedDB. Therefore matching must use paths/rename metadata plus
  normalized hunks, while the revision stack remains memory-only.
- Success criteria: deterministic delta counts; exact-diff carry-forward; honest
  stale evidence for changed/removed files; duplicate rejection; local and
  GitHub adjacent imports; slice navigation; capsule compatibility; and the
  existing check, test, build, browser, responsive, and production gates.
- Steps: specify the transition; test the pure model; add compatible capsule
  state; connect stack import/navigation; verify; push; match the live revision.
- Out of scope: cloning repositories, fetching arbitrary refs, fuzzy anchors,
  server persistence, provider writes, and cross-reload stack restoration.

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
- 2026-07-18: Initial releases used local CLI uploads because the existing app
  had no GitHub source. The app is now linked to
  `AhmedMohamedAbdelaty/patchscope`; the CLI remains a recovery path rather than
  the normal release mechanism.
- 2026-07-18: Two pushes produced no Deno revision despite the dashboard showing
  a linked repository. A checked-in GitHub Action now owns automatic deployment;
  it uses a scoped organization token and gates upload on test, check, and
  build.
- 2026-07-18: Phase 2 rejects capsules from another document instead of trying
  to match paths or nearby lines. Honest anchor migration requires the revision
  model planned for Phase 3.

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
- 2026-07-18: Deploying local source does not link an existing app to GitHub.
  Repository linking is an App Settings operation; its proof is a new build with
  GitHub source metadata triggered by a push.
- 2026-07-18: The Deno Deploy CLI appends a blank line to `deno.json` even for a
  read-only revision listing. Remove that formatting-only mutation before
  committing so deployment diagnostics do not create unrelated config churn.
- 2026-07-18: A linked Deno repository is not sufficient proof of automatic
  deployment. Two post-link pushes reached GitHub without enqueuing a revision,
  so the release contract now requires a green Action and changed health ID.
- 2026-07-18: Reloading does not reopen a local patch because Patchscope does
  not persist source contents. Reopening the same patch restores its notebook by
  document digest; the browser test now exercises that exact boundary.
- 2026-07-18: IndexedDB request success precedes transaction completion. Finding
  mutations now await the committed transaction before the UI says they were
  saved, so an immediate reload cannot race the write.
- 2026-07-18: A unified context row defaults to its new-side coordinate. The
  split view exposes separate old and new anchors when that distinction matters.
- 2026-07-18: Removing an inline editor also removes its focused control. Focus
  now returns to the exact annotation gutter or edited card instead of falling
  back to the page's first link.
- 2026-07-18: Two fast finding mutations can overlap before Preact rerenders.
  Mutations now derive from a synchronous notebook reference, expose busy state,
  and commit both changes without a last-write-wins loss.
- 2026-07-18: Phase 3 compares owned normalized hunks after path or explicit
  rename matching. A changed hunk, including shifted line coordinates, makes
  every affected finding stale; no similarity threshold exists.
- 2026-07-18: The revision stack is memory-only because persisting it would also
  persist patch contents. Each slice still uses its ordinary digest-keyed review
  record, so reopening that exact diff restores its progress and stale evidence.
- 2026-07-18: Native disclosure panels overlapped at 320 px. The revision rail
  now permits only one of the import or stale-evidence panels to be open, and
  anchors both panels to the rail on narrow screens.

## Questions for review

- The working name is **Patchscope**. It is intentionally isolated to copy and
  metadata, so renaming does not affect the data model.

## Summary

- Deviations recorded: 8; Phase 3 keeps the stack memory-only to preserve the
  source-free storage boundary.
- Most revisitable decision: optional AI remains behind the evidence model.
- Edge cases recorded: 31, including exact rename matching, stale anchors,
  duplicate revisions, stack branching, and overlapping touch disclosures.
- Next session should read `SPEC.md` before changing revision behavior.
- Release proof requires a green Action and matching `/health` revision.
