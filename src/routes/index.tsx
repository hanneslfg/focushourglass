import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { safeStorage } from "@/lib/safeStorage";

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
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
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
.fhl{
  --bg:#0a0908; --bg-2:#100e0b; --surface:#16130e; --surface-2:#1c1912;
  --border:rgba(242,237,228,0.09); --border-strong:rgba(242,237,228,0.16);
  --text:#f3ede1; --text-dim:#a89f8c; --text-mute:#6d6754;
  --gold-1:#f2cd82; --gold-2:#e2b05c; --gold-3:#c8933f; --gold-4:#8a5a28;
  --shadow-gold:0 0 40px rgba(226,176,92,0.18);
  --ease:cubic-bezier(.16,.8,.24,1);
  background:var(--bg); color:var(--text);
  font-family:'Inter', sans-serif;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
  scroll-behavior:smooth;
}
.fhl *{ box-sizing:border-box; margin:0; padding:0; }
.fhl ::selection{ background:var(--gold-2); color:#0a0908; }
.fhl a{ color:inherit; text-decoration:none; }
.fhl img,.fhl svg{ display:block; }
.fhl .display{ font-family:'Fraunces', serif; }
.fhl .mono{ font-family:'IBM Plex Mono', monospace; }
.fhl :focus-visible{ outline:2px solid var(--gold-2); outline-offset:3px; border-radius:2px; }
.fhl .wrap{ max-width:1160px; margin:0 auto; padding:0 clamp(20px,5vw,56px); }
.fhl .grain{
  position:fixed; inset:0; pointer-events:none; z-index:2;
  opacity:.035; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.fhl .nav{
  position:fixed; top:0; left:0; right:0; z-index:50; padding:20px 0;
  background:transparent; border-bottom:1px solid transparent;
  transition: background .4s var(--ease), border-color .4s var(--ease), padding .3s var(--ease);
}
.fhl .nav.solid{ background:rgba(10,9,8,0.86); backdrop-filter:blur(10px); border-bottom-color:var(--border); padding:14px 0; }
.fhl .nav-inner{ display:flex; align-items:center; justify-content:space-between; }
.fhl .brand{ display:flex; align-items:center; gap:10px; font-size:15px; letter-spacing:.02em; }
.fhl .brand svg{ width:20px; height:20px; }
.fhl .brand-name{ font-family:'Fraunces', serif; font-weight:500; font-size:16px; }
.fhl .nav-links{ display:flex; align-items:center; gap:clamp(16px,3vw,32px); }
.fhl .nav-links a.ghost{ font-size:13px; color:var(--text-dim); transition:color .2s; }
.fhl .nav-links a.ghost:hover{ color:var(--text); }
.fhl .btn{
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  font-family:'Inter',sans-serif; font-weight:600; font-size:13px; letter-spacing:.02em;
  padding:11px 20px; border-radius:999px; cursor:pointer; border:1px solid transparent;
  transition: transform .18s var(--ease), box-shadow .25s var(--ease), background .25s;
}
.fhl .btn-gold{ background:linear-gradient(180deg, var(--gold-1), var(--gold-3)); color:#100c04; }
.fhl .btn-gold:hover{ transform:translateY(-1px); box-shadow:var(--shadow-gold); }
.fhl .btn-ghost{ border-color:var(--border-strong); color:var(--text); background:rgba(255,255,255,0.02); }
.fhl .btn-ghost:hover{ border-color:var(--gold-2); color:var(--gold-1); }
.fhl .hero{
  position:relative; min-height:100svh; display:flex; flex-direction:column;
  align-items:center; justify-content:center; text-align:center; padding:140px 0 80px; overflow:hidden;
}
.fhl .hero-glow{
  position:absolute; top:8%; left:50%; transform:translateX(-50%);
  width:min(900px,130vw); height:900px;
  background:radial-gradient(circle, rgba(226,176,92,0.14) 0%, rgba(226,176,92,0.04) 40%, transparent 70%);
  pointer-events:none; z-index:0;
}
.fhl .countdown-label{
  position:relative; z-index:1; font-family:'IBM Plex Mono', monospace; font-size:11px;
  letter-spacing:.22em; text-transform:uppercase; color:var(--text-mute); margin-bottom:18px;
  opacity:0; animation:fhlRise .9s var(--ease) .1s forwards;
}
.fhl .countdown{
  position:relative; z-index:1; font-family:'IBM Plex Mono', monospace; font-variant-numeric:tabular-nums;
  font-size:clamp(22px,4.4vw,40px); color:var(--gold-1); letter-spacing:.01em;
  text-shadow:0 0 30px rgba(226,176,92,0.35); margin-bottom:40px;
  opacity:0; animation:fhlRise .9s var(--ease) .25s forwards;
}
.fhl .countdown-note{ display:block; margin-top:10px; font-family:'Inter',sans-serif; font-size:11.5px; letter-spacing:0; color:var(--text-mute); text-transform:none; }
.fhl h1.hero-title{
  position:relative; z-index:1; font-family:'Fraunces', serif; font-weight:500;
  font-size:clamp(38px,6.6vw,84px); line-height:1.03; letter-spacing:-0.01em; max-width:15ch;
  opacity:0; animation:fhlRise 1s var(--ease) .4s forwards;
}
.fhl h1.hero-title em{
  font-style:italic; font-weight:400;
  background:linear-gradient(180deg, var(--gold-1), var(--gold-3));
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.fhl .hero-sub{
  position:relative; z-index:1; max-width:54ch; margin:26px auto 0;
  font-size:clamp(15.5px,1.7vw,18.5px); line-height:1.65; color:var(--text-dim);
  opacity:0; animation:fhlRise 1s var(--ease) .55s forwards;
}
.fhl .hero-cta{
  position:relative; z-index:1; margin-top:40px; display:flex; align-items:center; gap:16px;
  flex-wrap:wrap; justify-content:center; opacity:0; animation:fhlRise 1s var(--ease) .7s forwards;
}
.fhl .hero-cta .btn{ padding:15px 30px; font-size:14.5px; }
.fhl .hero-fine{ font-size:12px; color:var(--text-mute); font-family:'IBM Plex Mono', monospace; }
@keyframes fhlRise{ from{ opacity:0; transform:translateY(16px); } to{ opacity:1; transform:translateY(0); } }
.fhl .scroll-cue{
  position:absolute; bottom:34px; left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:8px;
  color:var(--text-mute); font-size:10px; letter-spacing:.2em; text-transform:uppercase;
  animation:fhlBob 2.6s ease-in-out infinite; opacity:.7;
}
@keyframes fhlBob{ 0%,100%{ transform:translate(-50%,0);} 50%{ transform:translate(-50%,8px);} }
.fhl section{ position:relative; padding:clamp(70px,12vw,140px) 0; }
.fhl .eyebrow{
  font-family:'IBM Plex Mono', monospace; font-size:11px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--gold-2); margin-bottom:18px; display:flex; align-items:center; gap:10px;
}
.fhl .eyebrow::before{ content:''; width:22px; height:1px; background:var(--gold-3); }
.fhl .reveal{ opacity:0; transform:translateY(28px); transition: opacity .9s var(--ease), transform .9s var(--ease); }
.fhl .reveal.in{ opacity:1; transform:none; }
.fhl .pain{ border-top:1px solid var(--border); border-bottom:1px solid var(--border); background:linear-gradient(180deg, var(--bg-2), var(--bg)); }
.fhl .pain-inner{ max-width:780px; margin:0 auto; text-align:center; }
.fhl .pain h2{ font-family:'Fraunces', serif; font-weight:400; font-style:italic; font-size:clamp(24px,3.4vw,34px); line-height:1.5; color:var(--text-dim); }
.fhl .pain h2 strong{ font-style:normal; font-weight:500; color:var(--text); }
.fhl .pain-beats{ margin-top:56px; display:grid; grid-template-columns:repeat(3,1fr); gap:28px; text-align:left; }
.fhl .pain-beat{ padding:26px 22px; border:1px solid var(--border); border-radius:14px; background:rgba(255,255,255,0.015); }
.fhl .pain-beat .num{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--gold-3); letter-spacing:.15em; margin-bottom:14px; display:block; }
.fhl .pain-beat p{ font-size:14.5px; line-height:1.65; color:var(--text-dim); }
.fhl .mori{ padding-top:clamp(90px,14vw,160px); }
.fhl .mori-grid{ display:grid; grid-template-columns:0.85fr 1.15fr; gap:clamp(40px,6vw,90px); align-items:center; }
.fhl .hourglass-wrap{ display:flex; align-items:center; justify-content:center; position:relative; }
.fhl .hourglass-wrap svg{ width:min(260px,70vw); height:auto; filter:drop-shadow(0 20px 60px rgba(226,176,92,0.12)); }
.fhl .mori h2{ font-family:'Fraunces', serif; font-weight:500; font-size:clamp(30px,4vw,46px); line-height:1.12; letter-spacing:-.01em; margin-bottom:26px; }
.fhl .mori h2 em{ font-style:italic; font-weight:400; color:var(--gold-2); }
.fhl .mori p{ font-size:15.5px; line-height:1.8; color:var(--text-dim); max-width:52ch; }
.fhl .mori p + p{ margin-top:16px; }
.fhl .mori-callout{
  margin-top:28px; padding:16px 20px; border-left:2px solid var(--gold-2);
  font-family:'Fraunces', serif; font-style:italic; font-size:16px; color:var(--text); background:rgba(226,176,92,0.04);
}
.fhl .system{ background:var(--surface); border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
.fhl .system-head{ max-width:640px; }
.fhl .system h2{ font-family:'Fraunces', serif; font-weight:500; font-size:clamp(28px,3.8vw,42px); line-height:1.15; letter-spacing:-.01em; margin-bottom:18px; }
.fhl .system h2 em{ font-style:italic; font-weight:400; color:var(--gold-2); }
.fhl .system p.lede{ font-size:15.5px; line-height:1.75; color:var(--text-dim); }
.fhl .blocks{ margin-top:64px; display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
.fhl .block{
  position:relative; border:1px solid var(--border); border-radius:16px; padding:28px 24px 24px;
  background:linear-gradient(180deg, rgba(226,176,92,0.035), transparent 60%); overflow:hidden;
}
.fhl .block::after{
  content:''; position:absolute; left:0; right:0; bottom:0; height:3px;
  background:linear-gradient(90deg, var(--gold-3), var(--gold-1));
  transform-origin:left; transform:scaleX(0); transition:transform 1.1s var(--ease);
}
.fhl .block.in::after{ transform:scaleX(1); }
.fhl .block .idx{ font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--gold-3); letter-spacing:.15em; }
.fhl .block .mins{ font-family:'Fraunces', serif; font-weight:500; font-size:44px; margin-top:12px; color:var(--text); }
.fhl .block .mins span{ font-size:16px; font-weight:400; color:var(--text-mute); margin-left:6px; }
.fhl .block .desc{ margin-top:14px; font-size:13.5px; line-height:1.6; color:var(--text-dim); }
.fhl .system-total{ margin-top:26px; display:flex; align-items:center; gap:14px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; color:var(--text-mute); }
.fhl .system-total .line{ flex:1; height:1px; background:var(--border-strong); }
.fhl .features h2{ font-family:'Fraunces', serif; font-weight:500; font-size:clamp(28px,3.6vw,40px); letter-spacing:-.01em; margin-bottom:14px; }
.fhl .features > .wrap > p.lede{ max-width:56ch; font-size:15px; color:var(--text-dim); line-height:1.7; margin-bottom:56px; }
.fhl .feat-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--border); border:1px solid var(--border); border-radius:16px; overflow:hidden; }
.fhl .feat{ background:var(--bg); padding:32px 26px; transition:background .3s; }
.fhl .feat:hover{ background:var(--surface-2); }
.fhl .feat .icon{ width:30px; height:30px; margin-bottom:20px; color:var(--gold-2); }
.fhl .feat h3{ font-family:'Fraunces', serif; font-weight:500; font-size:17px; margin-bottom:10px; }
.fhl .feat p{ font-size:13.5px; line-height:1.65; color:var(--text-dim); }
.fhl .cta-band{ text-align:center; background:radial-gradient(120% 140% at 50% 0%, rgba(226,176,92,0.10), transparent 60%), var(--bg-2); border-top:1px solid var(--border); }
.fhl .cta-band h2{ font-family:'Fraunces', serif; font-weight:500; font-style:italic; font-size:clamp(28px,5vw,54px); line-height:1.1; max-width:16ch; margin:0 auto 30px; }
.fhl .cta-band .btn{ padding:16px 32px; font-size:15px; }
.fhl .cta-band .hero-fine{ margin-top:18px; }
.fhl footer{ border-top:1px solid var(--border); padding:40px 0; }
.fhl .foot-inner{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
.fhl .foot-links{ display:flex; gap:24px; }
.fhl .foot-links a{ font-size:12.5px; color:var(--text-mute); transition:color .2s; }
.fhl .foot-links a:hover{ color:var(--text-dim); }
.fhl footer .copy{ font-size:12px; color:var(--text-mute); }
@media (max-width:860px){
  .fhl .mori-grid{ grid-template-columns:1fr; text-align:center; }
  .fhl .mori p{ margin-left:auto; margin-right:auto; }
  .fhl .hourglass-wrap{ order:-1; }
  .fhl .pain-beats{ grid-template-columns:1fr; }
  .fhl .blocks{ grid-template-columns:1fr; }
  .fhl .feat-grid{ grid-template-columns:1fr; }
  .fhl .nav-links a.ghost{ display:none; }
}
@media (prefers-reduced-motion: reduce){
  .fhl *{ animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
}
`;

const ONBOARDING_KEY = "hourglass_onboarding_completed";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function Landing() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [solid, setSolid] = useState(false);
  const [countdown, setCountdown] = useState("—");
  const [year, setYear] = useState<number | null>(null);

  // Returning users skip straight into the app (onboarding stays untouched).
  useEffect(() => {
    if (safeStorage.getItem(ONBOARDING_KEY)) void navigate({ to: "/app" });
  }, [navigate]);

  useEffect(() => {
    setYear(new Date().getFullYear());
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.16 },
    );
    rootRef.current
      ?.querySelectorAll(".reveal, .block")
      .forEach((el) => io.observe(el));

    // Live countdown — illustrative: 30 years old, life expectancy 80.
    const endTime = Date.now() + 50 * 365.25 * 24 * 60 * 60 * 1000;
    const tick = () => {
      const total = Math.floor(Math.max(0, endTime - Date.now()) / 1000);
      const days = Math.floor(total / 86400);
      setCountdown(
        `${days.toLocaleString("en-US")}d  ${pad(Math.floor((total % 86400) / 3600))}:${pad(
          Math.floor((total % 3600) / 60),
        )}:${pad(total % 60)}`,
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="fhl" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="grain" />

      <nav className={`nav${solid ? " solid" : ""}`}>
        <div className="wrap nav-inner">
          <div className="brand">
            <svg viewBox="0 0 48 72" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Focus Hourglass logo">
              <title>Focus Hourglass logo</title>
              <path
                d="M10 6H38M10 66H38M12 6C12 22 24 30 24 30C24 30 12 38 12 66M36 6C36 22 24 30 24 30C24 30 36 38 36 66"
                stroke="url(#navGrad)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="navGrad" x1="24" y1="6" x2="24" y2="66">
                  <stop stopColor="#f2cd82" />
                  <stop offset="1" stopColor="#c8933f" />
                </linearGradient>
              </defs>
            </svg>
            <span className="brand-name">Focus Hourglass</span>
          </div>
          <div className="nav-links">
            <a href="#mori" className="ghost">Philosophy</a>
            <a href="#system" className="ghost">The System</a>
            <a href="#features" className="ghost">Features</a>
            <Link to="/app" className="btn btn-gold">Start free</Link>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-glow" />
        <div className="wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="countdown-label">Remaining, if you&apos;re 30 and live to 80</div>
          <div className="countdown mono">{countdown}</div>
          <h1 className="hero-title">
            Your time is running out.
            <br />
            Stop pretending it <em>isn&apos;t</em>.
          </h1>
          <p className="hero-sub">
            Focus Hourglass gives you three 90‑minute blocks a day — nothing more — so the one thing
            that actually matters finally gets finished, instead of buried under a hundred
            half‑started things.
          </p>
          <div className="hero-cta">
            <Link to="/app" className="btn btn-gold">Start your 3 blocks today</Link>
            <a href="#mori" className="btn btn-ghost">See how it works</a>
          </div>
          <div className="hero-fine" style={{ marginTop: 22 }}>
            Free to start · no card required
          </div>
        </div>
        <div className="scroll-cue">Scroll</div>
      </header>

      <section className="pain">
        <div className="wrap pain-inner reveal">
          <div className="eyebrow" style={{ justifyContent: "center" }}>The pattern</div>
          <h2>
            You wake up with a plan. Somewhere between coffee and your first open tab,{" "}
            <strong>it dissolves.</strong>
          </h2>
          <div className="pain-beats">
            <div className="pain-beat">
              <span className="num">01 — POSTPONE</span>
              <p>
                &ldquo;Five minutes on your phone&rdquo; becomes forty-five. Starting felt heavier
                than scrolling, so you scrolled.
              </p>
            </div>
            <div className="pain-beat">
              <span className="num">02 — SCATTER</span>
              <p>
                When you finally start, ten minutes in you check your phone anyway — nine other
                half-finished things are calling.
              </p>
            </div>
            <div className="pain-beat">
              <span className="num">03 — REPEAT</span>
              <p>
                By evening you were busy all day. You could not tell anyone what you actually
                finished. Tomorrow, same plan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mori" id="mori">
        <div className="wrap mori-grid">
          <div className="hourglass-wrap reveal">
            <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3a3020" stopOpacity=".5" />
                  <stop offset="100%" stopColor="#3a3020" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="sandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f2cd82" />
                  <stop offset="100%" stopColor="#c8933f" />
                </linearGradient>
                <linearGradient id="glassStroke" x1="100" y1="20" x2="100" y2="280" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f2cd82" />
                  <stop offset="1" stopColor="#c8933f" />
                </linearGradient>
                <clipPath id="topChamber"><path d="M30 20 H170 L104 148 H96 Z" /></clipPath>
                <clipPath id="botChamber"><path d="M96 152 H104 L170 280 H30 Z" /></clipPath>
              </defs>

              <path
                d="M20 20H180M20 280H180M28 20C28 90 100 148 100 148C100 148 28 200 28 280M172 20C172 90 100 148 100 148C100 148 172 200 172 280"
                stroke="url(#glassStroke)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />

              <g clipPath="url(#topChamber)">
                <rect x="20" y="20" width="160" height="0" fill="url(#sandGrad)">
                  <animate attributeName="y" values="20;20;128" dur="6s" keyTimes="0;0.15;1" repeatCount="indefinite" />
                  <animate attributeName="height" values="0;108;0" dur="6s" keyTimes="0;0.15;1" repeatCount="indefinite" />
                </rect>
              </g>

              <g clipPath="url(#botChamber)">
                <rect x="20" y="270" width="160" height="0" fill="url(#sandGrad)">
                  <animate attributeName="y" values="278;278;172" dur="6s" keyTimes="0;0.15;1" repeatCount="indefinite" />
                  <animate attributeName="height" values="0;0;108" dur="6s" keyTimes="0;0.15;1" repeatCount="indefinite" />
                </rect>
              </g>

              <rect x="98.5" y="145" width="3" height="6" fill="#f2cd82" opacity=".9" />
            </svg>
          </div>
          <div className="reveal">
            <div className="eyebrow">Why this starts with death</div>
            <h2>
              Every other app motivates you with rewards. <em>This one tells you the truth.</em>
            </h2>
            <p>
              Streaks and badges work for about two weeks. Then the novelty fades and you&apos;re
              back where you started — except now you also feel guilty about breaking a streak.
            </p>
            <p>
              Memento mori — remember you will die — isn&apos;t a productivity hack. It&apos;s the
              truth every ambitious person quietly avoids: you have a finite, unknown, probably
              smaller-than-you-think number of days left. Focus Hourglass keeps that countdown
              visible while you work. Not to make you anxious. To make the alternative — another day
              spent &ldquo;busy&rdquo; instead of finished — feel like what it actually is.
            </p>
            <div className="mori-callout">
              When time is visibly finite, the hundred open things stop competing equally. One or two
              survive. The rest can wait.
            </div>
          </div>
        </div>
      </section>

      <section className="system" id="system">
        <div className="wrap">
          <div className="system-head reveal">
            <div className="eyebrow">The method</div>
            <h2>
              Not eight hours. <em>Four and a half.</em>
            </h2>
            <p className="lede">
              Deep, undistracted cognitive work has a real ceiling — most research on focused output
              converges on roughly three to five hours a day, regardless of how long you sit at a
              desk. Everything past that isn&apos;t more output. It&apos;s the same brain producing
              worse work, slower, while feeling busier.
            </p>
          </div>

          <div className="blocks">
            <div className="block reveal">
              <span className="idx">BLOCK 01</span>
              <div className="mins">90<span>min</span></div>
              <p className="desc">
                A Focus Calibration warm-up points your attention at the one task before the clock
                starts — so the first, most distraction-prone minutes aren&apos;t wasted.
              </p>
            </div>
            <div className="block reveal">
              <span className="idx">BLOCK 02</span>
              <div className="mins">90<span>min</span></div>
              <p className="desc">
                Roughly your body&apos;s natural ultradian rhythm — long enough to get past the urge
                to reach for your phone, short enough that attention stays real.
              </p>
            </div>
            <div className="block reveal">
              <span className="idx">BLOCK 03</span>
              <div className="mins">90<span>min</span></div>
              <p className="desc">
                When it ends, it&apos;s genuinely done. No sneaking in a fourth block &ldquo;just
                this once&rdquo; — so tomorrow&apos;s three matter as much as today&apos;s did.
              </p>
            </div>
          </div>

          <div className="system-total">
            <span>3 × 90 MIN</span>
            <div className="line" />
            <span>= 270 MIN</span>
            <div className="line" />
            <span className="mono" style={{ color: "var(--gold-2)" }}>4.5 HOURS. THAT&apos;S IT.</span>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="wrap">
          <div className="reveal">
            <div className="eyebrow">Everything else, in service of the above</div>
            <h2>Nothing here is decoration.</h2>
            <p className="lede">
              Every feature exists to break one specific part of the pattern — starting late,
              scattering attention, or forgetting that today had a limit.
            </p>
          </div>

          <div className="feat-grid reveal">
            <div className="feat">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
              </svg>
              <h3>Focus Calibration</h3>
              <p>
                A short warm-up before every block, so attention is already pointed at the task
                instead of drifting toward your phone.
              </p>
            </div>
            <div className="feat">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 10h8M8 14h5" />
              </svg>
              <h3>Today&apos;s Agenda</h3>
              <p>
                A deliberately small daily list. If it&apos;s not on today&apos;s agenda, it
                isn&apos;t competing for one of today&apos;s three blocks.
              </p>
            </div>
            <div className="feat">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M12 3v6l4 4" />
                <circle cx="12" cy="13" r="9" />
              </svg>
              <h3>Project Goals</h3>
              <p>
                Real target time per project — so sitting down to a block, you already know exactly
                what finished looks like.
              </p>
            </div>
            <div className="feat">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M6 3h12M6 21h12M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9s8 3 8 9" />
              </svg>
              <h3>Daily Focus Budget</h3>
              <p>Three hourglasses, visibly draining. A checklist can always grow — three hourglasses cannot.</p>
            </div>
            <div className="feat">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M4 20V10M12 20V4M20 20v-7" />
              </svg>
              <h3>Analytics &amp; Focus Score</h3>
              <p>
                &ldquo;I was busy all week&rdquo; and &ldquo;I finished four of my five
                priorities&rdquo; are different sentences. This is how you know which was true.
              </p>
            </div>
            <div className="feat">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-4 5 5 0 0 1 9 4c-2 4.5-9 9-9 9z" />
              </svg>
              <h3>Streaks, without the collapse</h3>
              <p>
                Missing one day shouldn&apos;t cost you the habit. One Streak Freeze protects you —
                the rule is never miss twice, not never miss at all.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="wrap reveal">
          <div className="eyebrow" style={{ justifyContent: "center" }}>Today, not Monday</div>
          <h2>
            Pick three things. <br />
            Finish them like it&apos;s the only day you get.
          </h2>
          <Link to="/app" className="btn btn-gold">Start your 3 blocks today</Link>
          <div className="hero-fine">Free to start · no card required</div>
        </div>
      </section>

      <footer>
        <div className="wrap foot-inner">
          <div className="copy">
            © {year ?? ""} Focus Hourglass. Your time is not a renewable resource.
          </div>
          <div className="foot-links">
            <a href="#mori">Philosophy</a>
            <a href="#system">The System</a>
            <a href="#features">Features</a>
            <Link to="/app">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
