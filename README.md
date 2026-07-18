# Patchscope

Patchscope reviews Git patches and public GitHub changes. It orders files with
explained heuristics, tracks progress locally, and exports a Markdown ledger.

Live at
[patchscope.ahmedmohamedabdelaty.deno.net](https://patchscope.ahmedmohamedabdelaty.deno.net).

## Inputs and limits

- Paste a unified Git diff or upload a `.patch`/`.diff` file. Local input never
  leaves the browser.
- Import public GitHub commits, pull requests, and compares. The server accepts
  GitHub URLs only and keeps a short ETag cache.
- Inputs are limited to 5 MiB, 2,000 files, and 100,000 review lines.
- Private repositories, GitHub writes, accounts, AI review, and server-side
  patch storage are out of scope.

## Run locally

```sh
deno install
deno task dev
```

Requires Deno 2.9 or newer. Open `http://localhost:5173`. `GITHUB_TOKEN` is
optional and stays server-side.

```sh
GITHUB_TOKEN=github_pat_... deno task dev
```

## Verify

```sh
deno task test
deno task check
deno task build
```

`/health` returns the active Deno Deploy revision. `/api/github` returns stable
error codes, upstream retry timing when available, and `X-RateLimit-*` headers.

## Deploy

`deno.json` selects the `fresh` preset; Fresh needs no adapter.

From [console.deno.com](https://console.deno.com), create an app and connect the
repository. Add `GITHUB_TOKEN` as a secret only if the unauthenticated GitHub
allowance is insufficient.

For a local-source deployment, the current CLI also supports:

```sh
deno deploy create \
  --org your-org \
  --app patchscope \
  --source local \
  --framework-preset fresh \
  --build-timeout 5 \
  --build-memory-limit 3072 \
  --region global
```

Use the new platform, not Deploy Classic. Deno documents the current flow in
[Getting started](https://docs.deno.com/deploy/getting_started/),
[Fresh framework support](https://docs.deno.com/deploy/reference/frameworks/#fresh-fresh),
and the
[`deno deploy` command](https://docs.deno.com/runtime/reference/cli/deploy/).

## Structure

- `lib/diff/` owns parsing, priority signals, limits, and Markdown export.
- `lib/client/` stores review progress in IndexedDB.
- `lib/server/` validates GitHub URLs, bounds provider reads, caches responses,
  and rate-limits imports.
- `islands/ReviewWorkspace.tsx` coordinates the browser review loop.
- `routes/` contains the Fresh shell and HTTP boundaries.

Priority scores choose a review order. They do not claim that a file is
vulnerable, correct, or safe.
