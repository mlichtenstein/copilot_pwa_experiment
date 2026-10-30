/*
 * Purpose: Unit tests for presets.js: URL encoding round trips, URL restore, validation,
 *   and the Supabase client's requests and error messages against a mocked fetch.
 * Consumers: `node --test apps/shared/*test.js` (run with the cloud-simulator suite).
 * Dependencies: node:test, node:assert, presets.js. No network access.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { encodeParams, decodeParams, paramsFromUrl, urlWithParams, validatePreset, createPresetStore, LIMITS } from "./presets.js";

const params = { seed: 4294967295, water: 0.5, layering: "stable", feather: true, label: "über ☁️", nested: { a: [1, 2] } };

test("encode/decode round trips plain objects, including non-ASCII text", () => {
  const text = encodeParams(params);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeParams(text), params);
});

test("decode rejects junk, non-objects and arrays", () => {
  for (const bad of ["", "%%%", "not base64!", encodeParams({}).slice(0, -1) + "*", btoa("[1,2]"), btoa("42"), btoa("{bad json"), null, undefined]) {
    assert.equal(decodeParams(bad), null, String(bad));
  }
  assert.throws(() => encodeParams([1]));
});

test("URLs carry params in ?p= and keep the rest of the address", () => {
  const link = urlWithParams("https://example.com/apps/x.html?view=sunset#rules", params);
  const url = new URL(link);
  assert.equal(url.searchParams.get("view"), "sunset");
  assert.equal(url.hash, "#rules");
  assert.deepEqual(paramsFromUrl(link), params);
  assert.equal(paramsFromUrl("https://example.com/apps/x.html"), null);
  assert.equal(paramsFromUrl("https://example.com/?p=garbage!"), null);
});

test("validation mirrors the table's limits", () => {
  const ok = { app: "cloud-simulator/convection", name: "Calm", note: "", params };
  assert.equal(validatePreset(ok), null);
  assert.match(validatePreset({ ...ok, name: "  " }), /name/);
  assert.match(validatePreset({ ...ok, name: "x".repeat(LIMITS.name + 1) }), /80/);
  assert.match(validatePreset({ ...ok, note: "x".repeat(LIMITS.note + 1) }), /500/);
  assert.match(validatePreset({ ...ok, app: "" }), /App id/);
  assert.match(validatePreset({ ...ok, params: [1] }), /plain object/);
  assert.match(validatePreset({ ...ok, params: { big: "x".repeat(LIMITS.params) } }), /8 KB/);
});

// A fake Supabase: records requests and answers from a list of handlers.
function fakeServer(handlers) {
  const requests = [];
  const fetch = async (url, options) => {
    const request = { url: new URL(url), method: options.method ?? "GET", headers: options.headers, body: options.body && JSON.parse(options.body) };
    requests.push(request);
    const [status, body] = handlers.shift()(request);
    return { ok: status < 300, status, json: async () => body };
  };
  return { fetch, requests };
}
const memoryStorage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; };
const options = (server, extra = {}) => ({ app: "demo/app", url: "https://project.supabase.co", key: "sb_publishable_test", fetch: server.fetch, storage: memoryStorage(), now: () => 1_000_000_000_000, ...extra });

test("list reads this app's presets newest first with only the publishable key", async () => {
  const server = fakeServer([() => [200, [{ id: "1", name: "A" }]]]);
  const rows = await createPresetStore(options(server)).list();
  assert.deepEqual(rows, [{ id: "1", name: "A" }]);
  const [request] = server.requests;
  assert.equal(request.url.pathname, "/rest/v1/presets");
  assert.equal(request.url.searchParams.get("app"), "eq.demo/app");
  assert.equal(request.url.searchParams.get("order"), "created_at.desc");
  assert.equal(request.headers.apikey, "sb_publishable_test");
  assert.equal(request.headers.Authorization, undefined);
});

test("first save signs in anonymously once, then reuses the session", async () => {
  const server = fakeServer([
    () => [200, { access_token: "jwt1", refresh_token: "r1", expires_in: 3600, user: { id: "user-1" } }],
    request => [201, [{ id: "p1", ...request.body }]],
    request => [201, [{ id: "p2", ...request.body }]],
  ]);
  const store = createPresetStore(options(server));
  assert.equal(store.userId(), null);
  const row = await store.save({ name: "  Calm  ", note: "", params, commitSha: "abc123" });
  assert.deepEqual(row, { id: "p1", app: "demo/app", name: "Calm", note: null, params, commit_sha: "abc123" });
  await store.save({ name: "Again", params });
  assert.deepEqual(server.requests.map(r => r.method + " " + r.url.pathname), ["POST /auth/v1/signup", "POST /rest/v1/presets", "POST /rest/v1/presets"]);
  assert.deepEqual(server.requests[0].body, { data: {} });
  assert.equal(server.requests[1].headers.Authorization, "Bearer jwt1");
  assert.equal(server.requests[1].headers.Prefer, "return=representation");
  assert.equal(store.userId(), "user-1");
});

test("an expiring session is refreshed instead of creating a new user", async () => {
  let time = 1_000_000_000_000;
  const server = fakeServer([
    () => [200, { access_token: "jwt1", refresh_token: "r1", expires_in: 3600, user: { id: "user-1" } }],
    () => [201, [{ id: "p1" }]],
    () => [200, { access_token: "jwt2", refresh_token: "r2", expires_in: 3600, user: { id: "user-1" } }],
    () => [201, [{ id: "p2" }]],
  ]);
  const store = createPresetStore(options(server, { now: () => time }));
  await store.save({ name: "One", params });
  time += 3600_000;
  await store.save({ name: "Two", params });
  assert.equal(server.requests[2].url.pathname + server.requests[2].url.search, "/auth/v1/token?grant_type=refresh_token");
  assert.deepEqual(server.requests[2].body, { refresh_token: "r1" });
  assert.equal(server.requests[3].headers.Authorization, "Bearer jwt2");
});

test("invalid presets fail before any request", async () => {
  const server = fakeServer([]);
  await assert.rejects(createPresetStore(options(server)).save({ name: "", params }), { kind: "invalid" });
  assert.equal(server.requests.length, 0);
});

test("errors explain setup problems, limits and being offline", async () => {
  const cases = [
    [[404, { code: "PGRST205", message: "Could not find the table 'public.presets' in the schema cache" }], "list", "setup", /table is missing/],
    [[422, { code: 422, error_code: "anonymous_provider_disabled", msg: "Anonymous sign-ins are disabled" }], "save", "anonymous", /anonymous sign-ins/],
    [[400, { code: "P0001", message: "preset rate limit: at most 20 saves per hour" }], "save", "limit", /an hour/],
  ];
  for (const [answer, action, kind, message] of cases) {
    const handlers = action === "save" && kind === "limit"
      ? [() => [200, { access_token: "t", refresh_token: "r", expires_in: 3600, user: { id: "u" } }], () => answer]
      : [() => answer];
    const store = createPresetStore(options(fakeServer(handlers)));
    await assert.rejects(action === "list" ? store.list() : store.save({ name: "x", params }), error => error.kind === kind && message.test(error.message));
  }
  const offline = createPresetStore(options({ fetch: async () => { throw new TypeError("Failed to fetch"); } }));
  await assert.rejects(offline.list(), { kind: "offline" });
});

test("delete needs this browser's session and reports rows it could not delete", async () => {
  const server = fakeServer([
    () => [200, { access_token: "jwt1", refresh_token: "r1", expires_in: 3600, user: { id: "user-1" } }],
    () => [201, [{ id: "p1" }]],
    () => [200, [{ id: "p1" }]],
    () => [200, []],
  ]);
  const store = createPresetStore(options(server));
  await assert.rejects(store.remove("p1"), { kind: "invalid" });
  await store.save({ name: "Mine", params });
  await store.remove("p1");
  assert.equal(server.requests[2].method, "DELETE");
  assert.equal(server.requests[2].url.searchParams.get("id"), "eq.p1");
  await assert.rejects(store.remove("someone-else"), /isn't yours/);
});
