import { priorityLabel } from "./priority.ts";
import type { DiffDocument } from "./types.ts";
import type { ReviewFinding } from "../review/notebook.ts";

export function exportReview(
  document: DiffDocument,
  viewedFileIds: ReadonlySet<string>,
  findings: readonly ReviewFinding[] = [],
): string {
  const reviewed = document.files.filter((file) => viewedFileIds.has(file.id));
  const remaining = document.files.filter((file) =>
    !viewedFileIds.has(file.id)
  );
  const source = sourceLink(document);
  const includedFindings = findings.filter((finding) => finding.included);
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
        `- [ ] ${codeSpan(file.path)}: ${
          priorityLabel(file.priority)
        } (+${file.additions} −${file.deletions})`
      )
      : ["- None"]),
    "",
    "## Findings",
    "",
    ...(includedFindings.length
      ? includedFindings.map(formatFinding)
      : ["- None selected for export"]),
    "",
    "_Generated locally by Patchscope. Priority labels are navigation hints, not correctness or security findings._",
  ];
  return lines.join("\n");
}

export function exportIssueDraft(
  document: DiffDocument,
  findings: readonly ReviewFinding[] = [],
): string {
  const included = findings.filter((finding) => finding.included);
  return [
    `## Review follow-up: ${escapeText(document.title)}`,
    "",
    `Source: ${sourceLink(document)}`,
    `Scope: ${document.stats.files} files, +${document.stats.additions} −${document.stats.deletions}`,
    "",
    "### Items to resolve",
    "",
    ...(included.length
      ? included.map((finding) => `- [ ] ${formatFindingBody(finding)}`)
      : ["- [ ] Add the concrete follow-up before creating the issue."]),
    "",
    "_Drafted locally in Patchscope. Review and edit before posting._",
  ].join("\n");
}

export function exportReviewMemo(
  document: DiffDocument,
  viewedFileIds: ReadonlySet<string>,
  findings: readonly ReviewFinding[] = [],
): string {
  const included = findings.filter((finding) => finding.included);
  const stale = included.filter((finding) => finding.stale);
  return [
    `# Review memo: ${escapeText(document.title)}`,
    "",
    `Source: ${sourceLink(document)}`,
    `Reviewed: ${viewedFileIds.size}/${document.files.length} files`,
    `Change size: +${document.stats.additions} −${document.stats.deletions}`,
    "",
    "## Reviewer attention",
    "",
    ...(included.length
      ? included.map(formatFinding)
      : ["- No findings selected for sharing."]),
    "",
    "## Handoff state",
    "",
    `- ${document.files.length - viewedFileIds.size} files remain unreviewed.`,
    `- ${stale.length} selected finding${
      stale.length === 1 ? " is" : "s are"
    } stale and need re-anchoring.`,
    "",
    "_Prepared locally by Patchscope; no provider comment or document was created._",
  ].join("\n");
}

function formatFinding(finding: ReviewFinding): string {
  const kind = finding.kind[0].toUpperCase() + finding.kind.slice(1);
  const location = `${codeSpan(finding.anchor.filePath)} (${
    finding.anchor.side === "old" ? "old" : "new"
  } line ${finding.anchor.line})`;
  const body = finding.body.trim() ? `: ${escapeText(finding.body)}` : "";
  const stale = finding.stale
    ? ` **[stale: ${
      finding.stale.reason === "file-removed" ? "file removed" : "file changed"
    }]**`
    : "";
  return `- **${kind}**${stale} — ${location}${body}`;
}

function sourceLink(document: DiffDocument): string {
  return document.source.url
    ? `[${escapeText(document.source.label)}](${document.source.url})`
    : escapeText(document.source.label);
}

function formatFindingBody(finding: ReviewFinding): string {
  const stale = finding.stale ? "[stale] " : "";
  const body = finding.body.trim() || "Return to this line";
  return `${stale}${escapeText(body)} — ${
    codeSpan(finding.anchor.filePath)
  }:${finding.anchor.line}`;
}

function escapeText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(
    /[<>]/g,
    (character) => character === "<" ? "&lt;" : "&gt;",
  ).replace(/([\\[\]*_#])/g, "\\$1");
}

function codeSpan(value: string): string {
  const longest = Math.max(
    0,
    ...[...value.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longest + 1);
  return `${fence}${value}${fence}`;
}
