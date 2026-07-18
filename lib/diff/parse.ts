import gitDiffParser from "gitdiff-parser";
import { scoreFile } from "./priority.ts";
import {
  DEFAULT_PARSE_LIMITS,
  type DiffDocument,
  type DiffFile,
  type DiffHunk,
  type DiffLine,
  type DiffSource,
  type FileStatus,
  type ParseLimits,
} from "./types.ts";

interface VendorChange {
  content: string;
  type: "normal" | "insert" | "delete";
  oldLineNumber?: number;
  newLineNumber?: number;
  lineNumber?: number;
}

interface VendorHunk {
  content: string;
  oldStart: number;
  newStart: number;
  changes: VendorChange[];
}

interface VendorFile {
  oldPath?: string;
  newPath?: string;
  type?: string;
  isBinary?: boolean;
  hunks?: VendorHunk[];
}

const parser = gitDiffParser as unknown as {
  parse(source: string): VendorFile[];
};

export class DiffParseError extends Error {
  constructor(
    public readonly code:
      | "EMPTY"
      | "TOO_LARGE"
      | "TOO_MANY_FILES"
      | "TOO_MANY_LINES"
      | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "DiffParseError";
  }
}

export async function parseDiff(
  rawInput: string,
  source: DiffSource,
  title = source.label,
  limits: ParseLimits = DEFAULT_PARSE_LIMITS,
): Promise<DiffDocument> {
  const raw = normalizeInput(rawInput);
  if (!raw.trim()) {
    throw new DiffParseError(
      "EMPTY",
      "Paste a diff or choose a patch file first.",
    );
  }
  if (new TextEncoder().encode(raw).byteLength > limits.maxBytes) {
    throw new DiffParseError(
      "TOO_LARGE",
      "This patch is larger than the 5 MiB local review limit.",
    );
  }

  let parsed: VendorFile[];
  try {
    parsed = parser.parse(raw);
  } catch {
    throw new DiffParseError(
      "INVALID",
      "This does not look like a supported unified Git diff.",
    );
  }

  const rawFiles = splitRawFiles(raw);
  const files = parsed.map((file, index) =>
    mapFile(file, rawFiles[index] ?? "", index)
  );
  if (!files.length) {
    throw new DiffParseError(
      "INVALID",
      "No file changes were found. Use a Git unified diff with file headers.",
    );
  }
  if (files.length > limits.maxFiles) {
    throw new DiffParseError(
      "TOO_MANY_FILES",
      `This patch has more than ${limits.maxFiles.toLocaleString()} files.`,
    );
  }

  const lines = files.reduce(
    (sum, file) =>
      sum + file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0),
    0,
  );
  if (lines > limits.maxLines) {
    throw new DiffParseError(
      "TOO_MANY_LINES",
      `This patch has more than ${limits.maxLines.toLocaleString()} review lines.`,
    );
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const id = Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return {
    id,
    title,
    source,
    files,
    stats: {
      files: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      lines,
    },
    importedAt: new Date().toISOString(),
  };
}

function mapFile(file: VendorFile, raw: string, index: number): DiffFile {
  const fallback = `unknown-${index + 1}`;
  const parsedOldPath = cleanPath(file.oldPath || fallback);
  const parsedNewPath = cleanPath(file.newPath || fallback);
  const path = file.type === "delete" ? parsedOldPath : parsedNewPath;
  const oldPath = file.type === "add" ? path : parsedOldPath;
  const hunks: DiffHunk[] = (file.hunks ?? []).map((hunk) => ({
    header: hunk.content,
    oldStart: hunk.oldStart,
    newStart: hunk.newStart,
    lines: hunk.changes.map(mapLine),
  }));
  const additions = countLines(hunks, "addition");
  const deletions = countLines(hunks, "deletion");
  const isBinary = file.isBinary === true ||
    (hunks.length === 0 &&
      /(^|\n)(Binary files .* differ|GIT binary patch)(\n|$)/.test(raw));
  const status = mapStatus(
    file.type,
    file.type === "rename" || file.type === "copy" || path !== oldPath,
    isBinary,
  );
  const isGenerated =
    /(^|\/)(dist|build|coverage|vendor)\/|\.min\.(js|css)$|\.generated\.|(^|\/)generated\//i
      .test(path);
  const isLockfile =
    /(^|\/)(deno\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|go\.sum|composer\.lock)$/i
      .test(path);
  const isWhitespaceOnly = whitespaceOnly(hunks);
  const base = {
    id: `${index}-${path}`,
    oldPath,
    path,
    status,
    additions,
    deletions,
    hunks,
    isBinary,
    isGenerated,
    isLockfile,
    isWhitespaceOnly,
  };
  const scored = scoreFile(base);
  return {
    ...base,
    priority: scored.priority,
    prioritySignals: scored.signals,
  };
}

function mapLine(change: VendorChange): DiffLine {
  if (change.type === "insert") {
    return {
      kind: "addition",
      content: change.content,
      newLine: change.lineNumber,
    };
  }
  if (change.type === "delete") {
    return {
      kind: "deletion",
      content: change.content,
      oldLine: change.lineNumber,
    };
  }
  return {
    kind: "context",
    content: change.content,
    oldLine: change.oldLineNumber,
    newLine: change.newLineNumber,
  };
}

function countLines(hunks: DiffHunk[], kind: DiffLine["kind"]): number {
  return hunks.reduce(
    (total, hunk) =>
      total + hunk.lines.filter((line) => line.kind === kind).length,
    0,
  );
}

function mapStatus(
  type: string | undefined,
  renamed: boolean,
  binary: boolean,
): FileStatus {
  if (binary) return "binary";
  if (type === "add") return "added";
  if (type === "delete") return "deleted";
  if (renamed || type === "rename" || type === "copy") return "renamed";
  return "modified";
}

function whitespaceOnly(hunks: DiffHunk[]): boolean {
  const removed = hunks.flatMap((hunk) =>
    hunk.lines.filter((line) => line.kind === "deletion").map((line) =>
      compact(line.content)
    )
  );
  const added = hunks.flatMap((hunk) =>
    hunk.lines.filter((line) => line.kind === "addition").map((line) =>
      compact(line.content)
    )
  );
  return removed.length > 0 && added.length > 0 &&
    removed.join("\n") === added.join("\n");
}

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

function normalizeInput(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function cleanPath(path: string): string {
  return path.replace(/^"|"$/g, "").replace(/^[ab]\//, "").replace(
    /^\/(?!dev\/null$)/,
    "",
  );
}

function splitRawFiles(raw: string): string[] {
  const matches = [...raw.matchAll(/^diff --git /gm)];
  if (!matches.length) return [raw];
  return matches.map((match, index) =>
    raw.slice(match.index, matches[index + 1]?.index ?? raw.length)
  );
}
