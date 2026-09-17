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

// Caps the twinkle loop at ~30fps instead of following the display's native
// refresh rate (often 60-120fps) — this animation is subtle background
// chrome, so halving/thirding the redraw rate isn't visually noticeable but
// meaningfully cuts main-thread work on higher-refresh displays.
const FRAME_INTERVAL_MS = 1000 / 30;

// Precomputed fillStyle strings for a fixed set of opacity buckets, reused
// across every star/frame instead of building a new `rgba(...)` template
// string per star per frame (200 stars * up to 60fps = up to 12,000
// allocations/sec previously). 33 buckets (step of 1/32) is fine-grained
// enough that the quantization isn't perceptible in a twinkle this subtle.
const OPACITY_BUCKETS = 32;
const FILL_STYLES = Array.from(
  { length: OPACITY_BUCKETS + 1 },
  (_, i) => `rgba(255, 255, 255, ${(i / OPACITY_BUCKETS).toFixed(3)})`
);

function fillStyleForOpacity(opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  return FILL_STYLES[Math.round(clamped * OPACITY_BUCKETS)];
}

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
  // Set by the animation effect below; called by the resize effect so a
  // resize while prefers-reduced-motion is active (rAF loop not running)
  // still redraws the static field at the new size/positions instead of
  // leaving stale content on the canvas.
  const drawStaticRef = useRef<(() => void) | null>(null);

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
      drawStaticRef.current?.();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Twinkle animation loop — throttled to ~30fps (see FRAME_INTERVAL_MS)
  // since this is purely decorative chrome that doesn't need to track the
  // display's native refresh rate. Skips animating entirely under
  // prefers-reduced-motion, instead drawing one static frame so the field
  // doesn't just vanish. Reacts live to the OS-level setting changing while
  // the page is open (no reload required), starting/stopping the rAF loop
  // in response.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    let frameId: number | undefined;
    let lastFrameTime = 0;

    const drawStatic = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const star of starsRef.current) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = fillStyleForOpacity(star.baseOpacity);
        ctx.fill();
      }
    };
    drawStaticRef.current = drawStatic;

    const render = (time: number) => {
      if (time - lastFrameTime < FRAME_INTERVAL_MS) {
        frameId = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const star of starsRef.current) {
        const opacity = star.baseOpacity + star.amplitude * Math.sin(time * star.speed + star.phase);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = fillStyleForOpacity(opacity);
        ctx.fill();
      }
      frameId = requestAnimationFrame(render);
    };

    const startOrStop = () => {
      if (motionQuery.matches) {
        if (frameId !== undefined) {
          cancelAnimationFrame(frameId);
          frameId = undefined;
        }
        drawStatic();
      } else if (frameId === undefined) {
        lastFrameTime = 0;
        frameId = requestAnimationFrame(render);
      }
    };

    startOrStop();
    motionQuery.addEventListener("change", startOrStop);

    return () => {
      motionQuery.removeEventListener("change", startOrStop);
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      drawStaticRef.current = null;
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
