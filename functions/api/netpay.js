// Cloudflare Pages Function
// Handles GET / POST at /api/netpay
// Stores the actual net pay the person entered for a given week (keyed
// by that week's Monday date) in HOURS_KV, under "netpay:<user>".
// This is a plain user-entered figure — never calculated — used purely
// for comparison against the calculated gross figure.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function keyFor(user) {
  const clean = String(user || "").trim().slice(0, 40);
  return "netpay:" + clean;
}

function pinOk(env, providedPin) {
  const expected = env.APP_PIN;
  if (!expected) return true;
  return String(providedPin || "") === String(expected);
}

function isValidMonday(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // Must actually be a Monday — cheap sanity check without pulling in
  // the app's date-math helpers into this file.
  const d = new Date(s + "T00:00:00Z");
  return d.getUTCDay() === 1;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const providedPin = url.searchParams.get("pin");
  if (!user) return json({ error: "missing user" }, 400);
  if (!pinOk(env, providedPin)) return json({ error: "unauthorized" }, 401);

  const raw = await env.HOURS_KV.get(keyFor(user));
  return json(raw ? JSON.parse(raw) : {});
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
  const weekMonday = body.weekMonday;
  const amount = Number(body.amount);
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !isValidMonday(weekMonday)) {
    return json({ error: "weekMonday must be a Monday, e.g. 2026-08-11" }, 400);
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
    return json({ error: "amount must be a number between 0 and 100000" }, 400);
  }

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  const data = raw ? JSON.parse(raw) : {};
  data[weekMonday] = amount;

  await env.HOURS_KV.put(key, JSON.stringify(data));
  return json({ ok: true });
}
