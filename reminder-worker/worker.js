// Fortnight — 8pm reminder worker
//
// This is a SEPARATE Cloudflare Worker (not a Pages Function) because
// Cron Triggers only exist on standalone Workers. Deployed via the
// Cloudflare dashboard's Quick Edit — no CLI needed. See README.md in
// this folder for the exact setup steps.
//
// It runs on a schedule, checks whether any hours were logged for
// today (Sydney time), and if not, sends a real push notification to
// every subscribed device via the Web Push protocol (RFC 8291 payload
// encryption + RFC 8292 VAPID auth), implemented here from scratch
// using only the Web Crypto API already built into Workers.

const SYNC_USER = "household-hours-log"; // must match syncCode in index.html

// ---------- small helpers ----------
function b64url(buf) {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concatBytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}
async function hkdfExpand(prk, info, length) {
  const input = concatBytes(info, new Uint8Array([1]));
  const out = await hmacSha256(prk, input);
  return out.slice(0, length);
}

// ---------- Sydney-time helpers ----------
function sydneyHourNow() {
  const s = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", hour12: false }).format(new Date());
  return parseInt(s, 10) % 24;
}
function sydneyTodayStr() {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

// ---------- build & send one Web Push request ----------
async function sendWebPush({ endpoint, p256dh, auth }, env, payloadObj) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));

  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const uaPublicRaw = fromB64url(p256dh);
  const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);

  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, ephemeral.privateKey, 256));

  const authSecret = fromB64url(auth);
  const prkCombine = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  const ikm = await hkdfExpand(prkCombine, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cekBytes = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonceBytes = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const cekKey = await crypto.subtle.importKey("raw", cekBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concatBytes(payloadBytes, new Uint8Array([2]));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBytes, tagLength: 128 }, cekKey, padded);
  const ciphertext = new Uint8Array(cipherBuf);

  const rs = 4096;
  const rsBytes = new Uint8Array([(rs >>> 24) & 0xff, (rs >>> 16) & 0xff, (rs >>> 8) & 0xff, rs & 0xff]);
  const header = concatBytes(salt, rsBytes, new Uint8Array([asPublicRaw.length]), asPublicRaw);
  const body = concatBytes(header, ciphertext);

  const vapidPublicRaw = fromB64url(env.VAPID_PUBLIC_KEY);
  const vapidPrivateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256",
      d: env.VAPID_PRIVATE_KEY,
      x: b64url(vapidPublicRaw.slice(1, 33)),
      y: b64url(vapidPublicRaw.slice(33, 65)),
      ext: true, key_ops: ["sign"]
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const jwtHeader = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const jwtPayload = b64url(new TextEncoder().encode(JSON.stringify({ aud, exp, sub: "mailto:reminder@fortnight.local" })));
  const signingInput = `${jwtHeader}.${jwtPayload}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidPrivateKey, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400"
    },
    body
  });
  return res;
}

async function runCheck(env, force) {
  // Only actually proceed at 8pm Sydney time (the two UTC cron slots
  // below cover both sides of Sydney's daylight-saving shift — this
  // guard makes sure only the correct one of the two actually fires).
  if (!force && sydneyHourNow() !== 20) return { sent: false, reason: "not 8pm Sydney yet" };

  const entriesRaw = await env.HOURS_KV.get(`entries:${SYNC_USER}`);
  const entries = entriesRaw ? JSON.parse(entriesRaw) : [];
  const today = sydneyTodayStr();
  const loggedToday = entries.some(e => e.date === today);
  if (loggedToday) return { sent: false, reason: "already logged today" };

  const subsRaw = await env.HOURS_KV.get(`subs:${SYNC_USER}`);
  const subs = subsRaw ? JSON.parse(subsRaw) : [];
  if (subs.length === 0) return { sent: false, reason: "no subscriptions" };

  const payload = {
    title: "Fortnight",
    body: "No hours logged today — add today's shift before it slips your mind."
  };

  const stillValid = [];
  let sentCount = 0;
  for (const sub of subs) {
    try {
      const res = await sendWebPush(sub, env, payload);
      // 404/410 = subscription is dead (uninstalled, permission revoked) — drop it
      if (res.status !== 404 && res.status !== 410) {
        stillValid.push(sub);
        if (res.ok) sentCount++;
      }
    } catch (e) {
      stillValid.push(sub); // network hiccup — keep it, don't drop on a transient error
    }
  }

  if (stillValid.length !== subs.length) {
    await env.HOURS_KV.put(`subs:${SYNC_USER}`, JSON.stringify(stillValid));
  }
  return { sent: true, sentCount, totalSubs: subs.length };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCheck(env, false));
  },
  // Lets you trigger a check manually by visiting the Worker's URL —
  // add ?force=1 to skip the "must be 8pm Sydney" guard so you can
  // test it works right now, without waiting for the actual time.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const result = await runCheck(env, force);
    return new Response(JSON.stringify(result, null, 2), { headers: { "content-type": "application/json" } });
  }
};
