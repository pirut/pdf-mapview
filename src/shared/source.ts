import type { PdfMapManifest } from "./manifest";

export type CrossOriginPolicy = false | "Anonymous" | "use-credentials";

export interface OpenSeadragonLoadOptions {
  crossOriginPolicy?: CrossOriginPolicy;
  ajaxWithCredentials?: boolean;
}

export interface GetTileUrlArgs {
  manifest: PdfMapManifest;
  z: number;
  x: number;
  y: number;
  signal?: AbortSignal;
}

export type GetTileUrl = (args: GetTileUrlArgs) => string | Promise<string>;

export interface TilesSource {
  type: "tiles";
  manifest: PdfMapManifest;
  baseUrl?: string;
  getTileUrl?: GetTileUrl;
}

export interface ImageSource {
  type: "image";
  src: string;
  width: number;
  height: number;
}

export interface PdfSource {
  type: "pdf";
  file: string | Uint8Array | ArrayBuffer;
  page?: number;
  workerSrc?: string;
}

export type PdfMapSource = TilesSource | ImageSource | PdfSource;
