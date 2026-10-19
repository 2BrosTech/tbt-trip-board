# Set it up with Claude

Open a terminal in this folder, run `claude`, and paste everything in the box below.
New to this? The full walkthrough is at
[2brostech.com/free/trip-board](https://2brostech.com/free/trip-board).

```text
I downloaded the Trip Board template from Two Brothers Technology into this folder. Help me turn it into a board for my own trip and put it online. I'm not a developer, so explain each step in plain English.

First, read README.md and CLAUDE.md so you understand the project. Then ask me these one at a time:
1. What's the trip called, and where is it (town or area)?
2. What are the dates?
3. Which meals do we need covered, and what should be on the grocery and gear lists to start?
4. Any outings or events to put on the schedule?
5. Do we have a shared Spotify playlist? (If not, remove the playlist card.)

Then:
- Update the trip name, dates, weather location and starting lists in src/app.jsx.
- Run it on my computer (npm install, then npm run dev) and give me the link so I can look at it before anything goes online.
- When I say it looks good, walk me through putting it on Cloudflare's free plan: I'll do the browser login when you run "npx wrangler login". Then create the KV namespace, put its id into wrangler.toml, and deploy.
- Give me the final link to send to everyone, plus a short note on how to change things later.

Ask before you run anything that deletes data or costs money.
```
