"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import { Dashboard, Division, DashboardWithUrgency } from "@/lib/brain-types";

interface AddWorklistDashboardProps {
  currentAnalystId: number;
  existingWorklistDashboardIds: number[];
  onAdded: () => void;
  onCancel: () => void;
}

type Mode = "mine" | "all" | "new";

export function AddWorklistDashboard({
  currentAnalystId,
  existingWorklistDashboardIds,
  onAdded,
  onCancel,
}: AddWorklistDashboardProps) {
  const [mode, setMode] = useState<Mode>("mine");
  const [myDashboards, setMyDashboards] = useState<DashboardWithUrgency[]>([]);
  const [allDashboards, setAllDashboards] = useState<DashboardWithUrgency[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  // "+ New" form state
  const [newName, setNewName] = useState("");
  const [newDivisionId, setNewDivisionId] = useState<number | "">("");
  const [newStakeholder, setNewStakeholder] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [mineRes, allRes, divisionsRes] = await Promise.all([
          fetch("/api/dashboards", { headers: { "x-analyst-id": String(currentAnalystId) } }),
          fetch("/api/dashboards"),
          fetch("/api/divisions"),
        ]);
        const [mineData, allData, divisionsData] = await Promise.all([
          mineRes.json(),
          allRes.json(),
          divisionsRes.json(),
        ]);
        if (cancelled) return;

        if (!mineRes.ok) {
          setError(mineData.error ?? "Could not load your dashboards.");
          return;
        }
        if (!allRes.ok) {
          setError(allData.error ?? "Could not load dashboards.");
          return;
        }
        if (!divisionsRes.ok) {
          setError(divisionsData.error ?? "Could not load divisions.");
          return;
        }

        setMyDashboards(mineData);
        setAllDashboards(allData);
        setDivisions(divisionsData);
      } catch {
        if (!cancelled) setError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAnalystId]);

  const excludeSet = useMemo(() => new Set(existingWorklistDashboardIds), [existingWorklistDashboardIds]);

  const myCandidates = useMemo(
    () => myDashboards.filter((d) => !excludeSet.has(d.id)),
    [myDashboards, excludeSet]
  );

  const allCandidates = useMemo(
    () => allDashboards.filter((d) => !excludeSet.has(d.id)),
    [allDashboards, excludeSet]
  );

  const handleAddExisting = useCallback(
    async (dashboard: Dashboard) => {
      setError(null);
      setSubmittingId(dashboard.id);
      try {
        const res = await fetch("/api/worklist-dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analystId: currentAnalystId, dashboardId: dashboard.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not add dashboard to worklist.");
          return;
        }
        onAdded();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmittingId(null);
      }
    },
    [currentAnalystId, onAdded]
  );

  const handleCreateNew = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!newName.trim()) {
        setError("Name is required.");
        return;
      }
      if (newDivisionId === "") {
        setError("Division is required.");
        return;
      }

      setCreatingNew(true);
      try {
        const createRes = await fetch("/api/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName.trim(),
            divisionId: newDivisionId,
            analystId: currentAnalystId,
            stakeholder: newStakeholder.trim() ? newStakeholder.trim() : undefined,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          setError(createData.error ?? "Could not create dashboard.");
          return;
        }

        const addRes = await fetch("/api/worklist-dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analystId: currentAnalystId, dashboardId: createData.id }),
        });
        const addData = await addRes.json();
        if (!addRes.ok) {
          setError(addData.error ?? "Dashboard created, but could not add it to your worklist.");
          return;
        }

        onAdded();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setCreatingNew(false);
      }
    },
    [newName, newDivisionId, newStakeholder, currentAnalystId, onAdded]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg mx-4 rounded-lg border border-theme bg-panel shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <LayoutDashboard className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">Add dashboard to worklist</h2>
            <p className="text-xs text-secondary mt-0.5">
              Pick one of your dashboards, cover for another analyst, or create a new one.
            </p>
          </div>
        </div>

        <div className="px-5 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("mine")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              mode === "mine"
                ? "bg-brand-600 border-brand-600 text-white"
                : "border-theme text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Mine
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              mode === "all"
                ? "bg-brand-600 border-brand-600 text-white"
                : "border-theme text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Show all dashboards
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              mode === "new"
                ? "bg-brand-600 border-brand-600 text-white"
                : "border-theme text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            ＋ New
          </button>
        </div>

        <div className="px-5 py-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

          {mode !== "new" && (
            <>
              {loading && <p className="text-sm text-secondary">Loading dashboards…</p>}

              {!loading && mode === "mine" && myCandidates.length === 0 && (
                <p className="text-sm text-secondary">
                  All your dashboards are already on your worklist.
                </p>
              )}

              {!loading && mode === "all" && allCandidates.length === 0 && (
                <p className="text-sm text-secondary">No dashboards available.</p>
              )}

              {!loading && (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  {(mode === "mine" ? myCandidates : allCandidates).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleAddExisting(d)}
                      disabled={submittingId === d.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-md border border-theme text-primary hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors disabled:opacity-60 text-left"
                    >
                      <span className="truncate">{d.name}</span>
                      <span className="text-xs text-secondary flex-shrink-0">
                        {submittingId === d.id ? "Adding…" : "+ Add"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === "new" && (
            <form onSubmit={handleCreateNew} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="newDashName" className="text-xs font-medium text-secondary">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="newDashName"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="newDashDivision" className="text-xs font-medium text-secondary">
                  Division <span className="text-red-500">*</span>
                </label>
                <select
                  id="newDashDivision"
                  value={newDivisionId}
                  onChange={(e) => setNewDivisionId(e.target.value ? Number(e.target.value) : "")}
                  required
                  className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
                >
                  <option value="">Select a division…</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="newDashStakeholder" className="text-xs font-medium text-secondary">
                  Stakeholder
                </label>
                <input
                  id="newDashStakeholder"
                  type="text"
                  value={newStakeholder}
                  onChange={(e) => setNewStakeholder(e.target.value)}
                  className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={creatingNew}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingNew}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
                >
                  {creatingNew ? "Creating…" : "Create & add"}
                </button>
              </div>
            </form>
          )}

          {mode !== "new" && (
            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
