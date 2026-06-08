import { PbirsClient } from './client';

export async function exportRdl(
  client: PbirsClient,
  baseUrl: string,
  reportPath: string,
  parameters: Record<string, string>
): Promise<Buffer> {
  const paramStr = Object.entries(parameters)
    .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('');
  const url = `${baseUrl}/ReportServer?${reportPath}&rs:Format=PDF${paramStr}`;
  return client.getBytes(url);
}

interface PollOptions {
  pollIntervalMs: number;
  timeoutMs: number;
}

const DEFAULT_POLL: PollOptions = { pollIntervalMs: 2000, timeoutMs: 90_000 };

export async function exportPbix(
  client: PbirsClient,
  baseUrl: string,
  catalogItemId: string,
  pageName: string,
  opts: PollOptions = DEFAULT_POLL
): Promise<Buffer> {
  const api = `${baseUrl}/Reports/api/v2.0`;

  const job = (await client.postJson(
    `${api}/PowerBIReports(${catalogItemId})/Export(Format='PDF')`,
    { Settings: { PageName: pageName } }
  )) as { Id: string };

  const jobId = job.Id;
  const deadline = Date.now() + opts.timeoutMs;

  while (true) {
    if (Date.now() > deadline) {
      throw new Error(`PBIX export job timed out after ${opts.timeoutMs}ms`);
    }

    const status = (await client.getJson(`${api}/ExportJobs(${jobId})`)) as { Status: string };

    if (status.Status === 'Succeeded') {
      return client.getBytes(`${api}/ExportJobs(${jobId})/Content`);
    }
    if (status.Status === 'Failed') {
      throw new Error(`PBIRS export job failed for page "${pageName}"`);
    }

    await new Promise((r) => setTimeout(r, opts.pollIntervalMs));
  }
}
