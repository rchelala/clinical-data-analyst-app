"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, Loader2, ClipboardList, Paperclip, Trash2, Pencil } from "lucide-react";
import { BrainEntityKind, DashboardStatus, Division, RequestStatus, RequestWithCreator, Tag } from "@/lib/brain-types";
import { AttachFieldRequestForm } from "@/components/brain/AttachFieldRequestForm";
import { EditEntityForm } from "@/components/brain/EditEntityForm";
import { RequestTagEditor } from "./RequestTagEditor";
import { RequestLinkPicker } from "./RequestLinkPicker";

export interface RequestSidePanelEntity {
  kind: BrainEntityKind;
  id: number;
  name: string;
  stakeholder: string | null;
  status: DashboardStatus;
  jiraTicketId: string | null;
  divisionId: number;
}

interface RequestSidePanelProps {
  entity: RequestSidePanelEntity | null;
  currentAnalystId: number;
  focusRequestId?: number;
  divisions: Division[];
  onClose: () => void;
  onEntityUpdated: (newIdentity: { kind: BrainEntityKind; id: number }) => void;
  onEntityDeleted: () => void;
}

const STATUS_OPTIONS: RequestStatus[] = ["open", "in_progress", "done"];

const STATUS_LABELS: Record<RequestStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString();
}

