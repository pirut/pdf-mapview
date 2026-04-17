import type { RegionCollection } from "./overlays";
import type { PdfMapManifest } from "./manifest";

export type TileFormat = "webp" | "jpeg" | "png";

export interface OutputArtifact {
  kind: "tile" | "manifest" | "preview" | "overlay";
  path: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface StoredArtifact {
  kind: OutputArtifact["kind"];
  path: string;
  contentType: string;
  size: number;
  url?: string;
  metadata?: Record<string, string>;
}

export interface StorageFinalizeResult {
  artifacts: StoredArtifact[];
  baseUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface WriteTileArgs {
  z: number;
  x: number;
  y: number;
  ext: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface WriteTileFileArgs {
  z: number;
  x: number;
  y: number;
  ext: string;
  filePath: string;
  size: number;
  contentType: string;
}

export interface WriteManifestArgs {
  path: string;
  bytes: Uint8Array;
  contentType: "application/json";
}

export interface WriteAssetArgs {
  kind: "preview" | "overlay";
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface WriteAssetFileArgs {
  kind: "preview" | "overlay";
  path: string;
  filePath: string;
  size: number;
  contentType: string;
}

export interface FinalizeStorageArgs {
  manifest: PdfMapManifest;
  artifacts: StoredArtifact[];
}

export interface StorageAdapter {
  writeTile(args: WriteTileArgs): Promise<StoredArtifact>;
  writeTileFile?(args: WriteTileFileArgs): Promise<StoredArtifact>;
  writeManifest(args: WriteManifestArgs): Promise<StoredArtifact>;
  writeAsset?(args: WriteAssetArgs): Promise<StoredArtifact>;
  writeAssetFile?(args: WriteAssetFileArgs): Promise<StoredArtifact>;
  finalize(args: FinalizeStorageArgs): Promise<StorageFinalizeResult>;
}

export interface IngestCommonOptions {
  id?: string;
  title?: string;
  tileSize?: 256 | 512;
  tileFormat?: TileFormat;
  tileQuality?: number;
  maxDimension?: number;
  rasterDpi?: number;
  background?: string;
  overlays?: RegionCollection | string;
  baseUrl?: string;
  storage?: StorageAdapter;
  retainFilesInResult?: boolean;
  writeConcurrency?: number;
  onProgress?: IngestProgressCallback;
}

/**
 * Awaitable progress callback invoked at each ingest-pipeline milestone.
 *
 * Events are delivered serially — the next event is never emitted before the
 * previous callback has settled — so consumers can safely sequence async work
 * (e.g. database writes) off each event without worrying about overlap.
 *
 * A thrown (or rejected) callback propagates out of the surrounding
 * `ingestPdf` / `ingestImage` call and aborts the ingest.
 */
export type IngestProgressCallback = (
  event: IngestProgressEvent,
) => void | Promise<void>;

/**
 * Discriminated union of all events emitted during ingest.
 *
 * Order (image): `tile-build:level-complete` (×N) → `upload:artifact-complete` (×M) → `finalize:complete`.
 *
 * Order (PDF): `rasterize:start` → `rasterize:complete` → `tile-build:level-complete` (×N) → `upload:artifact-complete` (×M) → `finalize:complete`.
 *
 * Totals (`totalLevels`, `totalTiles`, `totalArtifacts`) are populated on the
 * very first event of their stage, and the `completed*` counters are
 * monotonically non-decreasing within a stage.
 */
export type IngestProgressEvent =
  | RasterizeStartEvent
  | RasterizeCompleteEvent
  | TileLevelCompleteEvent
  | ArtifactUploadCompleteEvent
  | FinalizeCompleteEvent;

export interface RasterizeStartEvent {
  stage: "rasterize";
  phase: "start";
  /** Effective DPI the rasterizer settled on (post-maxDimension clamp). */
  effectiveDpi: number;
  requestedDpi?: number;
  maxDimension?: number;
}

export interface RasterizeCompleteEvent {
  stage: "rasterize";
  phase: "complete";
  width: number;
  height: number;
  effectiveDpi: number;
}

export interface TileLevelCompleteEvent {
  stage: "tile-build";
  phase: "level-complete";
  /** 1-indexed: 1…totalLevels. */
  completedLevels: number;
  totalLevels: number;
  completedTiles: number;
  totalTiles: number;
  /** OSD zoom level this step covered. */
  zoom: number;
  /** Tile count in just this level. */
  levelTileCount: number;
}

export interface ArtifactUploadCompleteEvent {
  stage: "upload";
  phase: "artifact-complete";
  completedArtifacts: number;
  totalArtifacts: number;
  path: string;
  kind: OutputArtifact["kind"];
}

export interface FinalizeCompleteEvent {
  stage: "finalize";
  phase: "complete";
}

export interface IngestPdfOptions extends IngestCommonOptions {
  input: string | Buffer | Uint8Array | ArrayBuffer;
  page?: number;
}

export interface IngestImageOptions extends IngestCommonOptions {
  input: string | Buffer | Uint8Array | ArrayBuffer;
}

export interface IngestResult {
  manifest: PdfMapManifest;
  width: number;
  height: number;
  tileCount: number;
  files: OutputArtifact[];
  uploaded: StoredArtifact[];
  warnings: string[];
  storage: StorageFinalizeResult;
}
