"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { UserCircle2, RefreshCw, Check } from "lucide-react";
import { Analyst } from "@/lib/brain-types";
import { loadAnalystId, saveAnalystId } from "@/lib/analyst-identity";

interface AnalystSelectorProps {
  onSelect: (analystId: number, analystName: string, isManualSwitch: boolean) => void;
}

const MENU_WIDTH = 256; // matches w-64

export function AnalystSelector({ onSelect }: AnalystSelectorProps) {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Dropdown is shown either because no analyst id was stored yet, or because
  // the user deliberately clicked the current-analyst button to re-open it.
  const [open, setOpen] = useState(false);
  const [selectedAnalyst, setSelectedAnalyst] = useState<Analyst | null>(null);
  // Fixed-position coordinates for the portalled menu, measured from the trigger.
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/analysts");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Could not load analysts.");
          return;
        }

        setAnalysts(data);

        const storedId = loadAnalystId();
        if (storedId !== null) {
          const stored = (data as Analyst[]).find((a) => a.id === storedId);
          if (stored) setSelectedAnalyst(stored);
          onSelect(storedId, stored?.name ?? "", false);
        } else {
          setOpen(true);
        }
      } catch {
        if (!cancelled) setError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position the portalled menu relative to the trigger, right-aligned, flipping
  // upward when there isn't room below in the viewport.
  const positionMenu = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < 340;
    setPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(8, rect.right - MENU_WIDTH),
      openUp,
    });
  }, []);

  // While open: keep the menu positioned on scroll/resize and close on outside
  // click / Escape.
  useEffect(() => {
    if (!open) return;
    positionMenu();
    const onReflow = () => positionMenu();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, positionMenu]);

  const handlePick = useCallback(
    (analyst: Analyst) => {
      saveAnalystId(analyst.id);
      setOpen(false);
      setSelectedAnalyst(analyst);
      onSelect(analyst.id, analyst.name, true);
    },
    [onSelect]
  );

  return (
    <>
      {/* Shows the current analyst's name; clicking re-opens the selector. */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        title="Switch analyst"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
      >
        {selectedAnalyst ? (
          <UserCircle2 className="w-3 h-3" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        {selectedAnalyst ? selectedAnalyst.name : "Select analyst"}
      </button>

      {open && mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: MENU_WIDTH,
              transform: pos.openUp ? "translateY(-100%)" : "none",
              zIndex: 80,
            }}
            className="rounded-xl border border-theme bg-elevated shadow-panel overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-theme">
              <p className="text-xs font-semibold text-primary leading-none">Switch analyst</p>
              <p className="text-[11px] text-secondary mt-1">Pick your analyst identity.</p>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-1">
              {loading && <p className="text-sm text-secondary px-2 py-1.5">Loading analysts…</p>}

              {error && <p className="text-sm text-red-400 px-2 py-1.5">{error}</p>}

              {!loading && !error && analysts.length === 0 && (
                <p className="text-sm text-secondary px-2 py-1.5">No analysts found.</p>
              )}

              {!loading && !error && analysts.map((analyst) => {
                const isSelected = selectedAnalyst?.id === analyst.id;
                return (
                  <button
                    key={analyst.id}
                    onClick={() => handlePick(analyst)}
                    className={`flex items-center gap-2 px-2.5 py-2 text-sm font-medium rounded-md text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      isSelected ? "bg-brand-500/12 text-primary" : "text-primary hover:bg-panel/80"
                    }`}
                  >
                    <UserCircle2 className="w-4 h-4 text-secondary flex-shrink-0" />
                    {analyst.name}
                    {isSelected && <Check className="w-3.5 h-3.5 text-brand-400 ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
