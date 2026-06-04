import JSZip from "jszip";

export interface PbixVisual {
  type: string;
  title?: string;
}

export interface PbixPage {
  name: string;
  visuals: PbixVisual[];
}

export interface MeasureUsage {
  page: string;
  visualTitle: string;
  visualType: string;
}

export interface MeasureRow {
  name: string;
  table: string;
  usages: MeasureUsage[];
}

export interface PbixDashboard {
  reportName: string;
  pages: PbixPage[];
  measures: MeasureRow[];
  modelMeasuresAvailable: boolean;
}

export interface LoadedFile {
  dashboard: PbixDashboard;
  fileName: string;
}

interface VisualConfig {
  singleVisual?: {
    visualType?: string;
    vcObjects?: {
      title?: Array<{ properties?: { text?: { expr?: { Literal?: { Value?: string } } } } }>;
    };
  };
}

interface VisualContainer {
  config?: string;
  title?: string;
}

interface LayoutSection {
  displayName?: string;
  name?: string;
  visualContainers?: VisualContainer[];
}

interface ReportLayout {
  sections?: LayoutSection[];
}

function extractVisualTitle(config: VisualConfig): string | undefined {
  try {
    const titleProps = config.singleVisual?.vcObjects?.title?.[0]?.properties?.text?.expr?.Literal?.Value;
    if (titleProps) {
      return titleProps.replace(/^'|'$/g, "");
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function parsePbixFile(buffer: Buffer, fileName: string): Promise<PbixDashboard> {
  const zip = await JSZip.loadAsync(buffer);

  const layoutFile = zip.file("Report/Layout");
  if (!layoutFile) {
    throw new Error("This file does not appear to be a valid .pbix — Report/Layout not found.");
  }

  const rawBuffer = await layoutFile.async("nodebuffer");

  let layoutText = rawBuffer.toString("utf16le");
  if (layoutText.charCodeAt(0) === 0xfeff) {
    layoutText = layoutText.slice(1);
  }

  layoutText = layoutText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  const layout: ReportLayout = JSON.parse(layoutText);

  const reportName = fileName.replace(/\.pbix$/i, "").replace(/[_-]+/g, " ");

  const pages: PbixPage[] = (layout.sections ?? []).map((section) => {
    const pageName = section.displayName ?? section.name ?? "Unnamed Page";

    const visuals: PbixVisual[] = (section.visualContainers ?? [])
      .map((vc): PbixVisual | null => {
        if (!vc.config) return null;
        try {
          const config: VisualConfig = JSON.parse(vc.config);
          const visualType = config.singleVisual?.visualType;
          if (!visualType) return null;

          const title = extractVisualTitle(config) ?? vc.title;
          return { type: visualType, title };
        } catch {
          return null;
        }
      })
      .filter((v): v is PbixVisual => v !== null);

    return { name: pageName, visuals };
  });

  return { reportName, pages, measures: [], modelMeasuresAvailable: false };
}
