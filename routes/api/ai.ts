import { define } from "../../utils.ts";
import {
  analyzeWithOpenAI,
  isAiRequestError,
  readBoundedRequestJson,
} from "../../lib/server/ai.ts";
import { consumeRateLimit } from "../../lib/server/rate-limit.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const client = ctx.req.headers.get("x-forwarded-for")?.split(",")[0]
      ?.trim() || ctx.req.headers.get("x-real-ip") || "local";
    const rate = consumeRateLimit(`ai:${client}`, Date.now(), 10);
    if (!rate.allowed) {
      return Response.json(
        {
          error: {
            code: "AI_RATE_LIMIT",
            message: "Too many AI requests. Try again in a minute.",
          },
        },
        {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": "60" },
        },
      );
    }
    const authorization = ctx.req.headers.get("authorization") ?? "";
    const apiKey = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    try {
      const input = await readBoundedRequestJson(ctx.req);
      const claims = await analyzeWithOpenAI(input, apiKey);
      return Response.json(claims, {
        headers: {
          "Cache-Control": "no-store",
          "Pragma": "no-cache",
        },
      });
    } catch (error) {
      if (isAiRequestError(error)) {
        return Response.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      console.error("AI request failed", {
        requestId: ctx.state.requestId,
        error,
      });
      return Response.json(
        {
          error: {
            code: "INTERNAL",
            message: "The evidence request could not be completed.",
          },
        },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
});
