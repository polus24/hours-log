// Cloudflare Pages Function
// Handles GET / POST / DELETE at /api/entries
// Requires a KV namespace bound as HOURS_KV (see README.md)

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function keyFor(user) {
  // very light sanitisation — sync code becomes the KV key
  const clean = String(user || "").trim().slice(0, 40);
  return "entries:" + clean;
}

// Checks the PIN against the APP_PIN environment variable/secret.
// If APP_PIN hasn't been configured yet, requests are allowed through
// (so the site doesn't lock you out before you've set it up) —
// once APP_PIN is set in the Cloudflare Pages project and redeployed,
// every request is required to match it.
function pinOk(env, providedPin) {
  const expected = env.APP_PIN;
  if (!expected) return true;
  return String(providedPin || "") === String(expected);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const providedPin = url.searchParams.get("pin");
  if (!user) return json({ error: "missing user" }, 400);
  if (!pinOk(env, providedPin)) return json({ error: "unauthorized" }, 401);

  const raw = await env.HOURS_KV.get(keyFor(user));
  return json(raw ? JSON.parse(raw) : []);
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
  const date = body.date;
  const hours = Number(body.hours);
  const start = body.start || null;
  const finish = body.finish || null;
  const breakMinutes = Number.isFinite(Number(body.breakMinutes)) ? Number(body.breakMinutes) : 0;
  const isPublicHoliday = body.isPublicHoliday === true;

  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !date || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return json({ error: "invalid entry" }, 400);
  }

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  const entries = raw ? JSON.parse(raw) : [];

  const entry = { id: crypto.randomUUID(), date, hours, start, finish, breakMinutes, isPublicHoliday };
  entries.push(entry);

  await env.HOURS_KV.put(key, JSON.stringify(entries));
  return json(entry, 201);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const user = body.user;
  const id = body.id;
  const date = body.date;
  const hours = Number(body.hours);
  const start = body.start || null;
  const finish = body.finish || null;
  const breakMinutes = Number.isFinite(Number(body.breakMinutes)) ? Number(body.breakMinutes) : 0;
  const isPublicHoliday = body.isPublicHoliday === true;

  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !id) return json({ error: "missing id" }, 400);
  if (!date || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return json({ error: "invalid entry" }, 400);
  }

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  const entries = raw ? JSON.parse(raw) : [];

  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return json({ error: "entry not found" }, 404);

  const updated = { id, date, hours, start, finish, breakMinutes, isPublicHoliday };
  entries[idx] = updated;

  await env.HOURS_KV.put(key, JSON.stringify(entries));
  return json(updated);
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
  const id = body.id;
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !id) return json({ error: "invalid" }, 400);

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  let entries = raw ? JSON.parse(raw) : [];
  entries = entries.filter(e => e.id !== id);

  await env.HOURS_KV.put(key, JSON.stringify(entries));
  return json({ ok: true });
}
