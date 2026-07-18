import { assertEquals, assertStringIncludes } from "@std/assert";
import { parseDiff } from "./parse.ts";
import { exportReview } from "./export.ts";
import { SAMPLE_DIFF } from "../sample.ts";

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
