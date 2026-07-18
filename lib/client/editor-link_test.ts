import { assertEquals, assertThrows } from "@std/assert";
import { buildEditorLink } from "./editor-link.ts";

Deno.test("buildEditorLink encodes absolute POSIX paths and line coordinates", () => {
  assertEquals(
    buildEditorLink("stable", "/home/ahmed/My Project", "src/a#b.ts", 42),
    "vscode://file//home/ahmed/My%20Project/src/a%23b.ts:42:1",
  );
});

Deno.test("buildEditorLink supports Windows roots and the Insiders scheme", () => {
  assertEquals(
    buildEditorLink("insiders", "C:\\work\\app\\", "src\\main.ts", 3),
    "vscode-insiders://file/C%3A/work/app/src/main.ts:3:1",
  );
  assertEquals(
    buildEditorLink("stable", "C:\\", "main.ts"),
    "vscode://file/C%3A/main.ts:1:1",
  );
});

Deno.test("buildEditorLink rejects relative roots and traversal", () => {
  assertThrows(
    () => buildEditorLink("stable", "projects/app", "src/main.ts"),
    Error,
    "absolute",
  );
  assertThrows(
    () => buildEditorLink("stable", "/work/app", "../secret.ts"),
    Error,
    "not safe",
  );
  assertThrows(
    () => buildEditorLink("stable", "/work/../app", "src/main.ts"),
    Error,
    "traversal",
  );
  assertThrows(
    () => buildEditorLink("stable", `/${"x".repeat(4_097)}`, "src/main.ts"),
    Error,
    "absolute",
  );
});
