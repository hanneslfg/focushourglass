import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "Terms of Service — Focus Hourglass";
const DESCRIPTION =
  "The terms for using Focus Hourglass: account usage, subscriptions and free trials, content rights and liability.";
const URL = "https://www.focushourglass.com/terms";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Terms,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/80">{children}</div>
    </section>
  );
}

function Terms() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          ← Focus Hourglass
        </Link>

        <h1 className="font-display text-4xl tracking-tight mt-6">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-2">Nutzungsbedingungen · Last updated: [Datum]</p>

        <Section title="Scope">
          <p>
            These terms govern your use of Focus Hourglass (the "Service"), operated by [Full Name],
            [Mailing Address]. By creating an account or using the Service you agree to them.
          </p>
        </Section>

        <Section title="Account Usage">
          <p>
            You may use the Service as a guest or with an account. You are responsible for keeping
            your login credentials secure and for all activity under your account.
          </p>
          <p>
            One account per person. Do not misuse the Service: no automated scraping, no attempts to
            bypass access limits or payment gates, no abusive content in shared features such as
            focus rooms or buddy chat.
          </p>
          <p>
            We may suspend or terminate accounts that violate these terms. You can delete your
            account at any time.
          </p>
        </Section>

        <Section title="Subscriptions & Free Trials">
          <p>
            Focus Hourglass offers a free tier and a paid Premium plan. Free trials run for the
            stated period and convert into a paid subscription only if you choose to subscribe.
          </p>
          <p>
            Subscriptions renew automatically for the selected billing period until cancelled.
            Cancel any time before the end of the current period; access continues until that period
            ends. Payments are processed by our payment provider; we do not store card details.
          </p>
          <p>
            Statutory withdrawal rights for consumers in the EU remain unaffected. Prices include
            applicable VAT where required.
          </p>
        </Section>

        <Section title="Content Rights">
          <p>
            You retain all rights to the content you create (tasks, projects, goals, notes, session
            data). We only store and process it to provide the Service to you.
          </p>
          <p>
            The Service itself — software, design, branding and texts — remains the property of the
            operator and may not be copied, resold or reverse-engineered.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            The Service is provided "as is". We do not warrant uninterrupted availability or that it
            is free of errors, and it is not a substitute for medical, psychological or professional
            advice.
          </p>
          <p>
            Liability is limited to intent and gross negligence. For slight negligence we are liable
            only for breaches of essential contractual obligations, limited to typical, foreseeable
            damages. Liability for injury to life, body or health and under mandatory statutory law
            remains unaffected.
          </p>
        </Section>

        <Section title="Changes & Governing Law">
          <p>
            We may update these terms; material changes will be announced in the app. German law
            applies, insofar as mandatory consumer protection rules of your country of residence do
            not provide otherwise.
          </p>
        </Section>

        <footer className="mt-16 pt-6 border-t border-border/50 flex gap-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
          <Link to="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
        </footer>
      </div>
    </main>
  );
}
