import { PbirsClient } from './client';
import { CatalogItem } from './types';

export async function resolveCatalogItem(
  client: PbirsClient,
  baseUrl: string,
  reportPath: string
): Promise<{ id: string; type: string }> {
  const odataSafePath = reportPath.replace(/'/g, "''");
  const url = `${baseUrl}/Reports/api/v2.0/CatalogItems(Path='${odataSafePath}')`;
  const data = (await client.getJson(url)) as Partial<CatalogItem>;

  if (!data.Id) {
    throw new Error(`Report not found at path: ${reportPath}`);
  }

  return { id: data.Id, type: data.Type ?? 'Unknown' };
}
