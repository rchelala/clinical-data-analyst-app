"use client";

// Generic hover/click detail panel — generalizes the hover-card pattern
// originally inlined in DivisionBrain.tsx (the "absolute top-4 left-4 ...
// rounded-lg border border-theme bg-panel shadow-lg" box). DivisionBrain
// itself is left untouched; this is net-new and currently only consumed by
// GalaxyView, but the { title, rows } shape is intentionally generic enough
// to also fit the next task's Solar System hover content (per-division
// dashboard/subscription/urgency stats) without modification.

export interface DetailPanelRow {
  label: string;
  value: string | number;
}

interface DetailPanelProps {
  title: string;
  rows: DetailPanelRow[];
}

export function DetailPanel({ title, rows }: DetailPanelProps) {
  return (
    <div className="absolute top-4 left-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
      <p className="text-sm font-semibold text-primary">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-secondary mt-1">No data yet.</p>
      ) : (
        <dl className="text-xs text-secondary mt-2 flex flex-col gap-0.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt>{row.label}</dt>
              <dd className="text-primary font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
