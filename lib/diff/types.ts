export type ChangeKind = "context" | "addition" | "deletion";
export type FileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "binary";

export interface DiffLine {
  kind: ChangeKind;
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface PrioritySignal {
  label: string;
  detail: string;
  weight: number;
}

export interface DiffFile {
  id: string;
  oldPath: string;
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isBinary: boolean;
  isGenerated: boolean;
  isLockfile: boolean;
  isWhitespaceOnly: boolean;
  priority: number;
  prioritySignals: PrioritySignal[];
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
  lines: number;
}

export interface DiffSource {
  kind: "paste" | "upload" | "github" | "provider" | "sample";
  label: string;
  url?: string;
}

export interface DiffDocument {
  id: string;
  title: string;
  source: DiffSource;
  files: DiffFile[];
  stats: DiffStats;
  importedAt: string;
}

export interface ParseLimits {
  maxBytes: number;
  maxFiles: number;
  maxLines: number;
}

export const DEFAULT_PARSE_LIMITS: ParseLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxFiles: 2_000,
  maxLines: 100_000,
};
