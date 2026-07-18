import { assertEquals, assertThrows } from "@std/assert";
import type { DiffFile } from "../diff/types.ts";
import {
  buildEvidenceContext,
  claimAnchor,
  claimFindingBody,
  formatEvidenceContext,
  validateEvidenceClaims,
} from "./evidence.ts";

const file: DiffFile = {
  id: "file-1",
  oldPath: "src/check.ts",
  path: "src/check.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  hunks: [{
    header: "@@ -8,2 +8,2 @@",
    oldStart: 8,
    newStart: 8,
    lines: [
      {
        kind: "context",
        content: "const ready = true;",
        oldLine: 8,
        newLine: 8,
      },
      { kind: "deletion", content: "return allow;", oldLine: 9 },
      { kind: "addition", content: "return allow && ready;", newLine: 9 },
    ],
  }],
  isBinary: false,
  isGenerated: false,
  isLockfile: false,
  isWhitespaceOnly: false,
  priority: 0,
  prioritySignals: [],
};

Deno.test("buildEvidenceContext includes exact side-specific lines and reports truncation", () => {
  const complete = buildEvidenceContext(file);
  assertEquals(complete.lines.length, 4);
  assertEquals(complete.omittedLines, 0);
  assertEquals(
    formatEvidenceContext(complete).includes("NEW 9 | return allow && ready;"),
    true,
  );

  const limited = buildEvidenceContext(file, 45);
  assertEquals(limited.lines.length < 4, true);
  assertEquals(limited.omittedLines, 4 - limited.lines.length);
  assertEquals(
    formatEvidenceContext(limited).includes("CONTEXT TRUNCATED"),
    true,
  );
});

Deno.test("validateEvidenceClaims accepts exact citations and builds a private finding", () => {
  const context = buildEvidenceContext(file);
  const result = validateEvidenceClaims({
    claims: [{
      title: "Guard changed",
      explanation: "The return now also depends on ready.",
      evidence: [{ side: "new", line: 9, quote: "return allow && ready;" }],
      confidence: "high",
      uncertainty: "The surrounding caller contract is not shown.",
    }],
  }, context);
  assertEquals(result.rejected, 0);
  assertEquals(result.claims.length, 1);
  assertEquals(claimAnchor(file, result.claims[0]), {
    fileId: "file-1",
    filePath: "src/check.ts",
    side: "new",
    line: 9,
  });
  assertEquals(
    claimFindingBody(result.claims[0]).includes("Why this may be wrong:"),
    true,
  );
});

Deno.test("validateEvidenceClaims rejects invented, mismatched, and malformed claims", () => {
  const context = buildEvidenceContext(file);
  const base = {
    title: "Guard changed",
    explanation: "The return changed.",
    confidence: "medium",
    uncertainty: "Other code is not shown.",
  };
  const result = validateEvidenceClaims({
    claims: [
      { ...base, evidence: [{ side: "new", line: 99, quote: "invented" }] },
      {
        ...base,
        evidence: [{ side: "old", line: 9, quote: "return allow && ready;" }],
      },
      { ...base, evidence: [], confidence: "certain" },
      { ...base, evidence: [{ side: "old", line: 11, quote: "" }] },
    ],
  }, context);
  assertEquals(result, { claims: [], rejected: 4 });
  assertThrows(() => validateEvidenceClaims([], context));
});
