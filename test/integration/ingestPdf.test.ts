import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { ingestPdf } from "../../src/ingest/ingestPdf";
import { memoryStorageAdapter } from "../../src/ingest/storage/memory";

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

describe("ingestPdf", () => {
  it("works with a Uint8Array input", async () => {
    const result = await ingestPdf({
      input: await createSamplePdf(),
      id: "pdf-plan",
      page: 1,
      storage: memoryStorageAdapter(),
    });

    expect(result.manifest.id).toBe("pdf-plan");
    expect(result.manifest.source.type).toBe("pdf");
    expect(result.manifest.source.page).toBe(1);
    expect(result.tileCount).toBeGreaterThan(0);
  });

  it("works with a Buffer input", async () => {
    const result = await ingestPdf({
      input: Buffer.from(await createSamplePdf()),
      id: "pdf-plan-buffer",
      page: 1,
      storage: memoryStorageAdapter(),
    });

    expect(result.manifest.id).toBe("pdf-plan-buffer");
    expect(result.tileCount).toBeGreaterThan(0);
  });

  it("works with a file path input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdf-map-path-"));
    const filePath = join(dir, "sample.pdf");
    await writeFile(filePath, Buffer.from(await createSamplePdf()));

    const result = await ingestPdf({
      input: filePath,
      id: "pdf-plan-path",
      page: 1,
      storage: memoryStorageAdapter(),
    });

    expect(result.manifest.id).toBe("pdf-plan-path");
    expect(result.manifest.source.originalFilename).toBe("sample.pdf");
    expect(result.tileCount).toBeGreaterThan(0);
  });

  it("supports rasterizing a PDF at a requested DPI", async () => {
    const result = await ingestPdf({
      input: await createSamplePdf(),
      id: "pdf-plan-dpi",
      page: 1,
      rasterDpi: 144,
      storage: memoryStorageAdapter(),
    });

    expect(result.manifest.id).toBe("pdf-plan-dpi");
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1536);
    expect(result.tileCount).toBeGreaterThan(0);
  });
});
