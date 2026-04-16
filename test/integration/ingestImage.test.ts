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
});
