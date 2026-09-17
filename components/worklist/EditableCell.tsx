"use client";

import { useRef } from "react";

interface EditableCellProps {
  value: string | null;
  placeholder?: string;
  // Returns whether the save succeeded (or throws) so the cell can revert
  // the displayed text on failure instead of leaving the failed edit shown.
  onSave: (value: string) => Promise<boolean>;
}

// Inline-editable cell: shows current value as plain text, becomes
// contentEditable on focus, saves on blur — but only when the value actually
// changed, and reverts the displayed text if the save fails. Matches the
// mockup's .edit-cell affordance.
export function EditableCell({ value, placeholder, onSave }: EditableCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const original = value ?? "";

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={async (e) => {
        const next = e.currentTarget.innerText.trim();
        if (next === original) return;
        let ok = false;
        try {
          ok = await onSave(next);
        } catch {
          ok = false;
        }
        if (!ok && ref.current) {
          ref.current.innerText = original;
        }
      }}
      data-placeholder={placeholder}
      className="text-xs text-secondary outline-none rounded-md px-1.5 py-1 border border-transparent hover:border-theme hover:bg-panel focus:border-brand-500 focus:bg-panel focus:text-primary transition-colors min-h-[1.4em] min-w-[40px] empty:before:content-[attr(data-placeholder)] empty:before:text-secondary/50"
    >
      {value ?? ""}
    </div>
  );
}
