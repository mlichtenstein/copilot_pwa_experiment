/*
 * Purpose: App-agnostic emoji ratings of an app's current settings: encode settings into a
 *   shareable URL, validate a rating, and save and list rating rows in a Supabase
 *   table (cloud_simulator_presets by default), signing the visitor in anonymously on first tap.
 * Consumers: presets-panel.js (the drop-in rating bar), presets.test.js, and any app that wants
 *   URL-encoded parameters without the bar.
 * Dependencies: fetch, URL, TextEncoder/TextDecoder, btoa/atob and a localStorage-like
 *   store (all injectable for tests); the Supabase Auth (/auth/v1) and PostgREST (/rest/v1)
 *   HTTP APIs; the table and policies in supabase/migrations/*_cloud_simulator_presets.sql.
 */

// Public project values only. The publishable key is safe in the client: row-level
// security decides what it can do. Never put a secret or service-role key here.
export const SUPABASE_URL = "https://uluovxbitpyaijrzwzyp.supabase.co";
export const SUPABASE_KEY = "sb_publishable_yAkIT03wv4PQHR9_vlDrog_0RmDEH64";

// Limits mirror the table's check constraints, so most bad input fails before a request.
export const LIMITS = { name: 80, params: 8192, app: 80, thumbnail: 51200 };
export const URL_KEY = "p";
export const DEFAULT_TABLE = "cloud_simulator_presets";
// The four ratings, in button order. `value` is what the table stores (its check constraint
// allows exactly these); the emoji, label (tooltips) and meaning (the About note) are only for display.
export const RATINGS = [
  { value: "love", emoji: "❤️", label: "Love it", meaning: "Love: you could watch this all day." },
  { value: "beautiful", emoji: "🎨", label: "Beautiful, like a painting", meaning: "Beautiful: it looks like a painting." },
  { value: "gross", emoji: "🤮", label: "Gross", meaning: "Gross: something looks wrong or ugly." },
  { value: "boring", emoji: "⬜", label: "Boring", meaning: "Boring: nothing interesting is happening." }
];
export const ratingFor = value => RATINGS.find(rating => rating.value === value) ?? null;

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

// A small picture of a canvas as a data URL for the table's `thumbnail` column: scaled down to
// fit maxWidth × maxHeight (never up), WebP when the browser can encode it and that is
// smaller, otherwise PNG. Null when it can't be made within the size limit.
export function canvasThumbnail(canvas, { maxWidth = 128, maxHeight = 96, document: doc = globalThis.document } = {}) {
  try {
    const scale = Math.min(1, maxWidth / canvas.width, maxHeight / canvas.height);
    let source = canvas;
    if (scale < 1) {
      source = doc.createElement("canvas");
      source.width = Math.max(1, Math.round(canvas.width * scale));
      source.height = Math.max(1, Math.round(canvas.height * scale));
      source.getContext("2d").drawImage(canvas, 0, 0, source.width, source.height);
    }
    const candidates = [source.toDataURL("image/png"), source.toDataURL("image/webp", 0.85)].filter(isThumbnail);
    return candidates.sort((a, b) => a.length - b.length)[0] ?? null;
  } catch {
    return null;
  }
}

// True for a string the table's thumbnail check accepts: an image data URL within the size limit.
export function isThumbnail(text) {
  return typeof text === "string" && text.length <= LIMITS.thumbnail && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(text);
}

// A human-readable problem with a rating, or null when it can be saved.
export function validateRating({ app, displayName, rating, params, thumbnail = null }) {
  if (typeof app !== "string" || !app || app.length > LIMITS.app) return `App id must be 1-${LIMITS.app} characters.`;
  const trimmed = typeof displayName === "string" ? displayName.trim() : "";
  if (!trimmed) return "Type your name first.";
  if (trimmed.length > LIMITS.name) return `Names are at most ${LIMITS.name} characters.`;
  if (!ratingFor(rating)) return `Rating must be one of ${RATINGS.map(r => r.value).join(", ")}.`;
  if (!isPlainParams(params)) return "Parameters must be a plain object.";
  if (bytes(JSON.stringify(params)) > LIMITS.params) return "These settings are too large to save (8 KB limit).";
  if (thumbnail !== null && !isThumbnail(thumbnail)) return "The thumbnail must be a PNG, WebP or JPEG data URL of at most 50 KB.";
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
    return new PresetError("setup", "Ratings aren't set up yet: the table is missing. See supabase/README.md.");
  }
  if (body.error_code === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(text)) {
    return new PresetError("anonymous", "Saving isn't switched on yet: anonymous sign-ins are disabled for this project. See supabase/README.md.");
  }
  if (/rate limit/i.test(text) || response.status === 429) {
    return new PresetError("limit", "Too many taps for now. Try again in an hour.");
  }
  if (body.code === "23514") return new PresetError("invalid", "The server rejected this rating (name, rating or size limit).");
  return new PresetError("http", `Ratings request failed (${response.status}${text ? ": " + text : ""}).`);
}

/*
 * A ratings client for one app id and table. Reads need no sign-in; the first tap signs in
 * anonymously and keeps the session (access and refresh tokens) in `storage`, so later taps on
 * this device count as the same visitor.
 */
export function createPresetStore({ app, table = DEFAULT_TABLE, url = SUPABASE_URL, key = SUPABASE_KEY, fetch: fetchImpl = globalThis.fetch.bind(globalThis),
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
      throw new PresetError("offline", "Can't reach the ratings server. Check your connection.");
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

  const rows = `/rest/v1/${encodeURIComponent(table)}`;
  return {
    app,
    // The signed-in visitor's id, or null before their first tap.
    userId: () => loadSession()?.user_id ?? null,
    // This app's most recent ratings from everyone, newest first.
    async list(limit = 10) {
      const query = new URLSearchParams({ select: "id,app_id,display_name,rating,params,thumbnail,created_at,created_by", app_id: `eq.${app}`, order: "created_at.desc", limit: String(limit) });
      return call(`${rows}?${query}`);
    },
    // One tap: saves who, how it felt, the full settings and a thumbnail as a new row.
    async save({ displayName, rating, params, thumbnail = null }) {
      const problem = validateRating({ app, displayName, rating, params, thumbnail });
      if (problem) throw new PresetError("invalid", problem);
      const { access_token } = await session(true);
      const [row] = await call(rows, { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ app_id: app, display_name: displayName.trim(), rating, params, thumbnail }) }, access_token);
      return row;
    }
  };
}
