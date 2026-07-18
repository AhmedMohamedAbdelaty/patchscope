# Product research (2026-07-18)

This is the evidence behind the roadmap, not a feature checklist. Sources were
selected for repeated reviewer pain, established review products, and recent
code-review research.

## Phase 4 provider verification

- [GitLab's current merge-request API](https://docs.gitlab.com/api/merge_requests/#show-merge-request-raw-diffs)
  documents `/raw_diffs`, while its
  [user documentation](https://docs.gitlab.com/user/project/merge_requests/changes/#download-merge-request-changes)
  supports appending `.diff` to a merge-request URL. Patchscope uses the public
  plain-diff route and retains GitLab's own diff limits.
- [Gitea's API](https://docs.gitea.com/api/1.21/#tag/repository/operation/repoDownloadCommitDiffOrPatch)
  documents `GET /repos/{owner}/{repo}/git/commits/{sha}.diff`. Live Codeberg
  and Gitea.com requests returned unified text for that contract.
- [Forgejo documents Codeberg](https://forgejo.org/docs/latest/user/first-repository/)
  as a public Forgejo instance. Patchscope limits this first adapter to Codeberg
  rather than resolving arbitrary instance hosts.
- [VS Code documents](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls)
  the `vscode://file/{absolute path}:line:column` protocol used by the local
  editor link.
- A live Gitea.com pull `.diff` request redirected to login. Provider fetches
  use manual redirect handling so credentials, cookies, and arbitrary redirect
  destinations never enter the server import path.

## What reviewers repeatedly ask for

- Large changes create an orientation and memory problem: reviewers lose track
  of checked files, generated noise, and where to begin. A recent
  [PullMate discussion](https://www.reddit.com/r/chrome_extensions/comments/1u0uy2r/pullmate_a_chrome_extension_that_turns_githubs_pr/)
  validates progress, filters, and private notes, but also warns that checklists
  and time tracking can feel like extra work.
- Reviewers want a short explanation, a few starting files, and generated or
  formatting changes separated from behavior. That pattern recurs in
  [large-PR workflow discussions](https://www.reddit.com/r/codereview/comments/1l6zwg0/how_do_you_deal_with_large_prs_without_being_that/).
- GitHub's redesigned Files Changed view still receives feedback about large-PR
  performance, comment placement, and diff expansion in the
  [GitHub community discussion](https://github.com/orgs/community/discussions/163932).
- Re-review needs explicit revision bounds. Reviewers ask for “since my last
  review,” while
  [GitLab diff versions](https://docs.gitlab.com/user/project/merge_requests/versions/)
  and [Reviewable](https://docs.reviewable.io/reviews) demonstrate durable
  revision and review-state models.

## Competitor direction

- [CodeRabbit walkthroughs](https://docs.coderabbit.ai/pr-reviews/walkthroughs)
  consolidate related files and use diagrams when they improve understanding.
  Its 2026 Change Stack direction reinforces guided layers over a flat file
  list.
- [Reviewable](https://docs.reviewable.io/files.html) treats file revisions,
  review marks, discussions, keyboard control, and generated-file suppression as
  first-class review state.
- [Difftastic](https://github.com/wilfred/difftastic) shows why structural
  signal can make reformats easier to understand, but its language-aware runtime
  is a later, demand-dependent browser investment for Patchscope.
- AI-first products such as CodeRabbit, Greptile, and Qodo compete on repository
  context and automated findings. Patchscope should differentiate through
  private human reasoning and trust calibration rather than imitate comment
  volume.

## AI evidence and constraint

- [SWE-PRBench](https://arxiv.org/abs/2603.26130) reports that evaluated
  frontier models recover only a minority of human-flagged pull-request issues,
  with diff-only context particularly limiting.
- Practitioner discussions describe occasional valuable catches alongside
  false-positive fatigue, including this
  [CodeRabbit field report](https://www.reddit.com/r/devops/comments/1ojc1b6/tried_coderabbit_for_automated_code_reviews_and/).

The product implication is not “never use AI.” It is to add AI only after
Patchscope can supply explicit context, cite evidence, expose uncertainty, and
learn from dismissals without publishing anything automatically.

Phase 5 follows the current provider contracts rather than adding an SDK:

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
  recommends schema-constrained output over JSON mode. Patchscope uses the
  Responses API `text.format` contract with strict JSON Schema and disables
  provider storage for every request.
- [Ollama Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs)
  accepts a JSON Schema in `/api/chat`'s `format` field. Patchscope also parses
  and verifies the returned content; schema compliance alone does not prove a
  citation exists.
- [Ollama's networking guidance](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)
  binds locally by default and uses `OLLAMA_ORIGINS` for browser origins. The UI
  shows the exact current origin and never lets a review configure a remote
  model URL.

## Decisions produced by the research

1. Solve orientation first with Change Atlas.
2. Build private review memory before accounts or social workflow.
3. Make revisions a product primitive before provider write integrations.
4. Treat AI as an optional evidence assistant, never a verdict engine.
5. Keep the default workflow local, inspectable, and dependency-light.

## Phase 6 identity and handoff verification

- [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
  makes path ownership legible but also documents precedence and syntax that a
  partial clone could easily misrepresent. Patchscope therefore offers only four
  explicit local pattern forms and calls matches review intent, not code owner
  enforcement.
- [MDN's Web Crypto derivation guide](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)
  documents deriving an AES-GCM key from PBKDF2 key material with a random salt
  and using a 12-byte IV. Patchscope uses that browser-native boundary rather
  than introducing a cryptography dependency.
- [OWASP's current password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2)
  recommends 600,000 PBKDF2-HMAC-SHA-256 iterations. The handoff envelope fixes
  that export work factor and bounds accepted import factors to limit malicious
  CPU work.
- [OWASP's cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
  prefers AES with at least 128-bit keys and an authenticated mode. The handoff
  uses AES-256-GCM and authenticates the Patchscope envelope context.
