import { NextRequest, NextResponse } from "next/server";

const PBI_BASE = "https://api.powerbi.com/v1.0/myorg";

async function pbiGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function pbiDelete(url: string, token: string): Promise<void> {
  await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function poll<T>(
  fn: () => Promise<T>,
  isDone: (val: T) => boolean,
  isFailed: (val: T) => boolean,
  intervalMs: number,
  timeoutMs: number
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await fn();
    if (isDone(val)) return val;
    if (isFailed(val)) throw new Error(`Polling failed: ${JSON.stringify(val)}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Polling timed out");
}

interface ImportStatus {
  id: string;
  importState: string;
  reports?: Array<{ id: string; name: string }>;
  datasets?: Array<{ id: string; name: string }>;
}

interface ExportStatus {
  id: string;
  reportId: string;
  status: string;
  resourceLocation?: string;
  percentComplete?: number;
}

export async function POST(req: NextRequest) {
  let datasetId: string | undefined;
  let reportId: string | undefined;
  let exportId: string | undefined;
  let token = "";

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const pagesJson = form.get("pages") as string | null;
    token = (form.get("token") as string | null) ?? "";

    if (!file || !pagesJson || !token) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const selectedPages: string[] = JSON.parse(pagesJson);
    const reportName = file.name.replace(/\.pbix$/i, "");

    // Step 1: Upload PBIX
    const uploadForm = new FormData();
    uploadForm.append("file", file);

    const uploadRes = await fetch(
      `${PBI_BASE}/imports?datasetDisplayName=${encodeURIComponent(reportName + "-export-tmp")}&nameConflict=Overwrite`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm,
      }
    );
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return NextResponse.json({ error: "upload_failed", detail: text, step: "upload" }, { status: 502 });
    }
    const { id: importId } = (await uploadRes.json()) as { id: string };

    // Step 2: Poll import
    const importResult = await poll<ImportStatus>(
      () => pbiGet<ImportStatus>(`${PBI_BASE}/imports/${importId}`, token),
      (v) => v.importState === "Succeeded",
      (v) => v.importState === "Failed",
      2000,
      60000
    );

    reportId = importResult.reports?.[0]?.id;
    datasetId = importResult.datasets?.[0]?.id;
    if (!reportId) throw new Error("Import succeeded but no report ID returned");

    // Step 3: Trigger PDF export
    const exportBody = {
      format: "PDF",
      pages: selectedPages.map((pageName) => ({ pageName })),
    };

    const exportRes = await fetch(`${PBI_BASE}/reports/${reportId}/ExportTo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(exportBody),
    });
    if (!exportRes.ok) {
      const text = await exportRes.text();
      return NextResponse.json({ error: "export_trigger_failed", detail: text, step: "export" }, { status: 502 });
    }
    exportId = ((await exportRes.json()) as { id: string }).id;

    // Step 4: Poll export status
    await poll<ExportStatus>(
      () => pbiGet<ExportStatus>(`${PBI_BASE}/reports/${reportId}/exports/${exportId}`, token),
      (v) => v.status === "Succeeded",
      (v) => v.status === "Failed",
      3000,
      180000
    );

    // Step 5: Download PDF
    const pdfRes = await fetch(`${PBI_BASE}/reports/${reportId}/exports/${exportId}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pdfRes.ok) {
      throw new Error(`PDF download failed: ${pdfRes.status}`);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    // Step 6: Cleanup (fire-and-forget)
    if (datasetId) {
      pbiDelete(`${PBI_BASE}/datasets/${datasetId}`, token).catch(() => {/* ignore cleanup errors */});
    }

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportName}.pdf"`,
      },
    });
  } catch (err: unknown) {
    // Best-effort cleanup on error
    if (datasetId && token) {
      pbiDelete(`${PBI_BASE}/datasets/${datasetId}`, token).catch(() => {});
    }

    const error = err as Error;
    return NextResponse.json({ error: "export_failed", detail: error.message }, { status: 500 });
  }
}
