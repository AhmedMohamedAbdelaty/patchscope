import { assertEquals } from "@std/assert";
import { buildAtlas, classifyFile, isReviewLens } from "./atlas.ts";
import type { DiffFile } from "./types.ts";

function file(path: string, overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    id: path,
    oldPath: path,
    path,
    status: "modified",
    additions: 3,
    deletions: 1,
    hunks: [],
    isBinary: false,
    isGenerated: false,
    isLockfile: false,
    isWhitespaceOnly: false,
    priority: 20,
    prioritySignals: [],
    ...overrides,
  };
}

Deno.test("classifyFile uses stable precedence for ambiguous paths", () => {
  assertEquals(classifyFile(file("api/auth.test.ts")), {
    layer: "tests",
    reason: "Test or fixture path",
  });
  assertEquals(classifyFile(file("lib/auth/auth_test.ts")).layer, "tests");
  assertEquals(classifyFile(file("test_session.py")).layer, "tests");
  assertEquals(classifyFile(file("api/database/schema.sql")), {
    layer: "data",
    reason: "Durable data or schema path",
  });
  assertEquals(classifyFile(file("routes/users.ts")), {
    layer: "contract",
    reason: "External interface path",
  });
  assertEquals(classifyFile(file("src/session.ts")), {
    layer: "behavior",
    reason: "Application source path",
  });
});

Deno.test("classifyFile keeps generated and lock artifacts last", () => {
  assertEquals(
    classifyFile(file("src/generated/api.ts", { isGenerated: true })).layer,
    "artifacts",
  );
  assertEquals(
    classifyFile(file("deno.lock", { isLockfile: true })).reason,
    "Dependency lock data",
  );
});

Deno.test("buildAtlas changes route order without reclassifying files", () => {
  const files = [
    file("src/session.ts", { priority: 40 }),
    file("tests/session_test.ts", { priority: 10 }),
    file("routes/session.ts", { priority: 50 }),
    file("migrations/001.sql", { priority: 60 }),
  ];

  assertEquals(buildAtlas(files, "general").map((layer) => layer.id), [
    "contract",
    "data",
    "behavior",
    "tests",
  ]);
  assertEquals(buildAtlas(files, "tests").map((layer) => layer.id), [
    "tests",
    "behavior",
    "contract",
    "data",
  ]);
  assertEquals(
    buildAtlas(files, "tests")[0].files[0].path,
    "tests/session_test.ts",
  );
});

Deno.test("isReviewLens rejects untrusted stored preference values", () => {
  assertEquals(isReviewLens("security"), true);
  assertEquals(isReviewLens("dependencies"), false);
  assertEquals(isReviewLens(null), false);
});
