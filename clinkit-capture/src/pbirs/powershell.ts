import { execFileSync } from 'child_process';
import { PbirsClient } from './client';

function psEscape(s: string): string {
  return s.replace(/'/g, "''");
}

function runPs(script: string): string {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf-8', windowsHide: true }
  ).trim();
}

export class PowerShellClient implements PbirsClient {
  async getJson(url: string): Promise<unknown> {
    const safe = psEscape(url);
    const script = `$r = Invoke-RestMethod -UseDefaultCredentials -Uri '${safe}'; $r | ConvertTo-Json -Depth 10 -Compress`;
    return JSON.parse(runPs(script));
  }

  async postJson(url: string, body: object): Promise<unknown> {
    const safeUrl = psEscape(url);
    const safeBody = psEscape(JSON.stringify(body));
    const script = `$r = Invoke-RestMethod -UseDefaultCredentials -Uri '${safeUrl}' -Method Post -ContentType 'application/json' -Body '${safeBody}'; $r | ConvertTo-Json -Depth 10 -Compress`;
    return JSON.parse(runPs(script));
  }

  async getBytes(url: string): Promise<Buffer> {
    const safe = psEscape(url);
    const script = `[Convert]::ToBase64String((Invoke-WebRequest -UseDefaultCredentials -Uri '${safe}').Content)`;
    const b64 = runPs(script);
    return Buffer.from(b64, 'base64');
  }
}
