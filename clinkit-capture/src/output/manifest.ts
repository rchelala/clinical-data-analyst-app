import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Manifest } from './types';

export function writeManifest(outDir: string, manifest: Manifest): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}
