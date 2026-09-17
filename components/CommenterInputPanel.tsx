"use client";

import { memo, useMemo } from "react";
import { CodePanel } from "@/components/CodePanel";
import { Language } from "@/lib/prompts";

interface CommenterInputPanelProps {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  placeholder: string;
}

// Isolated so that Monaco's per-keystroke onChange doesn't force the whole
// home page (header, tab bar, other mounted tabs, output panel) to
// re-render — only this leaf and its own line-count re-render on typing.
function CommenterInputPanelImpl({ value, onChange, language, placeholder }: CommenterInputPanelProps) {
  const lineCount = useMemo(() => (value ? value.split("\n").length : 0), [value]);

  return (
    <div className="flex flex-col flex-1 border-b md:border-b-0 md:border-r border-theme overflow-hidden min-h-[40vh] md:min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-secondary/40" />
          <span className="text-xs font-semibold text-secondary uppercase tracking-wide">
            Input · {language.toUpperCase()}
          </span>
        </div>
        {value && (
          <span className="text-xs text-secondary">
            {lineCount} lines
          </span>
        )}
      </div>
      <div className="flex-1 overflow-hidden bg-panel">
        <CodePanel value={value} onChange={onChange} language={language} placeholder={placeholder} />
      </div>
    </div>
  );
}

export const CommenterInputPanel = memo(CommenterInputPanelImpl);
