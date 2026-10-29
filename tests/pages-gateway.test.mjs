import assert from "node:assert/strict";
import test from "node:test";
import gateway from "../deploy/pages/public/_worker.js";

test("Pages forwards the original URL, body, origin and cookies without a second database", async () => {
  for (const origin of ["https://thecup-edu.pages.dev", "https://untrusted.example"]) {
    const request = new Request("https://thecup-edu.pages.dev/api/example?month=2026-10", {
      method: "POST", headers: { Origin: origin, Cookie: "session=test", "Content-Type": "application/json" }, body: '{"test":true}',
    });
    const upstream = new Response("ok", { headers: { "Set-Cookie": "session=next; Secure; HttpOnly; SameSite=Lax; Path=/", "Cache-Control": "private, no-store" } });
    const response = await gateway.fetch(request, { EDU_APP: { fetch: async forwarded => {
      assert.equal(forwarded, request);
      assert.equal(forwarded.headers.get("origin"), origin); // Never turn an untrusted Origin into a trusted one.
      assert.equal(forwarded.headers.get("cookie"), "session=test");
      assert.equal(await forwarded.text(), '{"test":true}');
      return upstream;
    } } });
    assert.equal(response, upstream);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("Pages failures are temporary, uncached and do not expose internal exceptions", async () => {
  const response = await gateway.fetch(new Request("https://thecup-edu.pages.dev/"), { EDU_APP: { fetch: async () => { throw Error("internal binding details"); } } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /internal binding/);
});
