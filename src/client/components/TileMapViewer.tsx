import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type { RegionFeature, RegionCollection } from "../../shared/overlays";
import type { PdfMapSource } from "../../shared/source";
import type { NormalizedRect } from "../../shared/coordinates";
import type {
  MapPointerEvent,
  MapViewState,
  ScreenPoint,
  ViewTransitionOptions,
} from "../../shared/viewport";
import { normalizeRegions } from "../../shared/overlays";
import { MapController } from "../core/MapController";
import { OverlayLayer, type RegionRenderArgs } from "./OverlayLayer";
import { createOpenSeadragonEngine } from "../engines/openSeadragonEngine";
import { createPdfJsEngine } from "../engines/pdfJsEngine";
import { MapRuntimeContext } from "../runtimeContext";

export interface MapApi {
  getView(): MapViewState;
  setView(view: Partial<MapViewState>, opts?: ViewTransitionOptions): void;
  fitToBounds(bounds?: NormalizedRect, opts?: ViewTransitionOptions): void;
  zoomToRegion(regionId: string, opts?: ViewTransitionOptions): void;
  screenToNormalized(point: ScreenPoint): { x: number; y: number };
  normalizedToScreen(point: { x: number; y: number }): ScreenPoint;
}

export interface TileMapViewerProps {
  source: PdfMapSource;
  regions?: RegionCollection | RegionFeature[];
  initialView?: Partial<MapViewState>;
  minZoom?: number;
  maxZoom?: number;
  className?: string;
  style?: React.CSSProperties;
  selectedRegionId?: string | null;
  onViewChange?: (view: MapViewState) => void;
  onRegionClick?: (region: RegionFeature, event: MapPointerEvent) => void;
  onRegionHover?: (region: RegionFeature | null, event: MapPointerEvent) => void;
  renderRegion?: (args: RegionRenderArgs) => React.ReactNode;
}

export const TileMapViewer = forwardRef<MapApi, TileMapViewerProps>(function TileMapViewer(
  props,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controller = useMemo(() => new MapController(), []);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);

  const regions = useMemo(() => normalizeRegions(props.regions), [props.regions]);

  useEffect(() => {
    controller.setRegions(regions);
  }, [controller, regions]);

  useImperativeHandle(ref, () => ({
    getView: () => controller.getView(),
    setView: (view, opts) => controller.setView(view, opts),
    fitToBounds: (bounds, opts) => controller.fitToBounds(bounds, opts),
    zoomToRegion: (regionId, opts) => controller.zoomToRegion(regionId, opts),
    screenToNormalized: (point) => controller.screenToNormalized(point),
    normalizedToScreen: (point) => controller.normalizedToScreen(point),
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let activeEngine: Awaited<ReturnType<typeof createOpenSeadragonEngine>> | null = null;

    const onViewChange = (view: MapViewState) => {
      controller.store.setState(view);
      props.onViewChange?.(view);
    };

    const createEngine = async () => {
      const engine =
        props.source.type === "pdf"
          ? await createPdfJsEngine({
              container,
              source: props.source,
              minZoom: props.minZoom,
              maxZoom: props.maxZoom,
              initialView: props.initialView,
              onViewChange,
            })
          : await createOpenSeadragonEngine({
              container,
              source: props.source,
              minZoom: props.minZoom,
              maxZoom: props.maxZoom,
              initialView: props.initialView,
              onViewChange,
            });

      if (disposed) {
        engine.destroy();
        return;
      }

      activeEngine = engine;
      controller.attachEngine(engine);
      onViewChange(engine.getView());
    };

    void createEngine();

    const resizeObserver = new ResizeObserver(() => {
      controller.resize();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (activeEngine) {
        controller.detachEngine(activeEngine);
        activeEngine.destroy();
      }
      container.innerHTML = "";
    };
  }, [controller, props.initialView, props.maxZoom, props.minZoom, props.onViewChange, props.source]);

  return (
    <MapRuntimeContext.Provider
      value={{
        controller,
        regions,
      }}
    >
      <div
        className={props.className}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 320,
          background: "#f8fafc",
          overflow: "hidden",
          ...props.style,
        }}
      >
        <div
          ref={containerRef}
          style={{
            position: "absolute",
            inset: 0,
          }}
        />
        <OverlayLayer
          regions={regions}
          selectedRegionId={props.selectedRegionId}
          hoveredRegionId={hoveredRegionId}
          onRegionClick={props.onRegionClick}
          onRegionHover={(region, event) => {
            setHoveredRegionId(region?.id ?? null);
            props.onRegionHover?.(region, event);
          }}
          renderRegion={props.renderRegion}
        />
      </div>
    </MapRuntimeContext.Provider>
  );
});
