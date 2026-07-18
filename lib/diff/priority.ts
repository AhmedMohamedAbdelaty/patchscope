import type { DiffFile, PrioritySignal } from "./types.ts";

const SENSITIVE_PATHS: ReadonlyArray<[RegExp, string, number]> = [
  [
    /(^|\/)(auth|security|permissions?|acl)(\/|$)/i,
    "Authorization boundary",
    36,
  ],
  [
    /(^|\/)(migrations?|schema|database|storage)(\/|$)/i,
    "Durable data path",
    30,
  ],
  [/(^|\/)(billing|payments?|checkout)(\/|$)/i, "Money path", 30],
  [
    /(^|\/)(deploy|infra|terraform|k8s|docker)(\/|$)/i,
    "Runtime configuration",
    24,
  ],
  [/(^|\/)(api|routes?|handlers?)(\/|$)/i, "External boundary", 16],
];

export function scoreFile(
  file: Pick<
    DiffFile,
    "path" | "additions" | "deletions" | "status" | "isGenerated" | "isLockfile"
  >,
): { priority: number; signals: PrioritySignal[] } {
  const signals: PrioritySignal[] = [];

  for (const [pattern, label, weight] of SENSITIVE_PATHS) {
    if (pattern.test(file.path)) {
      signals.push({
        label,
        detail: `Path matches ${label.toLowerCase()} code`,
        weight,
      });
    }
  }

  const changed = file.additions + file.deletions;
  if (changed >= 300) {
    signals.push({
      label: "Large change",
      detail: `${changed} changed lines`,
      weight: 22,
    });
  } else if (changed >= 100) {
    signals.push({
      label: "Broad change",
      detail: `${changed} changed lines`,
      weight: 12,
    });
  }

  if (file.status === "deleted") {
    signals.push({
      label: "Deletion",
      detail: "A complete file is removed",
      weight: 8,
    });
  }

  if (/\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)tests?\//i.test(file.path)) {
    signals.push({
      label: "Test coverage",
      detail: "Test code is usually reviewed after behavior",
      weight: -6,
    });
  }
  if (file.isGenerated) {
    signals.push({
      label: "Generated",
      detail: "Generated output is lower-signal",
      weight: -28,
    });
  }
  if (file.isLockfile) {
    signals.push({
      label: "Lockfile",
      detail: "Dependency lock data is lower-signal",
      weight: -32,
    });
  }

  const priority = Math.max(
    0,
    Math.min(100, 20 + signals.reduce((sum, signal) => sum + signal.weight, 0)),
  );
  return { priority, signals };
}

export function priorityLabel(
  priority: number,
): "Start here" | "Review soon" | "Standard" | "Low signal" {
  if (priority >= 65) return "Start here";
  if (priority >= 42) return "Review soon";
  if (priority >= 18) return "Standard";
  return "Low signal";
}
