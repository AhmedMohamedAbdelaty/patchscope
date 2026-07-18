export const SAMPLE_DIFF =
  `diff --git a/src/auth/session.ts b/src/auth/session.ts
index 8a1df20..c20df17 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -8,11 +8,18 @@ export async function openSession(token: string) {
   const claims = await verifyToken(token);
-  return database.sessions.create({ userId: claims.sub });
+  const session = await database.sessions.create({
+    userId: claims.sub,
+    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
+  });
+
+  audit.record("session.opened", { sessionId: session.id });
+  return session;
 }
 
 export async function closeSession(id: string) {
-  await database.sessions.delete(id);
+  const removed = await database.sessions.delete(id);
+  if (removed) audit.record("session.closed", { sessionId: id });
 }
diff --git a/src/auth/session.test.ts b/src/auth/session.test.ts
index 16b8c71..bd2c901 100644
--- a/src/auth/session.test.ts
+++ b/src/auth/session.test.ts
@@ -20,6 +20,12 @@ Deno.test("opens a verified session", async () => {
   assertEquals(session.userId, "user-4");
+  assert(session.expiresAt > new Date());
+});
+
+Deno.test("records session creation", async () => {
+  await openSession(validToken);
+  assertSpyCall(audit.record, 0, { args: ["session.opened"] });
 });
diff --git a/docs/sessions.md b/docs/sessions.md
new file mode 100644
index 0000000..418d880
--- /dev/null
+++ b/docs/sessions.md
@@ -0,0 +1,7 @@
+# Sessions
+
+Sessions now expire after the configured TTL.
+
+- Opening and closing a session writes an audit event.
+- Existing callers do not need to change.
+- Tests use the in-memory audit adapter.
diff --git a/deno.lock b/deno.lock
index 9e2f9ff..ed2ab92 100644
--- a/deno.lock
+++ b/deno.lock
@@ -2,5 +2,5 @@
   "version": "4",
   "specifiers": {
-    "jsr:@std/assert@1.0.13": "1.0.13"
+    "jsr:@std/assert@1.0.14": "1.0.14"
   }
 }
`;
