"use client";

import { useState, useCallback, useRef } from "react";
import { ClipboardPlus, Paperclip, X } from "lucide-react";
import {
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  RequestType,
} from "@/lib/brain-types";
import {
  parseFieldRequestExcel,
  generateTitleFromParsedRows,
  generateDescriptionFromParsedRows,
} from "@/lib/parseFieldRequestExcel";

interface AddRequestFormProps {
  dashboards: DashboardWithUrgency[];
  subscriptions: ReportSubscriptionWithUrgency[];
  currentAnalystId: number;
  onCreated: () => void;
  onCancel: () => void;
}

const REQUEST_TYPE_OPTIONS: { value: RequestType; label: string }[] = [
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
  { value: "field_request", label: "Field request" },
];

export function AddRequestForm({
  dashboards,
  subscriptions,
  currentAnalystId,
  onCreated,
  onCancel,
}: AddRequestFormProps) {
  const firstOptionValue = dashboards[0]
    ? `dashboard:${dashboards[0].id}`
    : subscriptions[0]
      ? `subscription:${subscriptions[0].id}`
      : "";
  const [entityValue, setEntityValue] = useState<string>(firstOptionValue);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestType, setRequestType] = useState<RequestType>("field_request");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [titleAutoFilled, setTitleAutoFilled] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestFileRef = useRef<File | null>(null);

  const acceptFile = useCallback(
    async (f: File) => {
      if (!/\.(xlsx|xls)$/i.test(f.name)) {
        setError("Please attach a .xlsx or .xls file.");
        return;
      }
      setError(null);
      setParseNote(null);
      setAttachmentFile(f);
      latestFileRef.current = f;

      const result = await parseFieldRequestExcel(f);
      if (latestFileRef.current !== f) return; // a newer file was accepted while this parse was in flight — discard stale result

      if (result && result.rows.length > 0) {
        if (title.trim() === "" || titleAutoFilled) {
          setTitle(generateTitleFromParsedRows(result));
          setDescription(generateDescriptionFromParsedRows(result));
          setTitleAutoFilled(true);
        }
        setRequestType("field_request");
      } else {
        setParseNote(
          "Could not read field details from this file — it will still attach normally."
        );
      }
    },
    [title, titleAutoFilled]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) acceptFile(f);
    },
    [acceptFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) acceptFile(f);
    },
    [acceptFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleRemoveAttachment = useCallback(() => {
    setAttachmentFile(null);
    setParseNote(null);
    latestFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const separatorIndex = entityValue.indexOf(":");
      const kind = separatorIndex >= 0 ? entityValue.slice(0, separatorIndex) : "";
      const idPart = separatorIndex >= 0 ? entityValue.slice(separatorIndex + 1) : "";
      const parsedId = Number(idPart);

      if ((kind !== "dashboard" && kind !== "subscription") || !Number.isFinite(parsedId)) {
        setError("Please select a dashboard or subscription.");
        return;
      }
      if (!title.trim()) {
        setError("Title is required.");
        return;
      }

      setSubmitting(true);
      try {
        let attachmentUrl: string | undefined;
        let attachmentFilename: string | undefined;

        if (attachmentFile) {
          const uploadBody = new FormData();
          uploadBody.append("file", attachmentFile);
          const uploadRes = await fetch("/api/requests/attachment", {
            method: "POST",
            body: uploadBody,
          });
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) {
            setError(uploadData.error ?? "Could not upload attachment.");
            return;
          }
          attachmentUrl = uploadData.url;
          attachmentFilename = uploadData.filename;
        }

        const res = await fetch("/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-analyst-id": String(currentAnalystId),
          },
          body: JSON.stringify({
            dashboardId: kind === "dashboard" ? parsedId : undefined,
            subscriptionId: kind === "subscription" ? parsedId : undefined,
            title: title.trim(),
            description: description.trim() ? description.trim() : undefined,
            requestType,
            attachmentUrl,
            attachmentFilename,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Could not create request.");
          return;
        }

        onCreated();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [entityValue, title, description, requestType, attachmentFile, currentAnalystId, onCreated]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-xl border border-theme bg-elevated shadow-panel">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <ClipboardPlus className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Add request
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Log a new request against a dashboard or subscription.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="dashboard" className="text-xs font-medium text-secondary">
              Dashboard / Subscription <span className="text-red-500">*</span>
            </label>
            <select
              id="dashboard"
              value={entityValue}
              onChange={(e) => setEntityValue(e.target.value)}
              required
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              {dashboards.length === 0 && subscriptions.length === 0 && (
                <option value="">No dashboards or subscriptions available</option>
              )}
              {dashboards.length > 0 && (
                <optgroup label="Dashboards">
                  {dashboards.map((d) => (
                    <option key={`dashboard:${d.id}`} value={`dashboard:${d.id}`}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {subscriptions.length > 0 && (
                <optgroup label="Report Subscriptions">
                  {subscriptions.map((s) => (
                    <option key={`subscription:${s.id}`} value={`subscription:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-xs font-medium text-secondary">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleAutoFilled(false);
              }}
              required
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-xs font-medium text-secondary">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="requestType" className="text-xs font-medium text-secondary">
              Request type
            </label>
            <select
              id="requestType"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as RequestType)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              {REQUEST_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-secondary">
              Attach a previously-built Excel request (optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileInputChange}
            />
            {attachmentFile ? (
              <div className="flex items-center justify-between gap-2 text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary">
                <span className="flex items-center gap-1.5 truncate">
                  <Paperclip className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
                  {attachmentFile.name}
                </span>
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  className="text-secondary hover:text-red-500 transition-colors flex-shrink-0"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center justify-center gap-1.5 text-sm rounded-md border border-dashed px-3 py-2 cursor-pointer transition-colors ${
                  dragging
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-theme text-secondary hover:text-primary hover:bg-panel/80"
                }`}
              >
                <Paperclip className="w-3.5 h-3.5" />
                Drop Excel file here, or click to browse…
              </div>
            )}
            {parseNote && (
              <p className="text-xs text-amber-400">{parseNote}</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (dashboards.length === 0 && subscriptions.length === 0)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
