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
  unsubUrl: string;
}) {
  const hours = Math.floor(opts.minutes / 60);
  const mins = opts.minutes % 60;
  const duration = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;
  return `<!doctype html>
<html lang="de"><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <h1 style="font-size:22px;margin:0 0 8px">Deine Fokus-Woche, ${esc(opts.name)}</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 24px">
      Hier ist dein Rückblick auf die vergangenen 7 Tage.
    </p>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;text-align:center">
          <div style="font-size:26px;font-weight:bold">${duration}</div>
          <div style="font-size:13px;color:#6b7280">Fokuszeit</div>
        </td>
        <td style="width:12px"></td>
        <td style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;text-align:center">
          <div style="font-size:26px;font-weight:bold">${opts.sessions}</div>
          <div style="font-size:13px;color:#6b7280">Sessions</div>
        </td>
      </tr>
    </table>
    <a href="${SITE}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px">Neue Woche starten</a>
    <p style="font-size:12px;color:#9ca3af;margin-top:32px">
      Du willst diesen Rückblick nicht mehr erhalten?
      <a href="${opts.unsubUrl}" style="color:#6b7280">Mit einem Klick abmelden</a>.
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

        // 1. Subscribed profiles
        const profilesRes = await fetch(
          `${url}/rest/v1/profiles?select=user_id,email,display_name&is_subscribed=eq.true`,
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
