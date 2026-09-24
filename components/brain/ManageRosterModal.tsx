"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, Loader2, Pencil, UserMinus, UserPlus, Check, X } from "lucide-react";
import { Analyst } from "@/lib/brain-types";
import { loadAnalystId } from "@/lib/analyst-identity";

interface ManageRosterModalProps {
  // Fires on close, reporting whether anything changed so the caller can
  // refresh analyst names it already has in hand.
  onClose: (changed: boolean) => void;
}

// Rename / retire / un-retire. Lives here rather than in the analyst dropdown
// because that menu is 256px wide and, more to the point, only ever lists
// active analysts — so a retired teammate could never be brought back from it.
type RowMode = { id: number; mode: "rename" | "confirmRetire" } | null;

export function ManageRosterModal({ onClose }: ManageRosterModalProps) {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowMode, setRowMode] = useState<RowMode>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  // Nobody should be able to retire the identity this browser is using.
  const [myAnalystId] = useState<number | null>(() => loadAnalystId());

  // This modal is rendered from AnalystSelector, which sits inside a header
  // carrying `backdrop-filter`. That makes the header a containing block for
  // fixed-position descendants AND its own stacking context, so a plain
  // `fixed inset-0` panel would be sized to the header strip and painted
  // beneath the page canvas — invisible backdrop, unclickable rows. Portal to
  // document.body, same as the selector menu does.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Deliberately not lib/reference-data's cached helper: this modal edits
        // the roster, so it must see the current rows, not a cached list.
        const res = await fetch("/api/analysts?includeInactive=1");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Could not load the roster.");
          return;
        }

        setAnalysts(data as Analyst[]);
      } catch {
        if (!cancelled) setError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Last writer wins if two people edit the same analyst at once (one retires
  // while another renames). Not worth locking for a team of this size.
  const patch = useCallback(
    async (analyst: Analyst, body: { name?: string; isActive?: boolean }, failure: string) => {
      setRowError(null);
      setSavingId(analyst.id);
      try {
        const res = await fetch(`/api/analysts/${analyst.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
          setRowError(data.error ?? failure);
          return;
        }

        const updated = data as Analyst;
        setAnalysts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setChanged(true);
        setRowMode(null);
      } catch {
        setRowError("Network error — could not reach the server.");
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const handleRename = useCallback(
    (analyst: Analyst) => {
      const name = renameValue.trim();
      if (!name) {
        setRowError("Name is required.");
        return;
      }
      if (name === analyst.name) {
        setRowMode(null);
        return;
      }
      patch(analyst, { name }, "Could not rename.");
    },
    [renameValue, patch]
  );

  const startRename = useCallback((analyst: Analyst) => {
    setRowError(null);
    setRenameValue(analyst.name);
    setRowMode({ id: analyst.id, mode: "rename" });
  }, []);

  const close = useCallback(() => onClose(changed), [onClose, changed]);

  // Escape closes the modal, except while a row is mid-rename or armed for
  // retire — there it backs out of that row first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (rowMode !== null) {
        setRowMode(null);
        return;
      }
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rowMode, close]);

  const activeAnalysts = analysts.filter((a) => a.isActive);
  const retiredAnalysts = analysts.filter((a) => !a.isActive);

  const renderRow = (analyst: Analyst) => {
    const isRenaming = rowMode?.id === analyst.id && rowMode.mode === "rename";
    const isConfirming = rowMode?.id === analyst.id && rowMode.mode === "confirmRetire";
    const busy = savingId === analyst.id;

    if (isConfirming) {
      return (
        <div key={analyst.id} className="flex flex-col gap-2 px-3 py-2.5 rounded-md bg-red-500/10">
          <p className="text-xs text-primary">
            Retire {analyst.name}? They will stop appearing in pickers. Their tasks and
            dashboards stay.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setRowMode(null)}
              disabled={busy}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => patch(analyst, { isActive: false }, "Could not retire.")}
              disabled={busy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Retire
            </button>
          </div>
        </div>
      );
    }

    if (isRenaming) {
      return (
        <div key={analyst.id} className="flex items-center gap-2 px-3 py-2">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRename(analyst);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setRowMode(null);
              }
            }}
            autoFocus
            aria-label={`New name for ${analyst.name}`}
            className="flex-1 min-w-0 text-sm rounded-md border border-theme px-2.5 py-1.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={() => handleRename(analyst)}
            disabled={busy}
            title="Save name"
            className="p-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setRowMode(null)}
            disabled={busy}
            title="Cancel rename"
            className="p-1.5 rounded-md border border-theme bg-panel text-secondary hover:text-primary transition-colors disabled:opacity-60"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div key={analyst.id} className="flex items-center gap-2 px-3 py-2">
        <span
          className={`flex-1 min-w-0 truncate text-sm ${
            analyst.isActive ? "text-primary" : "text-secondary"
          }`}
        >
          {analyst.name}
          {analyst.id === myAnalystId && (
            <span className="text-[11px] text-secondary ml-1.5">(you)</span>
          )}
        </span>

        <button
          type="button"
          onClick={() => startRename(analyst)}
          title={`Rename ${analyst.name}`}
          className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-panel transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {!analyst.isActive ? (
          <button
            type="button"
            onClick={() => patch(analyst, { isActive: true }, "Could not bring them back.")}
            disabled={busy}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary transition-colors disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <UserPlus className="w-3 h-3" />
            )}
            Un-retire
          </button>
        ) : (
          analyst.id !== myAnalystId && (
            <button
              type="button"
              onClick={() => {
                setRowError(null);
                setRowMode({ id: analyst.id, mode: "confirmRetire" });
              }}
              title={`Retire ${analyst.name}`}
              className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-panel transition-colors"
            >
              <UserMinus className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>
    );
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        // Only a press that starts on the backdrop itself closes, so dragging
        // a text selection out of the rename input doesn't dismiss the modal.
        if (!panelRef.current?.contains(e.target as Node)) close();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md mx-4 rounded-xl border border-theme bg-elevated shadow-panel"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <Users className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">Manage roster</h2>
            <p className="text-xs text-secondary mt-0.5">
              Retiring hides someone from pickers. Past work is untouched.
            </p>
          </div>
        </div>

        <div className="px-2 py-3 max-h-96 overflow-y-auto flex flex-col gap-0.5">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-secondary px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading roster…
            </p>
          )}

          {error && <p className="text-sm text-red-400 px-3 py-2">{error}</p>}

          {!loading && !error && analysts.length === 0 && (
            <p className="text-sm text-secondary px-3 py-2">No analysts yet.</p>
          )}

          {activeAnalysts.map(renderRow)}

          {retiredAnalysts.length > 0 && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary px-3 pt-3 pb-1">
              Retired
            </p>
          )}
          {retiredAnalysts.map(renderRow)}

          {rowError && <p className="text-sm text-red-400 px-3 py-2">{rowError}</p>}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-theme">
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
