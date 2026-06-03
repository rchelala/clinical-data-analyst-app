"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Language } from "@/lib/prompts";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language: Language;
  readOnly?: boolean;
  placeholder?: string;
}

// DAX doesn't have built-in Monaco support — use a close approximation
const monacoLang: Record<Language, string> = {
  dax: "plaintext",
  sql: "sql",
};

export function CodePanel({ value, onChange, language, readOnly = false, placeholder }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const showPlaceholder = !value && placeholder && !readOnly;

  return (
    <div className="relative h-full w-full">
      {showPlaceholder && (
        <div className="absolute inset-0 flex items-start pt-4 pl-14 pointer-events-none z-10">
          <span className="text-sm font-mono text-slate-400 dark:text-slate-600 whitespace-pre-line leading-relaxed">
            {placeholder}
          </span>
        </div>
      )}
      {mounted && (
        <MonacoEditor
          height="100%"
          language={monacoLang[language]}
          value={value}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          onChange={(val) => onChange?.(val ?? "")}
          options={{
            readOnly,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            fontLigatures: true,
            lineNumbers: "on",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: readOnly ? "none" : "line",
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            contextmenu: false,
          }}
        />
      )}
    </div>
  );
}
