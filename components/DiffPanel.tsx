"use client";

import { DiffEditor, type BeforeMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Language } from "@/lib/prompts";

const monacoLang: Record<Language, string> = {
  dax: "plaintext",
  sql: "sql",
};

// Light theme: soft green background, dark readable text
// Dark theme: dark green background, light readable text
const beforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("diff-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background":                    "#ffffff",
      "diffEditor.insertedLineBackground":    "#d4f0d4",  // soft green bg
      "diffEditor.insertedTextBackground":    "#a8dba8",  // slightly deeper for inline
      "diffEditor.removedLineBackground":     "#fce8e8",
      "diffEditor.removedTextBackground":     "#f5c6c6",
    },
  });

  monaco.editor.defineTheme("diff-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background":                    "#161b22",
      "diffEditor.insertedLineBackground":    "#1a3a1a",  // dark green bg
      "diffEditor.insertedTextBackground":    "#2d5a2d",  // slightly lighter for inline
      "diffEditor.removedLineBackground":     "#3a1a1a",
      "diffEditor.removedTextBackground":     "#5a2d2d",
    },
  });
};

interface Props {
  original: string;
  modified: string;
  language: Language;
}

export function DiffPanel({ original, modified, language }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="h-full w-full">
      <DiffEditor
        height="100%"
        language={monacoLang[language]}
        original={original}
        modified={modified}
        theme={resolvedTheme === "dark" ? "diff-dark" : "diff-light"}
        beforeMount={beforeMount}
        options={{
          readOnly: true,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          fontLigatures: true,
          lineNumbers: "on",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          padding: { top: 16, bottom: 16 },
          renderSideBySide: true,
          overviewRulerBorder: false,
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          contextmenu: false,
        }}
      />
    </div>
  );
}
