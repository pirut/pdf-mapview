import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api";

import { clamp01 } from "../../shared/coordinates";
import type { MapViewState, ScreenPoint, ViewTransitionOptions } from "../../shared/viewport";
import type { EngineInitOptions, ViewerEngine } from "./engineTypes";

interface PdfJsModule {
  getDocument: (src: unknown) => {
    promise: Promise<any>;
    destroy?: () => void;
  };
}

export async function createPdfJsEngine(options: EngineInitOptions): Promise<ViewerEngine> {
  if (options.source.type !== "pdf") {
    throw new Error("PDF.js engine only supports PDF sources.");
  }

  const pdfjs = (await import("pdfjs-dist/build/pdf.mjs")) as PdfJsModule;
  const file = options.source.file;
  const loadingTask = pdfjs.getDocument(
    typeof file === "string"
      ? {
          url: file,
          disableWorker: true,
        }
      : {
          data: file instanceof ArrayBuffer ? new Uint8Array(file) : file,
          disableWorker: true,
        },
  );
  const pdf = (await loadingTask.promise) as PDFDocumentProxy;
  const page = (await pdf.getPage(options.source.page ?? 1)) as PDFPageProxy;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to get 2D context for PDF canvas.");
  }

  options.container.innerHTML = "";
  options.container.style.overflow = "hidden";
  options.container.style.touchAction = "none";
  options.container.appendChild(canvas);

  const baseViewport = page.getViewport({ scale: 1 });
  const containerRect = options.container.getBoundingClientRect();
  const fitScale =
    containerRect.width > 0 && containerRect.height > 0
      ? Math.min(containerRect.width / baseViewport.width, containerRect.height / baseViewport.height)
      : 1;
  const renderScale = Math.max(1, fitScale);

  const renderedViewport = page.getViewport({ scale: renderScale });
  canvas.width = Math.ceil(renderedViewport.width);
  canvas.height = Math.ceil(renderedViewport.height);
  canvas.style.transformOrigin = "0 0";
  canvas.style.willChange = "transform";

  await page.render({
    canvasContext: context,
    viewport: renderedViewport,
  }).promise;

  let view: MapViewState = {
    center: options.initialView?.center ?? { x: 0.5, y: 0.5 },
    zoom: options.initialView?.zoom ?? 1,
    minZoom: options.minZoom ?? 0.5,
    maxZoom: options.maxZoom ?? 8,
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
  };

  let pan = { x: 0, y: 0 };
  let dragging = false;
  let dragOrigin = { x: 0, y: 0 };

  const publish = () => {
    options.onViewChange?.({ ...view });
  };

  const applyTransform = () => {
    const rect = options.container.getBoundingClientRect();
    view = {
      ...view,
      containerWidth: rect.width,
      containerHeight: rect.height,
    };
    canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${view.zoom})`;
    publish();
  };

  const normalizedToCanvas = (point: ScreenPoint) => ({
    x: point.x * canvas.width,
    y: point.y * canvas.height,
  });

  const screenToNormalized = (point: ScreenPoint) => {
    const localX = (point.x - pan.x) / view.zoom;
    const localY = (point.y - pan.y) / view.zoom;
    return {
      x: clamp01(localX / canvas.width),
      y: clamp01(localY / canvas.height),
    };
  };

  const handlePointerDown = (event: PointerEvent) => {
    dragging = true;
    dragOrigin = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragging) {
      return;
    }
    pan = {
      x: event.clientX - dragOrigin.x,
      y: event.clientY - dragOrigin.y,
    };
    applyTransform();
  };

  const handlePointerUp = () => {
    dragging = false;
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.min(view.maxZoom, Math.max(view.minZoom, view.zoom * delta));
    view = {
      ...view,
      zoom: nextZoom,
    };
    applyTransform();
  };

  options.container.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  options.container.addEventListener("wheel", handleWheel, { passive: false });

  applyTransform();

  const engine: ViewerEngine = {
    getView() {
      return { ...view };
    },
    setView(nextView, transitionOptions) {
      if (nextView.center) {
        view = { ...view, center: nextView.center };
      }
      if (typeof nextView.zoom === "number") {
        view = {
          ...view,
          zoom: Math.min(view.maxZoom, Math.max(view.minZoom, nextView.zoom)),
        };
      }
      if (nextView.minZoom) {
        view = { ...view, minZoom: nextView.minZoom };
      }
      if (nextView.maxZoom) {
        view = { ...view, maxZoom: nextView.maxZoom };
      }
      if (transitionOptions?.immediate === false) {
        requestAnimationFrame(applyTransform);
      } else {
        applyTransform();
      }
    },
    fitToBounds(bounds) {
      if (!bounds) {
        view = { ...view, center: { x: 0.5, y: 0.5 }, zoom: 1 };
        pan = { x: 0, y: 0 };
        applyTransform();
        return;
      }

      const rect = options.container.getBoundingClientRect();
      const zoomX = rect.width / (bounds.width * canvas.width || canvas.width);
      const zoomY = rect.height / (bounds.height * canvas.height || canvas.height);
      const nextZoom = Math.min(view.maxZoom, Math.max(view.minZoom, Math.min(zoomX, zoomY)));
      const centerX = (bounds.x + bounds.width / 2) * canvas.width * nextZoom;
      const centerY = (bounds.y + bounds.height / 2) * canvas.height * nextZoom;
      pan = {
        x: rect.width / 2 - centerX,
        y: rect.height / 2 - centerY,
      };
      view = {
        ...view,
        center: {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
        zoom: nextZoom,
      };
      applyTransform();
    },
    screenToNormalized,
    normalizedToScreen(point) {
      const local = normalizedToCanvas(point);
      return {
        x: pan.x + local.x * view.zoom,
        y: pan.y + local.y * view.zoom,
      };
    },
    destroy() {
      options.container.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      options.container.removeEventListener("wheel", handleWheel);
      loadingTask.destroy?.();
    },
    resize() {
      applyTransform();
    },
    getContainer() {
      return options.container;
    },
  };

  return engine;
}
