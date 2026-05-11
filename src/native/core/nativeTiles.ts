import type { PdfMapManifest, TileLevelManifest } from "../../shared/manifest";
import { resolveTileUrl } from "../../shared/manifest";
import type { GetTileUrl, PdfMapSource, TilesSource } from "../../shared/source";
import type { MapViewState } from "../../shared/viewport";
import type { NativeViewportTransform } from "./nativeViewport";
import { getNativeViewportTransform } from "./nativeViewport";

export interface NativeTileDescriptor {
  id: string;
  z: number;
  x: number;
  y: number;
  uri?: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NativeTileLoadEvent {
  tile: Pick<NativeTileDescriptor, "z" | "x" | "y">;
  status: "requested" | "loaded" | "error" | "skipped" | "cancelled";
  uri?: string;
  error?: unknown;
}

export interface NativeVisibleTilesOptions {
  source: TilesSource;
  view: MapViewState;
  overscan?: number;
}

export type NativeTileLevelInput = MapViewState | number;

export interface ResolveNativeTileUrlOptions {
  source: TilesSource;
  z: number;
  x: number;
  y: number;
  signal?: AbortSignal;
}

export interface NativeTileCacheOptions {
  enabled?: boolean;
  maxMemoryEntries?: number;
  persist?: boolean;
  namespace?: string;
  adapter?: NativeTileCacheAdapter;
}

export interface NativeTileCacheAdapter {
  get(key: string): string | undefined | Promise<string | undefined>;
  set?(key: string, uri: string): void | Promise<void>;
  delete?(key: string): void | Promise<void>;
}

export function assertNativeTilesSource(source: PdfMapSource): TilesSource {
  if (source.type === "tiles") {
    return source;
  }

  throw new Error(
    `pdf-mapview/native only renders prebuilt tile manifests. Received source.type="${source.type}". ` +
      "Run pdf-mapview/ingest or pdf-mapview/server before passing the source to TileMapNative.",
  );
}

export function getNativeTileLevel(
  manifest: PdfMapManifest,
  viewOrZoom: NativeTileLevelInput,
): TileLevelManifest {
  const levels = [...manifest.tiles.levels].sort((left, right) => left.z - right.z);
  if (levels.length === 0) {
    throw new Error(`Manifest "${manifest.id}" does not include any tile levels.`);
  }

  const targetScale = getTargetTileScale(manifest, viewOrZoom);
  let best = levels[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  if (typeof viewOrZoom === "number") {
    for (const level of levels) {
      const distance = Math.abs(level.scale - targetScale);
      if (distance < bestDistance || (distance === bestDistance && level.z > best.z)) {
        best = level;
        bestDistance = distance;
      }
    }

    return best;
  }

  for (const level of levels) {
    if (level.scale + 0.000000001 < targetScale) {
      continue;
    }

    const distance = Math.abs(level.scale - targetScale);
    if (distance < bestDistance || (distance === bestDistance && level.z < best.z)) {
      best = level;
      bestDistance = distance;
    }
  }

  if (bestDistance === Number.POSITIVE_INFINITY) {
    for (const level of levels) {
      const distance = Math.abs(level.scale - targetScale);
      if (distance < bestDistance || (distance === bestDistance && level.z > best.z)) {
        best = level;
        bestDistance = distance;
      }
    }
  }

  return best;
}

export function getNativeVisibleTiles(options: NativeVisibleTilesOptions): NativeTileDescriptor[] {
  const { source, view } = options;
  const manifest = source.manifest;
  const activeLevel = getNativeTileLevel(manifest, view);
  const transform = getNativeViewportTransform(manifest, view);
  const overscan = options.overscan ?? manifest.tiles.tileSize;
  const descriptors = getNativeVisibleTileLevels(manifest, activeLevel).flatMap((level) =>
    getNativeTileDescriptorsForLevel({
      manifest,
      view,
      transform,
      level,
      overscan,
    }),
  );

  descriptors.sort((left, right) => {
    const leftDistance = distanceToViewportCenter(left, view);
    const rightDistance = distanceToViewportCenter(right, view);
    return (
      left.z - right.z ||
      leftDistance - rightDistance ||
      left.y - right.y ||
      left.x - right.x
    );
  });

  return descriptors;
}

function getNativeVisibleTileLevels(
  manifest: PdfMapManifest,
  activeLevel: TileLevelManifest,
): TileLevelManifest[] {
  const levels = [...manifest.tiles.levels].sort((left, right) => left.z - right.z);
  const activeIndex = levels.findIndex((level) => level.z === activeLevel.z);

  if (activeIndex <= 0) {
    return [activeLevel];
  }

  return [levels[activeIndex - 1], activeLevel];
}

function getNativeTileDescriptorsForLevel(options: {
  manifest: PdfMapManifest;
  view: MapViewState;
  transform: NativeViewportTransform;
  level: TileLevelManifest;
  overscan: number;
}): NativeTileDescriptor[] {
  const { manifest, view, transform, level, overscan } = options;
  const tileWidth = manifest.tiles.tileSize / level.scale;
  const tileHeight = manifest.tiles.tileSize / level.scale;
  const visible = getVisibleSourceRect(transform, view, overscan);
  const minX = Math.max(0, Math.floor(visible.x / tileWidth));
  const maxX = Math.min(level.columns - 1, Math.floor((visible.x + visible.width) / tileWidth));
  const minY = Math.max(0, Math.floor(visible.y / tileHeight));
  const maxY = Math.min(level.rows - 1, Math.floor((visible.y + visible.height) / tileHeight));
  const descriptors: NativeTileDescriptor[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!nativeTileExists(level, x, y)) {
        continue;
      }

      const sourceLeft = x * tileWidth;
      const sourceTop = y * tileHeight;
      const sourceRight = Math.min(sourceLeft + tileWidth, manifest.source.width);
      const sourceBottom = Math.min(sourceTop + tileHeight, manifest.source.height);

      descriptors.push({
        id: getNativeTileKey(manifest, level.z, x, y),
        z: level.z,
        x,
        y,
        left: transform.offsetX + sourceLeft * transform.scale,
        top: transform.offsetY + sourceTop * transform.scale,
        width: (sourceRight - sourceLeft) * transform.scale,
        height: (sourceBottom - sourceTop) * transform.scale,
      });
    }
  }

