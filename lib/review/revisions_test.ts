import { assertEquals } from "@std/assert";
import { parseDiff } from "../diff/parse.ts";
import type { ReviewFinding } from "./notebook.ts";
import { compareRevisions, transitionRevision } from "./revisions.ts";

const FIRST = `diff --git a/keep.ts b/keep.ts
--- a/keep.ts
+++ b/keep.ts
@@ -1 +1 @@
-old
+new
diff --git a/change.ts b/change.ts
--- a/change.ts
+++ b/change.ts
@@ -1 +1 @@
-before
+after
diff --git a/gone.ts b/gone.ts
deleted file mode 100644
--- a/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
`;

const NEXT = `diff --git a/keep.ts b/keep.ts
--- a/keep.ts
+++ b/keep.ts
@@ -1 +1 @@
-old
+new
diff --git a/change.ts b/change.ts
--- a/change.ts
+++ b/change.ts
@@ -1 +1 @@
-before
+later
diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1 @@
+hello
`;

function finding(id: string, fileId: string, filePath: string): ReviewFinding {
  return {
    id,
    kind: "note",
    anchor: { fileId, filePath, side: "new", line: 1 },
    body: id,
    included: true,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
  };
}

Deno.test("revision delta classifies unchanged, updated, added, and removed files", async () => {
  const previous = await parseDiff(FIRST, { kind: "paste", label: "first" });
  const next = await parseDiff(NEXT, { kind: "paste", label: "next" });
  const delta = compareRevisions(previous, next);
  assertEquals(
    {
      unchanged: delta.unchanged,
      updated: delta.updated,
      added: delta.added,
      removed: delta.removed,
    },
    { unchanged: 1, updated: 1, added: 1, removed: 1 },
  );
});

Deno.test("revision transition carries only identical progress and marks unavailable anchors stale", async () => {
  const previous = await parseDiff(FIRST, { kind: "paste", label: "first" });
  const next = await parseDiff(NEXT, { kind: "paste", label: "next" });
  const keep = previous.files.find((file) => file.path === "keep.ts")!;
  const change = previous.files.find((file) => file.path === "change.ts")!;
  const gone = previous.files.find((file) => file.path === "gone.ts")!;
  const result = transitionRevision(previous, next, {
    viewedFileIds: [keep.id, change.id, gone.id],
    selectedFileId: keep.id,
    findings: [
      finding("keep", keep.id, keep.path),
      finding("change", change.id, change.path),
      finding("gone", gone.id, gone.path),
    ],
  });
  const nextKeep = next.files.find((file) => file.path === "keep.ts")!;
  assertEquals(result.review.viewedFileIds, [nextKeep.id]);
  assertEquals(result.review.selectedFileId, nextKeep.id);
  assertEquals(result.review.findings[0].anchor.fileId, nextKeep.id);
  assertEquals(result.review.findings[0].stale, undefined);
  assertEquals(result.review.findings[1].stale?.reason, "file-changed");
  assertEquals(result.review.findings[2].stale?.reason, "file-removed");
});

Deno.test("an identical rename can carry review state without fuzzy line matching", async () => {
  const originalRaw = `diff --git a/keep.ts b/keep.ts
--- a/keep.ts
+++ b/keep.ts
@@ -1 +1 @@
-old
+new
`;
  const renamedRaw = `diff --git a/keep.ts b/kept.ts
similarity index 90%
rename from keep.ts
rename to kept.ts
--- a/keep.ts
+++ b/kept.ts
@@ -1 +1 @@
-old
+new
`;
  const previous = await parseDiff(originalRaw, {
    kind: "paste",
    label: "first",
  });
  const next = await parseDiff(renamedRaw, { kind: "paste", label: "rename" });
  const keep = previous.files.find((file) => file.path === "keep.ts")!;
  const result = transitionRevision(previous, next, {
    viewedFileIds: [keep.id],
    selectedFileId: keep.id,
    findings: [finding("keep", keep.id, keep.path)],
  });
  const kept = next.files.find((file) => file.path === "kept.ts")!;
  assertEquals(
    result.delta.files.find((file) => file.path === "kept.ts")?.state,
    "unchanged",
  );
  assertEquals(result.review.viewedFileIds, [kept.id]);
  assertEquals(result.review.findings[0].anchor.filePath, "kept.ts");
});
