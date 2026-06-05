import JSZip from "jszip";
import type { PbixVisual, PbixPage, PbixDashboard, MeasureRow } from "./pbix-parser";

interface VisualConfig {
  singleVisual?: {
    visualType?: string;
    vcObjects?: {
      title?: Array<{ properties?: { text?: { expr?: { Literal?: { Value?: string } } } } }>;
    };
  };
}

interface ProtoQueryFrom {
  Name: string;
  Entity: string;
}

interface ProtoQuerySelect {
  Measure?: {
    Expression: { SourceRef: { Source: string } };
    Property: string;
  };
}

interface ProtoQuery {
  From?: ProtoQueryFrom[];
  Select?: ProtoQuerySelect[];
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

function extractMeasureUsages(
  sections: LayoutSection[],
  extractTitle: (config: VisualConfig) => string | undefined
): Map<string, import("./pbix-parser").MeasureUsage[]> {
  const usageMap = new Map<string, import("./pbix-parser").MeasureUsage[]>();

  for (const section of sections) {
    const pageName = section.displayName ?? section.name ?? "Unnamed Page";

    for (const vc of section.visualContainers ?? []) {
      if (!vc.config) continue;

      let config: VisualConfig;
      try {
        config = JSON.parse(vc.config);
      } catch { continue; }

      const sv = config.singleVisual;
      if (!sv?.visualType) continue;

      const visualType = sv.visualType;
      const visualTitle = extractTitle(config) ?? vc.title ?? visualType;

      const rawProto = (sv as unknown as Record<string, unknown>).prototypeQuery;
      if (!rawProto) continue;

      let protoQuery: ProtoQuery;
      try {
        protoQuery = typeof rawProto === "string" ? JSON.parse(rawProto) : (rawProto as ProtoQuery);
      } catch { continue; }

      if (!protoQuery.From || !protoQuery.Select) continue;

      const aliasMap = new Map<string, string>();
      for (const from of protoQuery.From) {
        aliasMap.set(from.Name, from.Entity);
      }

      for (const sel of protoQuery.Select) {
        if (!sel.Measure) continue;
        const alias = sel.Measure.Expression?.SourceRef?.Source;
        const measureName = sel.Measure.Property;
        if (!alias || !measureName) continue;
        const tableName = aliasMap.get(alias);
        if (!tableName) continue;

        const key = `${tableName}::${measureName}`;
        const usage = { page: pageName, visualTitle, visualType };
        const existing = usageMap.get(key);
        if (existing) {
          existing.push(usage);
        } else {
          usageMap.set(key, [usage]);
        }
      }
    }
  }

  return usageMap;
}

interface ModelMeasureResult {
  rows: Array<{ name: string; table: string }>;
  available: boolean;
}

async function attemptModelMeasures(zip: JSZip): Promise<ModelMeasureResult> {
  const dataModelEntry = zip.file("DataModel");
  if (!dataModelEntry) return { rows: [], available: false };

  try {
    const bytes = await dataModelEntry.async("uint8array");
    const innerZip = await JSZip.loadAsync(bytes);

    const candidates = ["model.bim", "definition.bim", "schema.json", "DataModelSchema"];
    for (const candidate of candidates) {
      const file = innerZip.file(candidate);
      if (!file) continue;
      try {
        const text = await file.async("string");
        const parsed = JSON.parse(text);
        const rawTables = parsed?.model?.tables ?? parsed?.tables;
        if (!Array.isArray(rawTables)) continue;
        const tables: Array<{ name?: string; measures?: Array<{ name?: string }> }> = rawTables;
        const rows: Array<{ name: string; table: string }> = [];
        for (const table of tables) {
          for (const measure of table.measures ?? []) {
            if (measure.name) {
              rows.push({ name: measure.name, table: table.name ?? "Unknown" });
            }
          }
        }
        return { rows, available: true };
      } catch { continue; }
    }
  } catch { /* DataModel is not a ZIP or is unreadable — expected for most .pbix files */ }

  return { rows: [], available: false };
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

  let layout: ReportLayout;
  try {
    layout = JSON.parse(layoutText);
  } catch {
    throw new Error(`Failed to parse Report/Layout in "${file.name}": the file may be corrupt or unsupported.`);
  }
  const reportName = file.name.replace(/\.pbix$/i, "").replace(/[_-]+/g, " ");

  const pages: PbixPage[] = (layout.sections ?? []).map((section) => {
    const pageName = section.displayName ?? section.name ?? "Unnamed Page";
    const internalName = section.name ?? pageName;
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
    return { name: pageName, internalName, visuals };
  });

  // Extract measure usages from visual prototypeQuery configs
  const usageMap = extractMeasureUsages(layout.sections ?? [], extractVisualTitle);

  // Attempt to get full measure list from DataModel (includes unused measures)
  const { rows: modelRows, available: modelMeasuresAvailable } = await attemptModelMeasures(zip);

  // Merge: model rows are the authoritative list when available; otherwise build from usage map only
  const measureMap = new Map<string, MeasureRow>();

  if (modelMeasuresAvailable) {
    for (const { name, table } of modelRows) {
      const key = `${table}::${name}`;
      measureMap.set(key, { name, table, usages: usageMap.get(key) ?? [] });
    }
  } else {
    for (const [key, usages] of usageMap) {
      const separatorIdx = key.indexOf("::");
      const table = key.slice(0, separatorIdx);
      const name = key.slice(separatorIdx + 2);
      measureMap.set(key, { name, table, usages });
    }
  }

  const measures: MeasureRow[] = [...measureMap.values()];

  return { reportName, pages, measures, modelMeasuresAvailable };
}
