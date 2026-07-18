import type { DiffDocument, DiffFile } from "../diff/types.ts";

export const REVIEW_CAPSULE_FORMAT = "patchscope.review";
export const REVIEW_CAPSULE_VERSION = 1;
export const MAX_CAPSULE_BYTES = 1024 * 1024;
export const MAX_FINDINGS = 5_000;
export const MAX_FINDING_BODY = 10_000;

export type FindingKind = "concern" | "question" | "note" | "bookmark";
export type AnchorSide = "old" | "new";

export interface FindingAnchor {
  fileId: string;
  filePath: string;
  side: AnchorSide;
  line: number;
}

export interface ReviewFinding {
  id: string;
  kind: FindingKind;
  anchor: FindingAnchor;
  body: string;
  included: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortableReviewState {
  viewedFileIds: string[];
  selectedFileId?: string;
  findings: ReviewFinding[];
}

export interface ReviewCapsuleV1 {
  format: typeof REVIEW_CAPSULE_FORMAT;
  version: typeof REVIEW_CAPSULE_VERSION;
  exportedAt: string;
  document: {
    id: string;
    title: string;
    source: DiffDocument["source"];
  };
  review: PortableReviewState;
}

export function serializeReviewCapsule(
  document: DiffDocument,
  review: PortableReviewState,
): string {
  const capsule: ReviewCapsuleV1 = {
    format: REVIEW_CAPSULE_FORMAT,
    version: REVIEW_CAPSULE_VERSION,
    exportedAt: new Date().toISOString(),
    document: {
      id: document.id,
      title: document.title,
      source: document.source,
    },
    review: {
      viewedFileIds: [...review.viewedFileIds],
      selectedFileId: review.selectedFileId,
      findings: review.findings.map(copyFinding),
    },
  };
  return JSON.stringify(capsule, null, 2);
}

export function parseReviewCapsule(
  raw: string,
  document: DiffDocument,
): PortableReviewState {
  if (new TextEncoder().encode(raw).byteLength > MAX_CAPSULE_BYTES) {
    throw new Error("Review capsule exceeds the 1 MiB limit.");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Review capsule is not valid JSON.");
  }
  if (!isRecord(value) || value.format !== REVIEW_CAPSULE_FORMAT) {
    throw new Error("This file is not a Patchscope review capsule.");
  }
  if (value.version !== REVIEW_CAPSULE_VERSION) {
    throw new Error(
      `Review capsule version ${String(value.version)} is not supported.`,
    );
  }
  if (!isRecord(value.document) || value.document.id !== document.id) {
    throw new Error("Review capsule belongs to a different change.");
  }
  if (!isRecord(value.review)) {
    throw new Error("Review capsule has no review state.");
  }

  const fileIds = new Set(document.files.map((file) => file.id));
  const viewed = readStringArray(value.review.viewedFileIds, "reviewed files");
  if (viewed.some((id) => !fileIds.has(id))) {
    throw new Error("Review capsule references a file outside this change.");
  }

  const selected = value.review.selectedFileId;
  if (
    selected !== undefined &&
    (typeof selected !== "string" || !fileIds.has(selected))
  ) {
    throw new Error("Review capsule has an invalid selected file.");
  }
  if (
    !Array.isArray(value.review.findings) ||
    value.review.findings.length > MAX_FINDINGS
  ) {
    throw new Error(
      `Review capsule must contain at most ${MAX_FINDINGS.toLocaleString()} findings.`,
    );
  }

  const ids = new Set<string>();
  const findings = value.review.findings.map((finding) =>
    readFinding(finding, document.files, ids)
  );
  return {
    viewedFileIds: viewed,
    selectedFileId: selected,
    findings,
  };
}

export function findingAnchorId(anchor: FindingAnchor): string {
  return JSON.stringify([anchor.fileId, anchor.side, anchor.line]);
}

function readFinding(
  value: unknown,
  files: DiffFile[],
  ids: Set<string>,
): ReviewFinding {
  if (
    !isRecord(value) || typeof value.id !== "string" || !value.id ||
    value.id.length > 128
  ) {
    throw new Error("Review capsule contains a finding with an invalid ID.");
  }
  if (ids.has(value.id)) {
    throw new Error("Review capsule contains duplicate finding IDs.");
  }
  ids.add(value.id);
  if (!isFindingKind(value.kind) || !isRecord(value.anchor)) {
    throw new Error("Review capsule contains an invalid finding.");
  }
  const anchor = value.anchor;
  if (
    typeof anchor.fileId !== "string" ||
    typeof anchor.filePath !== "string" ||
    (anchor.side !== "old" && anchor.side !== "new") ||
    !Number.isSafeInteger(anchor.line) ||
    (anchor.line as number) < 1
  ) {
    throw new Error("Review capsule contains an invalid line anchor.");
  }
  const file = files.find((candidate) => candidate.id === anchor.fileId);
  if (
    !file || file.path !== anchor.filePath ||
    !lineExists(file, anchor.side, anchor.line as number)
  ) {
    throw new Error("Review capsule contains a stale line anchor.");
  }
  if (
    typeof value.body !== "string" || value.body.length > MAX_FINDING_BODY ||
    (value.kind !== "bookmark" && !value.body.trim()) ||
    typeof value.included !== "boolean" ||
    !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)
  ) {
    throw new Error("Review capsule contains invalid finding content.");
  }
  return {
    id: value.id,
    kind: value.kind,
    anchor: {
      fileId: anchor.fileId,
      filePath: anchor.filePath,
      side: anchor.side,
      line: anchor.line as number,
    },
    body: value.body,
    included: value.included,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function lineExists(file: DiffFile, side: AnchorSide, line: number): boolean {
  return file.hunks.some((hunk) =>
    hunk.lines.some((candidate) =>
      (side === "old" ? candidate.oldLine : candidate.newLine) === line
    )
  );
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Review capsule has invalid ${label}.`);
  }
  return [...new Set(value)];
}

function isFindingKind(value: unknown): value is FindingKind {
  return value === "concern" || value === "question" || value === "note" ||
    value === "bookmark";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyFinding(finding: ReviewFinding): ReviewFinding {
  return { ...finding, anchor: { ...finding.anchor } };
}
