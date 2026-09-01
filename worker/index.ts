/** Cloudflare Worker entry point for the application. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await handler.fetch(request, env, ctx);
    const pathname = new URL(request.url).pathname;
    if (pathname !== "/embed/course-openings") return response;

    const headers = new Headers(response.headers);
    headers.delete("X-Frame-Options");
    headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'self' https://coffeemonthly.creatorlink.net https://*.creatorlink.net",
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;
