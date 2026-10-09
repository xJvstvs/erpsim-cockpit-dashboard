import assert from "node:assert/strict";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:5173");
if (
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  base.protocol !== "http:"
)
  throw new Error("This test uses the local preview mock only.");
const game = `test-${Date.now()}`;
const headers = {
  Cookie: "__sites_local_auth=1",
  Origin: base.origin,
  "Content-Type": "application/json",
};
const request = (path, init = {}) => fetch(new URL(path, base), init);
let checks = 0;
const status = async (response, expected) => {
  assert.equal(response.status, expected);
  checks++;
  return response;
};
await status(await request("/api/dashboard"), 401);
await status(
  await request("/api/dashboard", {
    headers: {
      "oai-authenticated-user-id": "spoofed",
      "oai-authenticated-user-email": "fake@invalid.test",
    },
  }),
  401,
);
const dashboard = await (
  await status(await request("/api/dashboard", { headers }), 200)
).json();
assert.equal(dashboard.snapshot.mode, "demo");
const connection = await status(await request('/api/connection', { method: 'POST', headers, body: '{}' }), 401);
assert.match((await connection.json()).status, /SAP-Anmeldung/);
const path = `/api/drafts/marketing?game=${game}`;
const initial = await (
  await status(await request(path, { headers }), 200)
).json();
assert.equal(initial.version, 0);
const payload = {
  game,
  version: 0,
  baseVersion: "test-basis",
  payload: { "KK-F01:NO": "0" },
};
const put = (value, more = headers) =>
  request("/api/drafts/marketing", {
    method: "PUT",
    headers: more,
    body: JSON.stringify(value),
  });
await status(
  await put(payload, { ...headers, Origin: "https://other.invalid" }),
  403,
);
await status(
  await put(payload, { ...headers, "Content-Type": "text/plain" }),
  415,
);
const first = await (await status(await put(payload), 200)).json();
assert.equal(first.version, 1);
await status(await put(payload), 409);
const second = await (
  await status(
    await put({ ...payload, version: 1, payload: { "KK-F01:NO": "100" } }),
    200,
  )
).json();
assert.equal(second.version, 2);
const persisted = await (
  await status(await request(path, { headers }), 200)
).json();
assert.equal(persisted.payload["KK-F01:NO"], "100");
await status(
  await request("/api/actions", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      game: "demo-manufacturing",
      kind: "purchase",
      baseVersion: "demo-v1",
      payload: [
        {
          material: "KK-R01",
          vendor: "100001",
          quantity: 20000,
          unit: "KG",
          location: "88",
        },
      ],
    }),
  }),
  409,
);
await status(await request("/api/drafts/invalid?game=test", { headers }), 400);
console.log(
  `${checks} local API checks passed: authentication, spoofed headers, CSRF, JSON, persistence, conflicts, demo write protection.`,
);
