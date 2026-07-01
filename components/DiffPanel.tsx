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
// Dark theme (Eclipse): near-black editor background with low-alpha
// emerald/red tints for added/removed lines, matching the app's dark canvas.
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
      "editor.background":                    "#08080c",
      "diffEditor.insertedLineBackground":    "#34d39926",  // emerald @ ~15% alpha
      "diffEditor.insertedTextBackground":    "#34d3994d",  // emerald @ ~30% alpha for inline
      "diffEditor.removedLineBackground":     "#f8717120",  // red @ ~12% alpha
      "diffEditor.removedTextBackground":     "#f8717145",  // red @ ~27% alpha for inline
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
