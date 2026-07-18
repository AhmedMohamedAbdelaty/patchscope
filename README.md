# Patchscope

Patchscope reviews Git patches and supported public forge changes. It orders
files with explained heuristics, turns them into a suggested review route,
tracks progress and private line findings locally, and exports a Markdown
ledger.

Live at
[patchscope.ahmedmohamedabdelaty.deno.net](https://patchscope.ahmedmohamedabdelaty.deno.net).

## Inputs and limits

- Paste a unified Git diff or upload a `.patch`/`.diff` file. Local input never
  leaves the browser.
- Import public GitHub, GitLab.com, Codeberg, and Gitea.com changes. The server
  accepts exact-host change URLs only and keeps a short ETag cache.
- Use Change Atlas to move through contracts, data, behavior, interface, tests,
  delivery, and low-signal artifacts with general, security, or test-first
  ordering. Its path-based route is guidance, not a dependency graph.
- Add private concerns, questions, notes, and bookmarks to diff lines. Choose
  which findings enter Markdown, or move review state in a metadata-only
  `.patchscope.json` capsule.
- Add adjacent local or public-forge revisions to a temporary stack. Patchscope
  shows the file delta, carries only identical-file progress, and keeps
  invalidated findings visibly stale instead of guessing a nearby line.
- Press `Ctrl+K` or `Cmd+K` inside a review for the command palette. It can move
  review state, copy an issue follow-up draft, download a team memo, and build a
  VS Code link after you provide an absolute local workspace path.
- Open **Evidence** to run an explicit check on the selected file only. OpenAI
  uses your request-only API key; Ollama stays on the fixed local
  `127.0.0.1:11434` route. Patchscope rejects citations that do not exactly
  match a sent line and never posts model output.
- Open **Team handoff** to set a browser-local reviewer signature, attach simple
  path ownership rules, and create a passphrase-encrypted `.patchscope.team`
  file. The packet contains no patch lines and withholds every finding not
  explicitly selected for publication.
- Inputs are limited to 5 MiB, 2,000 files, and 100,000 review lines.
- Private repositories, provider writes, authenticated accounts, hosted team
  presence, autonomous AI review, and server-side patch storage are out of
  scope.

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

`/health` returns the active Deno Deploy revision. `/api/change` accepts GitHub
commit/PR/compare URLs, GitLab.com commit/MR/compare URLs, and Codeberg or
Gitea.com commit/PR/compare URLs. It returns stable errors, upstream retry
timing when available, and `X-RateLimit-*` headers. Redirects are never
followed.

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

After the app exists, publish a tested local checkout with:

```sh
deno deploy . --org ahmedmohamedabdelaty --app patchscope --prod
```

Use the new platform, not Deploy Classic. Deno documents the current flow in
[Getting started](https://docs.deno.com/deploy/getting_started/),
[Fresh framework support](https://docs.deno.com/deploy/reference/frameworks/#fresh-fresh),
and the
[`deno deploy` command](https://docs.deno.com/runtime/reference/cli/deploy/).

## Structure

- `lib/diff/` owns parsing, priority signals, limits, and Markdown export.
- `lib/client/` stores review progress in IndexedDB.
- `lib/ai/` owns selected-file context, the claim schema, and exact citation
  validation.
- `lib/review/` validates portable, source-free review capsules and computes
  conservative transitions between revisions.
- `lib/team/` validates path ownership intent and encrypts portable, source-free
  team handoffs with Web Crypto.
- `lib/server/` validates supported forge URLs, bounds provider reads, caches
  responses, and rate-limits imports.
- `islands/ReviewWorkspace.tsx` coordinates the browser review loop.
- `routes/` contains the Fresh shell and HTTP boundaries.

Priority scores choose a review order. They do not claim that a file is
vulnerable, correct, or safe.

See [PRODUCT.md](./PRODUCT.md) for the product principles and
[ROADMAP.md](./ROADMAP.md) for the independently shippable phases. The source
notes and product implications are recorded in [RESEARCH.md](./RESEARCH.md). The
app, revision, timeline, secret, and rollback model is explained in
[DEPLOYMENT.md](./DEPLOYMENT.md).
