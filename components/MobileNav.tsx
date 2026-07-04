"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X, Home, BrainCircuit, ClipboardList, Building2, Bot } from "lucide-react";
import { AIProvider, PROVIDER_LABELS } from "@/lib/providers";

export interface MobileNavSubTab {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

interface MobileNavProps {
  /** Which primary destination is active, for highlighting. */
  active: "home" | "brain" | "worklist" | "overview";
  /** Home-only: the in-page AI sub-tabs. Omit on other pages. */
  subTabs?: readonly MobileNavSubTab[];
  activeSubTab?: string;
  onSubTabSelect?: (id: string) => void;
  /** Optional provider selector shown in the drawer footer. */
  provider?: AIProvider;
  onProviderChange?: (p: AIProvider) => void;
}

const PRIMARY = [
  { key: "home",     href: "/",         label: "Home",     Icon: Home },
  { key: "brain",    href: "/brain",    label: "Brain",    Icon: BrainCircuit },
  { key: "worklist", href: "/worklist", label: "Worklist", Icon: ClipboardList },
  { key: "overview", href: "/overview", label: "Overview", Icon: Building2 },
] as const;

export function MobileNav({
  active, subTabs, activeSubTab, onSubTabSelect, provider, onProviderChange,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

  // While open: close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // While open: lock body scroll so the page behind the drawer can't scroll.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-theme bg-panel text-primary"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex md:hidden">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          {/* drawer */}
          <nav className="relative w-72 max-w-[80vw] h-full bg-elevated border-r border-theme flex flex-col p-4 gap-1 animate-fade-in overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-primary">ClinKit</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-secondary hover:text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {PRIMARY.map(({ key, href, label, Icon }) => (
              <Link
                key={key}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  active === key
                    ? "bg-brand-600/20 text-primary"
                    : "text-secondary hover:text-primary hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}

            {subTabs && subTabs.length > 0 && (
              <>
                <div className="mt-3 mb-1 px-3 text-[10px] uppercase tracking-wide text-secondary font-semibold">
                  Tools
                </div>
                {subTabs.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onSubTabSelect?.(id); setOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      activeSubTab === id
                        ? "bg-brand-600/20 text-primary"
                        : "text-secondary hover:text-primary hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </>
            )}

            {provider && onProviderChange && (
              <div className="mt-auto pt-4 border-t border-theme flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
                <select
                  aria-label="Select AI provider"
                  value={provider}
                  onChange={(e) => onProviderChange(e.target.value as AIProvider)}
                  className="flex-1 text-xs font-medium rounded-md border border-theme px-2 py-1.5 bg-panel text-primary focus:outline-none"
                >
                  {(Object.entries(PROVIDER_LABELS) as [AIProvider, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </nav>
        </div>,
        document.body
      )}
    </div>
  );
}
