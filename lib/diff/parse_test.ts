import { assertEquals, assertRejects } from "@std/assert";
import { parseDiff } from "./parse.ts";
import { SAMPLE_DIFF } from "../sample.ts";

const source = { kind: "sample" as const, label: "test" };

Deno.test("parseDiff maps files, lines, status, and review signals", async () => {
  const document = await parseDiff(SAMPLE_DIFF, source, "Sample");

  assertEquals(document.stats, {
    files: 4,
    additions: 23,
    deletions: 3,
    lines: 37,
  });
  assertEquals(document.files[0].path, "src/auth/session.ts");
  assertEquals(document.files[0].status, "modified");
  assertEquals(document.files[0].hunks[0].lines[0], {
    kind: "context",
    content: "  const claims = await verifyToken(token);",
    oldLine: 8,
    newLine: 8,
  });
  assertEquals(document.files[2].status, "added");
  assertEquals(document.files[3].isLockfile, true);
  assertEquals(document.files[0].priority > document.files[1].priority, true);
});

Deno.test("parseDiff detects whitespace-only files", async () => {
  const document = await parseDiff(
    `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-hello world
+hello   world
`,
    source,
  );
  assertEquals(document.files[0].isWhitespaceOnly, true);
});

Deno.test("parseDiff preserves added, deleted, renamed, and binary status", async () => {
  const added = await parseDiff(
    `diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+new
`,
    source,
  );
  const deleted = await parseDiff(
    `diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-old
`,
    source,
  );
  const renamed = await parseDiff(
    `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`,
    source,
  );
  const binary = await parseDiff(
    `diff --git a/logo.png b/logo.png
index 111..222 100644
Binary files a/logo.png and b/logo.png differ
`,
    source,
  );

  assertEquals(added.files[0].status, "added");
  assertEquals(added.files[0].oldPath, "new.txt");
  assertEquals(deleted.files[0].status, "deleted");
  assertEquals(deleted.files[0].path, "old.txt");
  assertEquals(renamed.files[0].status, "renamed");
  assertEquals(binary.files[0].status, "binary");
});

Deno.test("parseDiff cleans quoted Git paths", async () => {
  const document = await parseDiff(
    `diff --git "a/path with space.ts" "b/path with space.ts"
--- "a/path with space.ts"
+++ "b/path with space.ts"
@@ -1 +1 @@
-old
+new
`,
    source,
  );
  assertEquals(document.files[0].path, "path with space.ts");
});

Deno.test("parseDiff normalizes CRLF and produces stable content hashes", async () => {
  const lf = await parseDiff(SAMPLE_DIFF, source);
  const crlf = await parseDiff(SAMPLE_DIFF.replaceAll("\n", "\r\n"), source);
  assertEquals(lf.id, crlf.id);
});

Deno.test("parseDiff rejects empty, malformed, and bounded input", async () => {
  await assertRejects(() => parseDiff("", source), Error, "Paste a diff");
  await assertRejects(
    () => parseDiff("hello", source),
    Error,
    "No file changes",
  );
  await assertRejects(
    () =>
      parseDiff(SAMPLE_DIFF, source, "large", {
        maxBytes: 10,
        maxFiles: 20,
        maxLines: 20,
      }),
    Error,
    "larger",
  );
});
