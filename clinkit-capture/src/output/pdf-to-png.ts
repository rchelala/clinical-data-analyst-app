import { pdfToPng } from 'pdf-to-png-converter';

export interface PngResult {
  png: Buffer;
  width: number;
  height: number;
}

export async function convertPdfToPng(
  pdfBuffer: Buffer,
  targetWidthPx: number
): Promise<PngResult> {
  const [sample] = await pdfToPng(pdfBuffer, {
    pagesToProcess: [1],
    viewportScale: 1.0,
    verbosityLevel: 0,
  });

  const scale = targetWidthPx / sample.width;

  const [page] = await pdfToPng(pdfBuffer, {
    pagesToProcess: [1],
    viewportScale: scale,
    verbosityLevel: 0,
  });

  return { png: page.content, width: page.width, height: page.height };
}
