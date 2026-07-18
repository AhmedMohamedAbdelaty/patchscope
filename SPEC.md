# Patchscope product contract

## Outcome

Patchscope turns a patch, diff file, or public GitHub change URL into a focused
review workspace. It helps a reviewer answer three questions quickly: what
changed, where should I start, and what have I already checked?

## Product boundary

### Included

- Paste a Git unified diff.
- Upload `.patch` or `.diff` files.
- Import a public GitHub commit, pull request, or compare URL through a
  server-side allowlisted adapter.
- Browse files by path or review priority.
- Review a selected file in unified or split form, wrap long lines, search
  within changes, and link to a line.
- Hide lockfiles, generated files, and whitespace-only files without discarding
  them.
- Mark files viewed, resume local progress, jump to the next unreviewed file,
  and export a Markdown review summary.
- Explain every priority signal; never present heuristics as a security verdict.
- Work with keyboard, touch, reduced motion, zoom, and narrow screens.

### Excluded

- GitHub write access, private repositories, accounts, comments posted to a
  provider, arbitrary URL fetching, AI review, or server-side patch persistence.
- Claims that a change is safe, correct, or vulnerable.

## Acceptance criteria

1. A valid pasted or uploaded diff opens without a network request and shows
   accurate file and line counts.
2. Public GitHub commit, pull request, and compare URLs are normalized and
   fetched only from GitHub's API with bounded response size and stable errors.
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

## Architecture decisions

- Fresh 2 with Vite and Preact islands. The initial shell is server-rendered;
  diff parsing and review interaction stay local in one workspace island.
- A narrow `gitdiff-parser` adapter maps third-party output into an owned model.
  UI and storage do not import vendor types.
- IndexedDB stores review sessions keyed by a SHA-256 digest. A small
  localStorage preference record stores display settings.
- `/api/github` accepts only a normalized GitHub URL. It builds GitHub REST
  endpoints internally and returns raw diff text with source metadata.
- In-memory cache entries store ETag, payload, and expiry only. Patches are
  never logged or persisted by the server.

## Quality budgets

- Raw local input: 5 MiB maximum.
- GitHub response: 5 MiB maximum after decompression.
- File count: 2,000 maximum; line count: 100,000 changed/context lines maximum.
- No blocking operation should run before input is submitted.
- The interface must remain usable at 320 CSS pixels and 200% zoom.
