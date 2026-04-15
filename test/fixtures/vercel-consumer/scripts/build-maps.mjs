import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ingestPdf, localStorageAdapter } from "pdf-map/server";

async function createFixturePdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([900, 700]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 60,
    y: 80,
    width: 320,
    height: 180,
    color: rgb(0.16, 0.39, 0.89),
  });

  page.drawText("Build-time ingest fixture", {
    x: 80,
    y: 380,
    size: 28,
    font,
    color: rgb(0.08, 0.1, 0.2),
  });

  return new Uint8Array(await pdf.save());
}

const publicDir = new URL("../public/maps/site-plan-001/", import.meta.url);
await mkdir(publicDir, { recursive: true });

const pdfPath = new URL("../plans/site-plan.pdf", import.meta.url);
await mkdir(new URL("../plans/", import.meta.url), { recursive: true });
await writeFile(pdfPath, await createFixturePdf());

const result = await ingestPdf({
  input: fileURLToPath(pdfPath),
  id: "site-plan-001",
  page: 1,
  rasterDpi: 144,
  storage: localStorageAdapter({
    baseDir: fileURLToPath(publicDir),
    clean: true,
  }),
});

const manifestPath = join(fileURLToPath(publicDir), "manifest.json");
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(
  new URL("../app/site-plan-manifest.json", import.meta.url),
  JSON.stringify(result.manifest, null, 2),
);

console.log(JSON.stringify({
  manifestId: result.manifest.id,
  tileCount: result.tileCount,
  outputDir: fileURLToPath(publicDir),
}, null, 2));
