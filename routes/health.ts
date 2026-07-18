import { define } from "../utils.ts";

export const handler = define.handlers({
  GET() {
    return Response.json(
      {
        status: "ok",
        revision: Deno.env.get("DENO_DEPLOY_BUILD_ID") ??
          Deno.env.get("DENO_DEPLOY_REVISION_ID") ?? "local",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
});
