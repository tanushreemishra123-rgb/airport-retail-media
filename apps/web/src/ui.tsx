import React from "react";
import { useStore } from "./store";

export const fmt = (n: number): string => new Intl.NumberFormat("en-US").format(Math.round(n));
export function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}
export const pct = (n: number): string => `${Math.round(n * 100)}%`;

export function Card({ title, hint, children, className = "" }: { title?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      {title && <h3>{title}</h3>}
      {hint && <div className="hint">{hint}</div>}
      {children}
    </div>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="kpi">
      <div className={`v ${tone ?? ""}`}>{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
}

/** Horizontal bars from a shares map (0..1 values). */
export function SharesBars({ data, max = 1, limit }: { data: Record<string, number>; max?: number; limit?: number }) {
  let entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (limit) entries = entries.slice(0, limit);
  return (
    <div className="bars">
      {entries.map(([k, v]) => (
        <div className="bar" key={k}>
          <span>{k}</span>
          <div className="track"><div className="fill" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div>
          <span className="val">{Math.round(v * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ points, height = 40, color = "var(--accent)" }: { points: number[]; height?: number; color?: string }) {
  const max = Math.max(1, ...points);
  const w = 100;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - (p / max) * height).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

/** Re-render on each live delta tick. */
export function useLiveTick(): number {
  return useStore((s) => s.tick);
}
