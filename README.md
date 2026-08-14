# Hours Log — deploy to GitHub + Cloudflare

This is a static site (`index.html`) plus one small serverless function
(`functions/api/entries.js`) that stores entries in a Cloudflare KV
namespace. No build step, no framework, nothing to `npm install`.

## What you end up with

A URL like `hours-log.pages.dev` (or your own domain) that works on any
phone or PC, with data stored on Cloudflare rather than in the browser.
Each device is linked by a short **sync code** — generated automatically
the first time the app is opened, and re-enterable on any other device
to see the same log.

---

## 1. Push this to GitHub

1. Create a new repo on GitHub (public or private — doesn't matter), e.g. `hours-log`.
2. Copy these three files/folders into it, keeping the structure exactly as-is:
   ```
   hours-log/
     index.html
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

1. Go to your Pages project → **Settings** → **Functions**.
2. Under **KV namespace bindings**, click **Add binding**.
3. Variable name: `HOURS_KV` (must match exactly — that's what `entries.js` expects).
4. KV namespace: select the `HOURS_KV` you just created.
5. Save.
6. Trigger a new deployment so the binding takes effect — easiest way is
   **Deployments** → **⋯** on the latest one → **Retry deployment**.

## 5. (Optional) Custom domain

If you already manage a domain on Cloudflare: Pages project → **Custom domains**
→ **Set up a custom domain** → follow the prompt. It's typically automatic
since Cloudflare already controls the DNS.

## 6. Using it

- Open the `pages.dev` URL (or your custom domain) on his phone.
- The app auto-generates a 6-character sync code the first time it loads
  (shown at the top). That code is what links his devices together.
- On his PC, open the same URL, click **use a different code**, type in
  the same code from his phone, and both devices now read/write the same log.
- No login, no password — the code is just a shared key. It's fine for a
  personal tool like this, but anyone who has the code could see the data,
  so treat it a bit like a PIN (don't post it publicly).

## How the fortnight rule works

Weeks are fixed Monday–Sunday. The app tracks weekly totals and checks
every consecutive pair of weeks (week 1+2, week 2+3, week 3+4, …) against
the 48-hour cap — matching the "current fortnight" logic described. The
main dashboard always shows the previous week + current week combined,
since that's the live pair that matters day-to-day. The banner at the top
scans the *entire* history and flags any week-pair that ever went over,
even if it's since dropped back under.
