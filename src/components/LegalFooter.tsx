/**
 * Legal links (Settings only): two merged documents.
 *  A) Privacy & Terms  — privacy policy + terms of service
 *  B) Impressum & Legal Notice — imprint + mandatory disclosures
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

type LegalKey = "privacyTerms" | "impressum";

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
      <section className={className}>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          {t("legal.aboutLegal")}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setOpen("privacyTerms")}
            className="w-full text-left text-sm text-foreground/70 hover:text-foreground transition-colors py-1.5"
          >
            {t("legal.privacyTerms")}
          </button>
          <button
            type="button"
            onClick={() => setOpen("impressum")}
            className="w-full text-left text-sm text-foreground/70 hover:text-foreground transition-colors py-1.5"
          >
            {t("legal.impressumLegal")}
          </button>
        </div>
      </section>

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
              {which === "privacyTerms" ? t("legal.privacyTerms") : t("legal.impressumLegal")}
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
          {which === "privacyTerms" ? <PrivacyTermsBody /> : <ImpressumBody />}
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

function PrivacyTermsBody() {
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

      <div className="my-8 border-t border-border/60" />

      <H>{t("legal.termsScope")}</H>
      <p>{t("legal.termsScopeBody")}</p>

      <H>{t("legal.termsAccount")}</H>
      <p>{t("legal.termsAccountBody")}</p>

      <H>{t("legal.termsSubscriptions")}</H>
      <p>{t("legal.termsSubscriptionsBody")}</p>

      <H>{t("legal.termsContent")}</H>
      <p>{t("legal.termsContentBody")}</p>

      <H>{t("legal.termsLiability")}</H>
      <p>{t("legal.termsLiabilityBody")}</p>

      <H>{t("legal.termsChanges")}</H>
      <p>{t("legal.termsChangesBody")}</p>

      <H>{t("legal.asOf")}</H>
      <p className="text-foreground/60">[Datum der letzten Aktualisierung]</p>
    </div>
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

      <H>{t("legal.vatId")}</H>
      <p className="text-foreground/60">[USt-IdNr. / Umsatzsteuer-ID — falls vorhanden]</p>

      <H>{t("legal.disputeResolution")}</H>
      <p className="text-foreground/60">{t("legal.disputeResolutionBody")}</p>

      <H>{t("legal.disclaimer")}</H>
      <p className="text-foreground/60">{t("legal.disclaimerBody")}</p>

      <H>{t("legal.asOf")}</H>
      <p className="text-foreground/60">[Datum der letzten Aktualisierung]</p>
    </div>
  );
}
