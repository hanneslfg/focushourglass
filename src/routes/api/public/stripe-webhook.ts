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
  extra?: { stripeCustomerId?: string | null; subscriptionStatus?: string | null },
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
  if (extra?.stripeCustomerId) row.stripe_customer_id = extra.stripeCustomerId;
  if (extra?.subscriptionStatus !== undefined && extra.subscriptionStatus !== null) {
    row.subscription_status = extra.subscriptionStatus;
  }

  // Upsert into profiles(user_id, is_premium, trial_ends_at, ...)
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
  if (!res.ok) {
    // Optional columns may not exist yet — retry with the minimal payload so
    // premium still lands.
    const text = await res.text();
    console.error("[stripe-webhook] upsert with optional columns failed", res.status, text);
    const {
      trial_ends_at: _t,
      stripe_customer_id: _c,
      subscription_status: _s,
      ...rest
    } = row;
    res = await upsert(rest);
  }
  if (!res.ok) {
    const text = await res.text();
    console.error("[stripe-webhook] failed to upsert profile", res.status, text);
    throw new Error("Failed to update profile");
  }
  console.log("[stripe-webhook] profile updated", {
    userId,
    isPremium,
    trialEndsAt,
    status: extra?.subscriptionStatus,
  });
}


/** Look up a Supabase user id from a Stripe customer (metadata or email). */
async function userIdFromCustomer(customerId: string): Promise<string> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "";
  try {
    const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return "";
    const cust = (await res.json()) as {
      metadata?: Record<string, string>;
      email?: string | null;
    };
    const metaId = cust.metadata?.user_id;
    if (metaId) return metaId;
    const email = cust.email;
    if (!email) return "";
    const url = process.env.HG_SUPABASE_URL;
    const serviceKey = process.env.HG_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return "";
    const p = await fetch(
      `${url}/rest/v1/profiles?select=user_id&email=eq.${encodeURIComponent(email)}&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!p.ok) return "";
    const rows = (await p.json()) as Array<{ user_id?: string }>;
    return rows?.[0]?.user_id ?? "";
  } catch (err) {
    console.error("[stripe-webhook] customer lookup failed", err);
    return "";
  }
}

// Handle BOTH /stripe-webhook and /stripe-webhook/ (see sibling $.ts splat route).
export const stripeWebhookHandler = async ({ request }: { request: Request }) => {
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
    const customerId =
      typeof obj.customer === "string"
        ? obj.customer
        : ((obj.customer as { id?: string } | undefined)?.id ?? "");
    let userId =
      meta.user_id ||
      (obj.client_reference_id as string | undefined) ||
      "";
    if (!userId && customerId) {
      userId = await userIdFromCustomer(customerId);
      if (userId) console.log("[stripe-webhook] resolved user via customer", customerId);
    }

    const status = typeof obj.status === "string" ? (obj.status as string) : null;
    const trialEndUnix =
      typeof obj.trial_end === "number" ? (obj.trial_end as number) : null;
    const trialDays = Number(meta.trial_days);

    if (event.type === "checkout.session.completed") {
      if (!userId) {
        console.error("[stripe-webhook] could not resolve user for session");
        return new Response("ok", { status: 200 });
      }
      // Subscriptions with a free trial: persist when the trial ends so
      // the app can keep premium alive (and show "X days left").
      let trialEndsAt: string | null = null;
      if (obj.mode === "subscription") {
        if (trialEndUnix) {
          // Stripe's timestamp is authoritative.
          trialEndsAt =
            trialEndUnix * 1000 > Date.now()
              ? new Date(trialEndUnix * 1000).toISOString()
              : null;
        } else if (Number.isFinite(trialDays) && trialDays > 0) {
          trialEndsAt = new Date(Date.now() + trialDays * 86400_000).toISOString();
        }
      }
      await setPremium(userId, true, trialEndsAt, {
        stripeCustomerId: customerId || null,
        subscriptionStatus: trialEndsAt ? "trialing" : (status ?? "active"),
      });
    } else if (
      event.type === "customer.subscription.deleted" ||
      (event.type === "customer.subscription.updated" &&
        (obj.status === "canceled" ||
          obj.status === "unpaid" ||
          obj.status === "incomplete_expired"))
    ) {
      if (userId)
        await setPremium(userId, false, null, {
          stripeCustomerId: customerId || null,
          subscriptionStatus: status ?? "canceled",
        });
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      // Active or trialing subscription → premium, with authoritative
      // trial_end straight from Stripe.
      if (!userId) {
        console.error("[stripe-webhook] could not resolve user for subscription event");
      } else if (status === "active" || status === "trialing") {
        // Only touch trial_ends_at when we have real information:
        //  - trialing + future trial_end  -> authoritative value from Stripe
        //  - active (trial finished/none) -> clear it
        //  - anything else                -> leave the existing value alone
        const trialEndsAt =
          trialEndUnix && trialEndUnix * 1000 > Date.now()
            ? new Date(trialEndUnix * 1000).toISOString()
            : status === "active"
              ? null
              : undefined;
        await setPremium(userId, true, trialEndsAt, {
          stripeCustomerId: customerId || null,
          subscriptionStatus: status,
        });
      }
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
};

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: stripeWebhookHandler,
    },
  },
});
