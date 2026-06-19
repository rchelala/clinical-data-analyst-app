"use client";

import { MouseEvent, ReactNode } from "react";
import { Starfield } from "@/components/brain/Starfield";

interface GalaxyCanvasProps {
  children: ReactNode;
  onBackgroundClick: () => void;
}

// Minimal shell for the zoomable galaxy/analyst/division views. Later tasks
// will add the SVG viewBox and zoom transitions here — for now it owns the
// "click empty space to zoom out" behavior plus the decorative starfield
// background, visible across all three zoom levels since every zoom level
// renders as `children` here.
export function GalaxyCanvas({ children, onBackgroundClick }: GalaxyCanvasProps) {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onBackgroundClick();
    }
  };

  return (
    <div className="relative w-full h-full" onClick={handleClick}>
      {/* Starfield has pointer-events: none (set internally), so it never
          becomes the click target itself — clicks "through" it still land
          on this wrapper div and correctly satisfy the
          e.target === e.currentTarget check above. */}
      <Starfield />
      {children}
    </div>
  );
}
