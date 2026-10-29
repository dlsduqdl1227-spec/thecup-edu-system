// One application, one database. Forward the original URL and Origin together
// so the application's same-origin checks and host-only session cookies remain intact.
const gateway = {
  async fetch(request, env) {
    try {
      return await env.EDU_APP.fetch(request);
    } catch {
      return new Response("일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30" },
      });
    }
  },
};

export default gateway;
