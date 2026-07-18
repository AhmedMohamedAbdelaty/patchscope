import { define } from "../../utils.ts";
import { fetchGitHubDiff, GitHubImportError } from "../../lib/server/github.ts";
import { consumeRateLimit } from "../../lib/server/rate-limit.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url).searchParams.get("url") ?? "";
    const client = ctx.req.headers.get("x-forwarded-for")?.split(",")[0]
      ?.trim() || ctx.req.headers.get("x-real-ip") || "local";
    const rate = consumeRateLimit(client);
    const rateHeaders = {
      "X-RateLimit-Limit": String(rate.limit),
      "X-RateLimit-Remaining": String(rate.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1_000)),
    };
    if (!rate.allowed) {
      return Response.json(
        {
          error: {
            code: "LOCAL_RATE_LIMIT",
            message: "Too many imports. Try again in a minute.",
          },
        },
        {
          status: 429,
          headers: {
            ...rateHeaders,
            "Cache-Control": "no-store",
            "Retry-After": String(
              Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1_000)),
            ),
          },
        },
      );
    }
    try {
      const result = await fetchGitHubDiff(url, {
        token: Deno.env.get("GITHUB_TOKEN"),
      });
      return Response.json(result, {
        headers: {
          "Cache-Control": "private, max-age=60",
          "X-Patchscope-Cache": result.cache,
          ...rateHeaders,
        },
      });
    } catch (error) {
      if (error instanceof GitHubImportError) {
        const headers = new Headers({
          "Cache-Control": "no-store",
          ...rateHeaders,
        });
        if (error.retryAfter) headers.set("Retry-After", error.retryAfter);
        return Response.json({
          error: { code: error.code, message: error.message },
        }, { status: error.status, headers });
      }
      console.error("GitHub import failed", {
        requestId: ctx.state.requestId,
        error,
      });
      return Response.json(
        {
          error: {
            code: "INTERNAL",
            message: "The import could not be completed.",
          },
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store", ...rateHeaders },
        },
      );
    }
  },
});
