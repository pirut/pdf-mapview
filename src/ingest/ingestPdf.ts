import { randomUUID } from "node:crypto";

import type { IngestPdfOptions, IngestResult } from "../shared/ingest";
import { inspectInput } from "./pipeline/inspectInput";
import { rasterizePdf } from "./pipeline/rasterizePdf";
import { ingestRasterizedImage } from "./ingestImage";

export async function ingestPdf(options: IngestPdfOptions): Promise<IngestResult> {
  const inspected = await inspectInput(options.input);
  const page = options.page ?? 1;
  const rasterized = await rasterizePdf({
    bytes: inspected.bytes,
    page,
    maxDimension: options.maxDimension ?? 12288,
    background: options.background ?? "#ffffff",
  });

  return ingestRasterizedImage(rasterized, {
    common: options,
    id: options.id ?? defaultId(inspected.originalFilename ?? "pdf"),
    title: options.title,
    sourceType: "pdf",
    originalFilename: inspected.originalFilename,
    mimeType: "application/pdf",
    page,
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
