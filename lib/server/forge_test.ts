import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  fetchForgeDiff,
  ForgeImportError,
  parseForgeUrl,
  resetForgeCache,
} from "./forge.ts";

const DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`;

Deno.test("parseForgeUrl normalizes supported exact-host change URLs", () => {
  assertEquals(
    parseForgeUrl(
      "https://gitlab.com/group/sub/repo/-/merge_requests/42/diffs",
    ),
    {
      provider: "gitlab",
      kind: "pull",
      owner: "group/sub",
      repo: "repo",
      reference: "42",
      webUrl: "https://gitlab.com/group/sub/repo/-/merge_requests/42",
      fetchUrl: "https://gitlab.com/group/sub/repo/-/merge_requests/42.diff",
      format: "diff",
      label: "group/sub/repo · MR #42",
    },
  );
  assertStringIncludes(
    parseForgeUrl("https://codeberg.org/forgejo/forgejo/commit/abc123")
      .fetchUrl,
    "/api/v1/repos/forgejo/forgejo/git/commits/abc123.diff",
  );
  assertEquals(
    parseForgeUrl("https://gitea.com/gitea/tea/pulls/12").provider,
    "gitea",
  );
  const compare = parseForgeUrl(
    "https://gitlab.com/group/repo/-/compare/main...feature%2Fx",
  );
  assertEquals(compare.format, "gitlab-compare");
  assertStringIncludes(
    compare.fetchUrl,
    "/api/v4/projects/group%2Frepo/repository/compare?from=main&to=feature%2Fx",
  );
  assertEquals(
    parseForgeUrl("https://codeberg.org/acme/app/compare/main...feature%2Fx")
      .reference,
    "main...feature/x",
  );
});

Deno.test("fetchForgeDiff converts the bounded GitLab compare response", async () => {
  resetForgeCache();
  const url = "https://gitlab.com/acme/app/-/compare/main...feature";
  const result = await fetchForgeDiff(url, {
    fetcher: (_input, init) => {
      assertEquals(
        new Headers(init?.headers).get("accept"),
        "application/json",
      );
      return Promise.resolve(Response.json({
        compare_timeout: false,
        diffs: [{
          old_path: "src/old name.ts",
          new_path: "src/new name.ts",
          diff: "@@ -1 +1 @@\n-old\n+new\n",
          new_file: false,
          deleted_file: false,
        }],
      }));
    },
  });
  assertStringIncludes(
    result.diff,
    'diff --git "a/src/old name.ts" "b/src/new name.ts"',
  );
  assertStringIncludes(result.diff, "@@ -1 +1 @@");
});

Deno.test("parseForgeUrl rejects arbitrary hosts, credentials, ports, and non-change pages", () => {
  for (
    const url of [
      "https://gitlab.example.com/a/b/-/commit/abc",
      "https://user@gitlab.com/a/b/-/commit/abc",
      "https://codeberg.org:8443/a/b/commit/abc",
      "http://gitea.com/a/b/commit/abc",
      "https://gitlab.com/a/b/-/issues/1",
      "https://codeberg.org/a/b/src/branch/main/file.ts",
    ]
  ) {
    assertThrows(
      () => parseForgeUrl(url),
      ForgeImportError,
      "public",
    );
  }
});

Deno.test("fetchForgeDiff uses a manual bounded read and fresh cache", async () => {
  resetForgeCache();
  let calls = 0;
  const fetcher: typeof fetch = (input, init) => {
    calls++;
    assertStringIncludes(String(input), "git/commits/abc123.diff");
    assertEquals(init?.redirect, "manual");
    return Promise.resolve(new Response(DIFF, { headers: { etag: '"one"' } }));
  };
  const url = "https://codeberg.org/acme/app/commit/abc123";
  assertEquals(
    (await fetchForgeDiff(url, { fetcher, now: 1_000 })).cache,
    "miss",
  );
  assertEquals(
    (await fetchForgeDiff(url, { fetcher, now: 2_000 })).cache,
    "hit",
  );
  assertEquals(calls, 1);
});

Deno.test("fetchForgeDiff rejects redirects, missing changes, and oversized streams", async () => {
  resetForgeCache();
  const url = "https://gitea.com/acme/app/pulls/7";
  await assertRejects(
    () =>
      fetchForgeDiff(url, {
        fetcher: () => Promise.resolve(new Response("", { status: 303 })),
      }),
    ForgeImportError,
    "sign-in",
  );
  await assertRejects(
    () =>
      fetchForgeDiff(url, {
        fetcher: () => Promise.resolve(new Response("", { status: 404 })),
      }),
    ForgeImportError,
    "not found",
  );
  const huge = new Uint8Array(5 * 1024 * 1024 + 1);
  await assertRejects(
    () =>
      fetchForgeDiff(url, {
        fetcher: () => Promise.resolve(new Response(huge)),
      }),
    ForgeImportError,
    "larger",
  );
  await assertRejects(
    () =>
      fetchForgeDiff(url, {
        fetcher: () => Promise.resolve(new Response("<html>Sign in</html>")),
      }),
    ForgeImportError,
    "unified Git diff",
  );
});
