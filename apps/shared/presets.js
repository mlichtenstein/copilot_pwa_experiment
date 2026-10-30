/*
 * Purpose: App-agnostic presets: encode a run's parameters into a shareable URL, validate
 *   presets, and save, list and delete them in the shared Supabase `presets` table, signing
 *   the visitor in anonymously on first save.
 * Consumers: presets-panel.js (the drop-in UI), presets.test.js, and any app that wants
 *   URL-encoded parameters without the panel.
 * Dependencies: fetch, URL, TextEncoder/TextDecoder, btoa/atob and a localStorage-like
 *   store (all injectable for tests); the Supabase Auth (/auth/v1) and PostgREST (/rest/v1)
 *   HTTP APIs; the table and policies in supabase/migrations/*_presets.sql.
 */

// Public project values only. The publishable key is safe in the client: row-level
// security decides what it can do. Never put a secret or service-role key here.
export const SUPABASE_URL = "https://uluovxbitpyaijrzwzyp.supabase.co";
export const SUPABASE_KEY = "sb_publishable_yAkIT03wv4PQHR9_vlDrog_0RmDEH64";

// Limits mirror the table's check constraints, so most bad input fails before a request.
export const LIMITS = { name: 80, note: 500, params: 8192, app: 80 };
export const URL_KEY = "p";

const bytes = text => new TextEncoder().encode(text).length;

// Parameters are a plain JSON object (numbers, strings, booleans, nested plain data).
export function isPlainParams(params) {
  return params !== null && typeof params === "object" && !Array.isArray(params);
}

// base64url of the UTF-8 JSON, so a link survives chat apps and URL bars.
export function encodeParams(params) {
  if (!isPlainParams(params)) throw new TypeError("params must be a plain object");
  const utf8 = new TextEncoder().encode(JSON.stringify(params));
  let binary = "";
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns the parameters, or null for anything that is not a valid encoded object.
export function decodeParams(text) {
  if (typeof text !== "string" || !text || text.length > LIMITS.params * 2 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const params = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    return isPlainParams(params) ? params : null;
  } catch {
    return null;
  }
}

// The parameters in a URL's ?p=..., or null when absent or invalid.
export function paramsFromUrl(url) {
  return decodeParams(new URL(url).searchParams.get(URL_KEY) ?? "");
}

// The same URL with ?p= set to these parameters; other query parts and the hash are kept.
export function urlWithParams(url, params) {
  const next = new URL(url);
  next.searchParams.set(URL_KEY, encodeParams(params));
  return next.href;
}

// A human-readable problem with a preset, or null when it can be saved.
export function validatePreset({ app, name, note = "", params }) {
  if (typeof app !== "string" || !app || app.length > LIMITS.app) return `App id must be 1-${LIMITS.app} characters.`;
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return "Give the preset a name.";
  if (trimmed.length > LIMITS.name) return `Names are at most ${LIMITS.name} characters.`;
  if (typeof note !== "string" || note.length > LIMITS.note) return `Notes are at most ${LIMITS.note} characters.`;
  if (!isPlainParams(params)) return "Parameters must be a plain object.";
  if (bytes(JSON.stringify(params)) > LIMITS.params) return "These parameters are too large to save (8 KB limit).";
  return null;
}

// Errors carry a `kind` the UI can explain: offline, setup (table missing), anonymous
// (anonymous sign-ins off), limit (too many saves), invalid, or http.
export class PresetError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

// Turn a failed response into a PresetError with a clear message.
async function failure(response) {
  let body = {};
  try { body = await response.json(); } catch { /* not JSON */ }
  const text = [body.message, body.msg, body.error_description, body.error].filter(Boolean).join(" ");
  if (body.code === "PGRST205" || body.code === "42P01" || /could not find the table|does not exist/i.test(text)) {
    return new PresetError("setup", "Saved presets aren't set up yet: the presets table is missing. See supabase/README.md.");
  }
  if (body.error_code === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(text)) {
    return new PresetError("anonymous", "Saving isn't switched on yet: anonymous sign-ins are disabled for this project. See supabase/README.md.");
  }
  if (/preset rate limit/i.test(text) || response.status === 429) {
    return new PresetError("limit", "Too many saves for now. Try again in an hour.");
  }
  if (body.code === "23514") return new PresetError("invalid", "The server rejected this preset (name, note or size limit).");
  return new PresetError("http", `Presets request failed (${response.status}${text ? ": " + text : ""}).`);
}

/*
 * A presets client for one app id. Reads need no sign-in; the first save signs in
 * anonymously and keeps the session (access and refresh tokens) in `storage`, so the
 * same visitor can delete their own presets later on this device.
 */
export function createPresetStore({ app, url = SUPABASE_URL, key = SUPABASE_KEY, fetch: fetchImpl = globalThis.fetch.bind(globalThis),
  storage = globalThis.localStorage, now = () => Date.now() }) {
  const sessionKey = `presets-session:${new URL(url).host}`;
  const loadSession = () => { try { return JSON.parse(storage?.getItem(sessionKey) ?? "null"); } catch { return null; } };
  const saveSession = session => storage?.setItem(sessionKey, JSON.stringify(session));

  async function call(path, options = {}, token) {
    let response;
    try {
      response = await fetchImpl(url + path, { ...options, headers: { apikey: key, "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    } catch {
      throw new PresetError("offline", "Can't reach the presets server. Check your connection.");
    }
    if (!response.ok) throw await failure(response);
    return response.status === 204 ? null : response.json();
  }

  const keep = data => {
    const session = { access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(now() / 1000) + (data.expires_in ?? 3600), user_id: data.user?.id };
    saveSession(session);
    return session;
  };

  // A valid session, refreshed when within a minute of expiry; signs in when `create`.
  async function session(create) {
    let current = loadSession();
    if (current && current.expires_at - 60 > now() / 1000) return current;
    if (current?.refresh_token) {
      try { return keep(await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: current.refresh_token }) })); }
      catch (error) { if (error.kind === "offline") throw error; storage?.removeItem(sessionKey); current = null; }
    }
    if (!create) return null;
    // Anonymous sign-in: a sign-up with no email or password (what signInAnonymously() sends).
    return keep(await call("/auth/v1/signup", { method: "POST", body: JSON.stringify({ data: {} }) }));
  }

  return {
    app,
    // The signed-in visitor's id, or null before their first save.
    userId: () => loadSession()?.user_id ?? null,
    // This app's presets, newest first.
    async list(limit = 50) {
      const query = new URLSearchParams({ select: "id,app,name,note,params,commit_sha,created_at,created_by", app: `eq.${app}`, order: "created_at.desc", limit: String(limit) });
      return call(`/rest/v1/presets?${query}`);
    },
    async save({ name, note = "", params, commitSha = null }) {
      const problem = validatePreset({ app, name, note, params });
      if (problem) throw new PresetError("invalid", problem);
      const { access_token } = await session(true);
      const [row] = await call("/rest/v1/presets", { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ app, name: name.trim(), note: note.trim() || null, params, commit_sha: commitSha }) }, access_token);
      return row;
    },
    // Deletes one of the visitor's own presets; row-level security ignores anyone else's.
    async remove(id) {
      const current = await session(false);
      if (!current) throw new PresetError("invalid", "Only presets saved from this browser can be deleted here.");
      const rows = await call(`/rest/v1/presets?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=representation" } }, current.access_token);
      if (!rows?.length) throw new PresetError("invalid", "That preset wasn't deleted: it isn't yours, or it's already gone.");
    }
  };
}
