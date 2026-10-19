/**
 * Shared Board — Cloudflare Worker
 *
 * A no-login, real-time-enough shared board. One Worker serves a static React
 * app AND a KV-backed API; everyone who opens the URL sees the same live board.
 *
 * Routes:
 *   GET  /api/kv/:key   -> read a board section from KV (404 if unset)
 *   PUT  /api/kv/:key   -> write a board section to KV
 *   *                   -> static assets (the app), served from ./public
 *
 * Notes:
 * - Keys are namespaced by BOARD_ID, so you can run multiple independent boards
 *   off a single Worker + KV namespace.
 * - Private link: set the BOARD_KEY secret (`wrangler secret put BOARD_KEY`) and
 *   share the board as https://<board>/#key=<secret>. The app sends the key as
 *   X-Board-Key; without it the API answers 401 and the app shows a locked screen.
 *   Unset, the board is open to anyone who has the URL.
 * - KV is last-write-wins. The app does read-merge-write per section, which keeps
 *   concurrent edits to *different* rows safe. Two people editing the *same* row
 *   within the same second can still clobber — fine at small-group scale. For true
 *   atomicity, move sections to a Durable Object.
 */

const KEY_RE = /^[A-Za-z0-9:_.\-]{1,128}$/;
const MAX_BODY = 1_000_000; // 1 MB per section, well under KV's 25 MB value limit

// The board sections to snapshot on the scheduled cron (see [triggers] in
// wrangler.toml), and the allowlist for /api/kv. Keep in sync with KEYS in src/app.jsx.
const SECTIONS = ['board:meals:v1', 'board:staples:v1', 'board:gear:v1', 'board:roster:v1', 'board:events:v1'];
const BKP_PREFIX = 'bkp:'; // backup keys live in the same namespace, outside the board:: prefix
const BKP_KEEP = 48;       // keep ~2 days of hourly snapshots

// Snapshot every section into one timestamped backup key, then prune old ones.
// Stores the raw stored JSON per section (null if a section is unset). Restore with:
//   wrangler kv key get "bkp:<iso>" --namespace-id <id> --remote
async function backup(env) {
  const board = env.BOARD_ID || 'demo';
  const sections = {};
  for (const s of SECTIONS) sections[s] = await env.BOARD.get(`${board}::${s}`);
  const ts = new Date().toISOString();
  await env.BOARD.put(`${BKP_PREFIX}${ts}`, JSON.stringify({ ts, board, sections }));

  // ISO timestamps sort lexicographically, so the oldest are first — drop the excess.
  const { keys } = await env.BOARD.list({ prefix: BKP_PREFIX });
  const names = keys.map((k) => k.name).sort();
  for (const name of names.slice(0, Math.max(0, names.length - BKP_KEEP))) {
    await env.BOARD.delete(name);
  }
}

// The app is served by this same Worker, so the API is same-origin only: no CORS
// headers, which keeps other sites' scripts from reading or writing the board.
function withCors(resp) {
  resp.headers.set('x-content-type-options', 'nosniff');
  return resp;
}
const json = (obj, status = 200) =>
  withCors(new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } }));
const text = (body, status) => withCors(new Response(body, { status }));

// Constant-time comparison for the board key (set with `wrangler secret put BOARD_KEY`).
async function sameSecret(given, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function handleApi(request, env, url) {
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

  // Edge rate limiting, keyed per client IP. Protects the KV daily quota from
  // abusive loops with zero user-facing friction. Bindings are optional so the
  // Worker still runs fine anywhere they aren't configured (e.g. local dev).
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  if (env.API_LIMITER) {
    const { success } = await env.API_LIMITER.limit({ key: `a:${ip}` });
    if (!success) return text('slow down — too many requests', 429);
  }

  if (env.BOARD_KEY && !(await sameSecret(request.headers.get('x-board-key') || '', env.BOARD_KEY))) {
    return text('unauthorized', 401);
  }

  const match = url.pathname.match(/^\/api\/kv\/(.+)$/);
  if (!match) return text('not found', 404);

  const rawKey = decodeURIComponent(match[1]);
  if (!KEY_RE.test(rawKey)) return text('bad key', 400);
  // Only the board's own sections are storable, so nobody can fill the KV
  // namespace (or burn the free-tier write quota) with arbitrary keys.
  if (!SECTIONS.includes(rawKey)) return text('not found', 404);

  const board = env.BOARD_ID || 'demo';
  const kvKey = `${board}::${rawKey}`;

  if (request.method === 'GET') {
    const val = await env.BOARD.get(kvKey);
    if (val == null) return text('', 404);
    return withCors(new Response(val, { headers: { 'content-type': 'application/json' } }));
  }

  if (request.method === 'PUT') {
    if (env.WRITE_LIMITER) {
      const { success } = await env.WRITE_LIMITER.limit({ key: `w:${ip}` });
      if (!success) return text('slow down — too many writes', 429);
    }
    const body = await request.text();
    if (body.length > MAX_BODY) return text('payload too large', 413);
    // Every section is a JSON array; anything else would break the board for everyone.
    let parsed;
    try { parsed = JSON.parse(body); } catch { return text('body must be JSON', 400); }
    if (!Array.isArray(parsed)) return text('body must be a JSON array', 400);
    await env.BOARD.put(kvKey, body);
    return json({ ok: true });
  }

  return text('method not allowed', 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    return env.ASSETS.fetch(request); // serve the app
  },
  // Scheduled cron (wrangler.toml [triggers]) — snapshot the board to KV backup keys.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(backup(env));
  },
};
