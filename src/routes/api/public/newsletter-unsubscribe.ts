import { createFileRoute } from "@tanstack/react-router";

/**
 * One-click unsubscribe for the weekly newsletter.
 * GET (link click) and POST (RFC 8058 List-Unsubscribe-Post) both work.
 */

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const userId = token.slice(0, idx);
  const sigHex = token.slice(idx + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== sigHex.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sigHex.charCodeAt(i);
  return diff === 0 ? userId : null;
}

async function unsubscribe(token: string | null) {
  const secret = process.env.NEWSLETTER_UNSUB_SECRET;
  const url = process.env.HG_SUPABASE_URL;
  const serviceKey = process.env.HG_SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !serviceKey) {
    console.error("[unsubscribe] missing env configuration");
    return { ok: false, status: 500, message: "Not configured" };
  }
  if (!token) return { ok: false, status: 400, message: "Missing token" };

  const userId = await verifyToken(token, secret);
  if (!userId) return { ok: false, status: 400, message: "Invalid link" };

  const res = await fetch(`${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ is_subscribed: false }),
  });
  if (!res.ok) {
    console.error("[unsubscribe] update failed", res.status, await res.text());
    return { ok: false, status: 500, message: "Could not update preferences" };
  }
  console.log("[unsubscribe] user unsubscribed", userId);
  return { ok: true, status: 200, message: "Unsubscribed" };
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0f;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:420px;padding:32px;text-align:center">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#9ca3af;margin:0 0 24px">${body}</p>
<a href="https://www.focushourglass.com" style="color:#e5e7eb">Zurück zu Focus Hourglass</a>
</div></body></html>`;
}

export const Route = createFileRoute("/api/public/newsletter-unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        const result = await unsubscribe(token);
        return new Response(
          result.ok
            ? page("Abgemeldet", "Du erhältst den wöchentlichen Rückblick nicht mehr.")
            : page("Abmeldung fehlgeschlagen", result.message),
          { status: result.status, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
      POST: async ({ request }) => {
        let token = new URL(request.url).searchParams.get("token");
        if (!token) {
          try {
            const body = await request.text();
            token = new URLSearchParams(body).get("token");
          } catch {
            /* ignore */
          }
        }
        const result = await unsubscribe(token);
        return Response.json({ ok: result.ok, message: result.message }, { status: result.status });
      },
    },
  },
});
