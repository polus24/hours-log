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

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  if (!user) return json({ error: "missing user" }, 400);

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

  if (!user || !date || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return json({ error: "invalid entry" }, 400);
  }

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  const entries = raw ? JSON.parse(raw) : [];

  const entry = { id: crypto.randomUUID(), date, hours };
  entries.push(entry);

  await env.HOURS_KV.put(key, JSON.stringify(entries));
  return json(entry, 201);
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
  if (!user || !id) return json({ error: "invalid" }, 400);

  const key = keyFor(user);
  const raw = await env.HOURS_KV.get(key);
  let entries = raw ? JSON.parse(raw) : [];
  entries = entries.filter(e => e.id !== id);

  await env.HOURS_KV.put(key, JSON.stringify(entries));
  return json({ ok: true });
}
