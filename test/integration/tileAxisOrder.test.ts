import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ingestImage } from "../../src/ingest/ingestImage";
import { memoryStorageAdapter } from "../../src/ingest/storage/memory";
import type { OutputArtifact } from "../../src/shared/ingest";

/**
 * Regression tests for the tile axis-swap bug that shipped in 0.4.0.
 *
 * libvips (via `sharp.tile({ layout: "google" })`) writes tiles to disk as
 * `{z}/{y}/{x}.ext` — row before column, matching Google Maps' convention.
 * `collectTileFilePaths` previously mapped the second path segment to `x`
 * and the third to `y`, which silently scrambled every non-square zoom
 * level (e.g. a 4×1 grid shipped a phantom 1×4 tile column instead).
 *
 * The bug couldn't be caught with square fixtures because `row == col`
 * trivially aligns on square levels. These tests deliberately use a 4:1
 * aspect image so `columns !== rows` at every zoom level ≥ 1.
 */

async function createWideStripeImage(options: {
  width: number;
  height: number;
  tileSize: number;
}) {
  const { width, height, tileSize } = options;
  const columns = Math.ceil(width / tileSize);

  // Paint each tile column a distinct solid color so that, if the axes are
  // scrambled on disk, decoded tile bytes at different columns differ in a
  // way we can detect without relying on fragile byte-exact comparisons.
  const stripes: Buffer[] = [];
  for (let i = 0; i < columns; i += 1) {
    // Monotonically-stepping red channel per column (52, 102, 152, 202, …)
    // keeps the color palette far from pure black/white and far enough apart
    // that a mean-color comparison comfortably distinguishes them.
    const red = 52 + i * 50;
    stripes.push(
      await sharp({
        create: {
          width: tileSize,
          height,
          channels: 3,
          background: { r: red, g: 40, b: 40 },
        },
      })
        .png()
        .toBuffer(),
    );
  }

  const composite = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ffffff",
    },
  }).composite(
    stripes.map((input, index) => ({
      input,
      left: index * tileSize,
      top: 0,
    })),
  );

  const buffer = await composite.png().toBuffer();
  return new Uint8Array(buffer);
}

function tileArtifacts(files: OutputArtifact[]) {
  return files.filter((artifact) => artifact.kind === "tile");
}

async function meanRed(bytes: Uint8Array): Promise<number> {
  const { data, info } = await sharp(bytes)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    sum += data[i];
  }
  return sum / pixels;
}

describe("tile axis order (regression)", () => {
  it("emits tiles at tiles/{z}/{col}/{row} for a 4×1 non-square grid", async () => {
    const tileSize = 256;
    // 4 tiles wide × 1 tile tall at the max zoom: columns=4, rows=1.
    const width = tileSize * 4;
    const height = tileSize;

    const result = await ingestImage({
      input: await createWideStripeImage({ width, height, tileSize }),
      id: "axis-order-wide",
      tileSize,
      storage: memoryStorageAdapter(),
    });

    const maxZoom = result.manifest.tiles.maxZoom;
    const maxLevel = result.manifest.tiles.levels.at(-1);
    expect(maxLevel).toMatchObject({ z: maxZoom, columns: 4, rows: 1 });

    const tilePaths = tileArtifacts(result.files).map((artifact) => artifact.path);

    // Bug witness #1: with the old code, libvips' on-disk row (y=0, always
    // present because rows=1) was labeled as x, so `tiles/{maxZ}/0/3.webp`
    // existed even though (col=0, row=3) falls outside the actual image.
    expect(tilePaths).not.toContain(`tiles/${maxZoom}/0/3.webp`);
    expect(tilePaths).not.toContain(`tiles/${maxZoom}/0/1.webp`);
    expect(tilePaths).not.toContain(`tiles/${maxZoom}/0/2.webp`);

    // Bug witness #2: the actually-existing tiles at (col∈0..3, row=0) must
    // be addressable at `tiles/{maxZ}/{col}/0.webp` — i.e. the column index
    // appears in the second path segment, not the third.
    for (let col = 0; col < 4; col += 1) {
      expect(tilePaths).toContain(`tiles/${maxZoom}/${col}/0.webp`);
    }

    // A fully-populated 4×1 level has exactly 4 tiles, no phantom rows.
    const maxZoomTilePaths = tilePaths.filter((path) =>
      path.startsWith(`tiles/${maxZoom}/`),
    );
    expect(maxZoomTilePaths).toHaveLength(4);
  });

  it("also applies the fix to an intermediate non-square level (2×1)", async () => {
    const tileSize = 256;
    const width = tileSize * 4;
    const height = tileSize;

    const result = await ingestImage({
      input: await createWideStripeImage({ width, height, tileSize }),
      id: "axis-order-wide-intermediate",
      tileSize,
      storage: memoryStorageAdapter(),
    });

    // maxZoom is a 4×1 grid; the level below it is a 2×1 grid — also
    // non-square, and therefore also in scope for the bug.
    const intermediate = result.manifest.tiles.levels.find(
      (level) => level.columns === 2 && level.rows === 1,
    );
    expect(intermediate).toBeDefined();

    const { z } = intermediate!;
    const tilePaths = tileArtifacts(result.files).map((artifact) => artifact.path);
    const zPaths = tilePaths.filter((path) => path.startsWith(`tiles/${z}/`));

    expect(zPaths).toHaveLength(2);
    expect(zPaths).toContain(`tiles/${z}/0/0.webp`);
    expect(zPaths).toContain(`tiles/${z}/1/0.webp`);
    expect(zPaths).not.toContain(`tiles/${z}/0/1.webp`);
  });

  it("decoded tile bytes at distinct (col, row) keys are distinct", async () => {
    const tileSize = 256;
    const width = tileSize * 4;
    const height = tileSize;

    const result = await ingestImage({
      input: await createWideStripeImage({ width, height, tileSize }),
      id: "axis-order-decode",
      tileSize,
      storage: memoryStorageAdapter(),
    });

    const maxZoom = result.manifest.tiles.maxZoom;
    const tiles = tileArtifacts(result.files);

    const pathBytes = new Map(tiles.map((artifact) => [artifact.path, artifact.bytes]));

    const tile00 = pathBytes.get(`tiles/${maxZoom}/0/0.webp`);
    const tile30 = pathBytes.get(`tiles/${maxZoom}/3/0.webp`);
    expect(tile00).toBeDefined();
    expect(tile30).toBeDefined();

    // If both keys happened to point at the same underlying bytes, a
    // future regression where `collectGeneratedTiles` collapses both
    // diagonal entries onto one blob would be silently swallowed by the
    // path-level assertions above. Decoding each tile and comparing mean
    // red channels catches that: the stripe image paints col 0 at red≈52
    // and col 3 at red≈202, so the means must differ by ≥ ~100.
    const [mean00, mean30] = await Promise.all([meanRed(tile00!), meanRed(tile30!)]);
    expect(Math.abs(mean00 - mean30)).toBeGreaterThan(50);
  });
});
