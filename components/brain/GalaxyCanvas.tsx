"use client";

import { MouseEvent, ReactNode } from "react";

interface GalaxyCanvasProps {
  children: ReactNode;
  onBackgroundClick: () => void;
}

// Minimal shell for the zoomable galaxy/analyst/division views. Later tasks
// will add the SVG viewBox, starfield, and zoom transitions here — for now
// it just owns the "click empty space to zoom out" behavior.
export function GalaxyCanvas({ children, onBackgroundClick }: GalaxyCanvasProps) {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onBackgroundClick();
    }
  };

  return (
    <div className="relative w-full h-full" onClick={handleClick}>
      {children}
    </div>
  );
}
