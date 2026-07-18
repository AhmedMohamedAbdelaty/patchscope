import {
  EVIDENCE_RESPONSE_SCHEMA,
  type EvidenceContext,
  formatEvidenceContext,
  MAX_AI_CONTEXT_BYTES,
} from "../ai/evidence.ts";
import { readBoundedText, ResponseTooLargeError } from "./bounded-response.ts";

export const MAX_AI_REQUEST_BYTES = 96 * 1024;
const MAX_AI_RESPONSE_BYTES = 256 * 1024;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export class AiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

export async function analyzeWithOpenAI(
  input: unknown,
  apiKey: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<unknown> {
  const request = readAiRequest(input);
  if (apiKey.length < 20 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new AiRequestError(
      "INVALID_KEY",
      "Enter a valid OpenAI API key for this request.",
      400,
    );
  }
  const response = await (options.fetcher ?? fetch)(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      store: false,
      max_output_tokens: 3_000,
      input: [
        {
          role: "system",
          content: [
            "Review only the supplied file diff records.",
            "Return concrete, reviewable risks or an empty claims array.",
            "Every claim needs an exact cited record and a reason it may be wrong.",
            "Do not infer repository context, runtime behavior, or intent that is not shown.",
          ].join(" "),
        },
        { role: "user", content: formatEvidenceContext(request.context) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "patchscope_evidence",
          strict: true,
          schema: EVIDENCE_RESPONSE_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  let raw: string;
  try {
    raw = await readBoundedText(response, MAX_AI_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      throw new AiRequestError(
        "UPSTREAM_TOO_LARGE",
        "The model response exceeded Patchscope's limit.",
        502,
      );
    }
    throw error;
  }
  if (!response.ok) {
    throw new AiRequestError(
      "OPENAI_ERROR",
      readUpstreamMessage(raw) ??
        `OpenAI rejected the request (${response.status}).`,
      response.status === 401 || response.status === 429
        ? response.status
        : 502,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new AiRequestError(
      "INVALID_UPSTREAM_RESPONSE",
      "OpenAI returned an unreadable response.",
      502,
    );
  }
  const outputText = readOutputText(payload);
  if (!outputText) {
    throw new AiRequestError(
      "NO_OUTPUT",
      "OpenAI returned no review claims.",
      502,
    );
  }
  try {
    return JSON.parse(outputText);
  } catch {
    throw new AiRequestError(
      "INVALID_MODEL_OUTPUT",
      "OpenAI returned claims that were not valid JSON.",
      502,
    );
  }
}

export async function readBoundedRequestJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_AI_REQUEST_BYTES) {
    throw new AiRequestError(
      "REQUEST_TOO_LARGE",
      "AI context exceeds the request limit.",
      413,
    );
  }
  if (!req.body) {
    throw new AiRequestError(
      "INVALID_REQUEST",
      "Request body is required.",
      400,
    );
  }
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_AI_REQUEST_BYTES) {
        await reader.cancel();
        throw new AiRequestError(
          "REQUEST_TOO_LARGE",
          "AI context exceeds the request limit.",
          413,
        );
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new AiRequestError(
      "INVALID_JSON",
      "Request body must be valid JSON.",
      400,
    );
  }
}

export function isAiRequestError(error: unknown): error is AiRequestError {
  return error instanceof AiRequestError;
}

function readAiRequest(value: unknown): {
  model: string;
  context: EvidenceContext;
} {
  if (!isRecord(value) || typeof value.model !== "string") {
    throw new AiRequestError(
      "INVALID_REQUEST",
      "Model and context are required.",
      400,
    );
  }
  const model = value.model.trim();
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) {
    throw new AiRequestError(
      "INVALID_MODEL",
      "Use a valid OpenAI model ID.",
      400,
    );
  }
  const context = readContext(value.context);
  return { model, context };
}

function readContext(value: unknown): EvidenceContext {
  if (
    !isRecord(value) || typeof value.path !== "string" ||
    !value.path.trim() || value.path.length > 1_000 ||
    !Array.isArray(value.lines) || value.lines.length > 20_000 ||
    !Number.isSafeInteger(value.omittedLines) ||
    (value.omittedLines as number) < 0
  ) {
    throw new AiRequestError(
      "INVALID_CONTEXT",
      "Selected-file context is invalid.",
      400,
    );
  }
  const lines = value.lines.map((line) => {
    if (
      !isRecord(line) || (line.side !== "old" && line.side !== "new") ||
      !Number.isSafeInteger(line.line) || (line.line as number) < 1 ||
      typeof line.content !== "string" || line.content.length > 20_000
    ) {
      throw new AiRequestError(
        "INVALID_CONTEXT",
        "Selected-file context is invalid.",
        400,
      );
    }
    return {
      side: line.side as "old" | "new",
      line: line.line as number,
      content: line.content,
    };
  });
  const context: EvidenceContext = {
    path: value.path,
    lines,
    omittedLines: value.omittedLines as number,
    bytes: 0,
  };
  context.bytes =
    new TextEncoder().encode(formatEvidenceContext(context)).byteLength;
  if (context.bytes > MAX_AI_CONTEXT_BYTES + 1_000) {
    throw new AiRequestError(
      "CONTEXT_TOO_LARGE",
      "Selected-file context is too large.",
      413,
    );
  }
  return context;
}

function readOutputText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.output)) return undefined;
  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        isRecord(content) && content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }
  return undefined;
}

function readUpstreamMessage(raw: string): string | undefined {
  try {
    const value = JSON.parse(raw);
    return isRecord(value) && isRecord(value.error) &&
        typeof value.error.message === "string"
      ? value.error.message.slice(0, 500)
      : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
