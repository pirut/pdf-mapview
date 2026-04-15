import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

export interface RasterizedPdf {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
}

export interface RasterizePdfOptions {
  bytes: Uint8Array;
  page: number;
  maxDimension: number;
  background: string;
}

interface PdfJsModule {
  getDocument: (src: unknown) => {
    promise: Promise<any>;
  };
}

export async function rasterizePdf(options: RasterizePdfOptions): Promise<RasterizedPdf> {
  installNodeCanvasGlobals();
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsModule;
  const loadingTask = pdfjs.getDocument({
    data: options.bytes,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(options.page);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1, options.maxDimension / Math.max(viewport.width, viewport.height));
  const scaledViewport = page.getViewport({
    scale: scale <= 0 ? 1 : scale,
  });

  const canvas = createCanvas(Math.ceil(scaledViewport.width), Math.ceil(scaledViewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = options.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context as never,
    viewport: scaledViewport,
  }).promise;

  const png = await canvas.encode("png");

  await page.cleanup();
  await pdf.cleanup();
  await pdf.destroy();

  return {
    bytes: new Uint8Array(png),
    width: canvas.width,
    height: canvas.height,
    mimeType: "image/png",
  };
}

function installNodeCanvasGlobals() {
  if (!("DOMMatrix" in globalThis)) {
    (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
  }
  if (!("ImageData" in globalThis)) {
    (globalThis as Record<string, unknown>).ImageData = ImageData;
  }
  if (!("Path2D" in globalThis)) {
    (globalThis as Record<string, unknown>).Path2D = Path2D;
  }
}
