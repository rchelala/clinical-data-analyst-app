"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Braces } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600">
          <Braces className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-primary leading-none">
            DAX & SQL Commenter
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            AI-powered inline code documentation
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
