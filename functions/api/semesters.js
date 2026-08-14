// Cloudflare Pages Function
// Handles GET / POST at /api/semesters
// Stores the user-entered semester start/end dates in the same HOURS_KV
// namespace, under a "semesters:<user>" key. This data is what future
// logic (reminders, the 48h cap indicator) will use to know which weeks
// are actually restricted — this endpoint just stores what the person enters.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function keyFor(user) {
  const clean = String(user || "").trim().slice(0, 40);
  return "semesters:" + clean;
}

function pinOk(env, providedPin) {
  const expected = env.APP_PIN;
  if (!expected) return true;
  return String(providedPin || "") === String(expected);
}

const VALID_IDS = new Set([
  "s2-2026", "s1-2027", "s2-2027", "s1-2028", "s2-2028", "s1-2029", "s2-2029"
]);

function isValidDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
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
  const semesters = body.semesters;
  if (!pinOk(env, body.pin)) return json({ error: "unauthorized" }, 401);
  if (!user || !semesters || typeof semesters !== "object") {
    return json({ error: "invalid" }, 400);
  }

  // Only keep known semester ids, and only well-formed date strings.
  // Either date can be blank/omitted (not confirmed yet) — that's allowed.
  const clean = {};
  for (const [id, val] of Object.entries(semesters)) {
    if (!VALID_IDS.has(id)) continue;
    const start = val && isValidDateStr(val.start) ? val.start : "";
    const end = val && isValidDateStr(val.end) ? val.end : "";
    if (start && end && end < start) {
      return json({ error: `${id}: end date is before start date` }, 400);
    }
    clean[id] = { start, end };
  }

  await env.HOURS_KV.put(keyFor(user), JSON.stringify(clean));
  return json({ ok: true });
}
