import { createFileRoute } from "@tanstack/react-router";
// Reuse the exact same handler as the no-trailing-slash route so Stripe
// webhooks resolve whether the dashboard URL ends with a slash or not.
// This prevents 307 redirects from breaking webhook delivery.
import { stripeWebhookHandler } from "./stripe-webhook";

export const Route = createFileRoute("/api/public/stripe-webhook/$")({
  server: {
    handlers: {
      POST: stripeWebhookHandler,
    },
  },
});
