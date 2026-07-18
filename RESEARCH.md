# Product research (2026-07-18)

This is the evidence behind the roadmap, not a feature checklist. Sources were
selected for repeated reviewer pain, established review products, and recent
code-review research.

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

## Decisions produced by the research

1. Solve orientation first with Change Atlas.
2. Build private review memory before accounts or social workflow.
3. Make revisions a product primitive before provider write integrations.
4. Treat AI as an optional evidence assistant, never a verdict engine.
5. Keep the default workflow local, inspectable, and dependency-light.
