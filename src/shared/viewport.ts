import type { SyntheticEvent } from "react";

import type { NormalizedPoint, NormalizedRect } from "./coordinates";

export interface MapViewState {
  center: NormalizedPoint;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  containerWidth: number;
  containerHeight: number;
}

export interface ViewTransitionOptions {
  immediate?: boolean;
  animationTime?: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface MapPointerEvent {
  screenPoint: ScreenPoint;
  normalizedPoint?: NormalizedPoint;
  nativeEvent: Event | SyntheticEvent;
}

export interface ViewportController {
  getView(): MapViewState;
  setView(view: Partial<MapViewState>, options?: ViewTransitionOptions): void;
  fitToBounds(bounds?: NormalizedRect, options?: ViewTransitionOptions): void;
  screenToNormalized(point: ScreenPoint): NormalizedPoint;
  normalizedToScreen(point: NormalizedPoint): ScreenPoint;
}
