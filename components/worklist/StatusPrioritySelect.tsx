"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  // Fixed-position coordinates for the portal menu, measured from the trigger.
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false });
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setAddingNew(false);
    setCustomValue("");
  }, []);

  // The menu is rendered in a portal (so it can't be clipped by a parent's
  // overflow-hidden, e.g. the table card). Position it relative to the trigger
  // and flip upward when there isn't room below the trigger in the viewport.
  const handleToggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const openUp = window.innerHeight - rect.bottom < 260;
      setPos({ left: rect.left, top: openUp ? rect.top - 4 : rect.bottom + 4, openUp });
    }
    setOpen(true);
  }, [open, close]);

  const options = useMemo(() => {
    const set = new Set(suggestions.filter((s) => s && s.trim()));
    if (value) set.add(value);
    return Array.from(set);
  }, [suggestions, value]);

  // Close on outside click (checking both the trigger and the portalled menu),
  // and on scroll/resize since the fixed coordinates would otherwise drift.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onReflow = () => close();
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, close]);

  const handleSelect = useCallback(
    (val: string) => {
      if (val === ADD_NEW) {
        setAddingNew(true);
        return;
      }
      onChange(val);
      close();
    },
    [onChange, close]
  );

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customValue.trim();
    if (trimmed) onChange(trimmed);
    close();
  }, [customValue, onChange, close]);

  const menu = open && mounted
    ? createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: pos.openUp ? "translateY(-100%)" : "none",
            zIndex: 60,
          }}
          className="min-w-[160px] rounded-md border border-theme bg-panel shadow-lg py-1"
        >
          {addingNew ? (
            <div className="px-2 py-1">
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSubmit();
                  if (e.key === "Escape") close();
                }}
                onBlur={handleCustomSubmit}
                placeholder={kind === "priority" ? "Custom priority…" : "Custom status…"}
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
                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {kind === "status" && <span className={`w-1.5 h-1.5 rounded-full ${colorsFor(opt).dot}`} />}
                  {kind === "status" ? labelFor(opt) : opt}
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
        </div>,
        document.body
      )
    : null;

  if (kind === "priority") {
    return (
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center justify-center w-7 h-7 rounded-md border border-theme bg-panel text-secondary hover:text-primary text-xs font-bold transition-colors"
        >
          {value ?? "–"}
        </button>
        {menu}
      </div>
    );
  }

  const colors = value ? colorsFor(value) : null;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
          colors ? `${colors.text} ${colors.bg} ${colors.border}` : "text-secondary bg-panel border-theme"
        }`}
      >
        {colors && <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />}
        {value ? labelFor(value) : "–"}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {menu}
    </div>
  );
}
