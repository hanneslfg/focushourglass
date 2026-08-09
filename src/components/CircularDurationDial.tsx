/**
 * Circular duration dial around the hourglass.
 *
 * Geometry: one full rotation (360°) === 90 minutes. Dragging the thumb
 * tracks the pointer radially, counts full turns so durations beyond 90 min
 * keep working, and snaps to clean 1-minute steps (5-minute magnet).
 */
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_PER_TURN = 90;
const MIN_VALUE = 1;
const MAX_VALUE = 600;

interface Props {
  minutes: number;
  onChange: (m: number) => void;
  disabled?: boolean;
  /** Fraction 0..1 of elapsed progress, drawn as a subtle inner arc. */
  className?: string;
}

function snap(raw: number) {
  const rounded = Math.round(raw);
  const nearestFive = Math.round(raw / 5) * 5;
  // Magnet to 5-minute steps when we're basically there anyway.
  return Math.abs(raw - nearestFive) <= 0.8 ? nearestFive : rounded;
}

export function CircularDurationDial({ minutes, onChange, disabled, className }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastAngleRef = useRef<number | null>(null);
  const valueRef = useRef(minutes);
  valueRef.current = minutes;

  const angleFor = (m: number) => ((m % MIN_PER_TURN) / MIN_PER_TURN) * 360;

  const pointerAngle = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const deg = (Math.atan2(clientX - cx, cy - clientY) * 180) / Math.PI;
    return (deg + 360) % 360;
  }, []);

  const applyAngle = useCallback(
    (angle: number) => {
      const prev = lastAngleRef.current;
      lastAngleRef.current = angle;
      const current = valueRef.current;
      const currentAngle = angleFor(current);
      let delta = angle - (prev ?? currentAngle);
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const next = snap(current + (delta / 360) * MIN_PER_TURN);
      onChange(Math.min(MAX_VALUE, Math.max(MIN_VALUE, next)));
    },
    [onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      const a = pointerAngle(e.clientX, e.clientY);
      if (a != null) applyAngle(a);
    };
    const up = () => {
      setDragging(false);
      lastAngleRef.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, applyAngle, pointerAngle]);

  const size = 100;
  const c = size / 2;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const angle = angleFor(minutes) || (minutes >= MIN_PER_TURN ? 360 : 0);
  const dash = (angle / 360) * circumference;
  const rad = ((angle - 90) * Math.PI) / 180;
  const thumbX = c + radius * Math.cos(rad);
  const thumbY = c + radius * Math.sin(rad);
  const turns = Math.floor(minutes / MIN_PER_TURN);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${size} ${size}`}
      role="slider"
      aria-label="Session duration"
      aria-valuemin={MIN_VALUE}
      aria-valuemax={MAX_VALUE}
      aria-valuenow={minutes}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(MAX_VALUE, minutes + (e.shiftKey ? 5 : 1)));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(MIN_VALUE, minutes - (e.shiftKey ? 5 : 1)));
        }
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        const a = pointerAngle(e.clientX, e.clientY);
        lastAngleRef.current = a;
        setDragging(true);
      }}
      className={`absolute inset-0 h-full w-full overflow-visible ${
        disabled ? "pointer-events-none opacity-40" : "cursor-grab touch-none outline-none"
      } ${dragging ? "cursor-grabbing" : ""} ${className ?? ""}`}
      style={{ touchAction: "none" }}
    >
      {/* Track */}
      <circle
        cx={c}
        cy={c}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={1.5}
      />
      {/* Extra turns ring (each completed 90-min rotation) */}
      {turns > 0 && (
        <circle
          cx={c}
          cy={c}
          r={radius + 3}
          fill="none"
          stroke="var(--sand, currentColor)"
          strokeOpacity={0.25}
          strokeWidth={1}
        />
      )}
      {/* Selected arc */}
      <circle
        cx={c}
        cy={c}
        r={radius}
        fill="none"
        stroke="var(--sand, currentColor)"
        strokeWidth={dragging ? 3 : 2}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform={`rotate(-90 ${c} ${c})`}
        style={{
          transition: dragging ? "none" : "stroke-dasharray 0.25s ease, stroke-width 0.2s ease",
          filter: dragging
            ? "drop-shadow(0 0 6px var(--sand-glow, rgba(245,158,11,0.7)))"
            : "none",
        }}
      />
      {/* Thumb */}
      <g
        style={{
          transition: dragging ? "none" : "transform 0.25s ease",
          transform: "translateZ(0)",
        }}
      >
        <circle
          cx={thumbX}
          cy={thumbY}
          r={dragging ? 9 : 7}
          fill="var(--sand-glow, rgba(245,158,11,0.35))"
          opacity={dragging ? 0.35 : 0.18}
          style={{ transition: "r 0.15s ease, opacity 0.15s ease" }}
        />
        <circle
          cx={thumbX}
          cy={thumbY}
          r={dragging ? 4.2 : 3.4}
          fill="var(--sand, currentColor)"
          style={{ transition: "r 0.15s ease" }}
        />
      </g>
    </svg>
  );
}

export default CircularDurationDial;
