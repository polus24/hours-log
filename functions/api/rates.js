// Cloudflare Pages Function
// Handles GET / POST / DELETE at /api/rates
//
// Stores a dated HISTORY of hourly rates per day-type, not just one
// current number — so a rate change (birthday pay bump, pay rise, new
// job) never retroactively changes gross pay already calculated for
// past shifts. Each entry is { from: "YYYY-MM-DD", rate: number },
// meaning "this rate applies from this date until superseded by a
// later one". Stored under "rates:<user>" in HOURS_KV.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function keyFor(user) {
  const clean = String(user || "").trim().slice(0, 40);
  return "rates:" + clean;
}

function pinOk(env, providedPin) {
  const expected = env.APP_PIN;
  if (!expected) return true;
  return String(providedPin || "") === String(expected);
}

const DAY_TYPES = ["weekday", "saturday", "sunday", "publicHoliday"];

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidRate(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000;
}

async function loadHistory(env, user) {
  const raw = await env.HOURS_KV.get(keyFor(user));
  const data = raw ? JSON.parse(raw) : {};
  const result = {};
  for (const dt of DAY_TYPES) {
    let arr = data[dt];
    // Back-compat: an older deploy may have stored one flat number per
    // day-type instead of a history array — treat that as a single
    // entry that's always been in effect, rather than losing it.
    if (typeof arr === "number") {
      arr = [{ from: "2000-01-01", rate: arr }];
    }
    if (!Array.isArray(arr)) arr = [];
    result[dt] = arr
      .filter(h => h && isValidDate(h.from) && isValidRate(Number(h.rate)))
      .map(h => ({ from: h.from, rate: Number(h.rate) }))
      .sort((a, b) => a.from.localeCompare(b.from));
  }
  return result;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const providedPin = url.searchParams.get("pin");
  if (!user) return json({ error: "missing user" }, 400);
  if (!pinOk(env, providedPin)) return json({ error: "unauthorized" }, 401);

  return json(await loadHistory(env, user));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const user = body.user;
  const dayType = body.dayType;
  const from = body.from;
  const rate = Number(body.rate);
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !DAY_TYPES.includes(dayType)) return json({ error: "invalid day type" }, 400);
  if (!isValidDate(from)) return json({ error: "enter a valid effective date" }, 400);
  if (!isValidRate(rate)) return json({ error: "rate must be between 0 and 1000" }, 400);

  const history = await loadHistory(env, user);
  const arr = history[dayType];
  const idx = arr.findIndex(h => h.from === from);
  if (idx >= 0) arr[idx] = { from, rate }; // same date entered twice — correct it, don't duplicate
  else arr.push({ from, rate });
  arr.sort((a, b) => a.from.localeCompare(b.from));

  await env.HOURS_KV.put(keyFor(user), JSON.stringify(history));
  return json({ ok: true, history });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const user = body.user;
  const dayType = body.dayType;
  const from = body.from;
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !DAY_TYPES.includes(dayType) || !isValidDate(from)) {
    return json({ error: "invalid" }, 400);
  }

  const history = await loadHistory(env, user);
  history[dayType] = history[dayType].filter(h => h.from !== from);

  await env.HOURS_KV.put(keyFor(user), JSON.stringify(history));
  return json({ ok: true, history });
}
