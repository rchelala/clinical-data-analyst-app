"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { UserCircle2, RefreshCw, Check, UserPlus, Loader2, Users } from "lucide-react";
import { Analyst } from "@/lib/brain-types";
import { loadAnalystId, saveAnalystId, clearAnalystId } from "@/lib/analyst-identity";
import { fetchAnalysts, invalidateReferenceData } from "@/lib/reference-data";
import { ManageRosterModal } from "@/components/brain/ManageRosterModal";

interface AnalystSelectorProps {
  onSelect: (analystId: number, analystName: string, isManualSwitch: boolean) => void;
  // Fired when the roster itself changes (someone added, renamed, retired or
  // brought back). Callers that cache analyst-derived data — the Galaxy
  // summaries, for one — need to invalidate it.
  onRosterChanged?: () => void;
}

const MENU_WIDTH = 256; // matches w-64

export function AnalystSelector({ onSelect, onRosterChanged }: AnalystSelectorProps) {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Dropdown is shown either because no analyst id was stored yet, or because
  // the user deliberately clicked the current-analyst button to re-open it.
  const [open, setOpen] = useState(false);
  const [selectedAnalyst, setSelectedAnalyst] = useState<Analyst | null>(null);
  // Set when a stored id no longer matches anyone on the roster — they were
  // retired, or the row is gone. The id is cleared, so the app falls back to
  // its existing "no identity yet" paths instead of running unnamed.
  const [identityLost, setIdentityLost] = useState(false);
  // Inline "add analyst" form state.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  // Fixed-position coordinates for the portalled menu, measured from the trigger.
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Read by the document-level Escape handler, which is registered once and so
  // can't see `adding` directly.
  const addingRef = useRef(false);
  addingRef.current = adding;

  useEffect(() => setMounted(true), []);

  const loadAnalysts = useCallback(async (): Promise<Analyst[] | null> => {
    try {
      const data = await fetchAnalysts();
      setAnalysts(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — could not reach the server.");
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const data = await loadAnalysts();
      if (cancelled || data === null) {
        if (!cancelled) setLoading(false);
        return;
      }

      const storedId = loadAnalystId();
      if (storedId === null) {
        setOpen(true);
      } else {
        const stored = data.find((a) => a.id === storedId);
        if (stored) {
          setSelectedAnalyst(stored);
          onSelect(storedId, stored.name, false);
        } else {
          // Don't activate an identity we can't name — that would run the app
          // with a blank analyst name (and feed it into the weekly update).
          clearAnalystId();
          setIdentityLost(true);
          setOpen(true);
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position the portalled menu relative to the trigger, right-aligned, flipping
  // upward when there isn't room below in the viewport.
  const positionMenu = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 340;
    const openUp = window.innerHeight - rect.bottom < menuHeight;
    setPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(8, rect.right - MENU_WIDTH),
      openUp,
    });
  }, []);

  // While open: keep the menu positioned on scroll/resize and close on outside
  // click / Escape.
  useEffect(() => {
    if (!open) return;
    positionMenu();
    const onReflow = () => positionMenu();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape while naming someone cancels the add, not the whole menu —
      // otherwise a half-typed name vanishes with no way back.
      if (addingRef.current) {
        setAdding(false);
        setAddError(null);
        return;
      }
      setOpen(false);
    };
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, positionMenu]);

  // The menu grows when the add form opens, and when it opens upward it's
  // anchored by its own height — so re-measure rather than leaving it to run
  // off the top of the viewport.
  useEffect(() => {
    if (open) positionMenu();
  }, [open, adding, addError, analysts.length, positionMenu]);

  // Don't leave a half-filled form armed for the next time the menu opens.
  useEffect(() => {
    if (!open) {
      setAdding(false);
      setNewName("");
      setAddError(null);
    }
  }, [open]);

  const handlePick = useCallback(
    (analyst: Analyst) => {
      saveAnalystId(analyst.id);
      setOpen(false);
      setIdentityLost(false);
      setSelectedAnalyst(analyst);
      onSelect(analyst.id, analyst.name, true);
    },
    [onSelect]
  );

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAddError(null);

      const name = newName.trim();
      if (!name) {
        setAddError("Name is required.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/analysts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();

        if (!res.ok) {
          setAddError(data.error ?? "Could not add analyst.");
          return;
        }

        const created = data as Analyst;
        setAnalysts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        invalidateReferenceData("analysts");
        onRosterChanged?.();
        // Selecting them closes the menu; the trigger now reads their name,
        // which is the confirmation.
        handlePick(created);
      } catch {
        setAddError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [newName, handlePick, onRosterChanged]
  );

  // A rename or retirement in the roster modal can change the name we're
  // showing (and the one already handed to the page), so re-read the roster.
  const handleRosterClose = useCallback(
    async (changed: boolean) => {
      setShowRoster(false);
      if (!changed) return;

      // Clear the shared cache before reloading, or loadAnalysts() just
      // returns the pre-rename list.
      invalidateReferenceData("analysts");
      onRosterChanged?.();

      const data = await loadAnalysts();
      if (data === null) return;

      const storedId = loadAnalystId();
      if (storedId === null) return;

      const stored = data.find((a) => a.id === storedId);
      if (stored) {
        setSelectedAnalyst(stored);
        onSelect(stored.id, stored.name, false);
      } else {
        clearAnalystId();
        setSelectedAnalyst(null);
        setIdentityLost(true);
        setOpen(true);
      }
    },
    [loadAnalysts, onSelect, onRosterChanged]
  );

  return (
    <>
      {/* Shows the current analyst's name; clicking re-opens the selector. */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        title="Switch analyst"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
      >
        {selectedAnalyst ? (
          <UserCircle2 className="w-3 h-3" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        {selectedAnalyst ? selectedAnalyst.name : "Select analyst"}
      </button>

      {open && mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: MENU_WIDTH,
              transform: pos.openUp ? "translateY(-100%)" : "none",
              zIndex: 80,
            }}
            className="rounded-xl border border-theme bg-elevated shadow-panel overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-theme">
              <p className="text-xs font-semibold text-primary leading-none">Switch analyst</p>
              <p className="text-[11px] text-secondary mt-1">
                {identityLost
                  ? "Your saved name isn't on the roster anymore. Pick who you are."
                  : "Pick your analyst identity."}
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-1">
              {loading && <p className="text-sm text-secondary px-2 py-1.5">Loading analysts…</p>}

              {error && <p className="text-sm text-red-400 px-2 py-1.5">{error}</p>}

              {!loading && !error && analysts.length === 0 && (
                <p className="text-sm text-secondary px-2 py-1.5">No analysts found.</p>
              )}

              {!loading && !error && analysts.map((analyst) => {
                const isSelected = selectedAnalyst?.id === analyst.id;
                return (
                  <button
                    key={analyst.id}
                    onClick={() => handlePick(analyst)}
                    className={`flex items-center gap-2 px-2.5 py-2 text-sm font-medium rounded-md text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      isSelected ? "bg-brand-500/12 text-primary" : "text-primary hover:bg-panel/80"
                    }`}
                  >
                    <UserCircle2 className="w-4 h-4 text-secondary flex-shrink-0" />
                    {analyst.name}
                    {isSelected && <Check className="w-3.5 h-3.5 text-brand-400 ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Pinned below the scroll area so a new teammate can always reach
                it, including when the roster failed to load or is empty. */}
            <div className="border-t border-theme p-1.5 flex flex-col gap-1">
              {adding ? (
                <form onSubmit={handleAdd} className="flex flex-col gap-1.5 px-1 py-0.5">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="First name"
                    autoFocus
                    aria-label="New analyst name"
                    className="text-sm rounded-md border border-theme px-2.5 py-1.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {addError && <p className="text-[11px] text-red-400">{addError}</p>}
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setAddError(null);
                      }}
                      disabled={submitting}
                      className="px-2 py-1 text-[11px] font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary transition-colors disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
                    >
                      {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                      {submitting ? "Adding…" : "Add"}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setNewName("");
                    setAddError(null);
                    setAdding(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-2 text-sm font-medium rounded-md text-left text-primary hover:bg-panel/80 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <UserPlus className="w-4 h-4 text-secondary flex-shrink-0" />
                  Add analyst
                </button>
              )}

              <button
                onClick={() => {
                  // Close first: this menu is z-80 and the modal is z-50.
                  setOpen(false);
                  setShowRoster(true);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded-md text-left text-secondary hover:text-primary hover:bg-panel/80 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                Manage roster
              </button>
            </div>
          </div>,
          document.body
        )}

      {showRoster && <ManageRosterModal onClose={handleRosterClose} />}
    </>
  );
}
