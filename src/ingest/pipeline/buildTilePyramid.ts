import * as fs from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

import sharp from "sharp";

import type { TileFormat } from "../../shared/ingest";
import type { TileLevelManifest } from "../../shared/manifest";
import type { GeneratedAssetFile, GeneratedTileFile } from "./generatedArtifacts";

export interface TileBuildResult {
  levels: TileLevelManifest[];
  tiles: GeneratedTileFile[];
  preview: GeneratedAssetFile;
  cleanup: () => Promise<void>;
}

export interface BuildTilePyramidOptions {
  image: Uint8Array;
  width: number;
  height: number;
  tileSize: number;
  format: TileFormat;
  quality: number;
}

export async function buildTilePyramid(
  options: BuildTilePyramidOptions,
): Promise<TileBuildResult> {
  const source = Buffer.from(
    options.image.buffer,
    options.image.byteOffset,
    options.image.byteLength,
  );
  const gridLevels = buildTileLevels(options.width, options.height, options.tileSize);
  const tempDir = await fs.mkdtemp(join(tmpdir(), "pdf-map-tiles-"));
  const tileOutputPath = join(tempDir, "tiles.dz");
  const tileRootDir = join(tempDir, basename(tileOutputPath, ".dz"));
  const previewOutputPath = join(tempDir, "preview.webp");
  const cleanup = () => fs.rm(tempDir, { recursive: true, force: true });

  try {
    const base = sharp(source, { failOn: "none" });

    await Promise.all([
      base
        .clone()
        .toFormat(options.format, formatOptions(options.format, options.quality))
        .tile({
          size: options.tileSize,
          layout: "google",
        })
        .toFile(tileOutputPath),
      base
        .clone()
        .resize({
          width: 1024,
          height: 1024,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(previewOutputPath),
    ]);

    const [tiles, preview] = await Promise.all([
      collectGeneratedTiles(tileRootDir, options.format),
      createGeneratedAssetFile({
        kind: "preview",
        path: "preview.webp",
        filePath: previewOutputPath,
        contentType: "image/webp",
      }),
    ]);

    // libvips' `layout: "google"` skips tiles that are entirely the
    // background colour — a big win on floor-plan PDFs, which are mostly
    // white margin. The manifest grid (`columns × rows`) still reflects
    // the full addressable space, but we also record the set of coords
    // that were actually emitted so the OpenSeadragon tile source can
    // answer `tileExists` accurately and stop requesting blank tiles
    // that 404 at the storage layer.
    const levels = annotateLevelsWithGeneratedTiles(gridLevels, tiles);

    return {
      levels,
      tiles,
      preview,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function annotateLevelsWithGeneratedTiles(
  levels: TileLevelManifest[],
  tiles: GeneratedTileFile[],
): TileLevelManifest[] {
  const coordsByZoom = new Map<number, Array<[number, number]>>();
  for (const tile of tiles) {
    let coords = coordsByZoom.get(tile.z);
    if (!coords) {
      coords = [];
      coordsByZoom.set(tile.z, coords);
    }
    coords.push([tile.x, tile.y]);
  }

  // Row-major sort (y before x) keeps the serialized manifest
  // deterministic across re-ingests and mirrors the on-disk tile walk
  // order, making the list easy to skim in a diff.
  for (const coords of coordsByZoom.values()) {
    coords.sort((left, right) => left[1] - right[1] || left[0] - right[0]);
  }

  return levels.map((level) => ({
    ...level,
    generatedTiles: coordsByZoom.get(level.z) ?? [],
  }));
}

function buildTileLevels(width: number, height: number, tileSize: number): TileLevelManifest[] {
  const maxZoom = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
  const levels: TileLevelManifest[] = [];

  for (let z = 0; z <= maxZoom; z += 1) {
    const scale = 1 / 2 ** (maxZoom - z);
    const levelWidth = Math.max(1, Math.ceil(width * scale));
    const levelHeight = Math.max(1, Math.ceil(height * scale));

    levels.push({
      z,
      width: levelWidth,
      height: levelHeight,
      columns: Math.max(1, Math.ceil(levelWidth / tileSize)),
      rows: Math.max(1, Math.ceil(levelHeight / tileSize)),
      scale,
    });
  }

  return levels;
}

async function collectGeneratedTiles(
  tileRootDir: string,
  format: TileFormat,
): Promise<GeneratedTileFile[]> {
  const paths = await collectTileFilePaths(tileRootDir);
  const ext = extensionForFormat(format);
  const contentType = contentTypeForFormat(format);
  const tiles: GeneratedTileFile[] = paths.map((path) => ({
    z: path.z,
    x: path.x,
    y: path.y,
    kind: "tile",
    ext,
    path: `tiles/${path.z}/${path.x}/${path.y}.${ext}`,
    filePath: path.filePath,
    size: path.size,
    contentType,
  }));

  // Walk row-major within each zoom level so upload progress events fire in
  // a predictable, monotonic order regardless of how the filesystem happened
  // to enumerate libvips' `{z}/{y}/{x}.ext` tree.
  tiles.sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x);

  return tiles;
}

async function collectTileFilePaths(tileRootDir: string): Promise<
  Array<{
    filePath: string;
    z: number;
    x: number;
    y: number;
    size: number;
  }>
> {
  const tiles: Array<{
    filePath: string;
    z: number;
    x: number;
    y: number;
    size: number;
  }> = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const filePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
        continue;
      }

      const relativePath = relative(tileRootDir, filePath).split(sep).join("/");
      if (isIgnoredTileHelper(relativePath)) {
        continue;
      }

      const match = relativePath.match(/^(\d+)\/(\d+)\/(\d+)\.[^.]+$/);
      if (!match) {
        throw new Error(`Unexpected generated tile path: ${relativePath}`);
      }

      // libvips' `layout: "google"` writes `{z}/{y}/{x}.ext` (row before
      // column — the Google Maps convention), so the second path segment is
      // the row (y) and the third is the column (x). OpenSeadragon and our
      // uploaded key format (`tiles/{z}/{x}/{y}.ext`) both use x=column,
      // y=row, so we label these correctly here at the parse boundary.
      const stats = await fs.stat(filePath);
      tiles.push({
        filePath,
        z: Number(match[1]),
        y: Number(match[2]),
        x: Number(match[3]),
        size: stats.size,
      });
    }
  }

  await walk(tileRootDir);

  return tiles;
}

function isIgnoredTileHelper(relativePath: string): boolean {
  return relativePath === "blank.png" || relativePath === "vips-properties.xml";
}

async function createGeneratedAssetFile(options: {
  kind: "preview" | "overlay";
  path: string;
  filePath: string;
  contentType: string;
}): Promise<GeneratedAssetFile> {
  const stats = await fs.stat(options.filePath);

  return {
    kind: options.kind,
    path: options.path,
    filePath: options.filePath,
    size: stats.size,
    contentType: options.contentType,
  };
}

function formatOptions(format: TileFormat, quality: number) {
  switch (format) {
    case "jpeg":
      return { quality };
    case "png":
      return {};
    case "webp":
    default:
      return { quality };
  }
}

export function extensionForFormat(format: TileFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function contentTypeForFormat(format: TileFormat): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
    default:
      return "image/webp";
  }
}
