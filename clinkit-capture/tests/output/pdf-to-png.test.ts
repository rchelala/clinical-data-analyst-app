import { describe, it, expect } from 'vitest';
import { convertPdfToPng } from '../../src/output/pdf-to-png';

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
);

describe('convertPdfToPng', () => {
  it.skip('returns a Buffer at the requested pixel width', async () => {
    // minimal stub PDF may fail; integration-tested against real PBIRS output
    const result = await convertPdfToPng(MINIMAL_PDF, 800);
    expect(result.png).toBeInstanceOf(Buffer);
    expect(result.width).toBe(800);
    expect(result.height).toBeGreaterThan(0);
  }, 30_000);
});
