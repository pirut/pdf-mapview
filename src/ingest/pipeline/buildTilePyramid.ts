import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

import sharp from "sharp";

import type { OutputArtifact, TileFormat } from "../../shared/ingest";
import type { TileLevelManifest } from "../../shared/manifest";

export interface TileBuildResult {
  levels: TileLevelManifest[];
  tiles: OutputArtifact[];
  preview: OutputArtifact;
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
  const source = Buffer.from(options.image);
  const levels = buildTileLevels(options.width, options.height, options.tileSize);
  const tempDir = await mkdtemp(join(tmpdir(), "pdf-map-tiles-"));
  const tileOutputPath = join(tempDir, "tiles.dz");
  const tileRootDir = join(tempDir, basename(tileOutputPath, ".dz"));

  let tiles: OutputArtifact[];
  try {
    await sharp(source, { failOn: "none" })
      .toFormat(options.format, formatOptions(options.format, options.quality))
      .tile({
        size: options.tileSize,
        layout: "google",
      })
      .toFile(tileOutputPath);

    tiles = await collectGeneratedTiles(tileRootDir, options.format);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  const previewBuffer = await sharp(source, { failOn: "none" })
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();

  return {
    levels,
    tiles,
    preview: {
      kind: "preview",
      path: "preview.webp",
      contentType: "image/webp",
      bytes: new Uint8Array(previewBuffer),
    },
  };
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
): Promise<OutputArtifact[]> {
  const paths = await collectTileFilePaths(tileRootDir);
  const ext = extensionForFormat(format);
  const contentType = contentTypeForFormat(format);
  const tiles: Array<
    OutputArtifact & {
      z: number;
      x: number;
      y: number;
    }
  > = [];

  for (const path of paths) {
    const bytes = await readFile(path.filePath);
    tiles.push({
      z: path.z,
      x: path.x,
      y: path.y,
      kind: "tile",
      path: `tiles/${path.z}/${path.x}/${path.y}.${ext}`,
      contentType,
      bytes: new Uint8Array(bytes),
    });
  }

  tiles.sort((left, right) => left.z - right.z || left.x - right.x || left.y - right.y);

  return tiles.map(({ z: _z, x: _x, y: _y, ...tile }) => tile);
}

async function collectTileFilePaths(tileRootDir: string): Promise<
  Array<{
    filePath: string;
    z: number;
    x: number;
    y: number;
  }>
> {
  const tiles: Array<{
    filePath: string;
    z: number;
    x: number;
    y: number;
  }> = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

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

      tiles.push({
        filePath,
        z: Number(match[1]),
        x: Number(match[2]),
        y: Number(match[3]),
      });
    }
  }

  await walk(tileRootDir);

  return tiles;
}

function isIgnoredTileHelper(relativePath: string): boolean {
  return relativePath === "blank.png" || relativePath === "vips-properties.xml";
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
