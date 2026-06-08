import { describe, it, expect, vi } from 'vitest';
import { resolveCatalogItem } from '../../src/pbirs/catalog';
import type { PbirsClient } from '../../src/pbirs/client';

function mockClient(response: unknown): PbirsClient {
  return {
    getJson: vi.fn().mockResolvedValue(response),
    postJson: vi.fn(),
    getBytes: vi.fn(),
  } as unknown as PbirsClient;
}

describe('resolveCatalogItem', () => {
  it('resolves a PowerBIReport', async () => {
    const client = mockClient({ Id: 'abc-123', Type: 'PowerBIReport', Name: 'MAW', Path: '/x' });
    const result = await resolveCatalogItem(client, 'http://tpdcpbi02', '/Clinical/MAW');
    expect(result).toEqual({ id: 'abc-123', type: 'PowerBIReport' });
  });

  it('throws if item not found', async () => {
    const client = mockClient({});
    await expect(resolveCatalogItem(client, 'http://tpdcpbi02', '/Missing')).rejects.toThrow('/Missing');
  });

  it('calls the correct OData URL', async () => {
    const client = mockClient({ Id: 'x', Type: 'Report', Name: 'x', Path: '/x' });
    await resolveCatalogItem(client, 'http://tpdcpbi02', '/Clinical/MAW');
    expect(client.getJson).toHaveBeenCalledWith(
      "http://tpdcpbi02/Reports/api/v2.0/CatalogItems(Path='/Clinical/MAW')"
    );
  });
});
