import confetti from "canvas-confetti";

/** Big celebratory burst — goal / milestone achieved. */
export function fireCelebration() {
  if (typeof window === "undefined") return;
  const defaults = {
    startVelocity: 32,
    spread: 360,
    ticks: 90,
    zIndex: 200,
    colors: ["#E2B05C", "#F5C368", "#f4a261", "#ffffff", "#facc15"],
  };

  const shoot = (originX: number) => {
    confetti({
      ...defaults,
      particleCount: 80,
      origin: { x: originX, y: 0.5 },
    });
  };

  shoot(0.2);
  shoot(0.5);
  shoot(0.8);

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 120,
      spread: 100,
      origin: { x: 0.5, y: 0.35 },
    });
  }, 220);
}
