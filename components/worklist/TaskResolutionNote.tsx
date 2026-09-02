"use client";

import { useEffect, useRef, useState } from "react";

interface TaskResolutionNoteProps {
  value: string | null;
  editing: boolean;
  visible: boolean;
  onSave: (value: string | null) => void;
  onDismiss: () => void;
  onRequestEdit: () => void;
  readOnly?: boolean;
}

// Inline, optional resolution note shown once a task is marked done. Never
// blocks completion: it opens after the checkbox click, saves on blur/Enter,
// and Escape backs out with no save (and no follow-up save from the blur
// that Escape triggers — see escapedRef below).
export function TaskResolutionNote({
  value,
  editing,
  visible,
  onSave,
  onDismiss,
  onRequestEdit,
  readOnly,
}: TaskResolutionNoteProps) {
  const [draft, setDraft] = useState(value ?? "");
  const escapedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? "");
      escapedRef.current = false;
    }
  }, [editing, value]);

  if (!visible) return null;

  if (editing && !readOnly) {
    const commit = () => {
      if (escapedRef.current) return;
      const trimmed = draft.trim();
      if (trimmed !== (value ?? "")) {
        onSave(trimmed || null);
      }
      onDismiss();
    };

    return (
      <input
        autoFocus
        type="text"
        value={draft}
        maxLength={280}
        placeholder="Add resolution note…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            escapedRef.current = true;
            onDismiss();
          }
        }}
        onBlur={commit}
        className="mt-1 w-full text-xs bg-panel border border-theme rounded-md px-1.5 py-1 text-primary outline-none focus:border-brand-500 transition-colors"
      />
    );
  }

  if (value) {
    if (readOnly) {
      return <div className="mt-1 text-xs text-secondary italic">↳ {value}</div>;
    }
    return (
      <button
        type="button"
        onClick={onRequestEdit}
        className="mt-1 block text-left text-xs text-secondary italic hover:text-primary transition-colors"
      >
        ↳ {value}
      </button>
    );
  }

  if (readOnly) return null;

  return (
    <button
      type="button"
      onClick={onRequestEdit}
      className="mt-1 block text-left text-[11px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity"
    >
      + note
    </button>
  );
}
