import { FieldRequestEntry } from "./history";

export function summarizeFieldRequest(entry: FieldRequestEntry): string {
  const fieldCount = entry.rows.length;
  const fieldLabel = fieldCount === 1 ? "field" : "fields";
  const tableSegment = entry.tableName.trim()
    ? ` · table ${entry.tableName}`
    : "";
  return `${entry.templateType} template · ${fieldCount} ${fieldLabel}${tableSegment}`;
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
      title: `Field request: ${entry.tableName}`,
      description: summarizeFieldRequest(entry),
      requestType: "field_request",
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Could not attach field request.");
  }
}