// The attachment download route lives behind a private Blob store and
// requires an x-analyst-id header to authorize the request, so a plain
// <a href> navigation can't be used — we fetch the file as a Blob and
// trigger a save via a temporary object URL + synthetic <a download> click.
async function downloadAttachment(url: string, filename: string, analystId: number) {
  const res = await fetch(url, { headers: { "x-analyst-id": String(analystId) } });
  if (!res.ok) {
    throw new Error("Could not download attachment.");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export function RequestSidePanel({
  entity,
  currentAnalystId,
  focusRequestId,
  divisions,
  onClose,
  onEntityUpdated,
  onEntityDeleted,
}: RequestSidePanelProps) {
  const [requests, setRequests] = useState<RequestWithCreator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-request error message, keyed by request id, for failed status updates.
  const [statusErrors, setStatusErrors] = useState<Record<number, string>>({});
  // Tracks which request ids currently have an in-flight PATCH, so we can
  // disable that row's control without blocking the rest of the list.
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  // Per-request error message, keyed by request id, for failed attachment downloads.
  const [downloadErrors, setDownloadErrors] = useState<Record<number, string>>({});
  // Tracks which request ids currently have an in-flight attachment download,
  // so we can disable that row's button without blocking the rest of the list.
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  // Per-request error message, keyed by request id, for failed deletes.
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});
  // Tracks which request ids currently have an in-flight DELETE, so we can
  // disable that row's confirm/cancel buttons without blocking the rest of the list.
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  // Tracks which request ids are showing the inline "are you sure?" confirm
  // step (clicked the trash icon but haven't confirmed or cancelled yet).
  const [confirmingDeleteIds, setConfirmingDeleteIds] = useState<Set<number>>(new Set());
  const [attachFieldRequestOpen, setAttachFieldRequestOpen] = useState(false);
  // Bumping this re-runs the request-list fetch effect below, letting us
  // refresh the list after a field request is attached from this panel.
  const [refreshKey, setRefreshKey] = useState(0);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // Entity-level (dashboard/subscription) edit + delete state. Scoped to the
  // single entity shown in this panel instance, unlike the per-request state
  // above which tracks a Set across multiple requests in one list.
  const [entityEditOpen, setEntityEditOpen] = useState(false);
  const [entityConfirmingDelete, setEntityConfirmingDelete] = useState(false);
  const [entityDeleting, setEntityDeleting] = useState(false);
  const [entityDeleteError, setEntityDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!entity) return;
    const { kind, id } = entity;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setStatusErrors({});
    // Reset entity-level edit/delete UI state too — without this, switching
    // from one entity to another while a confirm/error state is showing
    // would leak that state onto the newly selected entity.
    setEntityEditOpen(false);
    setEntityConfirmingDelete(false);
    setEntityDeleteError(null);

    (async () => {
      try {
        const queryParam = kind === "dashboard" ? `dashboardId=${id}` : `subscriptionId=${id}`;
        const res = await fetch(`/api/requests?${queryParam}`);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Could not load requests.");
          return;
        }

        setRequests(data);
      } catch {
        if (!cancelled) setError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only refetch when the selected entity's kind+id changes, not when the
    // parent passes a structurally-identical-but-new entity object (e.g.
    // after a refreshKey-triggered parent refetch). Both kind and id must be
    // tracked so switching from dashboard #3 to subscription #3 refetches.
    // refreshKey is bumped after a field request is successfully attached,
    // so the list reflects the newly created request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.kind, entity?.id, refreshKey]);

  // Fetches the full tag list once the panel opens, for tag-autocomplete
  // suggestions in RequestTagEditor. Kept separate from the requests-fetch
  // effect above so a failure here (silently degrading to no suggestions)
  // can never block the request list from loading.
  useEffect(() => {
    if (!entity) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/tags");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) return;
        setAllTags(data);
      } catch {
        // Silently degrade — tag autocomplete just won't have suggestions.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entity?.kind, entity?.id]);

  useEffect(() => {
    if (!focusRequestId) return;
    const row = rowRefs.current[focusRequestId];
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Re-fire only when focusRequestId changes, or when the focused request
    // transitions from absent to present (e.g. right after the initial
    // fetch resolves) — not on every unrelated status-change re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequestId, requests.some((r) => r.id === focusRequestId)]);

  const handleStatusChange = useCallback(
    async (requestId: number, newStatus: RequestStatus) => {
      setStatusErrors((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setUpdatingIds((prev) => new Set(prev).add(requestId));

      try {
        const res = await fetch(`/api/requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        const data = await res.json();

        if (!res.ok) {
          setStatusErrors((prev) => ({
            ...prev,
            [requestId]: data.error ?? "Could not update status.",
          }));
          return;
        }

        setRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, ...data } : r))
        );
      } catch {
        setStatusErrors((prev) => ({
          ...prev,
          [requestId]: "Network error — could not reach the server.",
        }));
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    []
  );

  const handleDownloadAttachment = useCallback(
    async (requestId: number, url: string, filename: string) => {
      setDownloadErrors((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setDownloadingIds((prev) => new Set(prev).add(requestId));

      try {
        await downloadAttachment(url, filename, currentAnalystId);
      } catch {
        setDownloadErrors((prev) => ({
          ...prev,
          [requestId]: "Could not download attachment.",
        }));
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [currentAnalystId]
  );

  const handleRequestDelete = useCallback((requestId: number) => {
    setDeleteErrors((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
    setConfirmingDeleteIds((prev) => new Set(prev).add(requestId));
  }, []);

  const handleCancelDelete = useCallback((requestId: number) => {
    setConfirmingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(requestId);
      return next;
    });
    setDeleteErrors((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
  }, []);

  const handleConfirmDelete = useCallback(async (requestId: number) => {
    setDeleteErrors((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
    setDeletingIds((prev) => new Set(prev).add(requestId));

    try {
      const res = await fetch(`/api/requests/${requestId}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setDeleteErrors((prev) => ({
          ...prev,
          [requestId]: data.error ?? "Could not delete request.",
        }));
        return;
      }

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      setConfirmingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    } catch {
      setDeleteErrors((prev) => ({
        ...prev,
        [requestId]: "Network error — could not reach the server.",
      }));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  }, []);

  const handleEntityDeleteClick = useCallback(() => {
    setEntityDeleteError(null);
    setEntityConfirmingDelete(true);
  }, []);

  const handleEntityCancelDelete = useCallback(() => {
    setEntityConfirmingDelete(false);
    setEntityDeleteError(null);
  }, []);

  const handleEntityConfirmDelete = useCallback(async () => {
    if (!entity) return;
    setEntityDeleting(true);
    try {
      const endpoint = entity.kind === "dashboard" ? "/api/dashboards" : "/api/report-subscriptions";
      const res = await fetch(`${endpoint}/${entity.id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setEntityDeleteError(data.error ?? `Could not delete ${entity.kind}.`);
        return;
      }

      onEntityDeleted();
    } catch {
      setEntityDeleteError("Network error — could not reach the server.");
    } finally {
      setEntityDeleting(false);
    }
  }, [entity, onEntityDeleted]);

  if (!entity) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative h-full w-full sm:w-96 bg-panel border-l border-theme shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-theme flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              {entity.name}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Stakeholder: {entity.stakeholder ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {entity.kind === "dashboard" && (
              <button
                onClick={() => setAttachFieldRequestOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <ClipboardList className="w-3 h-3" />
                Attach Field Request
              </button>
            )}
            {!entityConfirmingDelete && (
              <>
                <button
                  onClick={() => setEntityEditOpen(true)}
                  aria-label={`Edit ${entity.kind}`}
                  className="flex items-center justify-center w-8 h-8 rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleEntityDeleteClick}
                  aria-label={`Delete ${entity.kind}`}
                  className="flex items-center justify-center w-8 h-8 rounded-md border border-theme bg-panel text-secondary hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-8 h-8 rounded-md border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-secondary" />
            </button>
          </div>
        </div>

        {entityConfirmingDelete && (
          <div className="flex flex-col gap-2 mx-5 mt-3 rounded-md border border-theme bg-slate-100 dark:bg-slate-800 px-3 py-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-secondary">
                Delete &quot;{entity.name}&quot;? This also deletes its requests.
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleEntityCancelDelete}
                  disabled={entityDeleting}
                  className="px-2 py-1 text-xs font-medium rounded-md border border-theme text-secondary hover:text-primary transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEntityConfirmDelete}
                  disabled={entityDeleting}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
                >
                  {entityDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
            {entityDeleteError && (
              <p className="text-xs text-red-600 dark:text-red-400">{entityDeleteError}</p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              <p className="text-sm text-secondary">Loading requests…</p>
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {!loading && !error && requests.length === 0 && (
            <p className="text-sm text-secondary">No requests yet.</p>
          )}

          {!loading && !error && requests.length > 0 && (
            <div className="flex flex-col gap-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  ref={(el) => {
                    rowRefs.current[request.id] = el;
                  }}
                  className={`rounded-lg border px-4 py-3 ${
                    request.id === focusRequestId
                      ? "border-brand-500 ring-2 ring-brand-500"
                      : "border-theme"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-primary">{request.title}</p>
                    {!confirmingDeleteIds.has(request.id) && (
                      <button
                        type="button"
                        onClick={() => handleRequestDelete(request.id)}
                        aria-label="Delete request"
                        className="flex items-center justify-center w-6 h-6 rounded-md text-secondary hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {confirmingDeleteIds.has(request.id) && (
                    <div className="flex items-center justify-between gap-2 mt-1.5 rounded-md border border-theme bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5">
                      <span className="text-xs text-secondary truncate">Delete &quot;{request.title}&quot;?</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCancelDelete(request.id)}
                          disabled={deletingIds.has(request.id)}
                          className="px-2 py-1 text-xs font-medium rounded-md border border-theme text-secondary hover:text-primary transition-colors disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(request.id)}
                          disabled={deletingIds.has(request.id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
                        >
                          {deletingIds.has(request.id) && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {deleteErrors[request.id] && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {deleteErrors[request.id]}
                    </p>
                  )}

                  {request.description && (
                    <p className="text-xs text-secondary mt-1">{request.description}</p>
                  )}

                  {request.attachmentUrl && (
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadAttachment(
                            request.id,
                            request.attachmentUrl!,
                            request.attachmentFilename ?? "attachment"
                          )
                        }
                        disabled={downloadingIds.has(request.id)}
                        className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 hover:underline mt-1.5 truncate disabled:opacity-60"
                      >
                        <Paperclip className="w-3 h-3 flex-shrink-0" />
                        {request.attachmentFilename ?? "Attachment"}
                      </button>
                      {downloadErrors[request.id] && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          {downloadErrors[request.id]}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-2 text-xs text-secondary">
                    <span className="capitalize">{request.requestType.replace("_", " ")}</span>
                    <span>·</span>
                    <span>Created by {request.createdByName}</span>
                  </div>

                  <div className="text-xs text-secondary mt-1">
                    Created: {formatDate(request.createdDate)}
                    {request.status === "done" && (
                      <> · Completed: {formatDate(request.completedDate)}</>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs text-secondary" htmlFor={`status-${request.id}`}>
                      Status:
                    </label>
                    <select
                      id={`status-${request.id}`}
                      value={request.status}
                      disabled={updatingIds.has(request.id)}
                      onChange={(e) =>
                        handleStatusChange(request.id, e.target.value as RequestStatus)
                      }
                      className="text-xs font-medium rounded-md border border-theme px-2 py-1 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors disabled:opacity-60"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    {updatingIds.has(request.id) && (
                      <Loader2 className="w-3 h-3 text-brand-500 animate-spin" />
                    )}
                  </div>

                  <div className="mt-2 pt-2 border-t border-theme">
                    <RequestTagEditor
                      requestId={request.id}
                      tags={request.tags}
                      allTags={allTags}
                      onTagsChange={(tags) =>
                        setRequests((prev) =>
                          prev.map((r) => (r.id === request.id ? { ...r, tags } : r))
                        )
                      }
                    />
                  </div>
                  <div className="mt-2 pt-2 border-t border-theme">
                    <RequestLinkPicker
                      requestId={request.id}
                      relatedRequests={request.relatedRequests}
                      onRelatedRequestsChange={(relatedRequests) =>
                        setRequests((prev) =>
                          prev.map((r) => (r.id === request.id ? { ...r, relatedRequests } : r))
                        )
                      }
                    />
                  </div>

                  {statusErrors[request.id] && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {statusErrors[request.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {attachFieldRequestOpen && entity && entity.kind === "dashboard" && (
        <AttachFieldRequestForm
          dashboardId={entity.id}
          dashboardName={entity.name}
          analystId={currentAnalystId}
          onAttached={() => setRefreshKey((k) => k + 1)}
          onClose={() => setAttachFieldRequestOpen(false)}
        />
      )}

      {entityEditOpen && entity && (
        <EditEntityForm
          kind={entity.kind}
          id={entity.id}
          initialName={entity.name}
          initialStakeholder={entity.stakeholder}
          initialStatus={entity.status}
          initialJiraTicketId={entity.jiraTicketId}
          divisions={divisions}
          initialDivisionId={entity.divisionId}
          onSaved={(newIdentity) => {
            setEntityEditOpen(false);
            onEntityUpdated(newIdentity);
          }}
          onCancel={() => setEntityEditOpen(false)}
        />
      )}
    </div>
  );
}
