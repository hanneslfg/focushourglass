import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook. Configure in Stripe dashboard with:
 *   URL:    https://<your-domain>/api/public/stripe-webhook
 *   Events: checkout.session.completed
 *           customer.subscription.deleted
 *           customer.subscription.updated
 *
 * Env vars required:
 *   STRIPE_WEBHOOK_SECRET       (whsec_...)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const encoder = new TextEncoder();

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<{ ok: boolean; event?: unknown }> {
  if (!header) return { ok: false };
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k, v.join("=")];
    }),
  ) as Record<string, string>;
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false };

  // Reject events older than 5 min to blunt replay attacks.
  const ageSec = Math.floor(Date.now() / 1000) - Number(t);
  if (!Number.isFinite(ageSec) || ageSec > 300) return { ok: false };

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${t}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe compare
  if (expected.length !== v1.length) return { ok: false };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false };

  try {
    return { ok: true, event: JSON.parse(payload) };
  } catch {
    return { ok: false };
  }
}

async function setPremium(
  userId: string,
  isPremium: boolean,
  trialEndsAt?: string | null,
) {
  const url = process.env.HG_SUPABASE_URL;
  const serviceKey = process.env.HG_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[stripe-webhook] Supabase env missing");
    throw new Error("Supabase not configured");
  }
  const row: Record<string, unknown> = {
    user_id: userId,
    is_premium: isPremium,
    updated_at: new Date().toISOString(),
  };
  if (trialEndsAt !== undefined) row.trial_ends_at = trialEndsAt;

  // Upsert into profiles(user_id, is_premium, trial_ends_at)
  async function upsert(payload: Record<string, unknown>) {
    return fetch(`${url}/rest/v1/profiles?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: serviceKey!,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([payload]),
    });
  }

  let res = await upsert(row);
  if (!res.ok && "trial_ends_at" in row) {
    // Column may not exist yet — retry without it so premium still lands.
    const text = await res.text();
    console.error("[stripe-webhook] upsert with trial_ends_at failed", res.status, text);
    const { trial_ends_at: _omit, ...rest } = row;
    res = await upsert(rest);
  }
  if (!res.ok) {
    const text = await res.text();
    console.error("[stripe-webhook] failed to upsert profile", res.status, text);
    throw new Error("Failed to update profile");
  }
  console.log("[stripe-webhook] profile updated", { userId, isPremium, trialEndsAt });
}


export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
          return new Response("Not configured", { status: 500 });
        }
        const raw = await request.text();
        const sig = request.headers.get("stripe-signature");
        const verified = await verifyStripeSignature(raw, sig, secret);
        if (!verified.ok) {
          console.error("[stripe-webhook] invalid signature");
          return new Response("Invalid signature", { status: 400 });
        }

        const event = verified.event as {
          type: string;
          data: { object: Record<string, unknown> };
        };
        console.log("[stripe-webhook] event", event.type);

        try {
          const obj = event.data.object as Record<string, unknown>;
          const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
          const userId =
            meta.user_id ||
            (obj.client_reference_id as string | undefined) ||
            "";

          if (event.type === "checkout.session.completed") {
            if (!userId) {
              console.error("[stripe-webhook] no user_id in session metadata");
              return new Response("ok", { status: 200 });
            }
            await setPremium(userId, true);
          } else if (
            event.type === "customer.subscription.deleted" ||
            (event.type === "customer.subscription.updated" &&
              (obj.status === "canceled" ||
                obj.status === "unpaid" ||
                obj.status === "incomplete_expired"))
          ) {
            if (userId) await setPremium(userId, false);
          }
        } catch (err) {
          console.error("[stripe-webhook] handler error", err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
