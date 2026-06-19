"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Tag } from "@/lib/brain-types";

interface RequestTagEditorProps {
  requestId: number;
  tags: Tag[];
  allTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
}

const MAX_SUGGESTIONS = 6;

export function RequestTagEditor({ requestId, tags, allTags, onTagsChange }: RequestTagEditorProps) {
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  // Tracks which tag id currently has an in-flight DELETE, so we can disable
  // just that chip's remove button without blocking the rest of the row.
  const [removingTagId, setRemovingTagId] = useState<number | null>(null);
  const [addPending, setAddPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return [];
    const assignedIds = new Set(tags.map((t) => t.id));
    return allTags
      .filter((t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [inputValue, allTags, tags]);

  const handleRemove = async (tagId: number) => {
    setError(null);
    setRemovingTagId(tagId);

    try {
      const res = await fetch(`/api/requests/${requestId}/tags?tagId=${tagId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not update tags.");
        return;
      }

      onTagsChange(data);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setRemovingTagId(null);
    }
  };

  const handleAdd = async (tagName: string) => {
    const trimmed = tagName.trim();
    if (!trimmed) return;

    setError(null);
    setAddPending(true);

    try {
      const res = await fetch(`/api/requests/${requestId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not update tags.");
        return;
      }

      onTagsChange(data);
      setInputValue("");
      setAdding(false);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setAddPending(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd(inputValue);
    } else if (e.key === "Escape") {
      setAdding(false);
      setInputValue("");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-secondary-glass text-secondary"
          >
            {tag.name}
            <button
              type="button"
              onClick={() => handleRemove(tag.id)}
              disabled={removingTagId === tag.id}
              aria-label={`Remove tag ${tag.name}`}
              className="flex items-center justify-center disabled:opacity-60"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-theme text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
            tag
          </button>
        )}

        {adding && (
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={inputValue}
              disabled={addPending}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={() => {
                // Defer collapse so a click on a suggestion (which fires
                // before blur settles) still registers as an add.
                window.setTimeout(() => {
                  setAdding(false);
                  setInputValue("");
                }, 150);
              }}
              placeholder="Tag name…"
              className="text-[10px] font-medium rounded-full border border-theme px-2 py-0.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 w-24"
            />

            {suggestions.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-10 min-w-full rounded-md border border-theme bg-panel shadow-lg overflow-hidden">
                {suggestions.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    disabled={addPending}
                    onMouseDown={(e) => {
                      // Use onMouseDown instead of onClick so this fires
                      // before the input's onBlur collapses the editor.
                      e.preventDefault();
                      handleAdd(tag.name);
                    }}
                    className="block w-full text-left px-2 py-1 text-[10px] text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
