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
