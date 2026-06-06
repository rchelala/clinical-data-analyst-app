const PBI_BASE = "https://api.powerbi.com/v1.0/myorg";

export type ExportPhase = "idle" | "exporting" | "downloading" | "done" | "failed";

export interface PbiWorkspace { id: string; name: string; }
export interface PbiReport    { id: string; name: string; }
export interface PbiPage      { name: string; displayName: string; order: number; }

async function pbiRequest(url: string, token: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });
  } catch {
    throw new Error(
      "Could not reach Power BI directly — your browser may be blocking cross-origin requests"
    );
  }
}

interface ExportStatus {
  status: string;
}

// $top=100 is the API maximum per page; tenants with >100 workspaces will see a truncated list.
export async function listWorkspaces(token: string): Promise<PbiWorkspace[]> {
  const res = await pbiRequest(`${PBI_BASE}/groups?$top=100`, token);
  if (!res.ok) throw new Error(`Failed to list workspaces: ${res.status}`);
  const data = (await res.json()) as { value: PbiWorkspace[] };
  return data.value;
}

export async function listReports(groupId: string, token: string): Promise<PbiReport[]> {
  const res = await pbiRequest(`${PBI_BASE}/groups/${groupId}/reports`, token);
  if (!res.ok) throw new Error(`Failed to list reports: ${res.status}`);
  const data = (await res.json()) as { value: PbiReport[] };
  return data.value;
}

export async function listPages(groupId: string, reportId: string, token: string): Promise<PbiPage[]> {
  const res = await pbiRequest(`${PBI_BASE}/groups/${groupId}/reports/${reportId}/pages`, token);
  if (!res.ok) throw new Error(`Failed to list pages: ${res.status}`);
  const data = (await res.json()) as { value: PbiPage[] };
  return data.value.slice().sort((a, b) => a.order - b.order);
}

export interface PublishedExportOptions {
  groupId: string;
  reportId: string;
  reportName: string;
  selectedPages: string[];
  token: string;
  onPhase: (phase: ExportPhase) => void;
}

export async function exportPublishedReportToPdf({
  groupId,
  reportId,
  reportName,
  selectedPages,
  token,
  onPhase,
}: PublishedExportOptions): Promise<void> {
  onPhase("exporting");

  // Trigger PDF export
  const exportRes = await pbiRequest(
    `${PBI_BASE}/groups/${groupId}/reports/${reportId}/ExportTo`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "PDF",
        powerBIReportConfiguration: {
          pages: selectedPages.map((name) => ({ pageName: name })),
        },
      }),
    }
  );
  if (!exportRes.ok) {
    const text = await exportRes.text().catch(() => "");
    throw new Error(`Export trigger failed: ${text || exportRes.status}`);
  }
  const { id: exportId } = (await exportRes.json()) as { id: string };
  if (!exportId) throw new Error("Export trigger returned no export ID");

  // Poll export status, respecting Power BI's Retry-After header (up to 60 min)
  let timedOut = true;
  const exportDeadline = Date.now() + 3_600_000;
  while (Date.now() < exportDeadline) {
    const statusRes = await pbiRequest(
      `${PBI_BASE}/groups/${groupId}/reports/${reportId}/exports/${exportId}`,
      token
    );
    if (!statusRes.ok) throw new Error(`Export status check failed: ${statusRes.status}`);
    const exportStatus = (await statusRes.json()) as ExportStatus;
    if (exportStatus.status === "Succeeded") { timedOut = false; break; }
    if (exportStatus.status === "Failed") throw new Error("Power BI reported export failure");
    const retryAfterRaw = parseInt(statusRes.headers.get("Retry-After") ?? "30", 10);
    const waitMs = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw * 1000 : 30_000;
    await new Promise<void>((r) => setTimeout(r, waitMs));
  }
  if (timedOut) throw new Error("Export generation timed out");

  // Download PDF blob
  onPhase("downloading");
  const pdfRes = await pbiRequest(
    `${PBI_BASE}/groups/${groupId}/reports/${reportId}/exports/${exportId}/file`,
    token
  );
  if (!pdfRes.ok) throw new Error(`PDF download failed: ${pdfRes.status}`);
  const blob = await pdfRes.blob();

  // Trigger browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reportName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Parses a PBRS portal URL and extracts the server base and report path.
 * Handles portal URLs like:
 *   http://tpdcpbi02/reports/powerbi/Folder/ReportName
 *   http://tpdcpbi02/reports/report/Folder/ReportName
 * Returns null if the URL cannot be parsed or has no report path.
 */
export function parsePbrsPortalUrl(
  input: string
): { serverBase: string; reportPath: string } | null {
  try {
    const url = new URL(input);
    const serverBase = `${url.protocol}//${url.host}`;
    const prefixes = ["/reports/powerbi", "/reports/report", "/reports/browse"];
    let path = decodeURIComponent(url.pathname);
    for (const prefix of prefixes) {
      if (path.startsWith(prefix)) {
        path = path.slice(prefix.length);
        break;
      }
    }
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    return { serverBase, reportPath: "/" + segments.join("/") };
  } catch {
    return null;
  }
}

/**
 * Builds the ReportServer URL-access PDF export URL for a PBRS report.
 * Works for both .pbix (Power BI) and .rdl (paginated) reports.
 * The resulting URL can be opened directly in the browser — Windows NTLM
 * auth is handled automatically.
 */
export function buildPbrsExportUrl(serverBase: string, reportPath: string): string {
  const segments = reportPath.split("/").filter(Boolean);
  const encodedPath = segments.map(encodeURIComponent).join("%2F");
  return `${serverBase}/ReportServer?%2F${encodedPath}&rs:Format=PDF&rs:Command=Render`;
}
