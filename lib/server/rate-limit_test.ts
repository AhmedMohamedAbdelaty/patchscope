import { assertEquals } from "@std/assert";
import { consumeRateLimit, resetRateLimits } from "./rate-limit.ts";

Deno.test("consumeRateLimit returns a bounded fixed-window contract", () => {
  resetRateLimits();
  assertEquals(consumeRateLimit("client", 1_000, 2, 1_000), {
    allowed: true,
    limit: 2,
    remaining: 1,
    resetAt: 2_000,
  });
  assertEquals(consumeRateLimit("client", 1_100, 2, 1_000).allowed, true);
  assertEquals(consumeRateLimit("client", 1_200, 2, 1_000).allowed, false);
  assertEquals(consumeRateLimit("client", 2_000, 2, 1_000).remaining, 1);
});
