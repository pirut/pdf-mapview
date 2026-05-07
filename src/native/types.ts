import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import type { NormalizedRect } from "../shared/coordinates";
import type { RegionCollection, RegionFeature } from "../shared/overlays";
import type { PdfMapSource, TilesSource } from "../shared/source";
import type {
  MapPointerEvent,
  MapViewState,
  ScreenPoint,
  ViewTransitionOptions,
} from "../shared/viewport";
import type { NativeTileCacheOptions, NativeTileLoadEvent } from "./core/nativeTiles";

export interface NativeMapApi {
  getView(): MapViewState;
  setView(view: Partial<MapViewState>, opts?: ViewTransitionOptions): void;
  fitToBounds(bounds?: NormalizedRect, opts?: ViewTransitionOptions): void;
  zoomToRegion(regionId: string, opts?: ViewTransitionOptions): void;
  screenToNormalized(point: ScreenPoint): { x: number; y: number };
  normalizedToScreen(point: { x: number; y: number }): ScreenPoint;
}

export interface NativeRegionRenderArgs {
  region: RegionFeature;
  isSelected: boolean;
  isHovered: boolean;
  screenBounds: { x: number; y: number; width: number; height: number };
}

export interface TileMapNativeProps {
  source: TilesSource | PdfMapSource;
  regions?: RegionCollection | RegionFeature[];
  initialView?: Partial<MapViewState>;
  selectedRegionId?: string | null;
  minZoom?: number;
  maxZoom?: number;
  style?: StyleProp<ViewStyle>;
  cache?: NativeTileCacheOptions;
  overscan?: number;
  onViewChange?: (view: MapViewState) => void;
  onRegionClick?: (region: RegionFeature, event: MapPointerEvent) => void;
  onRegionHover?: (region: RegionFeature | null, event: MapPointerEvent) => void;
  onTileLoad?: (event: NativeTileLoadEvent) => void;
  onError?: (error: Error) => void;
  renderRegionOverlay?: (args: NativeRegionRenderArgs) => ReactNode;
}

export type PdfMapNativeProps = TileMapNativeProps;

export type {
  NativeTileCacheAdapter,
  NativeTileCacheOptions,
  NativeTileDescriptor,
  NativeTileLoadEvent,
} from "./core/nativeTiles";
