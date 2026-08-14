// Cloudflare Pages Function
// Handles POST (subscribe) / DELETE (unsubscribe) at /api/subscribe
// Stores push subscriptions in the same HOURS_KV namespace already
// bound for entries, under a separate "subs:<user>" key.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function keyFor(user) {
  const clean = String(user || "").trim().slice(0, 40);
  return "subs:" + clean;
}

function pinOk(env, providedPin) {
  const expected = env.APP_PIN;
  if (!expected) return true;
  return String(providedPin || "") === String(expected);
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
  const sub = body.subscription;
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return json({ error: "invalid subscription" }, 400);
  }

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  const subs = raw ? JSON.parse(raw) : [];

  const cleanSub = { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };

  // de-dupe by endpoint (re-subscribing the same device shouldn't create duplicates)
  const existingIndex = subs.findIndex(s => s.endpoint === cleanSub.endpoint);
  if (existingIndex >= 0) {
    subs[existingIndex] = cleanSub;
  } else {
    subs.push(cleanSub);
  }

  await env.HOURS_KV.put(key, JSON.stringify(subs));
  return json({ ok: true, count: subs.length }, 201);
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
  const endpoint = body.endpoint;
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !endpoint) return json({ error: "invalid" }, 400);

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  let subs = raw ? JSON.parse(raw) : [];
  subs = subs.filter(s => s.endpoint !== endpoint);

  await env.HOURS_KV.put(key, JSON.stringify(subs));
  return json({ ok: true, count: subs.length });
}
