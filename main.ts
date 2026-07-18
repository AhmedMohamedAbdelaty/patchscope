import { App, csp, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";

export const app = new App<State>();

app.use(staticFiles());
app.use(csp({
  useNonce: true,
  csp: [
    "connect-src 'self' ws: wss: http://127.0.0.1:11434",
  ],
}));
app.use(
  define.middleware(async (ctx) => {
    ctx.state.requestId = crypto.randomUUID();
    const response = await ctx.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set("X-Frame-Options", "DENY");
    if (Deno.env.get("DENO_DEPLOY") === "true") {
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    return response;
  }),
);

app.fsRoutes();
