/**
 * Minimalist legal footer + Impressum/Datenschutz modals.
 * Dark, low-contrast, matches the app's stoic aesthetic.
 * Text is placeholder-based so the operator can fill personal data.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type LegalKey = "impressum" | "datenschutz";

export function LegalFooter({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState<LegalKey | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <footer
        className={`w-full flex items-center justify-center gap-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40 ${className}`}
      >
        <button
          type="button"
          onClick={() => setOpen("impressum")}
          className="hover:text-muted-foreground transition-colors"
        >
          Impressum
        </button>
        <span aria-hidden className="opacity-40">·</span>
        <button
          type="button"
          onClick={() => setOpen("datenschutz")}
          className="hover:text-muted-foreground transition-colors"
        >
          Datenschutz
        </button>
      </footer>

      {open && <LegalModal which={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LegalModal({ which, onClose }: { which: LegalKey; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-lg border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Legal
            </div>
            <h2 className="font-display text-2xl tracking-tight mt-0.5">
              {which === "impressum" ? "Impressum" : "Datenschutz"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center touch-manipulation"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6 text-sm leading-relaxed text-foreground/80">
          {which === "impressum" ? <ImpressumBody /> : <DatenschutzBody />}
        </div>
      </div>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mt-6 first:mt-0 mb-2">
      {children}
    </h3>
  );
}

function ImpressumBody() {
  return (
    <div className="space-y-4">
      <H>Angaben gemäß § 5 TMG</H>
      <p>
        [Full Name]
        <br />
        [Mailing Address — Straße Nr.]
        <br />
        [PLZ Ort]
        <br />
        [Land]
      </p>

      <H>Kontakt</H>
      <p>
        E-Mail: [Contact E-Mail]
      </p>

      <H>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</H>
      <p>
        [Full Name]
        <br />
        [Mailing Address]
      </p>

      <H>Haftungsausschluss</H>
      <p className="text-foreground/60">
        Die Inhalte dieser Anwendung wurden mit größtmöglicher Sorgfalt
        erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der
        Inhalte kann jedoch keine Gewähr übernommen werden.
      </p>
    </div>
  );
}

function DatenschutzBody() {
  return (
    <div className="space-y-4">
      <H>Überblick</H>
      <p>
        Hourglass ist eine minimalistische Fokus-Anwendung. Wir verarbeiten
        ausschließlich die Daten, die zur Bereitstellung des Kerndienstes
        erforderlich sind — nichts darüber hinaus. Kein Tracking, keine
        Werbung, keine Weitergabe an Dritte zu Marketingzwecken.
      </p>

      <H>Verantwortlicher</H>
      <p>
        [Full Name]
        <br />
        [Mailing Address]
        <br />
        E-Mail: [Contact E-Mail]
      </p>

      <H>Verarbeitete Daten</H>
      <p>
        <span className="text-foreground">Authentifizierung:</span> E-Mail-Adresse
        und (bei Passwort-Login) ein gehashtes Passwort, verwaltet über Supabase Auth.
      </p>
      <p>
        <span className="text-foreground">Produktivitätsdaten:</span> Von Ihnen
        erzeugte Sitzungen, Projekte, Ziele und Statistiken. Diese Daten sind
        strikt an Ihre Benutzer-ID gebunden.
      </p>

      <H>Speicherort &amp; Auftragsverarbeiter</H>
      <p>
        Alle Daten werden ausschließlich bei{" "}
        <span className="text-foreground">Supabase</span> auf EU-basierter
        Infrastruktur verarbeitet und gespeichert. Row Level Security stellt
        auf Datenbankebene sicher, dass jeder Datensatz nur für den jeweiligen
        Eigentümer (<code className="text-foreground/70">auth.uid() = user_id</code>)
        lesbar oder veränderbar ist.
      </p>

      <H>Rechtsgrundlage</H>
      <p>
        Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO
        (Vertragserfüllung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
        Interesse an einem funktionierenden, sicheren Dienst).
      </p>

      <H>Ihre Rechte</H>
      <p>
        Sie haben jederzeit das Recht auf Auskunft, Berichtigung, Löschung,
        Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch.
        Ihre Produktivitätsdaten können Sie unmittelbar in der Analytics- und
        Profil-Ansicht einsehen und einzeln oder vollständig löschen. Für die
        vollständige Löschung Ihres Kontos genügt eine formlose Nachricht an
        [Contact E-Mail].
      </p>

      <H>Cookies &amp; lokale Speicherung</H>
      <p>
        Wir setzen keine Tracking-Cookies. Für den Betrieb notwendige Daten
        (Session-Token, lokal zwischengespeicherte Sitzungen, Einstellungen)
        werden im <code className="text-foreground/70">localStorage</code>{" "}
        Ihres Browsers abgelegt und verlassen Ihr Gerät nur für den Sync mit
        Supabase.
      </p>

      <H>Beschwerderecht</H>
      <p className="text-foreground/60">
        Sie haben das Recht, sich bei einer Datenschutzaufsichtsbehörde zu
        beschweren, wenn Sie der Ansicht sind, dass die Verarbeitung Ihrer
        Daten gegen die DSGVO verstößt.
      </p>

      <H>Stand</H>
      <p className="text-foreground/60">[Datum der letzten Aktualisierung]</p>
    </div>
  );
}
