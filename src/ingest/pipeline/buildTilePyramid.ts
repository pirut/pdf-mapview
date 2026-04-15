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
  const maxZoom = Math.max(
    0,
    Math.ceil(Math.log2(Math.max(options.width, options.height) / options.tileSize)),
  );
  const levels: TileLevelManifest[] = [];
  const tiles: OutputArtifact[] = [];
  const source = Buffer.from(options.image);

  for (let z = 0; z <= maxZoom; z += 1) {
    const scale = 1 / 2 ** (maxZoom - z);
    const width = Math.max(1, Math.ceil(options.width * scale));
    const height = Math.max(1, Math.ceil(options.height * scale));
    const columns = Math.max(1, Math.ceil(width / options.tileSize));
    const rows = Math.max(1, Math.ceil(height / options.tileSize));

    levels.push({
      z,
      width,
      height,
      columns,
      rows,
      scale,
    });

    const levelBuffer = await sharp(source, { failOn: "none" })
      .resize({
        width,
        height,
        fit: "fill",
      })
      .png()
      .toBuffer();

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const left = x * options.tileSize;
        const top = y * options.tileSize;
        const extractWidth = Math.min(options.tileSize, width - left);
        const extractHeight = Math.min(options.tileSize, height - top);
        const tileBuffer = await sharp(levelBuffer, { failOn: "none" })
          .extract({
            left,
            top,
            width: extractWidth,
            height: extractHeight,
          })
          .toFormat(options.format, formatOptions(options.format, options.quality))
          .toBuffer();

        tiles.push({
          kind: "tile",
          path: `tiles/${z}/${x}/${y}.${extensionForFormat(options.format)}`,
          contentType: contentTypeForFormat(options.format),
          bytes: new Uint8Array(tileBuffer),
        });
      }
    }
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
