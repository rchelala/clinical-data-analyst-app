"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

interface StatusFilterDropdownProps {
  // Distinct status values currently in use across the sections, already
  // de-duplicated (case-insensitively) by the caller.
  options: string[];
  // Currently selected statuses (case-insensitive match). Empty = show all.
  selected: string[];
  onChange: (next: string[]) => void;
}

// Global multi-select status filter shown once and applied across every
// worklist section. Empty selection means "no filter — show everything".
export function StatusFilterDropdown({ options, selected, onChange }: StatusFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isSelected = useCallback(
    (opt: string) => selected.some((s) => s.trim().toLowerCase() === opt.trim().toLowerCase()),
    [selected]
  );

  const toggle = useCallback(
    (opt: string) => {
      if (isSelected(opt)) {
        onChange(selected.filter((s) => s.trim().toLowerCase() !== opt.trim().toLowerCase()));
      } else {
        onChange([...selected, opt]);
      }
    },
    [isSelected, onChange, selected]
  );

  const label =
    selected.length === 0
      ? "All statuses"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} statuses`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
          selected.length > 0
            ? "text-primary border-brand-500 bg-brand-600/10"
            : "border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80"
        }`}
      >
        Status: {label}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 max-h-72 overflow-auto rounded-md border border-theme bg-elevated shadow-panel py-1">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-theme/60">
            <span className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
              Filter by status
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] text-brand-400 hover:text-brand-300"
              >
                Clear
              </button>
            )}
          </div>
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-secondary">No statuses in use yet.</p>
          )}
          {options.map((opt) => {
            const on = isSelected(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-panel/80 transition-colors"
              >
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 ${
                    on ? "bg-brand-600 border-brand-600 text-white" : "border-secondary"
                  }`}
                >
                  {on && <Check className="w-3 h-3" />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
