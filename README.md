# Trip Board

A free, no-login trip board from [Two Brothers Technology](https://2brostech.com/free/trip-board).
One link holds the whole trip: meals, groceries, gear, headcount and the schedule.
Everyone who opens it sees the same live board. No app, no accounts, and it runs
on Cloudflare's free plan.

We built it for our own 23-person 4th of July and cleaned it up to share. This
copy is set up as a 4th-of-July lake weekend so you can see how everything fits.

## Not a developer? Let Claude set it up

1. Download this repo (green **Code** button → **Download ZIP**) and unzip it.
2. Install [Node.js](https://nodejs.org) (the LTS version, 22 or newer) and
   [Claude Code](https://claude.com/claude-code).
3. Make a free [Cloudflare account](https://dash.cloudflare.com/sign-up), then open
   **Workers & Pages** in the dashboard once and pick your `workers.dev` name.
4. Open a terminal in the unzipped folder, run `claude`, and paste the prompt in
   [PROMPT.md](PROMPT.md).

Claude asks about your trip, fills in the board, shows it to you locally, then
walks you through putting it online. The step-by-step version with screenshots
of the board is at [2brostech.com/free/trip-board](https://2brostech.com/free/trip-board).

## What's on it

Five tabs:

- **Meals** — day-by-day meal slots (arrival dinner → departure breakfast).
  Claim a meal, write the menu, and anyone can pledge potluck sides to it. The
  July 4th dinner gets the ★ "big cookout" badge.
- **Staples** — the grocery list. Claim, mark **Got it**, add with quantities
  (with duplicate detection).
- **Gear** — categorized packing list (Cookout / Lake & Outdoor / Cabin &
  Comfort / Games / July 4th) with claim and release.
- **Roster** — check in with just a name; set party size, arrival day, and
  dietary notes. Name matching is case-insensitive, and returning visitors tap
  their name chip to rejoin, so nobody double-counts the headcount.
- **Events** — a day-keyed weekend schedule with "I'm in" RSVPs, time-sorted
  listings, a live weather forecast card (Open-Meteo, keyless), and a hidden
  fireworks easter egg.

Plus the glue that makes it feel real: a claim-progress bar in the header, a
sync-status indicator, All/Mine/Open filters + search with a **Copy my list**
export (clipboard with mobile fallback), a Spotify playlist card, and an
**offline mode** — reads fall back to last-known-good data, writes buffer and
replay automatically when the connection returns.

```
trip-board/
  worker.js         API (/api/kv/:key) + serves the app + hourly KV backup
  wrangler.toml     config (KV binding, rate limits, backup cron, vars)
  src/app.jsx       the React app + all styles — edit here; the build bundles it
  public/index.html minimal HTML shell
```

## How it works

- **One Worker does everything.** It serves the static React app via Workers
  static assets and exposes a tiny JSON API (`GET`/`PUT /api/kv/:key`) backed by
  Workers KV. State is a handful of JSON documents — no SQL, no server to run.
- **Sections are KV keys.** Each part of the board (`board:meals:v1`,
  `board:events:v1`, …) is one key, namespaced by `BOARD_ID` so one Worker + KV
  namespace can host many independent boards. Empty sections self-seed on first
  load — and only after a *confirmed-empty* read, so a flaky connection can
  never overwrite real data with a fresh seed.
- **Read-merge-write, not overwrite.** The app fetches the latest copy of a
  section, applies your edit, and writes it back — so concurrent edits to
  *different* rows are safe. Same-row edits within a second are last-write-wins
  (fine at small-group scale; use a Durable Object if you need true atomicity).
- **No login, private link.** Identity is just a display name in `localStorage`.
  Access is the link itself: set a `BOARD_KEY` secret and share the board as
  `https://<board>/#key=<key>`. The part after `#` never reaches the server or its
  logs. Anyone without the key sees a "need the full link" screen.
- **Hourly backups, built in.** A scheduled cron fires the Worker's
  `scheduled()` handler, which snapshots every section into timestamped `bkp:`
  KV keys (keeps ~2 days). Runs in Cloudflare's cloud 24/7 — no local machine.
- **Edge rate limiting.** Per-IP limiters shield the KV free-tier quotas with no
  user-facing friction. All optional — the Worker runs fine without them.

## Deploy (about 5 minutes)

Needs Node.js 22 or newer and a free Cloudflare account. **New Cloudflare account?**
Open Workers & Pages in the dashboard once and pick your `workers.dev` name first,
or the first deploy stops and asks you to.

```bash
# 0. from the project folder
npm install

# 1. log into YOUR Cloudflare account (opens a browser)
npx wrangler login

# 2. ship it. The first deploy creates the KV namespace for you and writes its id
#    into wrangler.toml (keep it). The [build] hook bundles src/app.jsx first.
npx wrangler deploy

# 3. make it private: generate a key, store it as a secret
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
npx wrangler secret put BOARD_KEY      # paste the key when asked
```

Share `https://trip-board.<your-subdomain>.workers.dev/#key=<your-key>`. Skip
step 3 if you want an open board anyone with the URL can edit. To use
your own domain, uncomment the `[[routes]]` block in `wrangler.toml` (if the zone
is on your Cloudflare account, deploying creates the DNS record and TLS cert for
you).

## Develop locally

```bash
npm run dev     # bundles the app, then runs `wrangler dev` with a local KV
```

No Cloudflare login needed. To test the private link locally, put
`BOARD_KEY=anything` in a `.dev.vars` file and open `http://localhost:8787/#key=anything`.

## Make it yours

- **Rename the trip:** dates and day labels come from `tripDays()` in
  `src/app.jsx`; titles live in the `Gate` and `Header` components. The seeds
  (`seedMeals`, `STAPLES_SEED`, `GEAR_SEED`, `EVENTS_SEED`) are plain arrays —
  swap in your own weekend.
- **Add a section:** add a key to `KEYS`, a seed, a tab entry, and a component
  in `src/app.jsx`; add the same key to `SECTIONS` in `worker.js`. That list is both
  the hourly-backup list and the API allowlist, so the new tab can't save until
  it's there.
- **Change the look:** all styles live in the `Style` component at the bottom
  of `src/app.jsx` — one CSS block, custom properties up top.
- **Weather + playlist:** swap the Open-Meteo coordinates in `TripWeather` and
  the Spotify playlist id in `EMBED_SRC`.
- **Change the key:** run `npx wrangler secret put BOARD_KEY` again and send
  everyone the new link. Old links stop working right away.
- **Embedding something new?** Add its domain to the Content-Security-Policy in
  `public/_headers`, or the browser will block it.

## License

MIT — see [LICENSE](LICENSE).
