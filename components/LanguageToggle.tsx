"use client";

import { Language } from "@/lib/prompts";

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

export function LanguageToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-panel border border-theme">
      {(["dax", "sql"] as Language[]).map((lang) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
            value === lang
              ? "bg-brand-600 text-white shadow-sm"
              : "text-secondary hover:text-primary"
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
