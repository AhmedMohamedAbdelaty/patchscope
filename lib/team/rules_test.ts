import { assertEquals, assertThrows } from "@std/assert";
import {
  matchingTeamRules,
  validateProfile,
  validateTeamRules,
} from "./rules.ts";

Deno.test("matchingTeamRules supports only explicit simple path rules", () => {
  const rules = validateTeamRules([
    { id: "all", pattern: "*", owner: "maintainers", note: "Baseline" },
    { id: "auth", pattern: "/src/auth/", owner: "security", note: "Boundary" },
    { id: "test", pattern: "*.test.ts", owner: "quality", note: "Assertions" },
    { id: "exact", pattern: "deno.json", owner: "release", note: "Runtime" },
  ]);
  assertEquals(
    matchingTeamRules("src/auth/session.test.ts", rules).map((rule) => rule.id),
    [
      "all",
      "auth",
      "test",
    ],
  );
  assertEquals(matchingTeamRules("deno.json", rules).map((rule) => rule.id), [
    "all",
    "exact",
  ]);
});

Deno.test("team rule and profile validation reject ambiguous or oversized input", () => {
  assertEquals(validateProfile({ name: " Ada ", handle: " @ada " }), {
    name: "Ada",
    handle: "@ada",
  });
  assertThrows(
    () =>
      validateTeamRules([
        { id: "x", pattern: "src/**", owner: "team", note: "No" },
      ]),
    Error,
    "exact path",
  );
  assertThrows(
    () =>
      validateTeamRules([
        { id: "x", pattern: "*", owner: "team", note: "One" },
        { id: "x", pattern: "*", owner: "team", note: "Two" },
      ]),
    Error,
    "unique",
  );
});
