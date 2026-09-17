import { FieldRequestEntry } from "./history";
import { toLocalDateString } from "./dates";

const TEMPLATE_LABELS: Record<string, string> = {
  "general": "General",
  "quippe": "Quippe",
  "structured-note": "Struct. Note",
};

function templateLabel(templateType: string): string {
  return TEMPLATE_LABELS[templateType] ?? templateType;
}

export function summarizeFieldRequest(entry: FieldRequestEntry): string {
  const fieldCount = entry.rows.length;
  const fieldLabel = fieldCount === 1 ? "field" : "fields";
  const tableSegment = entry.tableName.trim()
    ? ` · table ${entry.tableName}`
    : "";
  return `${templateLabel(entry.templateType)} template · ${fieldCount} ${fieldLabel}${tableSegment}`;
}

// Pulls the field name out of each row the same way the SQL generator does
// (components/FieldRequestForm.tsx), so the persisted list matches what the
// analyst actually saw in the form.
export function extractFieldNames(entry: FieldRequestEntry): string[] {
  return entry.rows
    .map((row) => String(row.field || row.cubeObjectName || "").trim())
    .filter((name) => name.length > 0);
}

export async function attachFieldRequestToDashboard(
  entry: FieldRequestEntry,
  dashboardId: number,
  analystId: number
): Promise<void> {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-analyst-id": String(analystId),
    },
    body: JSON.stringify({
      dashboardId,
      title: entry.tableName.trim()
        ? `Field request: ${entry.tableName}`
        : "Field request",
      description: summarizeFieldRequest(entry),
      requestType: "field_request",
      fieldNames: extractFieldNames(entry),
      createdDate: toLocalDateString(new Date()),
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Could not attach field request.");
  }
}
