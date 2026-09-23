import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { safeStorage } from "@/lib/safeStorage";
import { supabase } from "@/lib/supabase";

const TITLE = "Focus Hourglass — Your time is running out. Stop pretending it isn't.";
const DESCRIPTION =
  "Three 90-minute blocks a day. Nothing more. A live countdown of your remaining time and a hard daily cap, so the one thing that matters finally gets finished.";
const URL = "https://www.focushourglass.com/";
const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c2e3f20e-03f4-4783-b42d-6bb55b5a1592/id-preview-f372b578--c58e05b9-28c8-4b4a-9943-bced0d439556.lovable.app-1780490616026.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "canonical", href: URL },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;1,300&family=Inter:wght@300;400;500&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Focus Hourglass",
          url: URL,
          applicationCategory: "ProductivityApplication",
          operatingSystem: "Web",
          description: DESCRIPTION,
        }),
      },
    ],
  }),
  component: Landing,
});

const CSS = `
.fhl, .fhl *::before, .fhl *::after { box-sizing: border-box; }
.fhl {
  --gold: #DFBB63;
  --gold-soft: #C9A961;
  --gold-deep: #8A7332;
  --ink: #0B0B0B;
  --sand: #F5F1E4;
  --muted: #8A8A8A;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14vh 24px;
  background: var(--ink);
  font-family: Merriweather, Georgia, serif;
  color: var(--sand);
  text-align: center;
  -webkit-font-smoothing: antialiased;
}
.fhl main { width: 100%; max-width: 36rem; }
/* Hidden (but still in the DOM for crawlers) until we know the visitor is
   new. Returning / signed-in users are redirected before anything shows. */
.fhl.fhl-pending main { visibility: hidden; }
.fhl.fhl-pending, .fhl.fhl-pending * { animation-play-state: paused; }
.fhl * { margin: 0; padding: 0; }

.fhl .eyebrow {
  font-family: Inter, system-ui, sans-serif;
  font-weight: 400;
  font-size: 0.75rem;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--gold-soft);
  margin: 0 0 0.9rem;
}

.fhl .memento {
  font-size: 0.875rem;
  font-style: italic;
  font-weight: 300;
  line-height: 1.9;
  color: var(--gold-soft);
  margin: 0 0 3.25rem;
}

.fhl .rule {
  width: 0;
  height: 1px;
  background: var(--gold);
  opacity: 0.4;
  margin: 0 auto 3.25rem;
  animation: fhlDraw 1400ms cubic-bezier(.22,.61,.36,1) 500ms forwards;
}

@keyframes fhlDraw { to { width: 4.5rem; } }

.fhl p.line {
  font-size: 1.0625rem;
  font-weight: 300;
  line-height: 2.05;
  margin: 0 0 1.6rem;
  opacity: 0;
  transform: translateY(8px);
  animation: fhlRise 900ms cubic-bezier(.22,.61,.36,1) forwards;
}

@keyframes fhlRise { to { opacity: 1; transform: none; } }

.fhl p.line:nth-of-type(1) { animation-delay: 240ms; }
.fhl p.line:nth-of-type(2) { animation-delay: 380ms; }
.fhl p.line:nth-of-type(3) { animation-delay: 500ms; }
.fhl p.line:nth-of-type(4) { animation-delay: 620ms; }
.fhl p.line:nth-of-type(5) { animation-delay: 740ms; }
.fhl p.line:nth-of-type(6) { animation-delay: 860ms; }
.fhl p.line:nth-of-type(7) { animation-delay: 980ms; }

.fhl p.closer {
  font-size: 1.25rem;
  font-weight: 400;
  line-height: 1.75;
  color: #FFFFFF;
  margin: 2.75rem 0 3.25rem;
  opacity: 0;
  animation: fhlRise 1100ms cubic-bezier(.22,.61,.36,1) 1180ms forwards;
}

.fhl .cta-wrap { opacity: 0; animation: fhlRise 900ms cubic-bezier(.22,.61,.36,1) 1500ms forwards; }

.fhl a.cta {
  position: relative;
  display: inline-block;
  font-family: Inter, system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--gold);
  text-decoration: none;
  padding: 1.05rem 2.6rem;
  border-radius: 999px;
  border: 1px solid var(--gold);
  overflow: hidden;
  transition: transform 220ms cubic-bezier(.22,.61,.36,1), box-shadow 320ms ease;
}

.fhl a.cta::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at var(--mx, 50%) 50%, rgba(255,255,255,.4), transparent 62%);
  opacity: 0;
  transition: opacity 300ms ease;
}

.fhl a.cta:hover, .fhl a.cta:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 0 0 1px var(--gold), 0 10px 40px -12px rgba(223,187,99,.7);
}

.fhl a.cta:hover::after { opacity: 1; }
.fhl a.cta:active { transform: translateY(0) scale(.985); }
.fhl a.cta:focus-visible { outline: 2px solid var(--sand); outline-offset: 4px; }

.fhl .hint {
  font-family: Inter, system-ui, sans-serif;
  font-size: 0.6875rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 1.5rem 0 0;
}

@media (max-width: 560px) {
  .fhl { padding: 9vh 22px; }
  .fhl p.line { font-size: 1rem; line-height: 1.95; }
  .fhl p.closer { font-size: 1.125rem; }
  .fhl .memento, .fhl .rule { margin-bottom: 2.5rem; }
}

@media (prefers-reduced-motion: reduce) {
  .fhl .rule { animation: none; width: 4.5rem; }
  .fhl p.line, .fhl p.closer, .fhl .cta-wrap { animation: none; opacity: 1; transform: none; }
  .fhl a.cta { transition: box-shadow 200ms ease; }
  .fhl a.cta:hover { transform: none; }
}
`;

