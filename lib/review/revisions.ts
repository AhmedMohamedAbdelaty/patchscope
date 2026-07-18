import type { DiffDocument, DiffFile } from "../diff/types.ts";
import type { ReviewFinding } from "./notebook.ts";

export type RevisionFileState = "unchanged" | "updated" | "added" | "removed";

export interface RevisionFileDelta {
  state: RevisionFileState;
  path: string;
  previous?: DiffFile;
  next?: DiffFile;
}

export interface RevisionDelta {
  files: RevisionFileDelta[];
  unchanged: number;
  updated: number;
  added: number;
  removed: number;
}

export interface RevisionReviewState {
  viewedFileIds: string[];
  selectedFileId?: string;
  findings: ReviewFinding[];
}

export interface RevisionTransition {
  delta: RevisionDelta;
  review: RevisionReviewState;
}

export function transitionRevision(
  previous: DiffDocument,
  next: DiffDocument,
  review: RevisionReviewState,
): RevisionTransition {
  const delta = compareRevisions(previous, next);
  const unchanged = new Map(
    delta.files.filter((file) => file.state === "unchanged").map((file) => [
      file.previous!.id,
      file.next!,
    ]),
  );
  const unavailable = new Map(
    delta.files.filter((file) =>
      file.state === "updated" || file.state === "removed"
    ).map((file) => [file.previous!.id, file.state]),
  );
  const viewedFileIds = review.viewedFileIds.flatMap((id) => {
    const target = unchanged.get(id);
    return target ? [target.id] : [];
  });
  const findings: ReviewFinding[] = review.findings.map((finding) => {
    if (finding.stale) return copyFinding(finding);
    const target = unchanged.get(finding.anchor.fileId);
    if (target) {
      return {
        ...copyFinding(finding),
        anchor: {
          ...finding.anchor,
          fileId: target.id,
          filePath: target.path,
        },
      };
    }
    const reason = unavailable.get(finding.anchor.fileId);
    return reason
      ? {
        ...copyFinding(finding),
        stale: {
          reason: reason === "removed"
            ? "file-removed" as const
            : "file-changed" as const,
          fromDocumentId: previous.id,
        },
      }
      : copyFinding(finding);
  });
  const selectedFileId = review.selectedFileId
    ? unchanged.get(review.selectedFileId)?.id
    : undefined;
  return { delta, review: { viewedFileIds, selectedFileId, findings } };
}

export function compareRevisions(
  previous: DiffDocument,
  next: DiffDocument,
): RevisionDelta {
  const remaining = new Set(previous.files);
  const files: RevisionFileDelta[] = [];

  for (const target of next.files) {
    const source = findPrevious(target, remaining);
    if (!source) {
      files.push({ state: "added", path: target.path, next: target });
      continue;
    }
    remaining.delete(source);
    files.push({
      state: sameDiff(source, target) ? "unchanged" : "updated",
      path: target.path,
      previous: source,
      next: target,
    });
  }
  for (const source of remaining) {
    files.push({ state: "removed", path: source.path, previous: source });
  }
  return {
    files,
    unchanged: count(files, "unchanged"),
    updated: count(files, "updated"),
    added: count(files, "added"),
    removed: count(files, "removed"),
  };
}

function findPrevious(target: DiffFile, candidates: Set<DiffFile>) {
  return [...candidates].find((source) => source.path === target.path) ??
    [...candidates].find((source) => target.oldPath === source.path);
}

function sameDiff(previous: DiffFile, next: DiffFile): boolean {
  return previous.isBinary === next.isBinary &&
    JSON.stringify(previous.hunks) === JSON.stringify(next.hunks);
}

function count(files: RevisionFileDelta[], state: RevisionFileState): number {
  return files.filter((file) => file.state === state).length;
}

function copyFinding(finding: ReviewFinding): ReviewFinding {
  return {
    ...finding,
    anchor: { ...finding.anchor },
    stale: finding.stale ? { ...finding.stale } : undefined,
  };
}
