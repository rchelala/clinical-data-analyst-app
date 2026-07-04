"use client";

interface EditableCellProps {
  value: string | null;
  placeholder?: string;
  onSave: (value: string) => void;
}

// Inline-editable cell: shows current value as plain text, becomes
// contentEditable on focus, saves on blur. Matches the mockup's
// .edit-cell affordance.
export function EditableCell({ value, placeholder, onSave }: EditableCellProps) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onSave(e.currentTarget.innerText.trim())}
      data-placeholder={placeholder}
      className="text-xs text-secondary outline-none rounded-md px-1.5 py-1 border border-transparent hover:border-theme hover:bg-panel focus:border-brand-500 focus:bg-panel focus:text-primary transition-colors min-h-[1.4em] min-w-[40px] empty:before:content-[attr(data-placeholder)] empty:before:text-secondary/50"
    >
      {value ?? ""}
    </div>
  );
}