  return descriptors;
}

export function nativeTileExists(level: TileLevelManifest, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.columns || y >= level.rows) {
    return false;
  }

  if (!level.generatedTiles) {
    return true;
  }

  return level.generatedTiles.some(([tileX, tileY]) => tileX === x && tileY === y);
}

export async function resolveNativeTileUrl(
  options: ResolveNativeTileUrlOptions,
): Promise<string> {
  const { source, z, x, y, signal } = options;
  throwIfAborted(signal);

  if (source.getTileUrl) {
    const uri = await resolveSignedTileUrl(source.getTileUrl, source.manifest, z, x, y, signal);
    throwIfAborted(signal);
    return uri;
  }

  return resolveTileUrl({
    manifest: source.manifest,
    z,
    x,
    y,
    baseUrl: source.baseUrl,
  });
}

export function getNativeTileKey(manifest: PdfMapManifest, z: number, x: number, y: number): string {
  return `${manifest.id}:${z}:${x}:${y}`;
}

function getVisibleSourceRect(
  transform: NativeViewportTransform,
  view: MapViewState,
  overscan: number,
) {
  const left = (-transform.offsetX - overscan) / transform.scale;
  const top = (-transform.offsetY - overscan) / transform.scale;
  const right = (view.containerWidth - transform.offsetX + overscan) / transform.scale;
  const bottom = (view.containerHeight - transform.offsetY + overscan) / transform.scale;

  return {
    x: Math.max(0, left),
    y: Math.max(0, top),
    width: Math.max(0, Math.min(transform.sourceWidth, right) - Math.max(0, left)),
    height: Math.max(0, Math.min(transform.sourceHeight, bottom) - Math.max(0, top)),
  };
}

export function getTargetTileScale(
  manifest: PdfMapManifest,
  viewOrZoom: NativeTileLevelInput,
): number {
  const maxLevel = manifest.tiles.levels.reduce(
    (current, level) => (level.scale > current.scale ? level : current),
    manifest.tiles.levels[0],
  );

  if (typeof viewOrZoom === "number") {
    return Math.max(0.000001, Math.min(maxLevel.scale, viewOrZoom * maxLevel.scale));
  }

  const view = viewOrZoom;
  const sourceWidth = manifest.source.width;
  const sourceHeight = manifest.source.height;
  const containerWidth = view?.containerWidth ?? 0;
  const containerHeight = view?.containerHeight ?? 0;
  const zoom = view?.zoom ?? 1;

  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return Math.max(0.000001, Math.min(maxLevel.scale, zoom * maxLevel.scale));
  }

  const baseScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  return Math.max(0.000001, Math.min(maxLevel.scale, baseScale * zoom));
}

function distanceToViewportCenter(tile: NativeTileDescriptor, view: MapViewState): number {
  const centerX = tile.left + tile.width / 2;
  const centerY = tile.top + tile.height / 2;
  const dx = centerX - view.containerWidth / 2;
  const dy = centerY - view.containerHeight / 2;
  return dx * dx + dy * dy;
}

async function resolveSignedTileUrl(
  getTileUrl: GetTileUrl,
  manifest: PdfMapManifest,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
) {
  const uri = await getTileUrl({ manifest, z, x, y, signal });
  if (typeof uri !== "string" || uri.length === 0) {
    throw new Error(`getTileUrl returned an invalid URI for tile ${z}/${x}/${y}.`);
  }
  return uri;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Native tile request cancelled.");
    error.name = "AbortError";
    throw error;
  }
}
