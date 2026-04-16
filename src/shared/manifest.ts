import { z } from "zod";

import { regionCollectionSchema } from "./overlays";
import type { RegionCollection } from "./overlays";
import type { TileFormat } from "./ingest";

export interface TileLevelManifest {
  z: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  scale: number;
}

export interface PdfRasterizationManifest {
  mode: "dpi" | "max-dimension";
  effectiveDpi: number;
  requestedDpi?: number;
  maxDimension?: number;
}

export interface PdfMapManifest {
  version: 1;
  kind: "pdf-map";
  id: string;
  source: {
    type: "pdf" | "image";
    originalFilename?: string;
    page?: number;
    width: number;
    height: number;
    mimeType?: string;
    rasterization?: PdfRasterizationManifest;
  };
  coordinateSpace: {
    normalized: true;
    width: number;
    height: number;
  };
  tiles: {
    tileSize: number;
    format: TileFormat;
    minZoom: number;
    maxZoom: number;
    pathTemplate: string;
    levels: TileLevelManifest[];
  };
  view: {
    defaultCenter: [number, number];
    defaultZoom: number;
    minZoom: number;
    maxZoom: number;
  };
  overlays?: {
    inline?: RegionCollection;
    url?: string;
  };
  assets?: {
    preview?: string;
  };
  metadata?: {
    title?: string;
    createdAt?: string;
    [key: string]: unknown;
  };
}

export interface CreateManifestInput extends Omit<PdfMapManifest, "version" | "kind"> {}

export interface ResolveTileUrlArgs {
  manifest: PdfMapManifest;
  z: number;
  x: number;
  y: number;
  baseUrl?: string;
  overrideTemplate?: string;
}

const tileLevelSchema = z.object({
  z: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  scale: z.number().positive(),
});

const pdfRasterizationSchema = z
  .object({
    mode: z.union([z.literal("dpi"), z.literal("max-dimension")]),
    effectiveDpi: z.number().positive(),
    requestedDpi: z.number().positive().optional(),
    maxDimension: z.number().int().positive().optional(),
  })
  .optional();

export const manifestSchema: z.ZodType<PdfMapManifest> = z.object({
  version: z.literal(1),
  kind: z.literal("pdf-map"),
  id: z.string().min(1),
  source: z.object({
    type: z.union([z.literal("pdf"), z.literal("image")]),
    originalFilename: z.string().optional(),
    page: z.number().int().positive().optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mimeType: z.string().optional(),
    rasterization: pdfRasterizationSchema,
  }),
  coordinateSpace: z.object({
    normalized: z.literal(true),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  tiles: z.object({
    tileSize: z.number().int().positive(),
    format: z.union([z.literal("webp"), z.literal("jpeg"), z.literal("png")]),
    minZoom: z.number().int().min(0),
    maxZoom: z.number().int().min(0),
    pathTemplate: z.string().min(1),
    levels: z.array(tileLevelSchema),
  }),
  view: z.object({
    defaultCenter: z.tuple([
      z.number().finite().min(0).max(1),
      z.number().finite().min(0).max(1),
    ]),
    defaultZoom: z.number().finite(),
    minZoom: z.number().finite(),
    maxZoom: z.number().finite(),
  }),
  overlays: z
    .object({
      inline: regionCollectionSchema.optional(),
      url: z.string().optional(),
    })
    .optional(),
  assets: z
    .object({
      preview: z.string().optional(),
    })
    .optional(),
  metadata: z
    .object({
      title: z.string().optional(),
      createdAt: z.string().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export function createManifest(input: CreateManifestInput): PdfMapManifest {
  return manifestSchema.parse({
    version: 1,
    kind: "pdf-map",
    ...input,
  });
}

export function parseManifest(input: unknown): PdfMapManifest {
  return manifestSchema.parse(input);
}

export function resolveTileUrl(args: ResolveTileUrlArgs): string {
  const template = args.overrideTemplate ?? args.manifest.tiles.pathTemplate;
  const relative = template
    .replaceAll("{z}", String(args.z))
    .replaceAll("{x}", String(args.x))
    .replaceAll("{y}", String(args.y));

  if (/^https?:\/\//.test(relative)) {
    return relative;
  }

  if (!args.baseUrl) {
    return relative;
  }

  if (/^https?:\/\//.test(args.baseUrl)) {
    return new URL(relative.replace(/^\//, ""), ensureTrailingSlash(args.baseUrl)).toString();
  }

  return joinRelativeUrl(args.baseUrl, relative);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function joinRelativeUrl(baseUrl: string, path: string): string {
  const normalizedBase = ensureLeadingSlash(stripTrailingSlash(baseUrl));
  const normalizedPath = stripLeadingSlash(path);

  if (!normalizedPath) {
    return normalizedBase || "/";
  }

  return normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`;
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string): string {
  if (!value) {
    return "";
  }
  return value.startsWith("/") ? value : `/${value}`;
}
