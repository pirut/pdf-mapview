import type { RegionFeature } from "../../shared/overlays";
import type { NormalizedPoint, NormalizedRect } from "../../shared/coordinates";
import type {
  MapViewState,
  ScreenPoint,
  ViewTransitionOptions,
  ViewportController,
} from "../../shared/viewport";

import { ViewportStore } from "./ViewportStore";
import { getRegionBounds } from "./overlayProjection";
import type { ViewerEngine } from "../engines/engineTypes";

export class MapController implements ViewportController {
  readonly store = new ViewportStore();
  private engine: ViewerEngine | null = null;
  private regions: RegionFeature[] = [];

  attachEngine(engine: ViewerEngine): void {
    this.engine = engine;
  }

  detachEngine(engine: ViewerEngine): void {
    if (this.engine === engine) {
      this.engine = null;
    }
  }

  setRegions(regions: RegionFeature[]): void {
    this.regions = regions;
  }

  getView(): MapViewState {
    if (this.engine) {
      return this.engine.getView();
    }
    return this.store.getSnapshot();
  }

  setView(view: Partial<MapViewState>, options?: ViewTransitionOptions): void {
    this.engine?.setView(view, options);
  }

  fitToBounds(bounds?: NormalizedRect, options?: ViewTransitionOptions): void {
    this.engine?.fitToBounds(bounds, options);
  }

  zoomToRegion(regionId: string, options?: ViewTransitionOptions): void {
    const region = this.regions.find((candidate) => candidate.id === regionId);
    if (!region) {
      return;
    }
    this.fitToBounds(getRegionBounds(region), options);
  }

  screenToNormalized(point: ScreenPoint): NormalizedPoint {
    return this.engine?.screenToNormalized(point) ?? { x: 0, y: 0 };
  }

  normalizedToScreen(point: NormalizedPoint): ScreenPoint {
    return this.engine?.normalizedToScreen(point) ?? { x: 0, y: 0 };
  }

  resize(): void {
    this.engine?.resize();
  }
}
