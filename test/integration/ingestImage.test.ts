import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ingestImage } from "../../src/ingest/ingestImage";
import { localStorageAdapter } from "../../src/ingest/storage/local";
import { memoryStorageAdapter } from "../../src/ingest/storage/memory";

async function createSampleImage() {
  const canvas = createCanvas(1200, 800);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0f172a";
  context.fillRect(80, 120, 400, 220);
  context.fillStyle = "#2563eb";
  context.beginPath();
  context.arc(840, 420, 140, 0, Math.PI * 2);
  context.fill();
  return new Uint8Array(await canvas.encode("png"));
}

async function createLargeImage() {
  const buffer = await sharp({
    create: {
      width: 8192,
      height: 8192,
      channels: 3,
      background: "#f5f5f5",
    },
  })
    .png()
    .toBuffer();

  return new Uint8Array(buffer);
}

describe("ingestImage", () => {
  it("builds a manifest and tile set in memory", async () => {
    const result = await ingestImage({
      input: await createSampleImage(),
      id: "sample-plan",
      storage: memoryStorageAdapter(),
    });

    expect(result.manifest.id).toBe("sample-plan");
    expect(result.manifest.source.type).toBe("image");
    expect(result.tileCount).toBeGreaterThan(0);
    expect(result.uploaded.some((artifact) => artifact.kind === "manifest")).toBe(true);
    expect(result.files.some((artifact) => artifact.kind === "preview")).toBe(true);

    const tilePaths = result.files
      .filter((artifact) => artifact.kind === "tile")
      .map((artifact) => artifact.path);
    expect(tilePaths.length).toBe(result.tileCount);
    expect(tilePaths.every((path) => /^tiles\/\d+\/\d+\/\d+\.webp$/.test(path))).toBe(true);
    expect(tilePaths.some((path) => path.includes("blank"))).toBe(false);
  });

  it("normalizes jpeg tile file extensions to .jpg", async () => {
    const result = await ingestImage({
      input: await createSampleImage(),
      id: "jpeg-plan",
      tileFormat: "jpeg",
      storage: memoryStorageAdapter(),
    });

    const tilePaths = result.files
      .filter((artifact) => artifact.kind === "tile")
      .map((artifact) => artifact.path);
    expect(tilePaths.length).toBeGreaterThan(0);
    expect(tilePaths.every((path) => path.endsWith(".jpg"))).toBe(true);
  });

  it("writes a local manifest", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "pdf-map-image-"));
    const result = await ingestImage({
      input: await createSampleImage(),
      id: "local-plan",
      storage: localStorageAdapter({
        baseDir: outDir,
        clean: true,
      }),
    });

    const manifestPath = result.storage.artifacts.find((artifact) => artifact.kind === "manifest")?.path;
    expect(manifestPath).toBeTruthy();
    const manifestBytes = await readFile(manifestPath!);
    expect(JSON.parse(manifestBytes.toString("utf8")).id).toBe("local-plan");
    expect(
      result.storage.artifacts.some(
        (artifact) => artifact.kind === "tile" && /tiles\/\d+\/\d+\/\d+\.webp$/.test(artifact.path),
      ),
    ).toBe(true);
    expect(result.storage.artifacts.some((artifact) => artifact.kind === "preview")).toBe(true);
  });

  it("handles 1000+ tiles while preserving manifest level data", async () => {
    const result = await ingestImage({
      input: await createLargeImage(),
      id: "large-plan",
      storage: memoryStorageAdapter(),
    });

    expect(result.tileCount).toBeGreaterThan(1000);
    expect(result.manifest.tiles.maxZoom).toBe(5);
    expect(result.manifest.tiles.levels).toHaveLength(6);
    expect(result.manifest.tiles.levels.at(-1)).toMatchObject({
      z: 5,
      width: 8192,
      height: 8192,
      columns: 32,
      rows: 32,
    });
  });

  it("records each level's emitted tile coordinates in manifest.generatedTiles", async () => {
    const result = await ingestImage({
      input: await createSampleImage(),
      id: "coverage-invariant",
      storage: memoryStorageAdapter(),
    });

    // Build the ground-truth set of (z, x, y) keys from the tile artifacts
    // the pipeline uploaded. The manifest's per-level `generatedTiles`
    // must exactly match this set — no less (missing entries would cause
    // 404s in OSD), and no more (extra entries would mean the manifest
    // claims tiles that were never uploaded).
    const uploadedByZ = new Map<number, Set<string>>();
    for (const file of result.files) {
      if (file.kind !== "tile") continue;
      const match = file.path.match(/^tiles\/(\d+)\/(\d+)\/(\d+)\.[^.]+$/);
      expect(match).not.toBeNull();
      const z = Number(match![1]);
      const x = Number(match![2]);
      const y = Number(match![3]);
      let set = uploadedByZ.get(z);
      if (!set) {
        set = new Set();
        uploadedByZ.set(z, set);
      }
      set.add(`${x},${y}`);
    }

    for (const level of result.manifest.tiles.levels) {
      expect(level.generatedTiles).toBeDefined();
      const manifestSet = new Set(
        level.generatedTiles!.map(([x, y]) => `${x},${y}`),
      );
      const uploadedSet = uploadedByZ.get(level.z) ?? new Set<string>();
      expect(manifestSet).toEqual(uploadedSet);
      expect(level.generatedTiles!.length).toBeLessThanOrEqual(
        level.columns * level.rows,
      );
    }
  });

  it("records sparse generatedTiles when libvips skips blank tiles on a mostly-white canvas", async () => {
    // Floor-plan-style fixture: mostly white with a single colored block
    // at (0, 0). libvips' `layout: "google"` skips tiles within the
    // default --skip-blanks threshold of the background, so 15 of the 16
    // max-zoom tiles never touch disk. The manifest's `columns × rows`
    // still reflects the full addressable grid (so OSD lays tiles out
    // correctly), but `generatedTiles` records only the (0, 0) coord
    // that was actually emitted.
    const tileSize = 256;
    const width = tileSize * 4;
    const height = tileSize * 4;

    const block = await sharp({
      create: {
        width: tileSize,
        height: tileSize,
        channels: 3,
        background: { r: 12, g: 200, b: 80 },
      },
    })
      .png()
      .toBuffer();

    const input = new Uint8Array(
      await sharp({
        create: { width, height, channels: 3, background: "#ffffff" },
      })
        .composite([{ input: block, left: 0, top: 0 }])
        .png()
        .toBuffer(),
    );

    const result = await ingestImage({
      input,
      id: "sparse-coverage",
      tileSize,
      storage: memoryStorageAdapter(),
    });

    const maxLevel = result.manifest.tiles.levels.at(-1);
    expect(maxLevel).toMatchObject({ columns: 4, rows: 4 });
    expect(maxLevel!.generatedTiles).toBeDefined();
    // Sparse: libvips skipped at least one blank tile, so the emitted
    // coord count is strictly less than the full grid.
    expect(maxLevel!.generatedTiles!.length).toBeLessThan(
      maxLevel!.columns * maxLevel!.rows,
    );
    // The colored block at (0, 0) was definitely emitted.
    const emitted = new Set(
      maxLevel!.generatedTiles!.map(([x, y]) => `${x},${y}`),
    );
    expect(emitted.has("0,0")).toBe(true);
  });
});
