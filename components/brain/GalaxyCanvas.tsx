"use client";

import { MouseEvent, ReactNode, useLayoutEffect, useRef } from "react";
import { Starfield } from "@/components/brain/Starfield";

interface GalaxyCanvasProps {
  children: ReactNode;
  onBackgroundClick: () => void;
  // Depth of the currently rendered zoom level (0 = galaxy, 1 = analyst,
  // 2 = division), computed by the caller from its own ZoomState. Compared
  // against the previous render's depth to decide the transition direction.
  zoomDepth: number;
  // Identity of the currently rendered zoom target (e.g.
  // `${level}-${analystId}-${divisionId}`), computed by the caller. Used as
  // the `key` on the content wrapper so React remounts it whenever the
  // target changes — that remount is what lets the CSS enter animation
  // re-trigger on every zoom change (a CSS animation class re-applied to an
  // already-mounted element does not restart on its own).
  zoomKey: string;
}

// Minimal shell for the zoomable galaxy/analyst/division views. Owns the
// "click empty space to zoom out" behavior, the decorative starfield
// background (visible across all three zoom levels since every zoom level
// renders as `children` here), and the zoom-depth-aware enter transition
// ("flying into"/"pulling back from" a system, per GALAXY_VIEW_SPEC.md
// section 7).
export function GalaxyCanvas({ children, onBackgroundClick, zoomDepth, zoomKey }: GalaxyCanvasProps) {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onBackgroundClick();
    }
  };

  // Previous render's depth, used to derive transition direction. `undefined`
  // on the very first render, in which case no animation should play (the
  // initial view shouldn't "fly in" — only subsequent zoom changes should).
  // The ref is updated in a useLayoutEffect below rather than inline during
  // render: mutating a ref during render is impure and gets silently
  // corrupted under StrictMode's double-invoked render (the second
  // invocation would see prevDepthRef.current already equal to zoomDepth,
  // permanently losing the transition direction for that render).
  const prevDepthRef = useRef<number | undefined>(undefined);
  const prevDepth = prevDepthRef.current;

  // Computed synchronously during render (not derived inside the effect
  // below) so the class is already set on the very first render of the new
  // keyed element below — React never paints an unstyled intermediate
  // frame, which is what avoids a flash/flicker on remount.
  let animationClass = "";
  if (prevDepth !== undefined && prevDepth !== zoomDepth) {
    animationClass = zoomDepth > prevDepth ? "zoom-enter-in" : "zoom-enter-out";
  }

  // Updating the ref here (layout effect, runs synchronously after DOM
  // mutations but before the browser paints) rather than inline during
  // render preserves the exact same no-flash behavior while keeping render
  // itself pure — this runs strictly after the animationClass above was
  // already computed and used for this render's output.
  useLayoutEffect(() => {
    prevDepthRef.current = zoomDepth;
  }, [zoomDepth]);

  return (
    <div className="relative w-full h-full" onClick={handleClick}>
      {/* Starfield has pointer-events: none (set internally), so it never
          becomes the click target itself — clicks "through" it still land
          on this wrapper div and correctly satisfy the
          e.target === e.currentTarget check above. */}
      <Starfield />
      <div key={zoomKey} className={`w-full h-full ${animationClass}`}>
        {children}
      </div>
    </div>
  );
}
