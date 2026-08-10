"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { AI_FEATURES, AI_PRIVACY_POINTS } from "@/lib/ai-usage-info";

// Header button that opens a static "How ClinKit uses AI" reference overlay.
// Self-contained (owns its own open state) so it can be dropped into a header
// with a single <AiInfoButton />. Overlay behavior mirrors components/MobileNav.tsx:
// portal to <body>, close on Escape, lock body scroll while open, backdrop click.
export function AiInfoButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="How ClinKit uses AI"
        title="How ClinKit uses AI"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">How AI works</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />

            {/* panel */}
            <div
              role="dialog"
              aria-modal="true"
              aria-label="How ClinKit uses AI"
              className="relative w-[92vw] max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-elevated border border-theme shadow-2xl animate-fade-in"
            >
              {/* header */}
              <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-theme bg-elevated">
                <div>
                  <h2 className="text-base font-semibold text-primary leading-tight">
                    How ClinKit uses AI
                  </h2>
                  <p className="text-xs text-secondary mt-0.5">
                    What each feature sends, which model handles it, and where it goes.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-secondary hover:text-primary hover:bg-white/[0.04] transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* feature cards */}
              <div className="px-6 py-4 flex flex-col gap-3">
                {AI_FEATURES.map((f) => (
                  <div
                    key={f.name}
                    className="rounded-xl border border-theme bg-panel px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <f.Icon className="w-4 h-4 text-secondary flex-shrink-0" />
                        <span className="text-sm font-semibold text-primary">{f.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          f.usesAI
                            ? "bg-brand-600/20 text-brand-400"
                            : "bg-white/[0.06] text-secondary"
                        }`}
                      >
                        {f.usesAI ? f.model : "No AI"}
                      </span>
                    </div>

                    <p className="text-xs text-secondary mt-2 leading-relaxed">{f.whatItDoes}</p>

                    <div className="mt-2 text-xs leading-relaxed">
                      <span className="font-semibold text-secondary">Data sent: </span>
                      <span className="text-primary">{f.dataSent}</span>
                      {f.usesAI && f.goesTo && (
                        <>
                          <span className="text-secondary"> → </span>
                          <span className="text-primary">{f.goesTo}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* privacy & PHI callout */}
              <div className="px-6 pb-6">
                <div className="rounded-xl border border-brand-500/30 bg-brand-500/[0.06] px-4 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-primary">Privacy &amp; PHI</h3>
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {AI_PRIVACY_POINTS.map((p) => (
                      <li key={p.title} className="flex items-start gap-2 text-xs leading-relaxed">
                        {p.caution ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        )}
                        <span className="text-secondary">
                          <span className="font-semibold text-primary">{p.title}. </span>
                          {p.body}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
