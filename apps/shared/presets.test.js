/*
 * Purpose: Unit tests for presets.js: URL encoding round trips, URL restore, rating and
 *   thumbnail validation, canvas thumbnails, and the Supabase client's requests and error
 *   messages against a mocked fetch.
 * Consumers: `node --test apps/shared/*test.js` (run with the cloud-simulator suite).
 * Dependencies: node:test, node:assert, presets.js. No network access.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { encodeParams, decodeParams, paramsFromUrl, urlWithParams, validateRating, isThumbnail, canvasThumbnail, createPresetStore, RATINGS, LIMITS } from "./presets.js";

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

const thumbnail = "data:image/png;base64,iVBORw0KGgo=";

test("validation mirrors the table's limits", () => {
  const ok = { app: "cloud-simulator/convection", displayName: "Max", rating: "love", params, thumbnail };
  assert.equal(validateRating(ok), null);
  assert.equal(validateRating({ ...ok, thumbnail: null }), null);
  assert.deepEqual(RATINGS.map(r => r.value), ["love", "beautiful", "gross", "boring"]);
  assert.match(validateRating({ ...ok, displayName: "  " }), /name/);
  assert.match(validateRating({ ...ok, displayName: "x".repeat(LIMITS.name + 1) }), /80/);
  assert.match(validateRating({ ...ok, rating: "meh" }), /Rating/);
  assert.match(validateRating({ ...ok, app: "" }), /App id/);
  assert.match(validateRating({ ...ok, params: [1] }), /plain object/);
  assert.match(validateRating({ ...ok, params: { big: "x".repeat(LIMITS.params) } }), /8 KB/);
  assert.match(validateRating({ ...ok, thumbnail: "javascript:alert(1)" }), /thumbnail/);
  assert.match(validateRating({ ...ok, thumbnail: "data:image/png;base64," + "A".repeat(LIMITS.thumbnail) }), /50 KB/);
});

test("thumbnails: keep small canvases, scale big ones down, pick the smaller encoding", () => {
  const fakeCanvas = (width, height, sizes = {}) => ({ width, height, drawn: null,
    getContext() { return { drawImage: (...args) => { this.drawn = args; } }; },
    toDataURL(type) { return `data:${type};base64,` + "A".repeat(sizes[type] ?? 100); } });
  const small = fakeCanvas(64, 48, { "image/png": 40, "image/webp": 80 });
  assert.equal(canvasThumbnail(small), "data:image/png;base64," + "A".repeat(40));
  let made;
  const doc = { createElement: () => (made = fakeCanvas(0, 0, { "image/png": 90, "image/webp": 30 })) };
  const big = fakeCanvas(512, 384);
  assert.equal(canvasThumbnail(big, { document: doc }), "data:image/webp;base64," + "A".repeat(30));
  assert.deepEqual([made.width, made.height], [128, 96]);
  assert.equal(made.drawn[0], big);
  // Browsers without WebP encoding return PNG for it; oversized results are dropped.
  assert.equal(canvasThumbnail(fakeCanvas(64, 48, { "image/png": LIMITS.thumbnail, "image/webp": LIMITS.thumbnail })), null);
  assert.equal(canvasThumbnail({ width: 1, height: 1, toDataURL() { throw new Error("tainted"); } }), null);
  assert.equal(isThumbnail("data:image/webp;base64,AAAA"), true);
  assert.equal(isThumbnail("data:text/html;base64,AAAA"), false);
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

test("list reads this app's last ratings newest first with only the publishable key", async () => {
  const server = fakeServer([() => [200, [{ id: "1", display_name: "A" }]]]);
  const rows = await createPresetStore(options(server)).list();
  assert.deepEqual(rows, [{ id: "1", display_name: "A" }]);
  const [request] = server.requests;
  assert.equal(request.url.pathname, "/rest/v1/cloud_simulator_presets");
  assert.equal(request.url.searchParams.get("app_id"), "eq.demo/app");
  assert.equal(request.url.searchParams.get("order"), "created_at.desc");
  assert.equal(request.url.searchParams.get("limit"), "10");
  assert.match(request.url.searchParams.get("select"), /rating.*thumbnail/);
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
  const row = await store.save({ displayName: "  Max  ", rating: "beautiful", params, thumbnail });
  assert.deepEqual(row, { id: "p1", app_id: "demo/app", display_name: "Max", rating: "beautiful", params, thumbnail });
  await store.save({ displayName: "Max", rating: "boring", params });
  assert.equal(server.requests[2].body.thumbnail, null);
  assert.deepEqual(server.requests.map(r => r.method + " " + r.url.pathname), ["POST /auth/v1/signup", "POST /rest/v1/cloud_simulator_presets", "POST /rest/v1/cloud_simulator_presets"]);
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
  await store.save({ displayName: "Max", rating: "love", params });
  time += 3600_000;
  await store.save({ displayName: "Max", rating: "gross", params });
  assert.equal(server.requests[2].url.pathname + server.requests[2].url.search, "/auth/v1/token?grant_type=refresh_token");
  assert.deepEqual(server.requests[2].body, { refresh_token: "r1" });
  assert.equal(server.requests[3].headers.Authorization, "Bearer jwt2");
});

test("invalid ratings fail before any request", async () => {
  const server = fakeServer([]);
  await assert.rejects(createPresetStore(options(server)).save({ displayName: "", rating: "love", params }), { kind: "invalid" });
  await assert.rejects(createPresetStore(options(server)).save({ displayName: "Max", rating: "meh", params }), { kind: "invalid" });
  assert.equal(server.requests.length, 0);
});

test("errors explain setup problems, limits and being offline", async () => {
  const cases = [
    [[404, { code: "PGRST205", message: "Could not find the table 'public.cloud_simulator_presets' in the schema cache" }], "list", "setup", /table is missing/],
    [[422, { code: 422, error_code: "anonymous_provider_disabled", msg: "Anonymous sign-ins are disabled" }], "save", "anonymous", /anonymous sign-ins/],
    [[400, { code: "P0001", message: "rating rate limit: at most 120 per hour" }], "save", "limit", /an hour/],
  ];
  for (const [answer, action, kind, message] of cases) {
    const handlers = action === "save" && kind === "limit"
      ? [() => [200, { access_token: "t", refresh_token: "r", expires_in: 3600, user: { id: "u" } }], () => answer]
      : [() => answer];
    const store = createPresetStore(options(fakeServer(handlers)));
    await assert.rejects(action === "list" ? store.list() : store.save({ displayName: "x", rating: "love", params }), error => error.kind === kind && message.test(error.message));
  }
  const offline = createPresetStore(options({ fetch: async () => { throw new TypeError("Failed to fetch"); } }));
  await assert.rejects(offline.list(), { kind: "offline" });
});

test("a custom table is used for every request", async () => {
  const server = fakeServer([() => [200, []]]);
  await createPresetStore(options(server, { table: "other_ratings" })).list();
  assert.equal(server.requests[0].url.pathname, "/rest/v1/other_ratings");
});

test("undo (delete) needs this browser's session and reports rows it could not delete", async () => {
  const server = fakeServer([
    () => [200, { access_token: "jwt1", refresh_token: "r1", expires_in: 3600, user: { id: "user-1" } }],
    () => [201, [{ id: "p1" }]],
    () => [200, [{ id: "p1" }]],
    () => [200, []],
  ]);
  const store = createPresetStore(options(server));
  await assert.rejects(store.remove("p1"), { kind: "invalid" });
  await store.save({ displayName: "Max", rating: "love", params });
  await store.remove("p1");
  assert.equal(server.requests[2].method, "DELETE");
  assert.equal(server.requests[2].url.searchParams.get("id"), "eq.p1");
  await assert.rejects(store.remove("someone-else"), /isn't yours/);
});
