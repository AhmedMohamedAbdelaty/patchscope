import {
  EVIDENCE_RESPONSE_SCHEMA,
  type EvidenceContext,
  formatEvidenceContext,
} from "../ai/evidence.ts";

export const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const MAX_OLLAMA_RESPONSE_BYTES = 256 * 1024;

export async function analyzeWithOllama(
  context: EvidenceContext,
  model: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const normalizedModel = model.trim();
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(normalizedModel) ||
    normalizedModel.includes("://") || normalizedModel.includes("//")
  ) {
    throw new Error("Use a valid local Ollama model name.");
  }
  const response = await fetcher(OLLAMA_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: normalizedModel,
      stream: false,
      format: EVIDENCE_RESPONSE_SCHEMA,
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content: [
            "Review only the supplied file diff records.",
            "Return concrete risks or an empty claims array using the supplied schema.",
            "Citations must copy an exact record and each claim must explain why it may be wrong.",
          ].join(" "),
        },
        { role: "user", content: formatEvidenceContext(context) },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await readBoundedText(response, MAX_OLLAMA_RESPONSE_BYTES);
  if (!response.ok) {
    throw new Error(
      readOllamaError(raw) ??
        `Ollama rejected the request (${response.status}).`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Ollama returned an unreadable response.");
  }
  if (
    !isRecord(payload) || !isRecord(payload.message) ||
    typeof payload.message.content !== "string"
  ) {
    throw new Error("Ollama returned no structured review claims.");
  }
  try {
    return JSON.parse(payload.message.content);
  } catch {
    throw new Error("Ollama returned claims that were not valid JSON.");
  }
}

async function readBoundedText(
  response: Response,
  limit: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) {
    throw new Error("Ollama response exceeded Patchscope's limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Ollama response exceeded Patchscope's limit.");
      }
      raw += decoder.decode(value, { stream: true });
    }
    return raw + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function readOllamaError(raw: string): string | undefined {
  try {
    const value = JSON.parse(raw);
    return isRecord(value) && typeof value.error === "string"
      ? value.error.slice(0, 500)
      : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
