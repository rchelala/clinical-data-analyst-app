#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { loadPlan } from './plan/load';
import { PowerShellClient } from './pbirs/powershell';
import { resolveCatalogItem } from './pbirs/catalog';
import { exportRdl, exportPbix } from './pbirs/export';
import { convertPdfToPng } from './output/pdf-to-png';
import { writeManifest } from './output/manifest';
import type { Manifest, ManifestPage } from './output/types';
import { log } from './utils/logger';
import { retry } from './utils/retry';

const program = new Command();

program
  .name('clinkit-capture')
  .description('Export PBIRS report pages as PNGs via the REST API')
  .requiredOption('--plan <path>', 'Path to plan.json')
  .requiredOption('--out <dir>', 'Output directory')
  .option('--force', 'Overwrite output directory if it exists', false)
  .action(async (opts: { plan: string; out: string; force: boolean }) => {
    const planPath = resolve(opts.plan);
    const outDir = resolve(opts.out);
    const framesDir = join(outDir, 'frames');

    if (existsSync(outDir) && !opts.force) {
      log.error(`Output directory already exists: ${outDir}. Use --force to overwrite.`);
      process.exit(1);
    }

    let plan: ReturnType<typeof loadPlan>;
    try {
      plan = loadPlan(planPath);
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }

    log.info(`Starting capture for "${plan!.name}" — ${plan!.pages.length} page(s)`);
    mkdirSync(framesDir, { recursive: true });

    const client = new PowerShellClient();
    const targetWidth = plan!.defaultPdfWidthPx ?? 1920;
    const manifestPages: ManifestPage[] = [];

    for (let i = 0; i < plan!.pages.length; i++) {
      const page = plan!.pages[i];
      log.step(i + 1, plan!.pages.length, `Exporting "${page.slug}"...`);
      const start = Date.now();

      try {
        let pdfBuffer: Buffer;

        if (page.reportType === 'rdl') {
          pdfBuffer = await retry(
            () => exportRdl(client, plan!.pbirsBaseUrl, page.reportPath, page.parameters ?? {}),
            2
          );
        } else {
          const catalog = await resolveCatalogItem(client, plan!.pbirsBaseUrl, page.reportPath);
          pdfBuffer = await retry(
            () => exportPbix(client, plan!.pbirsBaseUrl, catalog.id, page.pageName!),
            2
          );
        }

        const { png, width, height } = await convertPdfToPng(pdfBuffer, targetWidth);
        const pngFilename = `${page.slug}.png`;
        writeFileSync(join(framesDir, pngFilename), png);

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        log.done(`"${page.slug}" captured in ${elapsed}s (${width}x${height})`);

        manifestPages.push({
          slug: page.slug,
          pngPath: `frames/${pngFilename}`,
          widthPx: width,
          heightPx: height,
          sourceReportPath: page.reportPath,
          sourcePageName: page.pageName,
          narration: page.narration,
          durationSec: page.durationSec,
          capturedAt: new Date().toISOString(),
        });
      } catch (err) {
        log.error(`Failed to capture "${page.slug}": ${(err as Error).message}`);
        log.warn(`Skipping "${page.slug}" and continuing...`);
      }
    }

    const manifest: Manifest = {
      name: plan!.name,
      generatedAt: new Date().toISOString(),
      pages: manifestPages,
    };

    writeManifest(outDir, manifest);
    log.info(`Done. ${manifestPages.length}/${plan!.pages.length} pages captured.`);
    log.info(`Manifest: ${join(outDir, 'manifest.json')}`);
  });

program.parse(process.argv);
