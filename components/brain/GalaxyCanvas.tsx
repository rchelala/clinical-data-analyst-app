"use client";

import { MouseEvent, ReactNode, useRef } from "react";
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
  const prevDepthRef = useRef<number | undefined>(undefined);
  const prevDepth = prevDepthRef.current;
  prevDepthRef.current = zoomDepth;

  let animationClass = "";
  if (prevDepth !== undefined && prevDepth !== zoomDepth) {
    animationClass = zoomDepth > prevDepth ? "zoom-enter-in" : "zoom-enter-out";
  }

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
