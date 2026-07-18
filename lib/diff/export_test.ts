import { assertEquals, assertStringIncludes } from "@std/assert";
import { parseDiff } from "./parse.ts";
import { exportReview } from "./export.ts";
import { SAMPLE_DIFF } from "../sample.ts";
import type { ReviewFinding } from "../review/notebook.ts";

Deno.test("exportReview emits an honest checked and unchecked Markdown ledger", async () => {
  const document = await parseDiff(SAMPLE_DIFF, {
    kind: "github",
    label: "owner/repo · PR #4",
    url: "https://github.com/owner/repo/pull/4",
  }, "PR #4");
  const markdown = exportReview(document, new Set([document.files[0].id]));

  assertStringIncludes(markdown, "Progress: 1/4 files reviewed");
  assertStringIncludes(markdown, "- [x] `src/auth/session.ts`");
  assertStringIncludes(markdown, "- [ ] `src/auth/session.test.ts`");
  assertStringIncludes(
    markdown,
    "navigation hints, not correctness or security findings",
  );
  assertEquals(markdown.includes("safe"), false);
});

Deno.test("exportReview escapes user-controlled Markdown syntax", async () => {
  const document = await parseDiff(
    `diff --git "a/weird\`name.ts" "b/weird\`name.ts"
--- "a/weird\`name.ts"
+++ "b/weird\`name.ts"
@@ -1 +1 @@
-old
+new
`,
    { kind: "upload", label: "[local]" },
    "review\n# injected",
  );
  const markdown = exportReview(document, new Set());

  assertStringIncludes(markdown, "# Review: review \\# injected");
  assertStringIncludes(markdown, "Source: \\[local\\]");
  assertEquals(markdown.includes("\n# injected"), false);
});

Deno.test("exportReview includes only deliberately selected findings", async () => {
  const document = await parseDiff(SAMPLE_DIFF, {
    kind: "sample",
    label: "Sample",
  });
  const file = document.files[0];
  const line = file.hunks[0].lines.find((candidate) => candidate.newLine)!;
  const base: ReviewFinding = {
    id: "finding-1",
    kind: "concern",
    anchor: {
      fileId: file.id,
      filePath: file.path,
      side: "new",
      line: line.newLine!,
    },
    body: "Could <script> bypass the session check?",
    included: true,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
  };
  const markdown = exportReview(document, new Set(), [
    base,
    {
      ...base,
      id: "finding-2",
      kind: "note",
      body: "Private",
      included: false,
    },
  ]);

  assertStringIncludes(
    markdown,
    "**Concern** — `src/auth/session.ts` (new line",
  );
  assertStringIncludes(
    markdown,
    "Could &lt;script&gt; bypass the session check?",
  );
  assertEquals(markdown.includes("Private"), false);
});

Deno.test("exportReview labels stale evidence instead of presenting a live anchor", async () => {
  const document = await parseDiff(SAMPLE_DIFF, {
    kind: "sample",
    label: "Sample",
  });
  const markdown = exportReview(document, new Set(), [{
    id: "stale-1",
    kind: "concern",
    anchor: {
      fileId: "old-file",
      filePath: "removed.ts",
      side: "new",
      line: 4,
    },
    body: "Recheck this behavior",
    included: true,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
    stale: { reason: "file-removed", fromDocumentId: document.id },
  }]);

  assertStringIncludes(markdown, "[stale: file removed]");
  assertStringIncludes(markdown, "`removed.ts` (new line 4)");
});
