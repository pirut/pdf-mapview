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

export interface FinalizeStorageArgs {
  manifest: PdfMapManifest;
  artifacts: StoredArtifact[];
}

export interface StorageAdapter {
  writeTile(args: WriteTileArgs): Promise<StoredArtifact>;
  writeManifest(args: WriteManifestArgs): Promise<StoredArtifact>;
  writeAsset?(args: WriteAssetArgs): Promise<StoredArtifact>;
  finalize(args: FinalizeStorageArgs): Promise<StorageFinalizeResult>;
}

export interface IngestCommonOptions {
  id?: string;
  title?: string;
  tileSize?: 256 | 512;
  tileFormat?: TileFormat;
  tileQuality?: number;
  maxDimension?: number;
  background?: string;
  overlays?: RegionCollection | string;
  baseUrl?: string;
  storage?: StorageAdapter;
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
