import { assertEquals } from "@std/assert";
import { priorityLabel, scoreFile } from "./priority.ts";

Deno.test("scoreFile ranks consequential paths and explains every contribution", () => {
  const result = scoreFile({
    path: "src/auth/permissions/database.ts",
    additions: 220,
    deletions: 100,
    status: "modified",
    isGenerated: false,
    isLockfile: false,
  });
  assertEquals(result.priority, 78);
  assertEquals(result.signals.map((signal) => signal.label), [
    "Authorization boundary",
    "Large change",
  ]);
  assertEquals(priorityLabel(result.priority), "Start here");
});

Deno.test("scoreFile lowers generated and lockfile review order without hiding it", () => {
  const result = scoreFile({
    path: "deno.lock",
    additions: 2,
    deletions: 2,
    status: "modified",
    isGenerated: false,
    isLockfile: true,
  });
  assertEquals(result.priority, 0);
  assertEquals(priorityLabel(result.priority), "Low signal");
});
