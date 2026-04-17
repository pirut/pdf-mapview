import type { PdfMapManifest } from "./manifest";

export type CrossOriginPolicy = false | "Anonymous" | "use-credentials";

/**
 * Structural subset of OpenSeadragon's `GestureSettings`. OpenSeadragon does not
 * ship type declarations, so this hand-rolled shape covers the gesture knobs
 * consumers are most likely to override per input device (mouse / touch / pen).
 */
export interface OpenSeadragonGestureSettings {
  scrollToZoom?: boolean;
  clickToZoom?: boolean;
  dblClickToZoom?: boolean;
  dblClickDragToZoom?: boolean;
  pinchToZoom?: boolean;
  zoomToRefPoint?: boolean;
  flickEnabled?: boolean;
  flickMinSpeed?: number;
  flickMomentum?: number;
  pinchRotate?: boolean;
  dragToPan?: boolean;
}

export interface OpenSeadragonLoadOptions {
  crossOriginPolicy?: CrossOriginPolicy;
  ajaxWithCredentials?: boolean;
  /**
   * Convenience shortcut to disable (or enable) momentum fling on drag-release
   * for mouse, touch, and pen in one place. Per-input `gestureSettings*`
   * overrides take precedence over this value.
   *
   * @default true
   */
  flickEnabled?: boolean;
  /** Override OpenSeadragon mouse gesture settings. Overrides `flickEnabled`. */
  gestureSettingsMouse?: OpenSeadragonGestureSettings;
  /** Override OpenSeadragon touch gesture settings. Overrides `flickEnabled`. */
  gestureSettingsTouch?: OpenSeadragonGestureSettings;
  /** Override OpenSeadragon pen gesture settings. Overrides `flickEnabled`. */
  gestureSettingsPen?: OpenSeadragonGestureSettings;
}

export interface GetTileUrlArgs {
  manifest: PdfMapManifest;
  z: number;
  x: number;
  y: number;
  signal?: AbortSignal;
}

export type GetTileUrl = (args: GetTileUrlArgs) => string | Promise<string>;

export interface TilesSource {
  type: "tiles";
  manifest: PdfMapManifest;
  baseUrl?: string;
  getTileUrl?: GetTileUrl;
}

export interface ImageSource {
  type: "image";
  src: string;
  width: number;
  height: number;
}

export interface PdfSource {
  type: "pdf";
  file: string | Uint8Array | ArrayBuffer;
  page?: number;
  workerSrc?: string;
}

export type PdfMapSource = TilesSource | ImageSource | PdfSource;
