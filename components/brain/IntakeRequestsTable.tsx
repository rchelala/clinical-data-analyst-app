// Table rendering the Unassigned intake backlog
// (app/brain/unassigned/page.tsx). Status/priority/analyst/division are
// rendered as live <select> dropdowns — the dropdown IS the editor, no
// separate edit-mode toggle. Each onChange optimistically updates local
// row state, fires the page-owned PATCH via onFieldChange, and reverts the
// row (plus shows a small inline error) if the PATCH fails. The table owns
// only this per-row optimistic-update bookkeeping; the actual fetch/PATCH
// logic lives in the page component (mirrors the AddEntityForm split: the
// form fires the request and reports success/failure, the page decides
// what to do about it).

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Analyst,
  BrainEntityKind,
  Division,
  IntakePriority,
  IntakeRequestWithNames,
  IntakeStatus,
} from "@/lib/brain-types";

const STATUS_LABELS: Record<IntakeStatus, string> = {
  not_started: "Not started",
  discovery: "Discovery",
  ready: "Ready",
  in_progress: "In progress",
  on_hold: "On hold",
  fulfilled: "Fulfilled",
};

// 'fulfilled' is deliberately excluded — it must only be set via the
// Convert flow (which also sets fulfilled_entity_kind/fulfilled_entity_id
// together), never via a direct inline PATCH from this dropdown.
const STATUS_OPTIONS: IntakeStatus[] = [
  "not_started",
  "discovery",
  "ready",
  "in_progress",
  "on_hold",
];

const PRIORITY_OPTIONS: IntakePriority[] = ["low", "medium", "high"];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

type InlineField = "priority" | "divisionId" | "analystId" | "status";

interface IntakeRequestsTableProps {
  requests: IntakeRequestWithNames[];
  divisions: Division[];
  analysts: Analyst[];
  onFieldChange: (
    id: number,
    field: InlineField,
    value: string | number | null
  ) => Promise<void>;
  // Fired when the user clicks a "Convert to…" action. The page owns
  // opening AddEntityForm pre-filled from `request` and, on success,
  // calling POST /api/intake-requests/[id]/convert — this table only emits
  // the intent, mirroring the onFieldChange split above.
  onConvert: (request: IntakeRequestWithNames, kind: BrainEntityKind) => void;
}

