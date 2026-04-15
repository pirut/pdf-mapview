import type { RegionCollection } from "../../shared/overlays";
import type { TileFormat } from "../../shared/ingest";
import type { PdfMapManifest, TileLevelManifest } from "../../shared/manifest";
import { createManifest } from "../../shared/manifest";

export interface BuildManifestOptions {
  id: string;
  title?: string;
  sourceType: "pdf" | "image";
  originalFilename?: string;
  page?: number;
  width: number;
  height: number;
  mimeType?: string;
  tileSize: number;
  tileFormat: TileFormat;
  levels: TileLevelManifest[];
  baseUrl?: string;
  inlineOverlays?: RegionCollection;
  overlayUrl?: string;
  previewPath?: string;
}

export function buildManifest(options: BuildManifestOptions): PdfMapManifest {
  const minZoom = options.levels[0]?.z ?? 0;
  const maxZoom = options.levels[options.levels.length - 1]?.z ?? 0;

  return createManifest({
    id: options.id,
    source: {
      type: options.sourceType,
      originalFilename: options.originalFilename,
      page: options.page,
      width: options.width,
      height: options.height,
      mimeType: options.mimeType,
    },
    coordinateSpace: {
      normalized: true,
      width: options.width,
      height: options.height,
    },
    tiles: {
      tileSize: options.tileSize,
      format: options.tileFormat,
      minZoom,
      maxZoom,
      pathTemplate: withBaseUrl(options.baseUrl, `tiles/{z}/{x}/{y}.${options.tileFormat === "jpeg" ? "jpg" : options.tileFormat}`),
      levels: options.levels,
    },
    view: {
      defaultCenter: [0.5, 0.5],
      defaultZoom: 1,
      minZoom: 0,
      maxZoom: Math.max(maxZoom + 2, 6),
    },
    overlays:
      options.inlineOverlays || options.overlayUrl
        ? {
            inline: options.inlineOverlays,
            url: options.overlayUrl ? withBaseUrl(options.baseUrl, options.overlayUrl) : undefined,
          }
        : undefined,
    assets: options.previewPath
      ? {
          preview: withBaseUrl(options.baseUrl, options.previewPath),
        }
      : undefined,
    metadata: {
      title: options.title,
      createdAt: new Date().toISOString(),
    },
  });
}

function withBaseUrl(baseUrl: string | undefined, path: string) {
  if (!baseUrl) {
    return path;
  }

  if (/^https?:\/\//.test(baseUrl)) {
    return new URL(path.replace(/^\//, ""), ensureTrailingSlash(baseUrl)).toString();
  }

  return joinRelativeUrl(baseUrl, path);
}

function ensureTrailingSlash(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function joinRelativeUrl(baseUrl: string, path: string) {
  const normalizedBase = ensureLeadingSlash(stripTrailingSlash(baseUrl));
  const normalizedPath = stripLeadingSlash(path);

  if (!normalizedPath) {
    return normalizedBase || "/";
  }

  return normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`;
}

function stripLeadingSlash(value: string) {
  return value.replace(/^\/+/, "");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string) {
  if (!value) {
    return "";
  }
  return value.startsWith("/") ? value : `/${value}`;
}
