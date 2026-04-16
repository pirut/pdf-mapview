import type { PdfMapSource } from "../../shared/source";
import type { OpenSeadragonLoadOptions } from "../../shared/source";
import type { MapViewState, ViewTransitionOptions, ViewportController } from "../../shared/viewport";
import type { NormalizedRect } from "../../shared/coordinates";

export interface EngineInitOptions {
  source: PdfMapSource;
  container: HTMLElement;
  minZoom?: number;
  maxZoom?: number;
  initialView?: Partial<MapViewState>;
  onViewChange?: (view: MapViewState) => void;
  openSeadragon?: OpenSeadragonLoadOptions;
  signal?: AbortSignal;
}

export interface ViewerEngine extends ViewportController {
  destroy(): void;
  resize(): void;
  getContainer(): HTMLElement;
  fitToBounds(bounds?: NormalizedRect, options?: ViewTransitionOptions): void;
}
