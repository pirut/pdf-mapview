import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { ingestImage } from "../../src/ingest/ingestImage";
import { ingestPdf } from "../../src/ingest/ingestPdf";
import { memoryStorageAdapter } from "../../src/ingest/storage/memory";
import type { IngestProgressEvent } from "../../src/shared/ingest";

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

async function createSamplePdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([1024, 768]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 40,
    y: 40,
    width: 400,
    height: 200,
    color: rgb(0.1, 0.3, 0.9),
  });
  page.drawText("PDF Map Sample", {
    x: 80,
    y: 400,
    size: 32,
    font,
    color: rgb(0.08, 0.1, 0.2),
  });

  return new Uint8Array(await pdf.save());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ingest progress reporting", () => {
  it("emits tile-build, upload, and finalize events in order for ingestImage", async () => {
    const events: IngestProgressEvent[] = [];

    await ingestImage({
      input: await createSampleImage(),
      id: "progress-image-order",
      storage: memoryStorageAdapter(),
      onProgress: async (event) => {
        events.push(event);
      },
    });

    // No rasterize events on the image path.
    expect(events.every((event) => event.stage !== "rasterize")).toBe(true);

    // Stage order: all tile-build events, then all upload events, then finalize.
    const stageSequence = events.map((event) => event.stage);
    const firstUpload = stageSequence.indexOf("upload");
    const firstFinalize = stageSequence.indexOf("finalize");
    const lastTileBuild = stageSequence.lastIndexOf("tile-build");
    const lastUpload = stageSequence.lastIndexOf("upload");

    expect(firstUpload).toBeGreaterThan(lastTileBuild);
    expect(firstFinalize).toBeGreaterThan(lastUpload);

    // Exactly one finalize event, and it is the terminal event.
    expect(events.filter((event) => event.stage === "finalize")).toHaveLength(1);
    expect(events.at(-1)?.stage).toBe("finalize");
  });

  it("emits rasterize, tile-build, upload, and finalize events in order for ingestPdf", async () => {
    const events: IngestProgressEvent[] = [];

    await ingestPdf({
      input: await createSamplePdf(),
      id: "progress-pdf-order",
      page: 1,
      storage: memoryStorageAdapter(),
      onProgress: async (event) => {
        events.push(event);
      },
    });

    // The first two events are rasterize:start then rasterize:complete.
    expect(events[0]).toMatchObject({ stage: "rasterize", phase: "start" });
    expect(events[1]).toMatchObject({ stage: "rasterize", phase: "complete" });

    const firstTileBuild = events.findIndex((event) => event.stage === "tile-build");
    expect(firstTileBuild).toBe(2);

    // No rasterize events after the second event.
    expect(events.slice(2).every((event) => event.stage !== "rasterize")).toBe(true);

    const stageSequence = events.map((event) => event.stage);
    const firstUpload = stageSequence.indexOf("upload");
    const firstFinalize = stageSequence.indexOf("finalize");
    const lastTileBuild = stageSequence.lastIndexOf("tile-build");
    const lastUpload = stageSequence.lastIndexOf("upload");

    expect(firstUpload).toBeGreaterThan(lastTileBuild);
    expect(firstFinalize).toBeGreaterThan(lastUpload);
    expect(events.at(-1)?.stage).toBe("finalize");
  });

  it("never decreases completed* counters within a stage", async () => {
    const events: IngestProgressEvent[] = [];

    await ingestImage({
      input: await createSampleImage(),
      id: "progress-monotonic",
      storage: memoryStorageAdapter(),
      onProgress: async (event) => {
        events.push(event);
      },
    });

    let lastCompletedLevels = 0;
    let lastCompletedTiles = 0;
    let lastCompletedArtifacts = 0;

    for (const event of events) {
      if (event.stage === "tile-build") {
        expect(event.completedLevels).toBeGreaterThanOrEqual(lastCompletedLevels);
        expect(event.completedTiles).toBeGreaterThanOrEqual(lastCompletedTiles);
        lastCompletedLevels = event.completedLevels;
        lastCompletedTiles = event.completedTiles;
      }
      if (event.stage === "upload") {
        expect(event.completedArtifacts).toBeGreaterThanOrEqual(lastCompletedArtifacts);
        lastCompletedArtifacts = event.completedArtifacts;
      }
    }
  });

  it("final event in each stage satisfies completed === total", async () => {
    const events: IngestProgressEvent[] = [];

    await ingestImage({
      input: await createSampleImage(),
      id: "progress-terminal",
      storage: memoryStorageAdapter(),
      onProgress: async (event) => {
        events.push(event);
      },
    });

    const tileBuildEvents = events.filter(
      (event): event is Extract<IngestProgressEvent, { stage: "tile-build" }> =>
        event.stage === "tile-build",
    );
    const uploadEvents = events.filter(
      (event): event is Extract<IngestProgressEvent, { stage: "upload" }> =>
        event.stage === "upload",
    );

    expect(tileBuildEvents.length).toBeGreaterThan(0);
    expect(uploadEvents.length).toBeGreaterThan(0);

    const lastTileBuild = tileBuildEvents.at(-1)!;
    expect(lastTileBuild.completedLevels).toBe(lastTileBuild.totalLevels);
    expect(lastTileBuild.completedTiles).toBe(lastTileBuild.totalTiles);

    const lastUpload = uploadEvents.at(-1)!;
    expect(lastUpload.completedArtifacts).toBe(lastUpload.totalArtifacts);
  });

  it("awaits onProgress (slow callbacks delay the pipeline)", async () => {
    const input = await createSampleImage();
    const delay = 200;

    const baselineStart = performance.now();
    await ingestImage({
      input,
      id: "progress-await-baseline",
      storage: memoryStorageAdapter(),
    });
    const baselineMs = performance.now() - baselineStart;

    const slowStart = performance.now();
    let seenTileBuildCount = 0;
    await ingestImage({
      input,
      id: "progress-await-slow",
      storage: memoryStorageAdapter(),
      onProgress: async (event) => {
        if (event.stage === "tile-build") {
          seenTileBuildCount += 1;
          if (seenTileBuildCount === 2) {
            await sleep(delay);
          }
        }
      },
    });
    const slowMs = performance.now() - slowStart;

    // Prove the callback was awaited. Use a generous fraction of the delay
    // (not the full amount) to stay non-flaky under noisy CI timing while
    // still clearly distinguishing awaited from fire-and-forget.
    expect(slowMs - baselineMs).toBeGreaterThan(delay * 0.6);
  });

  it("aborts ingest when onProgress throws, and emits no later events", async () => {
    const events: IngestProgressEvent[] = [];
    const marker = "progress callback boom";
    let seenTileBuildCount = 0;

    await expect(
      ingestImage({
        input: await createSampleImage(),
        id: "progress-throws",
        storage: memoryStorageAdapter(),
        onProgress: async (event) => {
          events.push(event);
          if (event.stage === "tile-build") {
            seenTileBuildCount += 1;
            if (seenTileBuildCount === 2) {
              throw new Error(marker);
            }
          }
        },
      }),
    ).rejects.toThrow(marker);

    // No upload or finalize events should have been delivered after the throw.
    expect(events.some((event) => event.stage === "upload")).toBe(false);
    expect(events.some((event) => event.stage === "finalize")).toBe(false);
  });
});
