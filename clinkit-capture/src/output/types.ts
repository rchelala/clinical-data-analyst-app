export interface Manifest {
  name: string;
  generatedAt: string;
  pages: ManifestPage[];
}

export interface ManifestPage {
  slug: string;
  pngPath: string;
  widthPx: number;
  heightPx: number;
  sourceReportPath: string;
  sourcePageName?: string;
  narration?: string;
  durationSec?: number;
  capturedAt: string;
}
