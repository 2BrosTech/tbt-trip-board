# CLAUDE.md — Trip Board

A no-login shared trip board: one Cloudflare Worker (`worker.js`) serves a React app
(`src/app.jsx`, bundled to `public/app.js` by esbuild) and a KV-backed JSON API at
`/api/kv/:key`. The person you're helping is probably not a developer — explain
each step in plain English, and show them the board locally before deploying.

## Customizing for a new trip

Everything trip-specific lives near the top of `src/app.jsx`:

- **Dates:** `DK()` and `tripDays()` hardcode July 2026 (`new Date(2026, 6, dd)` —
  months are 0-based). Change the year/month/day list together. `seedMeals()` keys
  meal slots off `tripDays()`; its `spec` array has one entry per day (arrival day
  dinner only, departure day breakfast only), so keep its length equal to the
  number of days. The ★ "big" dinner is the one where `getDate() === 4` — move or
  drop that check for a non-4th trip.
- **Lists:** `STAPLES_SEED`, `GEAR_CATEGORIES` + `GEAR_SEED`, `EVENTS_SEED`. Event
  `dayKey` must be `'All week'` or a `DK(dd)` label that matches a trip day.
- **Names on screen:** the `Gate` component (`gate-title`) and the `Header`
  component (`eyebrow` line and `trip-title`). Search for "The 4th at the Lake".
- **Weather:** `TripWeather` — the Open-Meteo `latitude`/`longitude` in its URL and
  the "Lake forecast" label. Look up coordinates for the town they give you.
- **Playlist:** `EMBED_SRC` (a Spotify embed URL). If they have no playlist, remove
  the `<Playlist />` usage rather than leaving someone else's.
- **Fireworks easter egg:** fires when someone RSVPs to an event with "fireworks"
  in its title. Leave it unless they ask.
- **New tab or section:** add its key to `KEYS` in `src/app.jsx` AND to `SECTIONS`
  in `worker.js`. The Worker rejects any key not in `SECTIONS`, so a missing entry
  shows up as a section that never saves.
- **Look:** all CSS is in the `Style` component at the bottom of the file, with
  color variables at the top of that block.

## Running and deploying

- `npm install`, then `npm run dev` (builds, then runs `wrangler dev` with a local
  KV — no Cloudflare login needed). If devDependencies don't install, the shell has
  `NODE_ENV=production`; use `NODE_ENV=development npm install --include=dev`.
- Deploy: `npx wrangler login` (the user completes it in their browser), then
  `npx wrangler kv namespace create BOARD`, paste the printed id into
  `wrangler.toml` replacing `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`, then
  `npx wrangler deploy`. The `[build]` hook rebuilds `public/app.js` on every deploy.
- Everything fits Cloudflare's free plan. Don't enable paid features.

## Data safety

- Seeds only load into an **empty** section, and only after a confirmed-empty read.
  Editing a seed after the board is live does not change the live board — the user
  edits it in the app, or you clear that KV key deliberately (ask first).
- Don't rename `KEYS` on a live board; the app would start fresh under the new key
  and the old data would look lost.
- The Worker snapshots every section hourly into `bkp:` keys (about 2 days kept).
  Before any destructive change to a live board, take a manual backup with
  `npx wrangler kv key list` / `kv key get --remote`.
- There are no logins: anyone with the URL can edit. Remind the user to keep
  addresses, door codes and similar off the board. `BOARD_KEY` in `wrangler.toml`
  adds a light shared-secret gate if they want one.
