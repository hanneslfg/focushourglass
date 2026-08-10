/**
 * Minimalist legal footer + Impressum/Datenschutz modals.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Link } from "@tanstack/react-router";

type LegalKey = "impressum" | "datenschutz";

export function LegalFooter({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState<LegalKey | null>(null);
  const { t } = useTranslation();

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
          {t("legal.impressum")}
        </button>
        <span aria-hidden className="opacity-40">·</span>
        <button
          type="button"
          onClick={() => setOpen("datenschutz")}
          className="hover:text-muted-foreground transition-colors"
        >
          {t("legal.datenschutz")}
        </button>
        <span aria-hidden className="opacity-40">·</span>
        <Link to="/privacy" className="hover:text-muted-foreground transition-colors">
          Privacy
        </Link>
        <span aria-hidden className="opacity-40">·</span>
        <Link to="/terms" className="hover:text-muted-foreground transition-colors">
          Terms
        </Link>
      </footer>

      {open && <LegalModal which={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LegalModal({ which, onClose }: { which: LegalKey; onClose: () => void }) {
  const { t } = useTranslation();
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
              {t("legal.legal")}
            </div>
            <h2 className="font-display text-2xl tracking-tight mt-0.5">
              {which === "impressum" ? t("legal.impressum") : t("legal.datenschutz")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center touch-manipulation"
            aria-label={t("common.close")}
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
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <H>{t("legal.imprintTitle")}</H>
      <p>
        [Full Name]
        <br />
        [Mailing Address — Straße Nr.]
        <br />
        [PLZ Ort]
        <br />
        [Land]
      </p>

      <H>{t("legal.contact")}</H>
      <p>E-Mail: [Contact E-Mail]</p>

      <H>{t("legal.responsible")}</H>
      <p>
        [Full Name]
        <br />
        [Mailing Address]
      </p>

      <H>{t("legal.disclaimer")}</H>
      <p className="text-foreground/60">{t("legal.disclaimerBody")}</p>
    </div>
  );
}

function DatenschutzBody() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <H>{t("legal.overview")}</H>
      <p>{t("legal.overviewBody")}</p>

      <H>{t("legal.controller")}</H>
      <p>
        [Full Name]
        <br />
        [Mailing Address]
        <br />
        E-Mail: [Contact E-Mail]
      </p>

      <H>{t("legal.processedData")}</H>
      <p>
        <span className="text-foreground">{t("legal.auth")}</span> {t("legal.authBody")}
      </p>
      <p>
        <span className="text-foreground">{t("legal.productivity")}</span>{" "}
        {t("legal.productivityBody")}
      </p>

      <H>{t("legal.storage")}</H>
      <p>{t("legal.storageBody")}</p>

      <H>{t("legal.legalBasis")}</H>
      <p>{t("legal.legalBasisBody")}</p>

      <H>{t("legal.yourRights")}</H>
      <p>{t("legal.yourRightsBody")}</p>

      <H>{t("legal.cookies")}</H>
      <p>{t("legal.cookiesBody")}</p>

      <H>{t("legal.complaint")}</H>
      <p className="text-foreground/60">{t("legal.complaintBody")}</p>

      <H>{t("legal.asOf")}</H>
      <p className="text-foreground/60">[Datum der letzten Aktualisierung]</p>
    </div>
  );
}
