"use client";

// Presentational only — a low-opacity, blurred, larger duplicate of a node's
// circle rendered behind it, giving stars/planets a cheap "glow" per the
// spec's Visual Polish section. Shared by AnalystStar.tsx and
// DivisionPlanet.tsx so the glow technique lives in exactly one place
// instead of being copy-pasted a third time (this codebase has already
// consolidated color constants and label truncation after hitting the same
// duplication problem).
//
// Caller passes the already-scaled-up glow radius (base node radius * some
// multiplier) rather than this component owning the multiplier — keeps the
// interface simple and lets each caller tune the glow size to its own node
// without a magic number buried in here.

// Glow circle is drawn at this multiple of the node's own radius, per the
// spec's "low-opacity larger circle" callout. Hoisted here so AnalystStar.tsx
// and DivisionPlanet.tsx share one definition instead of each declaring their
// own copy — the same duplication this codebase has already been burned by
// twice before (color constants, label truncation).
export const GLOW_SCALE = 2;

export interface GlowProps {
  cx: number;
  cy: number;
  radius: number;
  color: string;
}

export function Glow({ cx, cy, radius, color }: GlowProps) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={color}
      opacity={0.25}
      style={{ filter: "blur(6px)", pointerEvents: "none" }}
    />
  );
}