export function IntakeRequestsTable({
  requests,
  divisions,
  analysts,
  onFieldChange,
  onConvert,
}: IntakeRequestsTableProps) {
  // Local optimistic overrides, keyed by `${id}:${field}`, so edits render
  // immediately without waiting on the page's refetch. Cleared per-key on
  // success, once the page has patched `requests` with the real value, and
  // reverted to the prior value on PATCH failure.
  const [overrides, setOverrides] = useState<Record<string, string | number | null>>({});
  // Errors are keyed the same way as overrides (`${id}:${field}`) so each
  // error renders under the specific cell that failed, not always Status.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const keyFor = (id: number, field: InlineField) => `${id}:${field}`;

  const valueFor = (
    r: IntakeRequestWithNames,
    field: InlineField,
    actual: string | number | null
  ) => {
    const k = keyFor(r.id, field);
    return k in overrides ? overrides[k] : actual;
  };

  const handleChange = async (
    r: IntakeRequestWithNames,
    field: InlineField,
    rawValue: string
  ) => {
    const k = keyFor(r.id, field);
    const previous: string | number | null =
      field === "divisionId" || field === "analystId"
        ? (r[field] as number | null)
        : (r[field] as string);

    const nextValue: string | number | null =
      field === "divisionId" || field === "analystId"
        ? (rawValue === "" ? null : Number(rawValue))
        : rawValue;

    setOverrides((prev) => ({ ...prev, [k]: nextValue }));
    setRowErrors((prev) => {
      const { [k]: _omit, ...rest } = prev;
      return rest;
    });

    try {
      await onFieldChange(r.id, field, nextValue);
      // Success: drop the override so the page's patched `requests` value
      // (set synchronously by the same onFieldChange call) takes over.
      setOverrides((prev) => {
        const { [k]: _omit, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      // Revert to the prior value and surface a brief inline error under
      // the specific field that failed.
      setOverrides((prev) => ({ ...prev, [k]: previous }));
      setRowErrors((prev) => ({
        ...prev,
        [k]: err instanceof Error ? err.message : "Update failed.",
      }));
    }
  };

  return (
    <div className="rounded-xl border border-theme bg-panel shadow-panel overflow-hidden">
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-theme text-left">
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Priority
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Date Received
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Division
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Topic
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Stakeholder
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Analyst
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Requested Kind
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Status
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Ticket Link
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Internal Comments
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Created Date
          </th>
          <th className="px-3 py-2 font-semibold text-secondary uppercase tracking-wide text-[10px]">
            Convert
          </th>
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => {
          const priorityValue = valueFor(r, "priority", r.priority) as IntakePriority;
          const divisionValue = valueFor(r, "divisionId", r.divisionId) as number | null;
          const analystValue = valueFor(r, "analystId", r.analystId) as number | null;
          const statusValue = valueFor(r, "status", r.status) as IntakeStatus;
          const priorityError = rowErrors[keyFor(r.id, "priority")];
          const divisionError = rowErrors[keyFor(r.id, "divisionId")];
          const analystError = rowErrors[keyFor(r.id, "analystId")];
          const statusError = rowErrors[keyFor(r.id, "status")];

          return (
            <tr
              key={r.id}
              className="border-b border-theme hover:bg-panel/80 transition-colors align-top"
            >
              <td className="px-3 py-2 text-primary">
                <select
                  value={priorityValue}
                  onChange={(e) => handleChange(r, "priority", e.target.value)}
                  aria-label={`Priority for ${r.topic}`}
                  className="text-xs rounded-md border border-theme px-1.5 py-1 bg-panel text-primary capitalize focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} className="capitalize">
                      {opt}
                    </option>
                  ))}
                </select>
                {priorityError && (
                  <p className="text-[11px] text-red-400 mt-1">{priorityError}</p>
                )}
              </td>
              <td className="px-3 py-2 text-primary whitespace-nowrap">
                {formatDate(r.dateReceived)}
              </td>
              <td className="px-3 py-2 text-primary">
                <select
                  value={divisionValue ?? ""}
                  onChange={(e) => handleChange(r, "divisionId", e.target.value)}
                  aria-label={`Division for ${r.topic}`}
                  className="text-xs rounded-md border border-theme px-1.5 py-1 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  <option value="">—</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {divisionError && (
                  <p className="text-[11px] text-red-400 mt-1">{divisionError}</p>
                )}
              </td>
              <td className="px-3 py-2 text-primary">{r.topic}</td>
              <td className="px-3 py-2 text-primary">{r.stakeholder ?? "—"}</td>
              <td className="px-3 py-2 text-primary">
                <select
                  value={analystValue ?? ""}
                  onChange={(e) => handleChange(r, "analystId", e.target.value)}
                  aria-label={`Analyst for ${r.topic}`}
                  className="text-xs rounded-md border border-theme px-1.5 py-1 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {analysts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {analystError && (
                  <p className="text-[11px] text-red-400 mt-1">{analystError}</p>
                )}
              </td>
              <td className="px-3 py-2 text-primary capitalize">{r.requestedKind ?? "—"}</td>
              <td className="px-3 py-2 text-primary">
                {/* Fulfilled rows are read-only here — 'fulfilled' is reachable
                    only via the Convert flow, never via this dropdown, so a
                    row already in that state can't be edited back through it
                    either (the dropdown has no option to represent it). */}
                {statusValue === "fulfilled" ? (
                  STATUS_LABELS.fulfilled
                ) : (
                  <select
                    value={statusValue}
                    onChange={(e) => handleChange(r, "status", e.target.value)}
                    aria-label={`Status for ${r.topic}`}
                    className="text-xs rounded-md border border-theme px-1.5 py-1 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {STATUS_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                )}
                {statusError && (
                  <p className="text-[11px] text-red-400 mt-1">{statusError}</p>
                )}
              </td>
              <td className="px-3 py-2 text-primary">
                {r.ticketLink ? (
                  <a
                    href={r.ticketLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Ticket
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td
                className="px-3 py-2 text-primary max-w-xs truncate"
                title={r.internalComments ?? undefined}
              >
                {r.internalComments ?? "—"}
              </td>
              <td className="px-3 py-2 text-primary whitespace-nowrap">
                {formatDate(r.createdDate)}
              </td>
              <td className="px-3 py-2 text-primary whitespace-nowrap">
                {r.status === "fulfilled" ? (
                  "—"
                ) : r.requestedKind ? (
                  <button
                    type="button"
                    onClick={() => onConvert(r, r.requestedKind!)}
                    className="px-2 py-1 text-[11px] font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors capitalize"
                  >
                    Convert to {r.requestedKind}
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onConvert(r, "dashboard")}
                      className="px-2 py-1 text-[11px] font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
                    >
                      Dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => onConvert(r, "subscription")}
                      className="px-2 py-1 text-[11px] font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
                    >
                      Subscription
                    </button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
