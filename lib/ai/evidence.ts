import type { DiffFile } from "../diff/types.ts";
import type { FindingAnchor } from "../review/notebook.ts";

export const MAX_AI_CONTEXT_BYTES = 80 * 1024;
export const MAX_AI_CLAIMS = 8;
export const MAX_AI_EVIDENCE = 3;

export type EvidenceSide = "old" | "new";
export type ClaimConfidence = "low" | "medium" | "high";

export interface EvidenceLine {
  side: EvidenceSide;
  line: number;
  content: string;
}

export interface EvidenceContext {
  path: string;
  lines: EvidenceLine[];
  omittedLines: number;
  bytes: number;
}

export interface ClaimCitation {
  side: EvidenceSide;
  line: number;
  quote: string;
}

export interface EvidenceClaim {
  id: string;
  title: string;
  explanation: string;
  evidence: ClaimCitation[];
  confidence: ClaimConfidence;
  uncertainty: string;
}

export interface EvidenceResult {
  claims: EvidenceClaim[];
  rejected: number;
}

export const EVIDENCE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      maxItems: MAX_AI_CLAIMS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 160 },
          explanation: { type: "string", maxLength: 1_500 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: MAX_AI_EVIDENCE,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                side: { type: "string", enum: ["old", "new"] },
                line: { type: "integer", minimum: 1 },
                quote: { type: "string", minLength: 1, maxLength: 2_000 },
              },
              required: ["side", "line", "quote"],
            },
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          uncertainty: { type: "string", maxLength: 1_000 },
        },
        required: [
          "title",
          "explanation",
          "evidence",
          "confidence",
          "uncertainty",
        ],
      },
    },
  },
  required: ["claims"],
} as const;

export function buildEvidenceContext(
  file: DiffFile,
  maxBytes = MAX_AI_CONTEXT_BYTES,
): EvidenceContext {
  const candidates = file.hunks.flatMap((hunk) =>
    hunk.lines.flatMap((line): EvidenceLine[] => {
      const output: EvidenceLine[] = [];
      if (line.oldLine != null) {
        output.push({ side: "old", line: line.oldLine, content: line.content });
      }
      if (line.newLine != null) {
        output.push({ side: "new", line: line.newLine, content: line.content });
      }
      return output;
    })
  );
  const encoder = new TextEncoder();
  const lines: EvidenceLine[] = [];
  let bytes = encoder.encode(`FILE ${file.path}\n`).byteLength;
  for (const line of candidates) {
    const size = encoder.encode(formatEvidenceLine(line)).byteLength + 1;
    if (bytes + size > maxBytes) break;
    lines.push(line);
    bytes += size;
  }
  return {
    path: file.path,
    lines,
    omittedLines: candidates.length - lines.length,
    bytes,
  };
}

export function formatEvidenceContext(context: EvidenceContext): string {
  const header = [
    `FILE ${context.path}`,
    "Each record is SIDE LINE | exact source text.",
    "Cite only these records and copy the text after | exactly.",
  ];
  if (context.omittedLines) {
    header.push(
      `CONTEXT TRUNCATED: ${context.omittedLines} line records omitted. Do not infer from omitted code.`,
    );
  }
  return [...header, ...context.lines.map(formatEvidenceLine)].join("\n");
}

export function validateEvidenceClaims(
  value: unknown,
  context: EvidenceContext,
): EvidenceResult {
  if (!isRecord(value) || !Array.isArray(value.claims)) {
    throw new Error("The model did not return a claims object.");
  }
  if (value.claims.length > MAX_AI_CLAIMS) {
    throw new Error(`The model returned more than ${MAX_AI_CLAIMS} claims.`);
  }
  const claims: EvidenceClaim[] = [];
  let rejected = 0;
  for (const candidate of value.claims) {
    const claim = readClaim(candidate, context);
    if (claim) claims.push(claim);
    else rejected++;
  }
  return { claims, rejected };
}

export function claimAnchor(
  file: DiffFile,
  claim: EvidenceClaim,
): FindingAnchor {
  const citation = claim.evidence[0];
  return {
    fileId: file.id,
    filePath: file.path,
    side: citation.side,
    line: citation.line,
  };
}

export function claimFindingBody(claim: EvidenceClaim): string {
  return `${claim.title}\n\n${claim.explanation}\n\nWhy this may be wrong: ${claim.uncertainty}`;
}

function readClaim(
  value: unknown,
  context: EvidenceContext,
): EvidenceClaim | undefined {
  if (
    !isRecord(value) || !boundedText(value.title, 160) ||
    !boundedText(value.explanation, 1_500) ||
    !boundedText(value.uncertainty, 1_000) ||
    !isConfidence(value.confidence) || !Array.isArray(value.evidence) ||
    value.evidence.length < 1 || value.evidence.length > MAX_AI_EVIDENCE
  ) return undefined;
  const evidence: ClaimCitation[] = [];
  for (const candidate of value.evidence) {
    if (!isRecord(candidate) || !isSide(candidate.side)) return undefined;
    if (
      !Number.isSafeInteger(candidate.line) || (candidate.line as number) < 1 ||
      typeof candidate.quote !== "string" || !candidate.quote.trim() ||
      candidate.quote.length > 2_000
    ) return undefined;
    const matches = context.lines.some((line) =>
      line.side === candidate.side && line.line === candidate.line &&
      line.content === candidate.quote
    );
    if (!matches) return undefined;
    evidence.push({
      side: candidate.side,
      line: candidate.line as number,
      quote: candidate.quote,
    });
  }
  return {
    id: crypto.randomUUID(),
    title: value.title.trim(),
    explanation: value.explanation.trim(),
    evidence,
    confidence: value.confidence,
    uncertainty: value.uncertainty.trim(),
  };
}

function formatEvidenceLine(line: EvidenceLine): string {
  return `${line.side.toUpperCase()} ${line.line} | ${line.content}`;
}

function boundedText(value: unknown, limit: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) &&
    value.length <= limit;
}

function isSide(value: unknown): value is EvidenceSide {
  return value === "old" || value === "new";
}

function isConfidence(value: unknown): value is ClaimConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
