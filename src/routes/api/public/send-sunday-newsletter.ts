import { createFileRoute } from "@tanstack/react-router";

/**
 * Weekly Sunday recap newsletter.
 *
 * NOTE: this project runs on TanStack Start (Cloudflare Workers), so there are
 * no Deno edge functions — this server route is the equivalent. Trigger it
 * from pg_cron / an external scheduler every Sunday:
 *
 *   POST https://focushourglass.com/api/public/send-sunday-newsletter
 *   Header: x-cron-secret: <NEWSLETTER_CRON_SECRET>
 *
 * Required env: RESEND_API_KEY, NEWSLETTER_CRON_SECRET, NEWSLETTER_UNSUB_SECRET,
 * HG_SUPABASE_URL, HG_SUPABASE_SERVICE_ROLE_KEY
 */

const FROM = "Focus Hourglass <newsletter@focushourglass.com>";
const SITE = "https://www.focushourglass.com";

type Profile = {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
};

type Stats = {
  total_focus_minutes: number | null;
  completed_sessions_count: number | null;
  current_streak?: number | null;
};

function sbHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signUnsubToken(userId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${userId}.${hex}`;
}

function esc(s: string) {
  return s.replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;",
  );
}

function renderEmail(opts: {
  name: string;
  minutes: number;
  sessions: number;
  streak: number;
  unsubUrl: string;
}) {
  const serif = "'Merriweather', Georgia, 'Times New Roman', serif";
  const stat = (value: string, label: string) => `
        <td align="center" style="padding:18px 10px;background:#ffffff;border:1px solid #E4E4E7;border-radius:10px">
          <div style="font-family:${serif};font-size:22px;font-weight:700;color:#18181B;line-height:1.2">${value}</div>
          <div style="font-family:${serif};font-size:12px;font-weight:300;color:#71717A;margin-top:6px;letter-spacing:.04em">${label}</div>
        </td>`;
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:${serif};color:#18181B">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="background:#F8F9FA;border:1px solid #E4E4E7;border-radius:14px;padding:36px 30px">
      <h1 style="font-family:${serif};font-size:24px;font-weight:700;margin:0 0 10px;color:#18181B">Dein Focus Recap &#8987;</h1>
      <p style="font-family:${serif};font-size:15px;font-weight:300;line-height:1.7;color:#3F3F46;margin:0 0 28px">
        ${esc(opts.name)}, hier sind deine Zahlen für diese Woche:
      </p>

      <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:8px 0;margin:0 0 30px">
        <tr>
          ${stat(`${opts.minutes} Min`, "Fokuszeit")}
          ${stat(String(opts.sessions), "Sessions")}
          ${stat(`${opts.streak} Tage &#128293;`, "Streak")}
        </tr>
      </table>

      <div style="border-top:1px solid #E4E4E7;padding-top:26px">
        <h2 style="font-family:${serif};font-size:17px;font-weight:700;margin:0 0 10px;color:#18181B">Tipp für nächste Woche: Die 2-Minuten-Regel</h2>
        <p style="font-family:${serif};font-size:14px;font-weight:300;line-height:1.75;color:#3F3F46;margin:0">
          Wenn eine Aufgabe weniger als zwei Minuten dauert, erledige sie sofort. Wenn sie länger dauert,
          starte heute Abend eine 25-Minuten-Session in Focus Hourglass, um das Momentum mit in den Montag zu nehmen.
        </p>
      </div>

      <div style="margin:30px 0 4px">
        <a href="${SITE}" style="display:inline-block;background:#18181B;color:#F8F9FA;text-decoration:none;padding:13px 24px;border-radius:8px;font-family:${serif};font-size:14px;font-weight:400">Woche planen &amp; Starten &rarr;</a>
      </div>
    </div>

    <p style="font-family:${serif};font-size:11px;font-weight:300;line-height:1.7;color:#A1A1AA;text-align:center;margin:22px 0 0">
      Focus Hourglass &bull; Du erhältst diese Mail als aktiver Nutzer.<br>
      <a href="${opts.unsubUrl}" style="color:#71717A;text-decoration:underline">Mit 1 Klick abmelden</a>
    </p>
  </div>
</body></html>`;
}

export const Route = createFileRoute("/api/public/send-sunday-newsletter")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.NEWSLETTER_CRON_SECRET;
        const resendKey = process.env.RESEND_API_KEY;
        const unsubSecret = process.env.NEWSLETTER_UNSUB_SECRET;
        const url = process.env.HG_SUPABASE_URL;
        const serviceKey = process.env.HG_SUPABASE_SERVICE_ROLE_KEY;

        if (!cronSecret || !resendKey || !unsubSecret || !url || !serviceKey) {
          console.error("[newsletter] missing env configuration");
          return new Response("Not configured", { status: 500 });
        }

        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!(await timingSafeEqual(provided, cronSecret))) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 1. Subscribed AND premium profiles only
        const profilesRes = await fetch(
          `${url}/rest/v1/profiles?select=user_id,email,display_name&is_subscribed=eq.true&is_premium=eq.true`,
          { headers: sbHeaders(serviceKey) },
        );
        if (!profilesRes.ok) {
          const text = await profilesRes.text();
          console.error("[newsletter] profiles query failed", profilesRes.status, text);
          return new Response("Failed to load recipients", { status: 500 });
        }
        const profiles = (await profilesRes.json()) as Profile[];
        console.log("[newsletter] recipients", profiles.length);

        let sent = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const profile of profiles) {
          try {
            let email = profile.email ?? null;
            if (!email) {
              const authRes = await fetch(
                `${url}/auth/v1/admin/users/${profile.user_id}`,
                { headers: sbHeaders(serviceKey) },
              );
              if (authRes.ok) {
                const u = (await authRes.json()) as { email?: string | null };
                email = u.email ?? null;
              }
            }
            if (!email) {
              skipped++;
              continue;
            }

            // 2. Weekly stats via database function
            const statsRes = await fetch(`${url}/rest/v1/rpc/get_weekly_user_stats`, {
              method: "POST",
              headers: sbHeaders(serviceKey),
              body: JSON.stringify({ p_user_id: profile.user_id }),
            });
            if (!statsRes.ok) {
              const text = await statsRes.text();
              console.error("[newsletter] stats rpc failed", profile.user_id, text);
              errors.push(profile.user_id);
              continue;
            }
            const raw = (await statsRes.json()) as Stats | Stats[];
            const stats = Array.isArray(raw) ? raw[0] : raw;
            const minutes = Math.round(Number(stats?.total_focus_minutes ?? 0));
            const sessions = Number(stats?.completed_sessions_count ?? 0);
            const streak = Number(stats?.current_streak ?? 0);


            // Nothing to report — don't spam inactive users.
            if (minutes <= 0 && sessions <= 0) {
              skipped++;
              continue;
            }

            const token = await signUnsubToken(profile.user_id, unsubSecret);
            const unsubUrl = `${SITE}/api/public/newsletter-unsubscribe?token=${encodeURIComponent(token)}`;

            // 3. Send via Resend
            const sendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: FROM,
                to: [email],
                subject: "Deine Fokus-Woche im Rückblick",
                html: renderEmail({
                  name: profile.display_name?.trim() || "Focus Friend",
                  minutes,
                  sessions,
                  streak,
                  unsubUrl,
                }),
                headers: {
                  "List-Unsubscribe": `<${unsubUrl}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
              }),
            });
            if (!sendRes.ok) {
              const text = await sendRes.text();
              console.error("[newsletter] resend failed", sendRes.status, text);
              errors.push(profile.user_id);
              continue;
            }
            sent++;
          } catch (err) {
            console.error("[newsletter] recipient error", profile.user_id, err);
            errors.push(profile.user_id);
          }
        }

        console.log("[newsletter] done", { sent, skipped, failed: errors.length });
        return Response.json({ sent, skipped, failed: errors.length });
      },
    },
  },
});