const ONBOARDING_KEY = "hourglass_onboarding_completed";

function Landing() {
  const navigate = useNavigate();
  const ctaRef = useRef<HTMLAnchorElement | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  // Returning users skip straight into the app (onboarding stays untouched).
  useEffect(() => {
    if (safeStorage.getItem(ONBOARDING_KEY)) void navigate({ to: "/app" });
  }, [navigate]);

  // Ambient hover/click tones + CTA spotlight tracking (1:1 from source design).
  useEffect(() => {
    const audio = () => {
      if (!audioCtx.current) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        audioCtx.current = new AC();
      }
      if (audioCtx.current.state === "suspended") void audioCtx.current.resume();
      return audioCtx.current;
    };

    const tone = (freq: number, dur: number, peak: number) => {
      const a = audio();
      if (!a) return;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, a.currentTime);
      g.gain.setValueAtTime(0, a.currentTime);
      g.gain.linearRampToValueAtTime(peak, a.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur + 0.02);
    };

    const unlock = () => audio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);

    const cta = ctaRef.current;
    const onEnter = () => tone(660, 0.12, 0.035);
    const onDown = () => tone(392, 0.3, 0.07);
    const onFocus = () => tone(660, 0.12, 0.03);
    const onMove = (e: MouseEvent) => {
      if (!cta) return;
      const r = cta.getBoundingClientRect();
      cta.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    };
    cta?.addEventListener("mouseenter", onEnter);
    cta?.addEventListener("mousedown", onDown);
    cta?.addEventListener("focus", onFocus);
    cta?.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      cta?.removeEventListener("mouseenter", onEnter);
      cta?.removeEventListener("mousedown", onDown);
      cta?.removeEventListener("focus", onFocus);
      cta?.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div className="fhl">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <main>
        <p className="eyebrow">memento mori</p>

        <p className="memento">
          your time is running out fast; you only have this one life.
          <br />
          make it big.
        </p>

        <div className="rule" />

        <p className="line">aren&apos;t you tired of only ever talking about what great things you will achieve?</p>
        <p className="line">you wake up, drink a coffee, and you are motivated to do your work.</p>
        <p className="line">you want to get good grades, build the start-up, and change the world and your world.</p>
        <p className="line">you do not want you parents to be disappointed when talking about you, but proud.</p>
        <p className="line">why don&apos;t you take the one asset seriously that really makes a difference? your focus.</p>
        <p className="line">you already spend a lot time, you already think about your work all day….</p>
        <p className="line">but when looking back, why is so embarrassingly little you actually have achieved?</p>

        <p className="closer">why dont you get shit done?</p>

        <div className="cta-wrap">
          <a
            ref={ctaRef}
            className="cta"
            href="/app"
            onClick={(e) => {
              e.preventDefault();
              void navigate({ to: "/app" });
            }}
          >
            unlock 100x focus
          </a>
          <p className="hint">no card required</p>
        </div>
      </main>
    </div>
  );
}
