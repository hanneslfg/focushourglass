import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Product ID → allowed plan mapping. Only these three IDs can be checked out.
 * You can override any of them via env vars if you rotate products later.
 */
const PRODUCTS = {
  monthly: process.env.STRIPE_PRODUCT_MONTHLY || "prod_Utxzd5M6UprKK7",
  yearly: process.env.STRIPE_PRODUCT_YEARLY || "prod_Uty0Tc2FH7MNvS",
  lifetime: process.env.STRIPE_PRODUCT_LIFETIME || "prod_Uty0eeyWTMPqOS",
} as const;

type Plan = keyof typeof PRODUCTS;

const PLAN_MODE: Record<Plan, "subscription" | "payment"> = {
  monthly: "subscription",
  yearly: "subscription",
  lifetime: "payment",
};

async function stripeFetch(
  path: string,
  init: { method?: string; body?: URLSearchParams } = {},
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[stripe] STRIPE_SECRET_KEY is not set");
    throw new Error("Stripe is not configured");
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: init.body,
  });
  const json = (await res.json()) as { error?: { message?: string } } & Record<string, unknown>;
  if (!res.ok) {
    console.error("[stripe] API error", res.status, json?.error);
    throw new Error(json?.error?.message || `Stripe API error ${res.status}`);
  }
  return json;
}

async function resolveActivePriceId(productId: string): Promise<string> {
  const params = new URLSearchParams({
    product: productId,
    active: "true",
    limit: "1",
  });
  const list = (await stripeFetch(`/prices?${params.toString()}`)) as {
    data?: Array<{ id: string }>;
  };
  const priceId = list.data?.[0]?.id;
  if (!priceId) {
    throw new Error(`No active price found for product ${productId}`);
  }
  return priceId;
}

async function verifySupabaseUser(accessToken: string): Promise<{
  id: string;
  email: string | null;
}> {
  const url = process.env.HG_SUPABASE_URL;
  const anon = process.env.HG_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("[stripe] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing on server");
    throw new Error("Server auth not configured");
  }
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    console.error("[stripe] failed to verify user", res.status);
    throw new Error("Not authenticated");
  }
  const user = (await res.json()) as { id: string; email?: string | null };
  return { id: user.id, email: user.email ?? null };
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      plan: z.enum(["monthly", "yearly", "lifetime"]),
      accessToken: z.string().min(10),
      origin: z.string().url(),
    }),
  )
  .handler(async ({ data }) => {
    console.log("[stripe] createCheckoutSession start", { plan: data.plan });

    const user = await verifySupabaseUser(data.accessToken);
    const productId = PRODUCTS[data.plan as Plan];
    const priceId = await resolveActivePriceId(productId);
    const mode = PLAN_MODE[data.plan as Plan];

    const body = new URLSearchParams();
    body.set("mode", mode);
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    body.set("success_url", `${data.origin}/?checkout=success`);
    body.set("cancel_url", `${data.origin}/?checkout=cancel`);
    body.set("client_reference_id", user.id);
    body.set("metadata[user_id]", user.id);
    body.set("metadata[plan]", data.plan);
    if (mode === "subscription") {
      body.set("subscription_data[metadata][user_id]", user.id);
      body.set("subscription_data[metadata][plan]", data.plan);
    }
    if (user.email) body.set("customer_email", user.email);
    body.set("allow_promotion_codes", "true");

    const session = (await stripeFetch("/checkout/sessions", {
      method: "POST",
      body,
    })) as { id: string; url: string };

    console.log("[stripe] session created", session.id);
    return { url: session.url };
  });

/**
 * Look up whether the user currently has an active Stripe subscription tied
 * to their Supabase user_id (stored in subscription metadata at checkout).
 */
export const findActiveSubscription = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accessToken: z.string().min(10) }))
  .handler(async ({ data }) => {
    const user = await verifySupabaseUser(data.accessToken);
    const query = encodeURIComponent(
      `metadata['user_id']:'${user.id}' AND status:'active'`,
    );
    const res = (await stripeFetch(`/subscriptions/search?query=${query}&limit=1`)) as {
      data?: Array<{
        id: string;
        status: string;
        cancel_at_period_end?: boolean;
        current_period_end?: number;
        created?: number;
        start_date?: number;
      }>;
    };
    const sub = res.data?.[0];
    if (!sub) return { subscription: null as null };
    return {
      subscription: {
        id: sub.id,
        status: sub.status,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        current_period_end: sub.current_period_end ?? null,
        created: sub.created ?? sub.start_date ?? null,
      },
    };
  });

/**
 * Cancel the user's active Stripe subscription at period end so they keep
 * access until the paid term expires. Idempotent.
 */
export const cancelUserSubscription = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accessToken: z.string().min(10) }))
  .handler(async ({ data }) => {
    const user = await verifySupabaseUser(data.accessToken);
    const query = encodeURIComponent(
      `metadata['user_id']:'${user.id}' AND status:'active'`,
    );
    const search = (await stripeFetch(`/subscriptions/search?query=${query}&limit=1`)) as {
      data?: Array<{ id: string }>;
    };
    const sub = search.data?.[0];
    if (!sub) {
      return { ok: false, error: "No active subscription found for this account." };
    }
    const body = new URLSearchParams();
    body.set("cancel_at_period_end", "true");
    await stripeFetch(`/subscriptions/${sub.id}`, { method: "POST", body });
    console.log("[stripe] scheduled cancellation for", sub.id);
    return { ok: true, subscriptionId: sub.id };
  });
