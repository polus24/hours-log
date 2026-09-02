// Cloudflare Pages Function
// Handles GET / POST at /api/rates
// Stores the four editable hourly pay rates (weekday/Saturday/Sunday/
// public holiday) in the same HOURS_KV namespace, under "rates:<user>".

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

const FIELDS = ["weekday", "saturday", "sunday", "publicHoliday"];

function isValidRate(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const providedPin = url.searchParams.get("pin");
  if (!user) return json({ error: "missing user" }, 400);
  if (!pinOk(env, providedPin)) return json({ error: "unauthorized" }, 401);

  const raw = await env.HOURS_KV.get(keyFor(user));
  const defaults = { weekday: 0, saturday: 0, sunday: 0, publicHoliday: 0 };
  return json(raw ? { ...defaults, ...JSON.parse(raw) } : defaults);
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
  const rates = body.rates;
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !rates || typeof rates !== "object") {
    return json({ error: "invalid" }, 400);
  }

  const clean = {};
  for (const field of FIELDS) {
    const v = Number(rates[field]);
    if (!isValidRate(v)) {
      return json({ error: `${field}: enter a rate between 0 and 1000` }, 400);
    }
    clean[field] = v;
  }

  await env.HOURS_KV.put(keyFor(user), JSON.stringify(clean));
  return json({ ok: true });
}
