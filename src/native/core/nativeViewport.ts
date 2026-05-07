import type { NormalizedPoint, NormalizedRect } from "../../shared/coordinates";
import { clamp01 } from "../../shared/coordinates";
import type { PdfMapManifest } from "../../shared/manifest";
import { resolveManifestView } from "../../shared/manifest";
import type { MapViewState, ScreenPoint, ViewTransitionOptions } from "../../shared/viewport";

export interface NativeViewportSize {
  width: number;
  height: number;
}

export interface NativeViewportTransform {
  sourceWidth: number;
  sourceHeight: number;
  baseScale: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ResolveNativeViewOptions {
  manifest: PdfMapManifest;
  container: NativeViewportSize;
  initialView?: Partial<MapViewState>;
  minZoom?: number;
  maxZoom?: number;
}

export function resolveNativeInitialView(options: ResolveNativeViewOptions): MapViewState {
  const manifestView = resolveManifestView(options.manifest);
  const minZoom = options.minZoom ?? manifestView.minZoom;
  const maxZoom = options.maxZoom ?? manifestView.maxZoom;
  const zoom = clampZoom(options.initialView?.zoom ?? manifestView.defaultZoom, minZoom, maxZoom);

  return {
    center: options.initialView?.center ?? {
      x: manifestView.defaultCenter[0],
      y: manifestView.defaultCenter[1],
    },
    zoom,
    minZoom,
    maxZoom,
    containerWidth: options.container.width,
    containerHeight: options.container.height,
  };
}

export function getNativeViewportTransform(
  manifest: PdfMapManifest,
  view: MapViewState,
): NativeViewportTransform {
  const sourceWidth = manifest.source.width;
  const sourceHeight = manifest.source.height;
  const baseScale =
    view.containerWidth > 0 && view.containerHeight > 0
      ? Math.min(view.containerWidth / sourceWidth, view.containerHeight / sourceHeight)
      : 1;
  const scale = baseScale * view.zoom;
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;

  return {
    sourceWidth,
    sourceHeight,
    baseScale,
    scale,
    offsetX: view.containerWidth / 2 - view.center.x * scaledWidth,
    offsetY: view.containerHeight / 2 - view.center.y * scaledHeight,
  };
}

export function normalizedToNativeScreen(
  manifest: PdfMapManifest,
  view: MapViewState,
  point: NormalizedPoint,
): ScreenPoint {
  const transform = getNativeViewportTransform(manifest, view);
  return {
    x: transform.offsetX + point.x * transform.sourceWidth * transform.scale,
    y: transform.offsetY + point.y * transform.sourceHeight * transform.scale,
  };
}

export function nativeScreenToNormalized(
  manifest: PdfMapManifest,
  view: MapViewState,
  point: ScreenPoint,
): NormalizedPoint {
  const transform = getNativeViewportTransform(manifest, view);
  return {
    x: clamp01((point.x - transform.offsetX) / (transform.sourceWidth * transform.scale)),
    y: clamp01((point.y - transform.offsetY) / (transform.sourceHeight * transform.scale)),
  };
}

export function applyNativePan(
  manifest: PdfMapManifest,
  view: MapViewState,
  delta: ScreenPoint,
): MapViewState {
  const transform = getNativeViewportTransform(manifest, view);
  const nextCenter = {
    x: view.center.x - delta.x / (transform.sourceWidth * transform.scale),
    y: view.center.y - delta.y / (transform.sourceHeight * transform.scale),
  };

  return clampNativeView(manifest, {
    ...view,
    center: nextCenter,
  });
}

export function applyNativeZoom(
  manifest: PdfMapManifest,
  view: MapViewState,
  nextZoom: number,
  focalPoint?: ScreenPoint,
): MapViewState {
  const clampedZoom = clampZoom(nextZoom, view.minZoom, view.maxZoom);
  if (!focalPoint || clampedZoom === view.zoom) {
    return clampNativeView(manifest, { ...view, zoom: clampedZoom });
  }

  const focalBefore = nativeScreenToNormalized(manifest, view, focalPoint);
  const nextView = clampNativeView(manifest, { ...view, zoom: clampedZoom });
  const focalAfter = normalizedToNativeScreen(manifest, nextView, focalBefore);
  return applyNativePan(manifest, nextView, {
    x: focalPoint.x - focalAfter.x,
    y: focalPoint.y - focalAfter.y,
  });
}

export function fitNativeBounds(
  manifest: PdfMapManifest,
  view: MapViewState,
  bounds?: NormalizedRect,
  _options?: ViewTransitionOptions,
): MapViewState {
  if (!bounds) {
    const manifestView = resolveManifestView(manifest);
    return clampNativeView(manifest, {
      ...view,
      center: {
        x: manifestView.defaultCenter[0],
        y: manifestView.defaultCenter[1],
      },
      zoom: clampZoom(manifestView.defaultZoom, view.minZoom, view.maxZoom),
    });
  }

  const transform = getNativeViewportTransform(manifest, { ...view, zoom: 1 });
  const zoomX = view.containerWidth / (bounds.width * transform.sourceWidth * transform.baseScale);
  const zoomY = view.containerHeight / (bounds.height * transform.sourceHeight * transform.baseScale);
  const zoom = clampZoom(Math.min(zoomX || view.maxZoom, zoomY || view.maxZoom), view.minZoom, view.maxZoom);

  return clampNativeView(manifest, {
    ...view,
    center: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    zoom,
  });
}

export function resizeNativeView(view: MapViewState, size: NativeViewportSize): MapViewState {
  return {
    ...view,
    containerWidth: size.width,
    containerHeight: size.height,
  };
}

export function clampNativeView(_manifest: PdfMapManifest, view: MapViewState): MapViewState {
  return {
    ...view,
    center: {
      x: clamp01(view.center.x),
      y: clamp01(view.center.y),
    },
    zoom: clampZoom(view.zoom, view.minZoom, view.maxZoom),
  };
}

function clampZoom(value: number, minZoom: number, maxZoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, value));
}
