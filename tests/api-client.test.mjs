import assert from "node:assert/strict";
import test from "node:test";
import { requestJson } from "../lib/api-client.ts";

test("JSON responses retain caller headers and multipart bodies", async (t) => {
  const form = new FormData(); form.set("receipt", new File(["photo"], "receipt.jpg"));
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.body, form);
    assert.equal(init.headers.get("accept"), "application/json");
    assert.equal(init.headers.get("x-request-id"), "receipt-1");
    assert.equal(init.headers.has("content-type"), false);
    return Response.json({ id: 7 }, { status: 201 });
  });
  assert.deepEqual(await requestJson("/upload", { method: "POST", body: form, headers: new Headers({ "x-request-id": "receipt-1" }) }), { id: 7 });
});

test("HTML and empty success responses do not clear forms as a successful save", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("<html>Unavailable</html>"));
  await assert.rejects(requestJson("/save"), /처리 결과를 확인하지 못했습니다/);
  fetch.mock.mockImplementation(async () => Response.json(null));
  await assert.rejects(requestJson("/save"), /처리 결과를 확인하지 못했습니다/);
});

test("authorization errors preserve the server message and HTML failures show readable text", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "로그인이 필요합니다." }, { status: 401 }));
  await assert.rejects(requestJson("/private"), /로그인이 필요합니다/);
  fetch.mock.mockImplementation(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));
  await assert.rejects(requestJson("/save"), /서버 응답/);
});

test("network failures never automatically replay a write", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(requestJson("/save", { method: "POST" }), /내역을 확인한 뒤/);
  assert.equal(fetch.mock.callCount(), 1);
});
