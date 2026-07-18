import { assertEquals, assertRejects } from "@std/assert";
import {
  AiRequestError,
  analyzeWithOpenAI,
  readBoundedRequestJson,
} from "./ai.ts";

const input = {
  model: "gpt-5.6-luna",
  context: {
    path: "src/check.ts",
    lines: [{ side: "new", line: 9, content: "return ready;" }],
    omittedLines: 0,
    bytes: 0,
  },
};

Deno.test("analyzeWithOpenAI fixes the upstream endpoint and disables storage", async () => {
  let requestUrl = "";
  let authorization = "";
  let requestBody: Record<string, unknown> = {};
  const result = await analyzeWithOpenAI(input, `sk-test-${"x".repeat(24)}`, {
    fetcher: (url, init) => {
      requestUrl = String(url);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      requestBody = JSON.parse(String(init?.body));
      return Promise.resolve(Response.json({
        output: [{
          content: [{
            type: "output_text",
            text: JSON.stringify({ claims: [] }),
          }],
        }],
      }));
    },
  });
  assertEquals(result, { claims: [] });
  assertEquals(requestUrl, "https://api.openai.com/v1/responses");
  assertEquals(authorization.startsWith("Bearer sk-test-"), true);
  assertEquals(requestBody.store, false);
  assertEquals(
    (requestBody.text as Record<string, unknown>).format !== undefined,
    true,
  );
  assertEquals(JSON.stringify(requestBody).includes("src/check.ts"), true);
});

Deno.test("analyzeWithOpenAI rejects invalid input and preserves safe upstream errors", async () => {
  await assertRejects(
    () =>
      analyzeWithOpenAI(
        { ...input, model: "https://evil.test" },
        "x".repeat(30),
      ),
    AiRequestError,
    "valid OpenAI model",
  );
  await assertRejects(
    () => analyzeWithOpenAI(input, "short"),
    AiRequestError,
    "valid OpenAI API key",
  );
  await assertRejects(
    () =>
      analyzeWithOpenAI(input, "x".repeat(30), {
        fetcher: () =>
          Promise.resolve(
            Response.json({ error: { message: "Bad key" } }, { status: 401 }),
          ),
      }),
    AiRequestError,
    "Bad key",
  );
});

Deno.test("readBoundedRequestJson rejects malformed and oversized bodies", async () => {
  await assertRejects(
    () =>
      readBoundedRequestJson(
        new Request("https://local.test", { method: "POST", body: "{" }),
      ),
    AiRequestError,
    "valid JSON",
  );
  await assertRejects(
    () =>
      readBoundedRequestJson(
        new Request("https://local.test", {
          method: "POST",
          body: "x",
          headers: { "content-length": "999999" },
        }),
      ),
    AiRequestError,
    "request limit",
  );
});
