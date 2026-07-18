import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  fetchGitHubDiff,
  GitHubImportError,
  parseGitHubUrl,
  resetGitHubCache,
} from "./github.ts";

const DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`;

Deno.test("parseGitHubUrl allows only canonical public change URLs", () => {
  assertEquals(
    parseGitHubUrl("https://github.com/denoland/deno/commit/abc123").apiUrl,
    "/repos/denoland/deno/commits/abc123",
  );
  assertEquals(
    parseGitHubUrl("https://github.com/denoland/deno/pull/42/files").kind,
    "pull",
  );
  assertEquals(
    parseGitHubUrl(
      "https://github.com/acme/app/compare/main...feature%2Fsession",
    ).reference,
    "main...feature/session",
  );
});

Deno.test("parseGitHubUrl rejects lookalike hosts and unsupported pages", () => {
  for (
    const url of [
      "https://github.example.com/a/b/commit/123",
      "http://github.com/a/b/commit/123",
      "https://github.com/a/b/issues/1",
      "https://user@github.com/a/b/pull/1",
    ]
  ) {
    try {
      parseGitHubUrl(url);
      throw new Error(`Expected rejection: ${url}`);
    } catch (error) {
      assertEquals(
        error instanceof GitHubImportError && error.code === "INVALID_URL",
        true,
      );
    }
  }
});

Deno.test("fetchGitHubDiff builds the endpoint and serves a fresh cache hit", async () => {
  resetGitHubCache();
  let calls = 0;
  const fetcher: typeof fetch = (input, init) => {
    calls++;
    assertStringIncludes(
      String(input),
      "api.github.com/repos/acme/app/pulls/7",
    );
    assertEquals(
      new Headers(init?.headers).get("accept"),
      "application/vnd.github.diff",
    );
    return Promise.resolve(
      new Response(DIFF, { headers: { etag: '"diff-1"' } }),
    );
  };
  const first = await fetchGitHubDiff("https://github.com/acme/app/pull/7", {
    fetcher,
    now: 1_000,
  });
  const second = await fetchGitHubDiff("https://github.com/acme/app/pull/7", {
    fetcher,
    now: 2_000,
  });
  assertEquals(first.cache, "miss");
  assertEquals(second.cache, "hit");
  assertEquals(calls, 1);
});

Deno.test("fetchGitHubDiff returns stable provider errors", async () => {
  resetGitHubCache();
  await assertRejects(
    () =>
      fetchGitHubDiff("https://github.com/acme/app/commit/dead", {
        fetcher: () => Promise.resolve(new Response("", { status: 404 })),
      }),
    GitHubImportError,
    "not found",
  );
  await assertRejects(
    () =>
      fetchGitHubDiff("https://github.com/acme/app/commit/dead", {
        fetcher: () => Promise.resolve(new Response("", { status: 429 })),
      }),
    GitHubImportError,
    "limit",
  );
});

Deno.test("fetchGitHubDiff aborts an oversized streamed response", async () => {
  resetGitHubCache();
  const huge = new Uint8Array(5 * 1024 * 1024 + 1);
  await assertRejects(
    () =>
      fetchGitHubDiff("https://github.com/acme/app/commit/dead", {
        fetcher: () => Promise.resolve(new Response(huge)),
      }),
    GitHubImportError,
    "larger",
  );
});
