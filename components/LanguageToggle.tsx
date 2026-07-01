"use client";

import { Language } from "@/lib/prompts";

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

export function LanguageToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 p-[3px] rounded-lg bg-panel border border-theme">
      {(["dax", "sql"] as Language[]).map((lang) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          aria-pressed={value === lang}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
            value === lang
              ? "bg-secondary text-primary shadow-panel"
              : "text-secondary hover:text-primary"
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
