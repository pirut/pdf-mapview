import { randomUUID } from "node:crypto";

import type {
  IngestCommonOptions,
  IngestImageOptions,
  IngestResult,
  OutputArtifact,
} from "../shared/ingest";
import type { RegionCollection } from "../shared/overlays";
import { memoryStorageAdapter } from "./storage/memory";
import { inspectInput } from "./pipeline/inspectInput";
import { normalizeImage } from "./pipeline/normalizeImage";
import { buildTilePyramid } from "./pipeline/buildTilePyramid";
import { buildManifest } from "./pipeline/manifestBuilder";
import { writeArtifacts } from "./pipeline/writeArtifacts";

export async function ingestImage(options: IngestImageOptions): Promise<IngestResult> {
  const inspected = await inspectInput(options.input);

  const normalized = await normalizeImage({
    bytes: inspected.bytes,
    maxDimension: options.maxDimension ?? 12288,
    background: options.background ?? "#ffffff",
  });

  return ingestRasterizedImage(normalized, {
    common: options,
    id: options.id ?? defaultId(inspected.originalFilename ?? "image"),
    title: options.title,
    sourceType: "image",
    originalFilename: inspected.originalFilename,
    mimeType: normalized.mimeType,
  });
}

export async function ingestRasterizedImage(
  normalized: { bytes: Uint8Array; width: number; height: number; mimeType: string },
  input: {
    common: IngestCommonOptions;
    id: string;
    title?: string;
    sourceType: "image" | "pdf";
    originalFilename?: string;
    mimeType?: string;
    page?: number;
  },
): Promise<IngestResult> {
  const tileSize = input.common.tileSize ?? 256;
  const tileFormat = input.common.tileFormat ?? "webp";
  const tileQuality = input.common.tileQuality ?? 92;
  const storage = input.common.storage ?? memoryStorageAdapter();

  const pyramid = await buildTilePyramid({
    image: normalized.bytes,
    width: normalized.width,
    height: normalized.height,
    tileSize,
    format: tileFormat,
    quality: tileQuality,
  });

  const overlayPayload = await resolveOverlayPayload(input.common.overlays);

  const manifest = buildManifest({
    id: input.id,
    title: input.title,
    sourceType: input.sourceType,
    originalFilename: input.originalFilename,
    page: input.page,
    width: normalized.width,
    height: normalized.height,
    mimeType: input.mimeType ?? normalized.mimeType,
    tileSize,
    tileFormat,
    levels: pyramid.levels,
    baseUrl: input.common.baseUrl,
    inlineOverlays: overlayPayload.inline,
    overlayUrl: overlayPayload.url,
    previewPath: pyramid.preview.path,
  });

  const files: OutputArtifact[] = [...pyramid.tiles, pyramid.preview];

  if (overlayPayload.file) {
    files.push(overlayPayload.file);
  }

  files.push({
    kind: "manifest",
    path: "manifest.json",
    contentType: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });

  const { uploaded, storage: storageResult } = await writeArtifacts(storage, manifest, files);

  return {
    manifest,
    width: normalized.width,
    height: normalized.height,
    tileCount: pyramid.tiles.length,
    files,
    uploaded,
    warnings: [],
    storage: storageResult,
  };
}

async function resolveOverlayPayload(
  input?: RegionCollection | string,
): Promise<{
  inline?: RegionCollection;
  url?: string;
  file?: OutputArtifact;
}> {
  if (!input) {
    return {};
  }

  if (typeof input === "string") {
    return {
      url: input,
    };
  }

  const bytes = new TextEncoder().encode(JSON.stringify(input, null, 2));
  if (bytes.byteLength < 64 * 1024) {
    return {
      inline: input,
    };
  }

  return {
    url: "regions.json",
    file: {
      kind: "overlay",
      path: "regions.json",
      contentType: "application/json",
      bytes,
    },
  };
}

function defaultId(seed: string) {
  const safe = seed
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || randomUUID();
}
