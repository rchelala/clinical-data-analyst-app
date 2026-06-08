import { describe, it, expect, afterEach } from 'vitest';
import { writeManifest } from '../../src/output/manifest';
import { readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { Manifest } from '../../src/output/types';

const TMP = join(__dirname, '../../.tmp-manifest');

afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true }); });

describe('writeManifest', () => {
  it('writes manifest.json to outDir', () => {
    const manifest: Manifest = {
      name: 'test-run',
      generatedAt: '2026-06-08T00:00:00.000Z',
      pages: [{
        slug: '01-overview', pngPath: 'frames/01-overview.png',
        widthPx: 1920, heightPx: 1080,
        sourceReportPath: '/Clinical/MAW',
        capturedAt: '2026-06-08T00:00:01.000Z',
      }],
    };
    writeManifest(TMP, manifest);
    const written = JSON.parse(readFileSync(join(TMP, 'manifest.json'), 'utf-8'));
    expect(written.name).toBe('test-run');
    expect(written.pages).toHaveLength(1);
  });

  it('creates outDir if it does not exist', () => {
    const nested = join(TMP, 'nested/deep');
    writeManifest(nested, { name: 'x', generatedAt: 'now', pages: [] });
    expect(existsSync(join(nested, 'manifest.json'))).toBe(true);
  });
});
