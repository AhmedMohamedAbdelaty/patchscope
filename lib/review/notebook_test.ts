import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { parseDiff } from "../diff/parse.ts";
import { SAMPLE_DIFF } from "../sample.ts";
import {
  MAX_CAPSULE_BYTES,
  parseReviewCapsule,
  type ReviewFinding,
  serializeReviewCapsule,
} from "./notebook.ts";

async function fixture() {
  return await parseDiff(SAMPLE_DIFF, { kind: "sample", label: "Sample" });
}

Deno.test("review capsule round-trips progress and anchored findings without source", async () => {
  const document = await fixture();
  const file = document.files[0];
  const line =
    file.hunks[0].lines.find((candidate) => candidate.newLine)?.newLine ?? 1;
  const finding: ReviewFinding = {
    id: "finding-1",
    kind: "concern",
    anchor: { fileId: file.id, filePath: file.path, side: "new", line },
    body: "Could this invalidate an active session?",
    included: true,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
  };

  const raw = serializeReviewCapsule(document, {
    viewedFileIds: [file.id],
    selectedFileId: file.id,
    findings: [finding],
  });
  const restored = parseReviewCapsule(raw, document);

  assertEquals(restored, {
    viewedFileIds: [file.id],
    selectedFileId: file.id,
    findings: [finding],
  });
  assertStringIncludes(raw, '"version": 1');
  assertEquals(raw.includes("export async function openSession"), false);
  for (
    const content of document.files.flatMap((candidate) =>
      candidate.hunks.flatMap((hunk) => hunk.lines.map((line) => line.content))
    ).filter((content) => content.trim().length >= 20)
  ) {
    assertEquals(raw.includes(content), false);
  }
});

Deno.test("review capsule rejects wrong documents and stale anchors atomically", async () => {
  const document = await fixture();
  const file = document.files[0];
  const raw = serializeReviewCapsule(document, {
    viewedFileIds: [],
    findings: [{
      id: "finding-1",
      kind: "note",
      anchor: {
        fileId: file.id,
        filePath: file.path,
        side: "new",
        line: 999_999,
      },
      body: "Stale",
      included: false,
      createdAt: "2026-07-18T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z",
    }],
  });

  assertThrows(
    () => parseReviewCapsule(raw, document),
    Error,
    "stale line anchor",
  );
  const wrongDocument = JSON.stringify({
    ...JSON.parse(raw),
    document: { id: "another-change" },
  });
  assertThrows(
    () => parseReviewCapsule(wrongDocument, document),
    Error,
    "different change",
  );
});

Deno.test("review capsule rejects malformed versions and finding content", async () => {
  const document = await fixture();
  assertThrows(
    () => parseReviewCapsule("not json", document),
    Error,
    "not valid JSON",
  );
  assertThrows(
    () =>
      parseReviewCapsule(
        JSON.stringify({ format: "patchscope.review", version: 2 }),
        document,
      ),
    Error,
    "version 2",
  );
  assertThrows(
    () => parseReviewCapsule(" ".repeat(MAX_CAPSULE_BYTES + 1), document),
    Error,
    "1 MiB limit",
  );
});

Deno.test("review capsule rejects duplicate IDs and empty substantive findings", async () => {
  const document = await fixture();
  const file = document.files[0];
  const line = file.hunks[0].lines.find((candidate) => candidate.newLine)!;
  const finding: ReviewFinding = {
    id: "duplicate",
    kind: "question",
    anchor: {
      fileId: file.id,
      filePath: file.path,
      side: "new",
      line: line.newLine!,
    },
    body: "Why?",
    included: true,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
  };
  const duplicate = serializeReviewCapsule(document, {
    viewedFileIds: [],
    findings: [finding, finding],
  });
  assertThrows(
    () => parseReviewCapsule(duplicate, document),
    Error,
    "duplicate finding IDs",
  );
  const empty = serializeReviewCapsule(document, {
    viewedFileIds: [],
    findings: [{ ...finding, id: "empty", body: "   " }],
  });
  assertThrows(
    () => parseReviewCapsule(empty, document),
    Error,
    "invalid finding content",
  );
});
