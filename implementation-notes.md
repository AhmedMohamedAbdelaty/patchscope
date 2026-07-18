# Implementation notes

## Phase 7 gate

- Goal: widen the visual system for long review sessions and varied access needs
  without making themes a second component architecture.
- Unknowns checked against current W3C and color-universal-design guidance:
  normal text needs 4.5:1 contrast; 320 CSS-pixel reflow and operating-system
  motion preferences need direct browser checks; color cannot be the only
  carrier of diff state.
- Success criteria: seven finite semantic themes; measured token contrast;
  redundant diff signs and labels; validated browser-local density, scale,
  code-face, and motion preferences; keyboard focus; 320 px containment; no
  change to review behavior; and the full local, browser, slop, push, Action,
  and production gates.
- Steps: own the preference vocabulary; expand semantic tokens; connect one
  native display disclosure; measure every explicit theme and control; push;
  match production.
- Out of scope: user-authored CSS, downloadable theme packages, runtime theme
  dependencies, cloud-synced preferences, layout builders, and animated theme
  transitions.

## Phase 6 gate

- Goal: let reviewers identify their exported work, express team review intent,
  and hand off deliberately published evidence without creating an account or
  uploading source.
- Unknowns checked against current GitHub, MDN, and OWASP guidance: full
  CODEOWNERS semantics are too broad to imitate partially; Web Crypto supplies
  PBKDF2 and AES-GCM directly; current PBKDF2-HMAC-SHA-256 guidance uses 600,000
  iterations.
- Success criteria: browser-local identity; explicit simple path rules; visible
  unmatched coverage; an authenticated randomized encrypted envelope; no patch
  lines, passphrases, excluded drafts, API keys, or workspace roots; document-
  bound import; merge without local draft loss; and the full local, browser,
  security, slop, push, Action, and production gates.
- Steps: own the profile/rule contract; implement and test the encrypted
  envelope; connect a publication receipt and import merge; verify; push; match
  production.
- Out of scope: login, verified identity, server storage, key recovery,
  presence, chat, approvals, notification delivery, and provider permission
  changes.

## Phase 5 gate

- Goal: make model assistance inspectable and optional without turning
  Patchscope into an automated reviewer or secret store.
- Unknowns checked against current official docs: OpenAI Responses supports
  strict `text.format` schemas and request storage control; Ollama `/api/chat`
  accepts JSON Schema and requires an allowed browser origin outside its local
  defaults.
- Success criteria: explicit selected-file runs; an 80 KiB context receipt;
  fixed OpenAI and loopback Ollama endpoints; request-only keys; strict schema
  plus exact line/side/quote validation; visible uncertainty; session-only
  claims; private excluded conversion; and the full local, browser, security,
  slop, push, Action, and production gates.
- Steps: own the context and claim schema; bound the two adapters; render a
  native evidence dialog; validate before display; connect private findings;
  verify; push; match production.
- Out of scope: repository-wide context, automatic runs, arbitrary model hosts,
  stored keys, model verdicts, provider posting, claim persistence, and hidden
  reasoning traces.

## Phase 4 gate

- Goal: make Patchscope a useful read-only review operating surface across major
  public forges and local tools without acquiring provider write authority.
- Unknowns checked against current official docs and live public endpoints:
  GitLab supports plain merge-request diffs; Gitea documents commit `.diff`
  responses; Codeberg and Gitea.com both returned commit diffs; only Codeberg's
  tested pull diff stayed public. Redirects therefore remain errors.
- Success criteria: exact-host parsing for GitLab.com, Codeberg, and Gitea.com;
  shared byte/time/error bounds; no redirect following; working command palette;
  encoded editor deep links; distinct issue and review-memo exports; and the
  full local, browser, security, slop, push, Action, and production gates.
- Steps: add bounded provider adapters; route the generic endpoint; add pure
  editor/export helpers; connect commands and UI; verify; push; match
  production.
- Out of scope: arbitrary self-hosted forges, private repositories, OAuth,
  provider writes, automatic issue creation, and detecting a local checkout.

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
- 2026-07-18: Phase 4 limits remote hosts to `github.com`, `gitlab.com`,
  `codeberg.org`, and `gitea.com`. Supporting arbitrary self-hosted instances
  would require DNS rebinding defenses and a managed allowlist, not URL parsing
  alone.
- 2026-07-18: Gitea.com redirected a public pull-diff request to login while its
  public commit-diff API worked. Forge fetches use `redirect: manual`;
  Patchscope explains the sign-in boundary and never follows the response.
- 2026-07-18: Editor links require an absolute browser-local workspace root.
  Diff paths cannot contain empty, dot, or parent segments, and every segment is
  URL-encoded before creating the documented VS Code scheme.
- 2026-07-18: A strict JSON schema constrains response shape but does not prove
  that cited code exists. Phase 5 resolves every side/line pair against the
  exact sent context and requires a byte-for-byte quote match before rendering.
- 2026-07-18: Local Ollama runs in the reviewer's browser rather than through
  Deno Deploy. This preserves the local route, but a production-origin browser
  may need that exact origin in `OLLAMA_ORIGINS`; Patchscope displays the
  command boundary instead of silently falling back to a cloud proxy.
- 2026-07-18: Exporting the ordinary review capsule would disclose excluded
  private findings. Team handoff builds a fresh capsule containing only findings
  already marked for publication, then encrypts that source-free payload.
- 2026-07-18: Team import merges published finding IDs and reviewed files into
  the local record instead of replacing it. A portable handoff must never erase
  the recipient's private drafts.
- 2026-07-18: The Phase 6 publication audit found that new notebook entries
  inherited an export-selected default. New findings now begin withheld; a
  reviewer must explicitly select Markdown publication before any team handoff
  can include them.

## Questions for review

- The working name is **Patchscope**. It is intentionally isolated to copy and
  metadata, so renaming does not affect the data model.

## Summary

- Deviations recorded: 8; Phase 3 keeps the stack memory-only to preserve the
  source-free storage boundary.
- Most revisitable decision: optional AI remains behind the evidence model.
- Edge cases recorded: 31, including exact rename matching, stale anchors,
  duplicate revisions, stack branching, and overlapping touch disclosures.
- Phase 4 adds exact-host multi-forge reads, local editor links, a command
  palette, and destination-specific drafts without provider write authority.
- Next session should read `SPEC.md` before changing provider or export
  behavior.
- Release proof requires a green Action and matching `/health` revision.
