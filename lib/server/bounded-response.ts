export const MAX_PROVIDER_BYTES = 5 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
  constructor() {
    super("Provider response exceeded the byte limit.");
    this.name = "ResponseTooLargeError";
  }
}

export async function readBoundedText(
  response: Response,
  limit = MAX_PROVIDER_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) throw new ResponseTooLargeError();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ResponseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
