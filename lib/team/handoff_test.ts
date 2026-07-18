import { assertEquals, assertRejects } from "@std/assert";
import {
  createPublishedReviewCapsule,
  createTeamHandoff,
  decryptTeamHandoff,
  encryptTeamHandoff,
  TEAM_ENVELOPE_FORMAT,
} from "./handoff.ts";
import { parseDiff } from "../diff/parse.ts";

const handoff = createTeamHandoff({
  profile: { name: "Ada Lovelace", handle: "@ada" },
  teamName: "Runtime",
  rules: [{
    id: "source",
    pattern: "src/",
    owner: "runtime",
    note: "Behavior",
  }],
  capsule: JSON.stringify({
    format: "patchscope.review",
    private: "published finding",
  }),
});

Deno.test("team handoff encrypts authenticated content and round-trips", async () => {
  const first = await encryptTeamHandoff(
    handoff,
    "correct horse battery staple",
  );
  const second = await encryptTeamHandoff(
    handoff,
    "correct horse battery staple",
  );
  assertEquals(first.includes("published finding"), false);
  assertEquals(first === second, false);
  assertEquals(JSON.parse(first).format, TEAM_ENVELOPE_FORMAT);
  assertEquals(
    await decryptTeamHandoff(first, "correct horse battery staple"),
    handoff,
  );
});

Deno.test("team handoff rejects wrong secrets, tampering, and weak input", async () => {
  const encrypted = await encryptTeamHandoff(
    handoff,
    "correct horse battery staple",
  );
  await assertRejects(
    () => decryptTeamHandoff(encrypted, "incorrect horse battery staple"),
    Error,
    "could not be decrypted",
  );
  const tampered = JSON.parse(encrypted);
  tampered.cipher.ciphertext = `${tampered.cipher.ciphertext.slice(0, -4)}AAAA`;
  await assertRejects(
    () =>
      decryptTeamHandoff(
        JSON.stringify(tampered),
        "correct horse battery staple",
      ),
    Error,
    "could not be decrypted",
  );
  await assertRejects(
    () => encryptTeamHandoff(handoff, "too short"),
    Error,
    "between 12",
  );
});

Deno.test("published capsule withholds private drafts and patch contents", async () => {
  const raw =
    `diff --git a/secret.ts b/secret.ts\n--- a/secret.ts\n+++ b/secret.ts\n@@ -1 +1 @@\n-old secret\n+new secret\n`;
  const document = await parseDiff(raw, { kind: "paste", label: "Private" });
  const base = {
    anchor: {
      fileId: document.files[0].id,
      filePath: "secret.ts",
      side: "new" as const,
      line: 1,
    },
    kind: "concern" as const,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const capsule = createPublishedReviewCapsule(
    document,
    [],
    document.files[0].id,
    [
      { ...base, id: "private", body: "private draft", included: false },
      { ...base, id: "public", body: "published finding", included: true },
    ],
  );
  assertEquals(capsule.includes("private draft"), false);
  assertEquals(capsule.includes("new secret"), false);
  assertEquals(capsule.includes("published finding"), true);
});
