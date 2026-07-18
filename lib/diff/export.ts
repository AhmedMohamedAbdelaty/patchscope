import { priorityLabel } from "./priority.ts";
import type { DiffDocument } from "./types.ts";

export function exportReview(
  document: DiffDocument,
  viewedFileIds: ReadonlySet<string>,
): string {
  const reviewed = document.files.filter((file) => viewedFileIds.has(file.id));
  const remaining = document.files.filter((file) =>
    !viewedFileIds.has(file.id)
  );
  const source = document.source.url
    ? `[${escapeText(document.source.label)}](${document.source.url})`
    : escapeText(document.source.label);
  const lines = [
    `# Review: ${escapeText(document.title)}`,
    "",
    `Source: ${source}`,
    `Progress: ${reviewed.length}/${document.files.length} files reviewed`,
    `Change: +${document.stats.additions} −${document.stats.deletions} across ${document.stats.files} files`,
    "",
    "## Reviewed",
    "",
    ...(reviewed.length
      ? reviewed.map((file) => `- [x] ${codeSpan(file.path)}`)
      : ["- None yet"]),
    "",
    "## Remaining",
    "",
    ...(remaining.length
      ? remaining.map((file) =>
        `- [ ] ${codeSpan(file.path)} — ${
          priorityLabel(file.priority)
        } (+${file.additions} −${file.deletions})`
      )
      : ["- None"]),
    "",
    "_Generated locally by Patchscope. Priority labels are navigation hints, not correctness or security findings._",
  ];
  return lines.join("\n");
}

function escapeText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/([\\[\]*_#])/g, "\\$1");
}

function codeSpan(value: string): string {
  const longest = Math.max(
    0,
    ...[...value.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longest + 1);
  return `${fence}${value}${fence}`;
}
