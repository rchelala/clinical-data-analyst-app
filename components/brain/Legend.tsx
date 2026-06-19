"use client";

// Generic bottom-right legend box — generalizes the inline legend pattern
// originally hardcoded in the now-removed DivisionBrain.tsx (the "absolute
// bottom-4 right-4 border-theme bg-panel" box with colored dots + labels).
// SolarSystemView is the current consumer; this is a separate, reusable
// component for use by GalaxyView and future zoom levels.

export interface LegendItem {
  color: string;
  label: string;
}

interface LegendProps {
  items: LegendItem[];
}

export function Legend({ items }: LegendProps) {
  return (
    <div className="absolute bottom-4 right-4 rounded-lg border border-theme bg-panel shadow-lg px-3 py-2.5 pointer-events-none">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">Legend</p>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-primary">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
