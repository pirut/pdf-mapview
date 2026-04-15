import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createCanvas } from "@napi-rs/canvas";
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
  });
});
