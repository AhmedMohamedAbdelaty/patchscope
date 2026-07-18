import { assertEquals, assertRejects } from "@std/assert";
import { analyzeWithOllama, OLLAMA_CHAT_URL } from "./ollama.ts";

const context = {
  path: "src/check.ts",
  lines: [{ side: "new" as const, line: 1, content: "return true;" }],
  omittedLines: 0,
  bytes: 20,
};

Deno.test("analyzeWithOllama uses only the fixed loopback endpoint and schema", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  const output = await analyzeWithOllama(
    context,
    "qwen3:4b",
    (input, init) => {
      url = String(input);
      body = JSON.parse(String(init?.body));
      return Promise.resolve(Response.json({
        message: { content: JSON.stringify({ claims: [] }) },
      }));
    },
  );
  assertEquals(url, OLLAMA_CHAT_URL);
  assertEquals(body.stream, false);
  assertEquals(typeof body.format, "object");
  assertEquals(output, { claims: [] });
});

Deno.test("analyzeWithOllama rejects invalid model names and oversized output", async () => {
  await assertRejects(
    () => analyzeWithOllama(context, "https://evil.test"),
    Error,
    "model name",
  );
  await assertRejects(
    () =>
      analyzeWithOllama(
        context,
        "qwen3",
        () =>
          Promise.resolve(
            new Response("x", {
              headers: { "content-length": "999999" },
            }),
          ),
      ),
    Error,
    "exceeded",
  );
});
