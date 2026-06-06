const PBI_BASE = "https://api.powerbi.com/v1.0/myorg";

export type ExportPhase =
  | "idle"
  | "uploading"
  | "importing"
  | "exporting"
  | "downloading"
  | "cleaning_up"
  | "done"
  | "failed";

export interface ExportOptions {
  file: File;
  selectedPages: string[];
  token: string;
  onPhase: (phase: ExportPhase) => void;
}

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

async function poll<T>(
  fn: () => Promise<T>,
  isDone: (val: T) => boolean,
  isFailed: (val: T) => boolean,
  intervalMs: number,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await fn();
    if (isDone(val)) return val;
    if (isFailed(val)) throw new Error("Power BI reported export failure");
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
  throw new Error(timeoutMessage);
}

interface ImportStatus {
  importState: string;
  reports?: Array<{ id: string; name: string }>;
  datasets?: Array<{ id: string; name: string }>;
}

interface ExportStatus {
  status: string;
}

// Calls onPhase for: importing → exporting → downloading → cleaning_up.
// Caller is responsible for setting "uploading" before calling, and "done"/"failed" after.
export async function exportPbixToPdf({
  file,
  selectedPages,
  token,
  onPhase,
}: ExportOptions): Promise<void> {
  let datasetId: string | undefined;

  try {
    // Step 1: Upload PBIX directly to Power BI
    const reportName = file.name.replace(/\.pbix$/i, "");
    const uploadForm = new FormData();
    uploadForm.append("file", file);

    const uploadRes = await pbiRequest(
      `${PBI_BASE}/imports?datasetDisplayName=${encodeURIComponent(
        `${reportName}-export-tmp-${Date.now()}`
      )}&nameConflict=Abort`,
      token,
      { method: "POST", body: uploadForm }
    );
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      throw new Error(`Upload failed: ${text || uploadRes.status}`);
    }
    const { id: importId } = (await uploadRes.json()) as { id: string };

    // Step 2: Poll import status
    onPhase("importing");
    const importResult = await poll<ImportStatus>(
      async () => {
        const res = await pbiRequest(`${PBI_BASE}/imports/${importId}`, token);
        if (!res.ok) throw new Error(`Import status check failed: ${res.status}`);
        return res.json() as Promise<ImportStatus>;
      },
      (v) => v.importState === "Succeeded",
      (v) => v.importState === "Failed",
      2000,
      60000,
      "Import timed out"
    );

    const reportId = importResult.reports?.[0]?.id;
    datasetId = importResult.datasets?.[0]?.id;
    if (!reportId) throw new Error("Import succeeded but no report ID returned");

    // Step 3: Trigger PDF export
    onPhase("exporting");
    const exportRes = await pbiRequest(`${PBI_BASE}/reports/${reportId}/ExportTo`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "PDF",
        pages: selectedPages.map((pageName) => ({ pageName })),
      }),
    });
    if (!exportRes.ok) {
      const text = await exportRes.text().catch(() => "");
      throw new Error(`Export trigger failed: ${text || exportRes.status}`);
    }
    const { id: exportId } = (await exportRes.json()) as { id: string };

    // Step 4: Poll export status
    await poll<ExportStatus>(
      async () => {
        const res = await pbiRequest(
          `${PBI_BASE}/reports/${reportId}/exports/${exportId}`,
          token
        );
        if (!res.ok) throw new Error(`Export status check failed: ${res.status}`);
        return res.json() as Promise<ExportStatus>;
      },
      (v) => v.status === "Succeeded",
      (v) => v.status === "Failed",
      5000,
      600000,
      "Export generation timed out"
    );

    // Step 5: Download PDF blob
    onPhase("downloading");
    const pdfRes = await pbiRequest(
      `${PBI_BASE}/reports/${reportId}/exports/${exportId}/file`,
      token
    );
    if (!pdfRes.ok) throw new Error(`PDF download failed: ${pdfRes.status}`);
    const blob = await pdfRes.blob();

    // Step 6: Trigger browser download
    onPhase("cleaning_up");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } finally {
    // Fire-and-forget cleanup
    if (datasetId) {
      fetch(`${PBI_BASE}/datasets/${datasetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }
}
