#!/usr/bin/env node
import { resolve } from "node:path";

import { cac } from "cac";

import { ingestImage } from "./ingestImage";
import { ingestPdf } from "./ingestPdf";
import { localStorageAdapter } from "./storage/local";

const cli = cac("pdf-map");

cli
  .command("ingest <input>", "Ingest a PDF or image into a tiled map manifest")
  .option("--page <page>", "PDF page to ingest", {
    default: 1,
  })
  .option("--id <id>", "Manifest id")
  .option("--title <title>", "Manifest title")
  .option("--out-dir <outDir>", "Write output to a local directory")
  .option("--type <type>", "Force source type: pdf or image")
  .option("--base-url <baseUrl>", "Base URL for manifest asset references")
  .option("--adapter <adapter>", "Module path for a custom storage adapter factory")
  .option("--adapter-export <name>", "Named export for the custom storage adapter", {
    default: "default",
  })
  .option("--tile-size <tileSize>", "Tile size: 256 or 512", {
    default: 256,
  })
  .option("--format <format>", "Tile format: webp, jpeg, or png", {
    default: "webp",
  })
  .option("--quality <quality>", "Tile quality", {
    default: 92,
  })
  .option("--raster-dpi <rasterDpi>", "Rasterize PDF pages at a fixed DPI")
  .option("--max-dimension <maxDimension>", "Max raster dimension", {
    default: 12288,
  })
  .action(async (input, flags) => {
    const outDir = flags.outDir ? resolve(String(flags.outDir)) : undefined;
    const storage = flags.adapter
      ? await loadCustomAdapter(String(flags.adapter), String(flags.adapterExport))
      : outDir
        ? localStorageAdapter({
            baseDir: outDir,
            clean: true,
          })
        : undefined;

    const type = String(flags.type ?? inferType(String(input)));
    const common = {
      id: flags.id ? String(flags.id) : undefined,
      title: flags.title ? String(flags.title) : undefined,
      tileSize: Number(flags.tileSize) as 256 | 512,
      tileFormat: String(flags.format) as "webp" | "jpeg" | "png",
      tileQuality: Number(flags.quality),
      rasterDpi: flags.rasterDpi ? Number(flags.rasterDpi) : undefined,
      maxDimension: Number(flags.maxDimension),
      baseUrl: flags.baseUrl ? String(flags.baseUrl) : undefined,
      storage,
    };

    const result =
      type === "pdf"
        ? await ingestPdf({
            ...common,
            input: String(input),
            page: Number(flags.page),
          })
        : await ingestImage({
            ...common,
            input: String(input),
          });

    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
  });

cli.help();
cli.parse();

function inferType(input: string) {
  return /\.pdf$/i.test(input) ? "pdf" : "image";
}

async function loadCustomAdapter(modulePath: string, exportName: string) {
  const mod = (await import(resolve(modulePath))) as Record<string, unknown>;
  const candidate = mod[exportName];
  if (typeof candidate === "function") {
    return candidate();
  }
  if (candidate && typeof candidate === "object") {
    return candidate;
  }
  throw new Error(`Unable to load storage adapter export "${exportName}" from ${modulePath}`);
}
