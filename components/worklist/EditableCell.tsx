"use client";

import { memo, useRef, useState } from "react";

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
function EditableCellImpl({ value, placeholder, onSave }: EditableCellProps) {
  // Bumped on a failed save to force React to remount the contentEditable
  // element (via key) instead of mutating its DOM text node directly —
  // direct mutation (innerText = ...) desyncs the node from React's vdom, so
  // later `value` prop updates stop rendering and a later blur can save
  // stale text over newer data.
  const [revertKey, setRevertKey] = useState(0);
  // Tracks the latest `value` prop so the no-op comparison in `onBlur`
  // (whose closure is created once per render) always compares against the
  // current value, not a stale one captured at an earlier render.
  const valueRef = useRef(value);
  valueRef.current = value;

  return (
    <div
      key={revertKey}
      contentEditable
      suppressContentEditableWarning
      onBlur={async (e) => {
        const next = e.currentTarget.innerText.trim();
        const original = valueRef.current ?? "";
        if (next === original) return;
        let ok = false;
        try {
          ok = await onSave(next);
        } catch {
          ok = false;
        }
        if (!ok) {
          setRevertKey((k) => k + 1);
        }
      }}
      data-placeholder={placeholder}
      className="text-xs text-secondary outline-none rounded-md px-1.5 py-1 border border-transparent hover:border-theme hover:bg-panel focus:border-brand-500 focus:bg-panel focus:text-primary transition-colors min-h-[1.4em] min-w-[40px] empty:before:content-[attr(data-placeholder)] empty:before:text-secondary/50"
    >
      {value ?? ""}
    </div>
  );
}

// Memoized: dozens render per table (one per editable field per row), and
// most don't change when an unrelated row/field is edited elsewhere on the
// page.
export const EditableCell = memo(EditableCellImpl);
