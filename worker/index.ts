/** Cloudflare Worker entry point for the application. */
import handler from "vinext/server/app-router-entry";
import { ensureDatabase } from "../lib/db";
import { prepareBookingCalendar } from "../lib/booking-calendar";
import {dispatchPush,scheduledPush} from "../lib/push";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async scheduled(event: {cron:string}, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledPush().catch(()=>console.error("push_schedule_failed")));
    if(event.cron!=="* * * * *")ctx.waitUntil((async () => { await ensureDatabase(); await prepareBookingCalendar(); })());
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await handler.fetch(request, env, ctx);
    const pathname = new URL(request.url).pathname;
    if(response.ok&&request.method==="POST"&&(
      pathname==="/api/push"||pathname.startsWith("/api/booking/")||pathname.startsWith("/api/learning/")
    ))ctx.waitUntil(dispatchPush({limit:2}).catch(()=>console.error("push_dispatch_failed")));
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    if(pathname==="/sw.js"){headers.set("Cache-Control","no-cache, no-store, must-revalidate");headers.set("Service-Worker-Allowed","/");}
    const publicGet = request.method === "GET" && (pathname.startsWith("/api/public/") || pathname.startsWith("/api/booking/public/"));
    if (pathname.startsWith("/api/") && !publicGet) headers.set("Cache-Control", "private, no-store");
    if (pathname === "/admin") headers.set("X-Robots-Tag", "noindex, nofollow");
    if (pathname === "/embed/course-openings") {
      headers.delete("X-Frame-Options");
      headers.delete("Cross-Origin-Opener-Policy");
      headers.set(
        "Content-Security-Policy",
        "frame-ancestors 'self' https://coffeemonthly.creatorlink.net https://*.creatorlink.net",
      );
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;
