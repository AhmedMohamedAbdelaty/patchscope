# Patchscope product contract

## Outcome

Patchscope turns a patch, diff file, or supported public forge URL into a
focused review workspace. It helps a reviewer answer three questions quickly:
what changed, where should I start, and what have I already checked?

## Product boundary

### Included

- Paste a Git unified diff.
- Upload `.patch` or `.diff` files.
- Import a public GitHub, GitLab.com, Codeberg, or Gitea.com change URL through
  a server-side allowlisted adapter.
- Browse files by path or review priority.
- Follow a conservative suggested route through change-purpose layers, with
  general, security, and test-focused lenses.
- Review a selected file in unified or split form, wrap long lines, search
  within changes, and link to a line.
- Hide lockfiles, generated files, and whitespace-only files without discarding
  them.
- Mark files viewed, resume local progress, jump to the next unreviewed file,
  and export a Markdown review summary.
- Add private concerns, questions, notes, and bookmarks to an old or new line.
  Findings remain in the browser and only explicitly included findings appear in
  Markdown exports.
- Export and restore a versioned review capsule containing progress, anchors,
  and findings but no diff contents.
- Add adjacent local or supported public-forge revisions to an in-memory review
  stack, inspect their file delta, and move through the stack one revision at a
  time.
- Carry reviewed state and active findings forward only when the normalized file
  diff is identical. Preserve findings from changed or removed files as visibly
  stale evidence without guessing a replacement line.
- Import public GitLab.com, Codeberg, and Gitea.com change URLs through the same
  read-only, bounded server contract. Never follow provider redirects or fetch a
  user-supplied hostname.
- Open an explicitly configured local workspace path in a supported editor,
  invoke core review actions from a keyboard command palette, and copy or
  download issue/document drafts without posting them.
- Explain every priority signal; never present heuristics as a security verdict.
- Work with keyboard, touch, reduced motion, zoom, and narrow screens.

### Excluded

- Provider writes, private repositories, accounts, comments posted to a
  provider, arbitrary forge hosts or URLs, AI review, server-side patch
  persistence, or persistence of a revision stack across reloads.
- Claims that a change is safe, correct, or vulnerable.
- Claims that path-based layers represent runtime or dependency relationships.

## Acceptance criteria

1. A valid pasted or uploaded diff opens without a network request and shows
   accurate file and line counts.
2. Public forge change URLs are normalized, dispatched only to exact-host
   adapters, and fetched with bounded response size and stable errors.
3. The file list exposes status, additions, deletions, review state, and an
   explained review-order score.
4. Unified and split views preserve line numbers and support an addressable
   selected line.
5. Review progress survives reloads in the browser and can be cleared.
6. Filtering never changes totals silently; hidden-file counts remain visible.
7. Empty, loading, malformed, binary-only, rate-limited, oversized, and
   upstream-error states are distinct.
8. Core parsing, URL validation, scoring, export, and API behavior have
   automated tests.
9. `deno task check`, `deno task test`, and `deno task build` pass.
10. The production artifact follows the current Fresh-on-Deno-Deploy integrated
    build contract.
11. Every file belongs to one stable Change Atlas layer. Lenses may reorder or
    emphasize layers, but never silently reclassify a file.
12. Selecting an atlas layer composes with text and noise filters, exposes a
    clear all-layers reset, and never changes document totals.
13. A line finding records the file, old/new side, and line number; it can be
    edited, removed, and excluded from Markdown without losing the draft.
14. Findings survive reloads alongside file progress. Existing records created
    before findings existed still load with an empty notebook.
15. Review capsules are bounded, versioned, validated against the open change,
    and rejected atomically when malformed, unsupported, or stale. They never
    contain source or diff line contents.
16. A revision transition classifies prior and next files as unchanged, updated,
    added, or removed. Only an identical normalized file diff can carry reviewed
    state or an active line anchor.
17. Findings from updated or removed files remain available as stale evidence,
    state why they became stale, and are never rendered on a guessed line.
18. Duplicate revisions are rejected, revision switching restores each slice's
    local review record, and raw revision contents are never persisted.
19. Multi-forge imports accept only canonical HTTPS URLs on an exact host
    allowlist, construct download/API paths internally, reject redirects, and
    share the 5 MiB response bound and stable error envelope.
20. Editor links are generated only after the reviewer provides an absolute
    local workspace path. Path segments are URL-encoded and no file contents or
    workspace paths leave the browser.
21. The command palette is keyboard and touch accessible, and every export is a
    local copy/download action with an explicit destination-oriented label.

## Architecture decisions

- Fresh 2 with Vite and Preact islands. The initial shell is server-rendered;
  diff parsing and review interaction stay local in one workspace island.
- A narrow `gitdiff-parser` adapter maps third-party output into an owned model.
  UI and storage do not import vendor types.
- IndexedDB stores review sessions keyed by a SHA-256 digest. A small
  localStorage preference record stores display settings.
- Notebook anchors use the immutable patch identity plus file identity, old/new
  side, and line number. Revision-aware migration belongs to the revision model
  rather than being guessed during import.
- Revision matching uses path and explicit rename metadata, then compares owned
  normalized hunk data. The stack exists only in page memory; each document's
  ordinary review record remains independently durable in IndexedDB.
- Change Atlas is an owned, dependency-free classifier over normalized file
  metadata. It returns a stable layer and a human-readable reason; the UI calls
  its output a suggestion rather than a dependency graph.
- `/api/change` dispatches normalized URLs to exact-host provider adapters. Each
  adapter builds its API or `.diff` endpoint internally and returns raw unified
  diff text with source metadata. `/api/github` remains a compatibility alias.
- In-memory cache entries store ETag, payload, and expiry only. Patches are
  never logged or persisted by the server.

## Quality budgets

- Raw local input: 5 MiB maximum.
- Provider response: 5 MiB maximum after decompression.
- File count: 2,000 maximum; line count: 100,000 changed/context lines maximum.
- No blocking operation should run before input is submitted.
- The interface must remain usable at 320 CSS pixels and 200% zoom.
