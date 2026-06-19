"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return [];
    const assignedIds = new Set(tags.map((t) => t.id));
    return allTags
      .filter((t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [inputValue, allTags, tags]);

  // Reset the highlighted suggestion whenever the candidate list changes
  // (e.g. as the user types), so a stale index from a previous keystroke
  // doesn't linger.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

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
    if (addPending) return;

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
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const highlighted = suggestions[highlightedIndex];
      handleAdd(highlighted ? highlighted.name : inputValue);
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
              className="flex items-center justify-center disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add tag"
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-theme text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <Plus className="w-2.5 h-2.5" />
            tag
          </button>
        )}

        {adding && (
          <div className="relative" ref={wrapperRef}>
            <input
              type="text"
              autoFocus
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-autocomplete="list"
              aria-controls="tag-suggestions-listbox"
              value={inputValue}
              disabled={addPending}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={(e) => {
                // Only collapse if focus is moving outside this wrapper
                // (i.e. not to one of the suggestion buttons below).
                if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) {
                  setAdding(false);
                  setInputValue("");
                }
              }}
              placeholder="Tag name…"
              className="text-[10px] font-medium rounded-full border border-theme px-2 py-0.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 w-24"
            />

            {suggestions.length > 0 && (
              <div
                id="tag-suggestions-listbox"
                role="listbox"
                className="absolute left-0 top-full mt-1 z-10 min-w-full rounded-md border border-theme bg-panel shadow-lg overflow-hidden"
              >
                {suggestions.map((tag, index) => (
                  <button
                    key={tag.id}
                    type="button"
                    role="option"
                    aria-selected={index === highlightedIndex}
                    disabled={addPending}
                    onClick={() => handleAdd(tag.name)}
                    className={`block w-full text-left px-2 py-1 text-[10px] text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      index === highlightedIndex ? "bg-slate-200 dark:bg-slate-700" : ""
                    }`}
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
