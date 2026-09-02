# Hours Log — deploy to GitHub + Cloudflare

This is a static site (`index.html`) plus one small serverless function
(`functions/api/entries.js`) that stores entries in a Cloudflare KV
namespace. No build step, no framework, nothing to `npm install`.

## What you end up with

A URL like `hours-log.pages.dev` (or your own domain) that works on any
phone or PC, with data stored on Cloudflare rather than in the browser.
Everyone who opens the link and enters the shared PIN sees the same log —
no accounts, no per-device setup.

---

## 1. Push this to GitHub

1. Create a new repo on GitHub (public or private — doesn't matter), e.g. `hours-log`.
2. Copy these files/folders into it, keeping the structure exactly as-is:
   ```
   hours-log/
     index.html
     manifest.json
     sw.js
     favicon.ico
     icons/
       apple-touch-icon.png
       apple-touch-icon-152.png
       apple-touch-icon-167.png
       icon-192.png
       icon-512.png
       icon-512-maskable.png
       favicon-32.png
       favicon-16.png
     functions/
       api/
         entries.js
     README.md
   ```
3. Commit and push:
   ```bash
   git init
   git add .
   git commit -m "Hours log tracker"
   git branch -M main
   git remote add origin https://github.com/<you>/hours-log.git
   git push -u origin main
   ```

## 2. Connect Cloudflare Pages to the repo

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the `hours-log` repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `/`
4. Click **Save and Deploy**. It'll deploy in under a minute — you'll get a
   `*.pages.dev` URL. The site will load, but saving hours won't work yet
   (no storage attached).

## 3. Create the KV namespace

1. Workers & Pages → **KV** (left sidebar) → **Create namespace**.
2. Name it `HOURS_KV`.

## 4. Bind KV to the Pages project

1. Go to your Pages project → **Settings** → **Bindings**.
2. Click **Add**.
3. Select **KV namespace**.
4. Variable name: `HOURS_KV` (must match exactly — that's what `entries.js` expects).
5. KV namespace: select the `HOURS_KV` you just created.
6. Save.

## 5. Set the shared PIN

This is what stops anyone but your household from seeing or entering data.

1. Same **Settings → Bindings** page → **Add** → this time choose
   **Environment variable / Secret** (Cloudflare may just call it "Variable").
2. Variable name: `APP_PIN`
3. Value: your chosen PIN, e.g. `4821`. Use **Secret** / "Encrypt" if offered,
   so it's not visible in the dashboard afterwards.
4. Save.

Until you do this step, the site works with **no PIN required at all** —
that's deliberate, so it's usable while you're still setting things up.
Once `APP_PIN` is set and deployed, every device needs that PIN to load or
save any data.

## 6. Redeploy so it all takes effect

1. **Deployments** tab → latest deployment → **⋯** → **Retry deployment**.

This picks up both the KV binding and the PIN.

## 7. (Optional) Custom domain

If you already manage a domain on Cloudflare: Pages project → **Custom domains**
→ **Set up a custom domain** → follow the prompt. It's typically automatic
since Cloudflare already controls the DNS.

## Using it

Open the `pages.dev` URL (or your custom domain) on any phone or PC — his,
yours, your wife's. First visit on each device asks for the PIN; enter it
once and that device stays unlocked (stored locally in the browser) until
someone taps **Lock** in the top corner. Everyone who's entered the PIN
reads and writes the same shared log automatically.

The PIN is enforced by the server, not just hidden in the page — so even
someone poking directly at the API without the PIN gets rejected.

## Navigation

Three pages, all cross-linked:

- **`/`** — the main hours log and 48h cap dashboard.
- **`/settings.html`** — semester dates (which weeks the cap applies to)
  and pay rates. Reached via the **⚙ Settings** button at the top of the
  main page.
- **`/income.html`** — gross vs. net pay by period. Reached via the
  **$ Income** button at the top of the main page.

All three share the same PIN — unlocking one doesn't separately unlock
the others per device, but the PIN itself is the same everywhere.

## Logging hours

Entries are made by entering a start time, finish time, and any unpaid
break (in minutes) — the app works out the total hours automatically,
including overnight shifts (finish time earlier than start = next day).
It shows a live preview of the shift length as you type, before you hit Add.

Weeks are fixed Monday–Sunday. The app tracks weekly totals and checks
every consecutive pair of weeks (week 1+2, week 2+3, week 3+4, …) against
the 48-hour cap — matching the "current fortnight" logic described. The
main dashboard always shows the previous week + current week combined,
since that's the live pair that matters day-to-day. The banner at the top
scans the *entire* history and flags any week-pair that ever went over,
even if it's since dropped back under.

## Exporting a report

The **Export report** panel lets you pick a "from" week and a "to" week —
both snapped to full Monday–Sunday weeks, so you can't accidentally slice
a week in half. It generates a printable report with:

- weekly totals for every week in range
- running fortnight totals for every consecutive week pair, flagged if
  any went over 48h
- a full entry-by-entry breakdown per week (date, start–finish, break, hours)

Click **Print / Save as PDF** in the report view and use your browser's
print dialog to save it as a PDF — the report is styled to print cleanly
on its own, without the rest of the app's dark background.

## Installing it as an app on iPhone (PWA)

The site is now a proper installable app, called **Fortnight**, with its
own icon (the "48" mark). No App Store, no extra setup beyond deploying
the files above.

To install on an iPhone:

1. Open the site URL in **Safari** (it has to be Safari — Chrome and
   other iOS browsers can't install PWAs to the home screen).
2. Tap the **Share** button (the square with an arrow, in the bottom bar).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top right.

The Fortnight icon now appears on the home screen like any other app. It
launches full-screen — no Safari address bar or browser chrome — and
works exactly the same as opening it in a browser tab underneath.

A few real limitations worth knowing about, all specific to how iOS
handles home-screen web apps:

- **No install banner.** iOS doesn't prompt anyone to install — each
  person has to do the Share → Add to Home Screen steps above manually.
  There's no way to shortcut this from the web page itself.
- **Works offline for viewing**, thanks to `sw.js`, which caches the app
  shell. It can't save or sync new hours without a connection, same as
  before — that part still needs the network.
- **The PIN may need re-entering once** if the app is ever removed and
  re-added to the home screen — iOS can clear that site's local storage
  when a home-screen app is deleted. Not a bug, just how iOS treats
  reinstalls.
- **No push notifications** — iOS doesn't support these for home-screen
  web apps. Not something built here, just flagging it in case it comes
  up later.

Everything else — the PIN, the shared log, the export reports — works
identically whether it's opened as a home-screen app or a regular Safari
tab.
