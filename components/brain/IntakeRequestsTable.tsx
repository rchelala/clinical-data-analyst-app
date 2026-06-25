// Plain HTML table rendering the Unassigned intake backlog
// (app/brain/unassigned/page.tsx). Extracted out of the page so Task 4's
// inline row-edit controls have an isolated place to land instead of
// growing inside the page component.

import { ExternalLink } from "lucide-react";
import { IntakeRequestWithNames, IntakeStatus } from "@/lib/brain-types";

const STATUS_LABELS: Record<IntakeStatus, string> = {
  not_started: "Not started",
  discovery: "Discovery",
  ready: "Ready",
  in_progress: "In progress",
  on_hold: "On hold",
  fulfilled: "Fulfilled",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

interface IntakeRequestsTableProps {
  requests: IntakeRequestWithNames[];
}

export function IntakeRequestsTable({ requests }: IntakeRequestsTableProps) {
  return (
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
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => (
          <tr
            key={r.id}
            className="border-b border-theme hover:bg-slate-200/40 dark:hover:bg-slate-700/30 transition-colors"
          >
            <td className="px-3 py-2 text-primary capitalize">{r.priority}</td>
            <td className="px-3 py-2 text-primary whitespace-nowrap">
              {formatDate(r.dateReceived)}
            </td>
            <td className="px-3 py-2 text-primary">{r.divisionName ?? "—"}</td>
            <td className="px-3 py-2 text-primary">{r.topic}</td>
            <td className="px-3 py-2 text-primary">{r.stakeholder ?? "—"}</td>
            <td className="px-3 py-2 text-primary">{r.analystName ?? "—"}</td>
            <td className="px-3 py-2 text-primary capitalize">{r.requestedKind ?? "—"}</td>
            <td className="px-3 py-2 text-primary">{STATUS_LABELS[r.status]}</td>
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
