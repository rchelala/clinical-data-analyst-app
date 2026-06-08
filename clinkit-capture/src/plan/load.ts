import { readFileSync } from 'fs';
import { PlanFile } from './types';

export function loadPlan(filePath: string): PlanFile {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot read plan file at ${filePath}: ${(err as Error).message}`);
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name) {
    throw new Error('plan.json must have a non-empty "name" string');
  }
  if (typeof obj.pbirsBaseUrl !== 'string' || !obj.pbirsBaseUrl) {
    throw new Error('plan.json must have a non-empty "pbirsBaseUrl" string');
  }
  if (!Array.isArray(obj.pages)) {
    throw new Error('plan.json must have a "pages" array');
  }

  for (const page of obj.pages as Record<string, unknown>[]) {
    if (page.reportType === 'pbix' && !page.pageName) {
      throw new Error(
        `Page "${page.slug}" has reportType "pbix" but is missing required "pageName"`
      );
    }
  }

  return raw as PlanFile;
}
