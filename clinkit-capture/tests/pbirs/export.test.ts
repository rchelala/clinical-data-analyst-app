import { describe, it, expect, vi } from 'vitest';
import { exportRdl } from '../../src/pbirs/export';
import type { PbirsClient } from '../../src/pbirs/client';

function bytesClient(bytes: Buffer): PbirsClient {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    getBytes: vi.fn().mockResolvedValue(bytes),
  } as unknown as PbirsClient;
}

describe('exportRdl', () => {
  it('returns bytes from the RDL endpoint', async () => {
    const client = bytesClient(Buffer.from('PDF'));
    const result = await exportRdl(client, 'http://tpdcpbi02', '/Clinical/Report', {});
    expect(result).toEqual(Buffer.from('PDF'));
  });

  it('builds the correct URL with no parameters', async () => {
    const client = bytesClient(Buffer.from('x'));
    await exportRdl(client, 'http://tpdcpbi02', '/Clinical/Report', {});
    expect(client.getBytes).toHaveBeenCalledWith(
      'http://tpdcpbi02/ReportServer?/Clinical/Report&rs:Format=PDF'
    );
  });

  it('URL-encodes parameter values', async () => {
    const client = bytesClient(Buffer.from('x'));
    await exportRdl(client, 'http://tpdcpbi02', '/Clinical/Report', { Division: 'Heme & Onc' });
    expect(client.getBytes).toHaveBeenCalledWith(
      'http://tpdcpbi02/ReportServer?/Clinical/Report&rs:Format=PDF&Division=Heme%20%26%20Onc'
    );
  });
});

import { exportPbix } from '../../src/pbirs/export';

describe('exportPbix', () => {
  it('returns PDF bytes when job immediately succeeds', async () => {
    const client = {
      getJson: vi.fn().mockResolvedValue({ Id: 'job-1', Status: 'Succeeded' }),
      postJson: vi.fn().mockResolvedValue({ Id: 'job-1' }),
      getBytes: vi.fn().mockResolvedValue(Buffer.from('PDF')),
    } as unknown as PbirsClient;
    const result = await exportPbix(client, 'http://tpdcpbi02', 'guid', 'Overview', { pollIntervalMs: 0, timeoutMs: 5000 });
    expect(result).toEqual(Buffer.from('PDF'));
  });

  it('polls until Succeeded', async () => {
    const client = {
      getJson: vi.fn()
        .mockResolvedValueOnce({ Id: 'job-1', Status: 'InProgress' })
        .mockResolvedValueOnce({ Id: 'job-1', Status: 'Succeeded' }),
      postJson: vi.fn().mockResolvedValue({ Id: 'job-1' }),
      getBytes: vi.fn().mockResolvedValue(Buffer.from('PDF')),
    } as unknown as PbirsClient;
    await exportPbix(client, 'http://tpdcpbi02', 'guid', 'Overview', { pollIntervalMs: 0, timeoutMs: 5000 });
    expect(client.getJson).toHaveBeenCalledTimes(2);
  });

  it('throws on Failed status', async () => {
    const client = {
      getJson: vi.fn().mockResolvedValue({ Id: 'job-1', Status: 'Failed' }),
      postJson: vi.fn().mockResolvedValue({ Id: 'job-1' }),
      getBytes: vi.fn(),
    } as unknown as PbirsClient;
    await expect(
      exportPbix(client, 'http://tpdcpbi02', 'guid', 'Overview', { pollIntervalMs: 0, timeoutMs: 5000 })
    ).rejects.toThrow('failed');
  });

  it('throws on timeout', async () => {
    const client = {
      getJson: vi.fn().mockResolvedValue({ Id: 'job-1', Status: 'InProgress' }),
      postJson: vi.fn().mockResolvedValue({ Id: 'job-1' }),
      getBytes: vi.fn(),
    } as unknown as PbirsClient;
    await expect(
      exportPbix(client, 'http://tpdcpbi02', 'guid', 'Overview', { pollIntervalMs: 0, timeoutMs: 1 })
    ).rejects.toThrow('timed out');
  });
});
