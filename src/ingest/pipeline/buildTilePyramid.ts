import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Canvas } from "@napi-rs/canvas";

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
  const source = await loadImage(Buffer.from(options.image));

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

    const levelCanvas = createCanvas(width, height);
    const levelContext = levelCanvas.getContext("2d");
    levelContext.drawImage(source, 0, 0, width, height);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const left = x * options.tileSize;
        const top = y * options.tileSize;
        const extractWidth = Math.min(options.tileSize, width - left);
        const extractHeight = Math.min(options.tileSize, height - top);
        const tileCanvas = createCanvas(extractWidth, extractHeight);
        const tileContext = tileCanvas.getContext("2d");
        tileContext.drawImage(levelCanvas, -left, -top);
        const tileBuffer = await encodeTile(tileCanvas, options.format, options.quality);

        tiles.push({
          kind: "tile",
          path: `tiles/${z}/${x}/${y}.${extensionForFormat(options.format)}`,
          contentType: contentTypeForFormat(options.format),
          bytes: new Uint8Array(tileBuffer),
        });
      }
    }
  }

  const previewScale = Math.min(1024 / options.width, 1024 / options.height, 1);
  const previewCanvas = createCanvas(
    Math.max(1, Math.round(options.width * previewScale)),
    Math.max(1, Math.round(options.height * previewScale)),
  );
  const previewContext = previewCanvas.getContext("2d");
  previewContext.drawImage(source, 0, 0, previewCanvas.width, previewCanvas.height);
  const previewBuffer = await previewCanvas.encode("webp", 80);

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

async function encodeTile(canvas: Canvas, format: TileFormat, quality: number) {
  switch (format) {
    case "jpeg":
      return canvas.encode("jpeg", quality);
    case "png":
      return canvas.encode("png");
    case "webp":
    default:
      return canvas.encode("webp", quality);
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
