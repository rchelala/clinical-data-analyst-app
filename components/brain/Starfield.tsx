"use client";

import { useEffect, useRef } from "react";

// Purely decorative canvas background of ~200 twinkling stars, per spec
// section 7 ("Visual Polish: Starfield"). Renders behind whatever zoom-level
// view GalaxyCanvas hosts. No interactivity — pointer-events are disabled so
// clicks pass straight through to GalaxyCanvas's own background-click
// handler underneath.
//
// Resize handling mirrors the ResizeObserver pattern already used in
// DivisionGraphBrain.tsx for sizing its force-graph canvas.

const STAR_COUNT = 200;

interface Star {
  x: number;
  y: number;
  radius: number;
  // Twinkle is a sine oscillation: baseOpacity +/- amplitude, advanced by
  // speed each frame, phase-offset per star so they don't all pulse in sync.
  baseOpacity: number;
  amplitude: number;
  phase: number;
  speed: number;
}

function createStars(width: number, height: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.2 + 0.3,
      baseOpacity: Math.random() * 0.4 + 0.3,
      amplitude: Math.random() * 0.4 + 0.1,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.0015 + 0.0005,
    });
  }
  return stars;
}

export function Starfield() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);

  // Track container size and (re)seed star positions to match, following the
  // same ResizeObserver convention as DivisionGraphBrain.tsx.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      canvas.width = width;
      canvas.height = height;
      starsRef.current = createStars(width, height);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Twinkle animation loop — skipped entirely under prefers-reduced-motion,
  // since this is purely decorative chrome with no functional purpose.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId: number;

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const star of starsRef.current) {
        const opacity = star.baseOpacity + star.amplitude * Math.sin(time * star.speed + star.phase);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, Math.min(1, opacity))})`;
        ctx.fill();
      }
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
