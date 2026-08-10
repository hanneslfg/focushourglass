import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "Privacy Policy — Focus Hourglass";
const DESCRIPTION =
  "How Focus Hourglass collects, stores and protects your data: authentication, analytics, storage and your rights under the GDPR.";
const URL = "https://www.focushourglass.com/privacy";

export const Route = createFileRoute("/privacy")({
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
  component: Privacy,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/80">{children}</div>
    </section>
  );
}

function Privacy() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          ← Focus Hourglass
        </Link>

        <h1 className="font-display text-4xl tracking-tight mt-6">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-2">Datenschutzerklärung · Last updated: [Datum]</p>

        <Section title="Overview">
          <p>
            Focus Hourglass is a minimalist focus application. We process only the data required to
            provide the core service. No advertising, no data sales, no third-party marketing
            trackers.
          </p>
        </Section>

        <Section title="Controller">
          <p>
            [Full Name]
            <br />
            [Mailing Address]
            <br />
            E-Mail: [Contact E-Mail]
          </p>
        </Section>

        <Section title="Data Collection">
          <p>
            <span className="text-foreground">Account data:</span> email address and, for password
            login, a securely hashed password.
          </p>
          <p>
            <span className="text-foreground">Productivity data:</span> focus sessions, projects,
            goals, rhythms, streaks and statistics you create. Every record is bound to your user
            ID.
          </p>
          <p>
            <span className="text-foreground">Local data:</span> settings, cached sessions and your
            session token are stored in your browser's localStorage. Guest usage stays on your
            device until you sign in.
          </p>
        </Section>

        <Section title="Google OAuth Authentication">
          <p>
            If you sign in with Google, we receive only your basic profile information (name, email
            address and profile picture) from Google to create and identify your account. We never
            receive your Google password, and we do not access Gmail, Drive, Calendar or any other
            Google service data.
          </p>
          <p>
            You can revoke access at any time in your Google Account security settings. Google's own
            processing is governed by their privacy policy.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            The analytics you see inside the app (focus totals, streaks, charts) are computed from
            your own sessions and are visible only to you.
          </p>
          <p>
            For the product itself we use only privacy-friendly, aggregated usage and error
            diagnostics. We do not build advertising profiles and do not set tracking cookies.
          </p>
        </Section>

        <Section title="Storage & Processors">
          <p>
            Data is processed and stored with our managed cloud backend on EU-based infrastructure.
            Row Level Security enforces at the database level that each record is only readable or
            modifiable by its owner.
          </p>
        </Section>

        <Section title="Legal Basis">
          <p>
            Processing is based on Art. 6(1)(b) GDPR (performance of a contract) and Art. 6(1)(f)
            GDPR (legitimate interest in a functioning, secure service).
          </p>
        </Section>

        <Section title="User Rights">
          <p>
            You have the right to access, rectification, erasure, restriction of processing, data
            portability and objection at any time. Your productivity data can be viewed and deleted
            directly in the app. For full account deletion, an informal message to [Contact E-Mail]
            is sufficient.
          </p>
          <p>
            You also have the right to lodge a complaint with a data protection supervisory
            authority.
          </p>
        </Section>

        <footer className="mt-16 pt-6 border-t border-border/50 flex gap-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
          <Link to="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </footer>
      </div>
    </main>
  );
}
