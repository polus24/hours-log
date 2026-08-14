# Fortnight reminder worker — setup

This is a **separate** Cloudflare Worker from the main site. It has to be
separate because Cron Triggers (scheduled jobs) only exist on standalone
Workers, not on Pages Functions. It's still deployed entirely through the
Cloudflare dashboard — no command line needed, same as everything else.

## What it does

Once a day, it checks whether any hours were logged for "today" (Sydney
time). If nothing's been logged by **8pm Sydney time**, it sends a real
push notification to every device that's enabled reminders. If hours
were already logged, it does nothing — silent by design.

## 1. Create the Worker

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Workers**
   (not Pages this time) → **Create Worker** (sometimes shown as "Hello World" starter is fine).
2. Give it a name, e.g. `fortnight-reminder`.
3. Once created, click **Edit code** (Quick Edit).
4. Delete whatever placeholder code is there, and paste in the entire
   contents of `worker.js` from this folder.
5. Click **Deploy**.

## 2. Bind the same KV namespace

The reminder worker needs to read the same hours data and store its
own list of subscribed devices — using the **same `HOURS_KV`** namespace
you already created for the main site.

1. Go to this Worker → **Settings** → **Bindings** → **Add**.
2. Choose **KV namespace**.
3. Variable name: `HOURS_KV` (must match exactly).
4. KV namespace: select the same `HOURS_KV` you created earlier.
5. Save.

## 3. Add the VAPID keys

These are the cryptographic keys that let this Worker send push
notifications. They're already generated for you — you don't need to
create your own.

1. Same **Settings → Bindings** → **Add** → **Environment variable / Secret**.
2. Add two variables:
   - Name: `VAPID_PUBLIC_KEY`
     Value: `BNRgdbOgmPoChCd1ENoBbKUe02kD-x_hqfA6XT4IQ26J8oFDne56YpWx9FB0gvQkiPJ3bjHzSlPxSgHZ9s6vUaw`
   - Name: `VAPID_PRIVATE_KEY`
     Value: `aYCSCbk-0WhR-OnC_Uz5-r3xo0yElkob7PdBeWYt8n4`
     (turn on **Secret/Encrypt** for this one, since it's the private half)
3. Save.

These same two keys are also already embedded in `index.html` (the
public one only — that one's safe to expose, it's not secret). Don't
regenerate new keys unless you specifically want to; the public key
baked into the site and the keys set here need to match each other.

## 4. Set the schedule

Sydney shifts between UTC+10 and UTC+11 with daylight saving, so this
uses **two** cron triggers — the Worker itself checks the real Sydney
time and only actually sends at 8pm, so only one of the two ever
actually fires on any given day. This is already handled in the code;
you just need to add both schedules.

1. This Worker → **Settings** → **Triggers** → **Cron Triggers** → **Add Cron Trigger**.
2. Add: `0 9 * * *`
3. Add another: `0 10 * * *`
4. Save.

## 5. Test it before trusting it

Don't wait for 8pm to find out if it works. Visit your Worker's URL
(shown at the top of its dashboard page, looks like
`fortnight-reminder.<your-subdomain>.workers.dev`) with `?force=1`
added to the end, e.g.:

```
https://fortnight-reminder.yoursubdomain.workers.dev/?force=1
```

This skips the "must be 8pm" check and runs the logic immediately. It
returns a small JSON response telling you what happened, e.g.:

```json
{ "sent": true, "sentCount": 1, "totalSubs": 1 }
```

or, if hours were already logged today:

```json
{ "sent": false, "reason": "already logged today" }
```

If `totalSubs` is 0, nobody's tapped **Enable reminders** in the app yet
— see below.

## Turning reminders on (on his phone)

This part happens in the app itself, not in Cloudflare:

1. Open Fortnight (from the home screen icon, not a browser tab —
   notifications only work for the installed app on iOS).
2. Tap **Enable reminders** near the top.
3. Allow notifications when iOS asks.

That's it — his device is now subscribed. Each person who wants their
own phone to get the reminder needs to do this on their own device; it's
per-device, not automatic for everyone once one person enables it.

## A note on reliability

This sends a real push notification, but no notification system —
Apple's included — guarantees delivery 100% of the time (Do Not
Disturb, Focus modes, and low-power states can all suppress it). Given
what's riding on this, it's worth treating this as the primary safety
net but not the *only* one — a plain recurring phone alarm as backup
costs nothing and doesn't depend on any of this working.
