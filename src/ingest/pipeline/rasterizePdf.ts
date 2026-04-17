import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

export interface RasterizedPdf {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  rasterization: {
    mode: "dpi" | "max-dimension";
    effectiveDpi: number;
    requestedDpi?: number;
    maxDimension?: number;
  };
}

export interface RasterizePdfOptions {
  bytes: Uint8Array;
  page: number;
  maxDimension: number;
  rasterDpi?: number;
  background: string;
  /**
   * Optional hook fired after the PDF is loaded and the render scale has been
   * resolved, but before the page is rasterized. The effective DPI is not
   * knowable until this point, so progress-style "rasterize start" events must
   * be emitted from here rather than from the caller.
   *
   * Awaited — any thrown/rejected value propagates and aborts rasterization.
   */
  onBeforeRender?: (info: {
    effectiveDpi: number;
    requestedDpi?: number;
    maxDimension?: number;
  }) => void | Promise<void>;
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
  const scale = resolveScale({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    maxDimension: options.maxDimension,
    rasterDpi: options.rasterDpi,
  });
  const scaledViewport = page.getViewport({
    scale: scale <= 0 ? 1 : scale,
  });

  const hasRequestedDpi =
    options.rasterDpi !== undefined &&
    Number.isFinite(options.rasterDpi) &&
    options.rasterDpi > 0;

  if (options.onBeforeRender) {
    await options.onBeforeRender({
      effectiveDpi: scale * 72,
      requestedDpi: hasRequestedDpi ? options.rasterDpi : undefined,
      maxDimension: hasRequestedDpi ? undefined : options.maxDimension,
    });
  }

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
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    scale,
    rasterization: {
      mode: options.rasterDpi && Number.isFinite(options.rasterDpi) && options.rasterDpi > 0
        ? "dpi"
        : "max-dimension",
      effectiveDpi: scale * 72,
      requestedDpi:
        options.rasterDpi && Number.isFinite(options.rasterDpi) && options.rasterDpi > 0
          ? options.rasterDpi
          : undefined,
      maxDimension:
        options.rasterDpi && Number.isFinite(options.rasterDpi) && options.rasterDpi > 0
          ? undefined
          : options.maxDimension,
    },
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

function resolveScale(options: {
  viewportWidth: number;
  viewportHeight: number;
  maxDimension: number;
  rasterDpi?: number;
}) {
  if (options.rasterDpi && Number.isFinite(options.rasterDpi) && options.rasterDpi > 0) {
    return options.rasterDpi / 72;
  }

  return Math.min(
    1,
    options.maxDimension / Math.max(options.viewportWidth, options.viewportHeight),
  );
}
