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
