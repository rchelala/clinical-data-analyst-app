"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface StatusPrioritySelectProps {
  kind: "status" | "priority";
  value: string | null;
  suggestions: string[];
  onChange: (value: string) => void;
}

// Common status values get a fixed, recognizable color. Anything else falls
// back to a deterministic hash-based color from FALLBACK_PALETTE so the same
// arbitrary string always renders the same chip color.
const STATUS_COLORS: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  open: { text: "text-[#ff9d8a]", bg: "bg-[rgba(218,54,51,0.10)]", border: "border-[rgba(218,54,51,0.30)]", dot: "bg-[#da3633]" },
  in_progress: { text: "text-[#f0c674]", bg: "bg-[rgba(210,153,34,0.12)]", border: "border-[rgba(210,153,34,0.35)]", dot: "bg-[#d29922]" },
  progress: { text: "text-[#f0c674]", bg: "bg-[rgba(210,153,34,0.12)]", border: "border-[rgba(210,153,34,0.35)]", dot: "bg-[#d29922]" },
  done: { text: "text-[#9aa7b4]", bg: "bg-[rgba(110,118,129,0.15)]", border: "border-[rgba(110,118,129,0.4)]", dot: "bg-[#6b7785]" },
  completed: { text: "text-[#9aa7b4]", bg: "bg-[rgba(110,118,129,0.15)]", border: "border-[rgba(110,118,129,0.4)]", dot: "bg-[#6b7785]" },
  active: { text: "text-[#7ee2a8]", bg: "bg-[rgba(46,160,67,0.12)]", border: "border-[rgba(46,160,67,0.35)]", dot: "bg-[#2ea043]" },
  maintenance: { text: "text-[#a8b6ff]", bg: "bg-[rgba(99,108,255,0.12)]", border: "border-[rgba(99,108,255,0.35)]", dot: "bg-[#636cff]" },
  retired: { text: "text-[#ff9d8a]", bg: "bg-[rgba(218,54,51,0.10)]", border: "border-[rgba(218,54,51,0.30)]", dot: "bg-[#da3633]" },
};

const FALLBACK_PALETTE: { text: string; bg: string; border: string; dot: string }[] = [
  { text: "text-[#7ee2a8]", bg: "bg-[rgba(46,160,67,0.12)]", border: "border-[rgba(46,160,67,0.35)]", dot: "bg-[#2ea043]" },
  { text: "text-[#f0c674]", bg: "bg-[rgba(210,153,34,0.12)]", border: "border-[rgba(210,153,34,0.35)]", dot: "bg-[#d29922]" },
  { text: "text-[#a8b6ff]", bg: "bg-[rgba(99,108,255,0.12)]", border: "border-[rgba(99,108,255,0.35)]", dot: "bg-[#636cff]" },
  { text: "text-[#ff9d8a]", bg: "bg-[rgba(218,54,51,0.10)]", border: "border-[rgba(218,54,51,0.30)]", dot: "bg-[#da3633]" },
  { text: "text-[#d8a8ff]", bg: "bg-[rgba(163,113,247,0.12)]", border: "border-[rgba(163,113,247,0.35)]", dot: "bg-[#a371f7]" },
  { text: "text-[#8ecbff]", bg: "bg-[rgba(59,130,246,0.12)]", border: "border-[rgba(59,130,246,0.35)]", dot: "bg-[#3b82f6]" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function colorsFor(value: string) {
  const key = value.toLowerCase().trim();
  if (STATUS_COLORS[key]) return STATUS_COLORS[key];
  return FALLBACK_PALETTE[hashString(key) % FALLBACK_PALETTE.length];
}

function labelFor(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const ADD_NEW = "__add_new__";

export function StatusPrioritySelect({ kind, value, suggestions, onChange }: StatusPrioritySelectProps) {
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const set = new Set(suggestions.filter((s) => s && s.trim()));
    if (value) set.add(value);
    return Array.from(set);
  }, [suggestions, value]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingNew(false);
        setCustomValue("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = useCallback(
    (val: string) => {
      if (val === ADD_NEW) {
        setAddingNew(true);
        return;
      }
      onChange(val);
      setOpen(false);
    },
    [onChange]
  );

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customValue.trim();
    if (trimmed) {
      onChange(trimmed);
    }
    setAddingNew(false);
    setCustomValue("");
    setOpen(false);
  }, [customValue, onChange]);

  if (kind === "priority") {
    return (
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center w-7 h-7 rounded-md border border-theme bg-panel text-secondary hover:text-primary text-xs font-bold transition-colors"
        >
          {value ?? "–"}
        </button>
        {open && (
          <div className="absolute z-10 mt-1 min-w-[120px] rounded-md border border-theme bg-panel shadow-lg py-1">
            {addingNew ? (
              <div className="px-2 py-1">
                <input
                  autoFocus
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCustomSubmit();
                    if (e.key === "Escape") {
                      setAddingNew(false);
                      setCustomValue("");
                    }
                  }}
                  onBlur={handleCustomSubmit}
                  placeholder="Custom value…"
                  className="w-full text-xs rounded border border-theme px-2 py-1 bg-panel text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            ) : (
              <>
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className="w-full text-left px-3 py-1.5 text-xs text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleSelect(ADD_NEW)}
                  className="w-full text-left px-3 py-1.5 text-xs text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border-t border-theme"
                >
                  Add new…
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  const colors = value ? colorsFor(value) : null;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
          colors
            ? `${colors.text} ${colors.bg} ${colors.border}`
            : "text-secondary bg-panel border-theme"
        }`}
      >
        {colors && <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />}
        {value ? labelFor(value) : "–"}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 min-w-[160px] rounded-md border border-theme bg-panel shadow-lg py-1">
          {addingNew ? (
            <div className="px-2 py-1">
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSubmit();
                  if (e.key === "Escape") {
                    setAddingNew(false);
                    setCustomValue("");
                  }
                }}
                onBlur={handleCustomSubmit}
                placeholder="Custom status…"
                className="w-full text-xs rounded border border-theme px-2 py-1 bg-panel text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          ) : (
            <>
              {options.map((opt) => {
                const optColors = colorsFor(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${optColors.dot}`} />
                    {labelFor(opt)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => handleSelect(ADD_NEW)}
                className="w-full text-left px-3 py-1.5 text-xs text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border-t border-theme"
              >
                Add new…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
