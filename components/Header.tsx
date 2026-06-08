"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ background: "linear-gradient(135deg, #1d4ed8, #7c3aed)" }}
        >
          <svg width="22" height="22" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="14" y="3" width="10" height="32" rx="4" fill="white" fillOpacity="0.92" />
            <rect x="3" y="14" width="32" height="10" rx="4" fill="white" fillOpacity="0.92" />
            <circle cx="30" cy="8" r="5" fill="#fbbf24" />
            <path d="M30 5.5 L30.6 7.4 L32.5 8 L30.6 8.6 L30 10.5 L29.4 8.6 L27.5 8 L29.4 7.4 Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold text-primary leading-none">
            ClinKit
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Your clinical data analyst toolkit
          </p>
        </div>
      </div>

      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        aria-label="Toggle theme"
      >
        {mounted ? (
          theme === "dark" ? (
            <Sun className="w-4 h-4 text-secondary" />
          ) : (
            <Moon className="w-4 h-4 text-secondary" />
          )
        ) : (
          <div className="w-4 h-4" />
        )}
      </button>
    </header>
  );
}
