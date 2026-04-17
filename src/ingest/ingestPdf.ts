import { randomUUID } from "node:crypto";

import type { IngestPdfOptions, IngestResult } from "../shared/ingest";
import { inspectInput } from "./pipeline/inspectInput";
import { rasterizePdf } from "./pipeline/rasterizePdf";
import { ingestRasterizedImage } from "./ingestImage";
import { createProgressReporter } from "./pipeline/progressReporter";

export async function ingestPdf(options: IngestPdfOptions): Promise<IngestResult> {
  const inspected = await inspectInput(options.input);
  const page = options.page ?? 1;
  const report = createProgressReporter(options.onProgress);

  const rasterized = await rasterizePdf({
    bytes: inspected.bytes,
    page,
    maxDimension: options.maxDimension ?? 12288,
    rasterDpi: options.rasterDpi,
    background: options.background ?? "#ffffff",
    onBeforeRender: async ({ effectiveDpi, requestedDpi, maxDimension }) => {
      await report({
        stage: "rasterize",
        phase: "start",
        effectiveDpi,
        requestedDpi,
        maxDimension,
      });
    },
  });

  await report({
    stage: "rasterize",
    phase: "complete",
    width: rasterized.width,
    height: rasterized.height,
    effectiveDpi: rasterized.rasterization.effectiveDpi,
  });

  return ingestRasterizedImage(rasterized, {
    common: options,
    id: options.id ?? defaultId(inspected.originalFilename ?? "pdf"),
    title: options.title,
    sourceType: "pdf",
    originalFilename: inspected.originalFilename,
    mimeType: "application/pdf",
    page,
    rasterization: rasterized.rasterization,
    report,
  });
}

function defaultId(seed: string) {
  const safe = seed
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || randomUUID();
}
