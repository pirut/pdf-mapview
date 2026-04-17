import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import type {
  IngestCommonOptions,
  IngestImageOptions,
  IngestResult,
  OutputArtifact,
} from "../shared/ingest";
import type { RegionCollection } from "../shared/overlays";
import type { PdfRasterizationManifest } from "../shared/manifest";
import { memoryStorageAdapter } from "./storage/memory";
import { mapWithConcurrency, resolveConcurrency } from "./pipeline/concurrency";
import type { PersistableArtifact } from "./pipeline/generatedArtifacts";
import { isGeneratedFileArtifact } from "./pipeline/generatedArtifacts";
import { inspectInput } from "./pipeline/inspectInput";
import { normalizeImage } from "./pipeline/normalizeImage";
import { buildTilePyramid } from "./pipeline/buildTilePyramid";
import { buildManifest } from "./pipeline/manifestBuilder";
import { writeArtifacts } from "./pipeline/writeArtifacts";
import {
  createProgressReporter,
  type ProgressReporter,
} from "./pipeline/progressReporter";

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
    rasterization?: PdfRasterizationManifest;
    /**
     * Pre-built reporter shared with earlier stages (PDF path). When omitted,
     * a fresh reporter is created from `common.onProgress` so direct callers
     * of `ingestImage` get progress out of the box.
     */
    report?: ProgressReporter;
  },
): Promise<IngestResult> {
  const tileSize = input.common.tileSize ?? 256;
  const tileFormat = input.common.tileFormat ?? "webp";
  const tileQuality = input.common.tileQuality ?? 92;
  const storage = input.common.storage ?? memoryStorageAdapter();
  const retainFilesInResult = input.common.retainFilesInResult !== false;
  const report = input.report ?? createProgressReporter(input.common.onProgress);

  const pyramid = await buildTilePyramid({
    image: normalized.bytes,
    width: normalized.width,
    height: normalized.height,
    tileSize,
    format: tileFormat,
    quality: tileQuality,
  });

  try {
    // Tile-build events. `sharp.tile()` produces the entire pyramid in a
    // single call (no per-level callbacks), so we synthesize one
    // `level-complete` event per zoom level once the pyramid is ready. Totals
    // are populated on the very first event and counters are monotonic.
    const tilesByZoom = new Map<number, number>();
    for (const tile of pyramid.tiles) {
      tilesByZoom.set(tile.z, (tilesByZoom.get(tile.z) ?? 0) + 1);
    }

    const totalLevels = pyramid.levels.length;
    const totalTiles = pyramid.tiles.length;
    let completedTiles = 0;
    for (let i = 0; i < pyramid.levels.length; i++) {
      const level = pyramid.levels[i];
      const levelTileCount = tilesByZoom.get(level.z) ?? 0;
      completedTiles += levelTileCount;
      await report({
        stage: "tile-build",
        phase: "level-complete",
        completedLevels: i + 1,
        totalLevels,
        completedTiles,
        totalTiles,
        zoom: level.z,
        levelTileCount,
      });
    }

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
      rasterization: input.rasterization,
      tileSize,
      tileFormat,
      levels: pyramid.levels,
      baseUrl: input.common.baseUrl,
      inlineOverlays: overlayPayload.inline,
      overlayUrl: overlayPayload.url,
      previewPath: pyramid.preview.path,
    });

    const filesToWrite: PersistableArtifact[] = [...pyramid.tiles, pyramid.preview];

    if (overlayPayload.file) {
      filesToWrite.push(overlayPayload.file);
    }

    filesToWrite.push({
      kind: "manifest",
      path: "manifest.json",
      contentType: "application/json",
      bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    });

    const { uploaded, storage: storageResult } = await writeArtifacts(
      storage,
      manifest,
      filesToWrite,
      {
        writeConcurrency: input.common.writeConcurrency,
        report,
        totalArtifacts: filesToWrite.length,
      },
    );

    const files = retainFilesInResult
      ? await materializeArtifacts(filesToWrite, input.common.writeConcurrency)
      : [];

    await report({ stage: "finalize", phase: "complete" });

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
  } finally {
    await pyramid.cleanup();
  }
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

async function materializeArtifacts(
  files: PersistableArtifact[],
  concurrency?: number,
): Promise<OutputArtifact[]> {
  return mapWithConcurrency(
    files,
    resolveConcurrency(concurrency),
    async (file): Promise<OutputArtifact> => {
      if (!isGeneratedFileArtifact(file)) {
        return file;
      }

      const bytes = await fs.readFile(file.filePath);
      return {
        kind: file.kind,
        path: file.path,
        contentType: file.contentType,
        bytes: new Uint8Array(bytes),
      };
    },
  );
}
