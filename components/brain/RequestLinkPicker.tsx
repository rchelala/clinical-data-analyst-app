"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { RelatedRequestSummary, RequestStatus } from "@/lib/brain-types";

interface RequestLinkPickerProps {
  requestId: number;
  relatedRequests: RelatedRequestSummary[];
  onRelatedRequestsChange: (relatedRequests: RelatedRequestSummary[]) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_LABELS: Record<RequestStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export function RequestLinkPicker({
  requestId,
  relatedRequests,
  onRelatedRequestsChange,
}: RequestLinkPickerProps) {
  const [linking, setLinking] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState<RelatedRequestSummary[]>([]);
  const [searching, setSearching] = useState(false);
  // Tracks which related-request id currently has an in-flight DELETE, so we
  // can disable just that row's unlink button without blocking the rest.
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [addPending, setAddPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Bumped on every search kicked off; only the response matching the latest
  // sequence number is applied, so a slow earlier response can't clobber a
  // later, faster one. We use a sequence counter rather than AbortController
  // because cancellation isn't required for correctness here — stale
  // responses are simply ignored, not aborted — which keeps the
  // try/catch/finally shape simple without needing to filter out
  // AbortError in the catch block.
  const searchSeqRef = useRef(0);
  // Mirrors the relatedRequests prop so the debounced search effect below
  // can read the latest value without depending on it (see effect comment).
  const relatedRequestsRef = useRef(relatedRequests);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  useEffect(() => {
    relatedRequestsRef.current = relatedRequests;
  }, [relatedRequests]);

  useEffect(() => {
    if (!linking) return;

    const query = inputValue.trim();
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }

    const seq = ++searchSeqRef.current;
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/requests/search?q=${encodeURIComponent(query)}&excludeId=${requestId}`
        );
        const data = await res.json();

        if (seq !== searchSeqRef.current) return; // superseded by a newer search

        if (!res.ok) {
          setError(data.error ?? "Could not update related requests.");
          setResults([]);
          return;
        }

        const relatedIds = new Set(relatedRequestsRef.current.map((r) => r.id));
        setResults((data as RelatedRequestSummary[]).filter((r) => !relatedIds.has(r.id)));
      } catch {
        if (seq !== searchSeqRef.current) return;
        setError("Network error — could not reach the server.");
        setResults([]);
      } finally {
        if (seq === searchSeqRef.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // relatedRequests is intentionally excluded: this effect only reads it
    // (via the ref above) to filter results, it doesn't need to re-trigger
    // the debounce/fetch when it changes for reasons unrelated to typing.
  }, [inputValue, linking, requestId]);

  const handleUnlink = async (relatedRequestId: number) => {
    setError(null);
    setRemovingId(relatedRequestId);

    try {
      const res = await fetch(
        `/api/requests/${requestId}/links?relatedRequestId=${relatedRequestId}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not update related requests.");
        return;
      }

      onRelatedRequestsChange(data);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleLink = async (relatedRequestId: number) => {
    if (addPending) return;

    setError(null);
    setAddPending(true);

    try {
      const res = await fetch(`/api/requests/${requestId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedRequestId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not update related requests.");
        return;
      }

      onRelatedRequestsChange(data);
      setInputValue("");
      setResults([]);
      setLinking(false);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setAddPending(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      setHighlightedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const highlighted = results[highlightedIndex];
      if (highlighted) handleLink(highlighted.id);
    } else if (e.key === "Escape") {
      setLinking(false);
      setInputValue("");
      setResults([]);
    }
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">
        Related
      </p>

      <div className="flex flex-col gap-1">
        {relatedRequests.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-secondary-glass"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-primary truncate">{item.title}</span>
              <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full border border-theme text-secondary">
                {STATUS_LABELS[item.status]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleUnlink(item.id)}
              disabled={removingId === item.id}
              aria-label={`Unlink request ${item.title}`}
              className="flex items-center justify-center flex-shrink-0 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <X className="w-3 h-3 text-secondary hover:text-primary" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-1.5">
        {!linking && (
          <button
            type="button"
            onClick={() => setLinking(true)}
            aria-label="Link request"
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-theme text-secondary hover:text-primary hover:bg-panel/80 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <Plus className="w-2.5 h-2.5" />
            link request
          </button>
        )}

        {linking && (
          <div className="relative" ref={wrapperRef}>
            <input
              type="text"
              autoFocus
              role="combobox"
              aria-expanded={results.length > 0}
              aria-autocomplete="list"
              aria-controls="related-request-listbox"
              aria-activedescendant={
                highlightedIndex >= 0 ? `related-request-option-${results[highlightedIndex]?.id}` : undefined
              }
              value={inputValue}
              disabled={addPending}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={(e) => {
                // Only collapse if focus is moving outside this wrapper
                // (i.e. not to one of the result buttons below).
                if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) {
                  setLinking(false);
                  setInputValue("");
                  setResults([]);
                }
              }}
              placeholder="Search requests…"
              className="text-[10px] font-medium rounded-full border border-theme px-2 py-0.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 w-40"
            />

            {results.length > 0 && (
              <div
                id="related-request-listbox"
                role="listbox"
                className="absolute left-0 top-full mt-1 z-10 min-w-full rounded-md border border-theme bg-elevated shadow-panel overflow-hidden"
              >
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    id={`related-request-option-${result.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === highlightedIndex}
                    disabled={addPending}
                    onClick={() => handleLink(result.id)}
                    className={`block w-full text-left px-2 py-1 text-[10px] disabled:opacity-60 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-500 hover:bg-panel/80 transition-colors ${
                      index === highlightedIndex ? "bg-panel/80" : ""
                    }`}
                  >
                    <span className="block text-secondary hover:text-primary truncate">{result.title}</span>
                    {result.contextName && (
                      <span className="block text-secondary/70 truncate">{result.contextName}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searching && results.length === 0 && (
              <p className="absolute left-0 top-full mt-1 text-[10px] text-secondary">Searching…</p>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
