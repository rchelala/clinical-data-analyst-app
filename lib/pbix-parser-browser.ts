import JSZip from "jszip";
import type { PbixVisual, PbixPage, PbixDashboard } from "./pbix-parser";

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
    const val = config.singleVisual?.vcObjects?.title?.[0]?.properties?.text?.expr?.Literal?.Value;
    if (val) return val.replace(/^'|'$/g, "");
  } catch { /* ignore */ }
  return undefined;
}

export async function parsePbixFileClient(file: File): Promise<PbixDashboard> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const layoutFile = zip.file("Report/Layout");
  if (!layoutFile) {
    throw new Error("This file does not appear to be a valid .pbix — Report/Layout not found.");
  }

  const rawBytes = await layoutFile.async("uint8array");
  let layoutText = new TextDecoder("utf-16le").decode(rawBytes);
  if (layoutText.charCodeAt(0) === 0xfeff) {
    layoutText = layoutText.slice(1);
  }
  // Strip control characters invalid in JSON strings (keep \t=9, \n=10, \r=13)
  layoutText = layoutText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  const layout: ReportLayout = JSON.parse(layoutText);
  const reportName = file.name.replace(/\.pbix$/i, "").replace(/[_-]+/g, " ");

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
        } catch { return null; }
      })
      .filter((v): v is PbixVisual => v !== null);
    return { name: pageName, visuals };
  });

  return { reportName, pages };
}
