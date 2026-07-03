"use client";

// Info popover that explains how a division's engagement score/tier is set.
// The numbers here mirror the scoring constants in app/api/overview/route.ts
// (SUBSCRIPTIONS/DASHBOARDS/DEMAND/RECENCY weights + tier thresholds) — keep
// them in sync if that formula changes.

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

const TIERS: { label: string; meaning: string; dot: string }[] = [
  { label: "Active", meaning: "Lots going on, and worked on recently.", dot: "bg-emerald-400" },
  { label: "Warm", meaning: "Some activity, but a bit quieter lately.", dot: "bg-amber-400" },
  { label: "Dormant", meaning: "Little or no recent activity.", dot: "bg-white/30" },
];

const SIGNALS: { label: string; counts: string; detail: string }[] = [
  { label: "Reports we send them", counts: "counts most", detail: "how many scheduled report subscriptions they get" },
  { label: "Dashboards we run for them", counts: "", detail: "how many live dashboards they have" },
  { label: "How recently we worked on their stuff", counts: "", detail: "the last month counts most; older work counts for less" },
  { label: "Requests still open", counts: "counts least", detail: "requests and tasks they've asked for that aren't finished yet" },
];

export function EngagementInfoButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="How is engagement scored?"
        className="flex items-center justify-center w-6 h-6 rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="How engagement is scored"
          className="absolute right-0 top-8 z-20 w-80 rounded-lg border border-theme bg-elevated shadow-panel p-4 text-left"
        >
          <h3 className="text-sm font-semibold text-primary mb-1">What does the rating mean?</h3>
          <p className="text-xs text-secondary mb-3 leading-relaxed">
            Each division gets a rating based on how much we&apos;re doing for them and how recently.
            We can&apos;t see who actually opens a dashboard, so this is our best guess from the work
            itself.
          </p>

          <div className="flex flex-col gap-1.5 mb-3">
            {TIERS.map((t) => (
              <div key={t.label} className="flex items-start gap-2 text-xs">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1 ${t.dot}`} />
                <span className="font-medium text-primary w-16 flex-shrink-0">{t.label}</span>
                <span className="text-secondary">{t.meaning}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-theme pt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">
              What we look at
            </p>
            <ul className="flex flex-col gap-1.5">
              {SIGNALS.map((s) => (
                <li key={s.label} className="text-xs">
                  <span className="text-primary font-medium">{s.label}</span>
                  {s.counts && <span className="text-secondary/70"> · {s.counts}</span>}
                  <span className="text-secondary"> — {s.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
