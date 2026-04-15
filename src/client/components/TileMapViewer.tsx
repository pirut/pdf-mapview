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
  const sourceRef = useRef(props.source);
  const initialViewRef = useRef(props.initialView);
  const onViewChangeRef = useRef(props.onViewChange);

  sourceRef.current = props.source;
  initialViewRef.current = props.initialView;
  onViewChangeRef.current = props.onViewChange;

  const regions = useMemo(() => normalizeRegions(props.regions), [props.regions]);
  const sourceKey = useMemo(() => getSourceKey(props.source), [props.source]);
  const initialViewKey = useMemo(() => getInitialViewKey(props.initialView), [props.initialView]);
  const mapApi = useMemo<MapApi>(
    () => ({
      getView: () => controller.getView(),
      setView: (view, opts) => controller.setView(view, opts),
      fitToBounds: (bounds, opts) => controller.fitToBounds(bounds, opts),
      zoomToRegion: (regionId, opts) => controller.zoomToRegion(regionId, opts),
      screenToNormalized: (point) => controller.screenToNormalized(point),
      normalizedToScreen: (point) => controller.normalizedToScreen(point),
    }),
    [controller],
  );

  useEffect(() => {
    controller.setRegions(regions);
  }, [controller, regions]);

  useImperativeHandle(ref, () => mapApi, [mapApi]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const abortController = new AbortController();
    let activeEngine: Awaited<ReturnType<typeof createOpenSeadragonEngine>> | null = null;

    const onViewChange = (view: MapViewState) => {
      controller.store.setState(view);
      onViewChangeRef.current?.(view);
    };

    const createEngine = async () => {
      try {
        const source = sourceRef.current;
        const initialView = initialViewRef.current;

        if (
          abortController.signal.aborted ||
          containerRef.current !== container ||
          !container.isConnected
        ) {
          return;
        }

        const engine =
          source.type === "pdf"
            ? await createPdfJsEngine({
                container,
                source,
                minZoom: props.minZoom,
                maxZoom: props.maxZoom,
                initialView,
                onViewChange,
                signal: abortController.signal,
              })
            : await createOpenSeadragonEngine({
                container,
                source,
                minZoom: props.minZoom,
                maxZoom: props.maxZoom,
                initialView,
                onViewChange,
                signal: abortController.signal,
              });

        if (
          abortController.signal.aborted ||
          containerRef.current !== container ||
          !container.isConnected
        ) {
          engine.destroy();
          return;
        }

        activeEngine = engine;
        controller.attachEngine(engine);
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          console.error(error);
        }
      }
    };

    void createEngine();

    const resizeObserver = new ResizeObserver(() => {
      controller.resize();
    });
    resizeObserver.observe(container);

    return () => {
      abortController.abort();
      resizeObserver.disconnect();
      if (activeEngine) {
        controller.detachEngine(activeEngine);
        activeEngine.destroy();
      }
      if (containerRef.current === container) {
        container.innerHTML = "";
      }
    };
  }, [controller, initialViewKey, props.maxZoom, props.minZoom, sourceKey]);

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

const objectIdCache = new WeakMap<object, number>();
let nextObjectId = 1;

function getSourceKey(source: PdfMapSource): string {
  switch (source.type) {
    case "tiles":
      return JSON.stringify({
        type: source.type,
        manifestId: source.manifest.id,
        width: source.manifest.source.width,
        height: source.manifest.source.height,
        pathTemplate: source.manifest.tiles.pathTemplate,
        minZoom: source.manifest.tiles.minZoom,
        maxZoom: source.manifest.tiles.maxZoom,
        baseUrl: source.baseUrl ?? null,
        getTileUrl: source.getTileUrl ? getObjectId(source.getTileUrl) : null,
      });
    case "image":
      return JSON.stringify({
        type: source.type,
        src: source.src,
        width: source.width,
        height: source.height,
      });
    case "pdf":
      return JSON.stringify({
        type: source.type,
        page: source.page ?? 1,
        file: typeof source.file === "string" ? source.file : getObjectId(source.file),
      });
  }
}

function getInitialViewKey(initialView?: Partial<MapViewState>): string {
  if (!initialView) {
    return "null";
  }

  return JSON.stringify({
    center: initialView.center
      ? {
          x: initialView.center.x,
          y: initialView.center.y,
        }
      : null,
    zoom: initialView.zoom ?? null,
    minZoom: initialView.minZoom ?? null,
    maxZoom: initialView.maxZoom ?? null,
  });
}

function getObjectId(value: object): number {
  const existing = objectIdCache.get(value);
  if (existing) {
    return existing;
  }
  const id = nextObjectId;
  nextObjectId += 1;
  objectIdCache.set(value, id);
  return id;
}
