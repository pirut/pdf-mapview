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
  it("rasterizes a PDF page and produces a pdf manifest", async () => {
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
});
