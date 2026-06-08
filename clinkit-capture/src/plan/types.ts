export interface PlanFile {
  name: string;
  pbirsBaseUrl: string;
  defaultPdfWidthPx?: number;
  pages: PlanPage[];
}

export interface PlanPage {
  slug: string;
  reportPath: string;
  reportType: 'pbix' | 'rdl';
  pageName?: string;
  parameters?: Record<string, string>;
  narration?: string;
  durationSec?: number;
}
