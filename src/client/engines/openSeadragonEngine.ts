import { clamp01 } from "../../shared/coordinates";
import { resolveTileUrl } from "../../shared/manifest";
import type { OpenSeadragonLoadOptions } from "../../shared/source";
import type { NormalizedPoint } from "../../shared/coordinates";
import type { MapViewState, ScreenPoint, ViewTransitionOptions } from "../../shared/viewport";
import type { EngineInitOptions, ViewerEngine } from "./engineTypes";

interface OpenSeadragonModule {
  default: {
    (options: Record<string, unknown>): any;
    Point: new (x: number, y: number) => any;
    Rect: new (x: number, y: number, width: number, height: number) => any;
  };
}

export async function createOpenSeadragonEngine(
  options: EngineInitOptions,
): Promise<ViewerEngine> {
  throwIfAborted(options.signal);
  const OpenSeadragon = (await import("openseadragon")) as unknown as OpenSeadragonModule;
  throwIfAborted(options.signal);
  if (!options.container.isConnected) {
    throw createAbortError();
  }
  const osd = OpenSeadragon.default;

  const {
    flickEnabled,
    gestureSettingsMouse,
    gestureSettingsTouch,
    gestureSettingsPen,
  } = options.openSeadragon ?? {};
  // Preserve the package's historical default of flick-enabled unless the
  // consumer explicitly opts out via `flickEnabled: false`.
  const flick = flickEnabled ?? true;

  const viewer = osd({
    element: options.container,
    showNavigationControl: false,
    minZoomLevel: options.minZoom,
    maxZoomLevel: options.maxZoom,
    visibilityRatio: 1,
    constrainDuringPan: true,
    animationTime: 0.2,
    crossOriginPolicy: options.openSeadragon?.crossOriginPolicy,
    ajaxWithCredentials: options.openSeadragon?.ajaxWithCredentials,
    // Spread order: hardcoded defaults < flick shortcut < explicit per-input
    // overrides. This matches the documented precedence in the README.
    gestureSettingsMouse: {
      clickToZoom: false,
      dblClickToZoom: true,
      pinchToZoom: true,
      flickEnabled: flick,
      scrollToZoom: true,
      ...gestureSettingsMouse,
    },
    // OpenSeadragon defaults touch and pen to flick-enabled, so we must mirror
    // the mouse flick setting here — otherwise a mouse-only fix still fires
    // momentum on tablets and stylus devices.
    gestureSettingsTouch: { flickEnabled: flick, ...gestureSettingsTouch },
    gestureSettingsPen: { flickEnabled: flick, ...gestureSettingsPen },
    tileSources: createTileSource(options.source, options.openSeadragon),
  });
  if (options.signal?.aborted || !options.container.isConnected) {
    viewer.destroy();
    throw createAbortError();
  }

  let isOpen = false;

  const publish = () => {
    options.onViewChange?.(getView());
  };

  viewer.addHandler("open", () => {
    isOpen = true;
    if (options.initialView?.center) {
      viewer.viewport.panTo(
        imageToViewportPoint(options.initialView.center.x, options.initialView.center.y),
        true,
      );
    }
    if (typeof options.initialView?.zoom === "number") {
      viewer.viewport.zoomTo(options.initialView.zoom, undefined, true);
    }
    publish();
  });
  viewer.addHandler("animation", publish);
  viewer.addHandler("resize", publish);

  const dimensions = getDimensions(options.source);
  const defaultView = getDefaultView(options, dimensions);

  const getItem = () => {
    const item = viewer.world.getItemAt(0);
    return item && typeof item.viewportToImageCoordinates === "function" ? item : null;
  };

  const getContainerSize = () => {
    const containerSize = viewer.container.getBoundingClientRect();
    return {
      width: containerSize.width,
      height: containerSize.height,
    };
  };

  const imageToViewportPoint = (x: number, y: number) => {
    const item = getItem();
    if (!item) {
      return new osd.Point(x, y);
    }
    return item.imageToViewportCoordinates(x * dimensions.width, y * dimensions.height);
  };

  const getView = (): MapViewState => {
    const item = getItem();
    const containerSize = getContainerSize();
    if (!isOpen || !item) {
      return {
        ...defaultView,
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
      };
    }

    const center = viewer.viewport.getCenter(true);
    const imageCenter = item.viewportToImageCoordinates(center);
    return {
      center: {
        x: clamp01(imageCenter.x / dimensions.width),
        y: clamp01(imageCenter.y / dimensions.height),
      },
      zoom: viewer.viewport.getZoom(true),
      minZoom: options.minZoom ?? 0,
      maxZoom: options.maxZoom ?? 8,
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    };
  };

  const engine: ViewerEngine = {
    getView,
    setView(view, transitionOptions) {
      if (!isOpen || !getItem()) {
        return;
      }
      if (view.center) {
        viewer.viewport.panTo(
          imageToViewportPoint(view.center.x, view.center.y),
          transitionOptions?.immediate ?? false,
        );
      }
      if (typeof view.zoom === "number") {
        viewer.viewport.zoomTo(view.zoom, undefined, transitionOptions?.immediate ?? false);
      }
      publish();
    },
    fitToBounds(bounds, transitionOptions) {
      const item = getItem();
      if (!isOpen || !item) {
        return;
      }
      if (!bounds) {
        viewer.viewport.goHome(transitionOptions?.immediate ?? false);
        publish();
        return;
      }

      const topLeft = item.imageToViewportCoordinates(
        bounds.x * dimensions.width,
        bounds.y * dimensions.height,
      );
      const bottomRight = item.imageToViewportCoordinates(
        (bounds.x + bounds.width) * dimensions.width,
        (bounds.y + bounds.height) * dimensions.height,
      );

      viewer.viewport.fitBounds(
        new osd.Rect(
          topLeft.x,
          topLeft.y,
          bottomRight.x - topLeft.x || 0.01,
          bottomRight.y - topLeft.y || 0.01,
        ),
        transitionOptions?.immediate ?? false,
      );
      publish();
    },
    screenToNormalized(point: ScreenPoint) {
      const item = getItem();
      if (!isOpen || !item) {
        const size = getContainerSize();
        return {
          x: size.width > 0 ? clamp01(point.x / size.width) : 0,
          y: size.height > 0 ? clamp01(point.y / size.height) : 0,
        };
      }
      const viewportPoint = viewer.viewport.pointFromPixel(
        new osd.Point(point.x, point.y),
        true,
      );
      const imagePoint = item.viewportToImageCoordinates(viewportPoint);
      return {
        x: clamp01(imagePoint.x / dimensions.width),
        y: clamp01(imagePoint.y / dimensions.height),
      };
    },
    normalizedToScreen(point: NormalizedPoint) {
      if (!isOpen || !getItem()) {
        const size = getContainerSize();
        return {
          x: point.x * size.width,
          y: point.y * size.height,
        };
      }
      const viewportPoint = imageToViewportPoint(point.x, point.y);
      const pixel = viewer.viewport.pixelFromPoint(viewportPoint, true);
      return {
        x: pixel.x,
        y: pixel.y,
      };
    },
    destroy() {
      isOpen = false;
      viewer.destroy();
    },
    resize() {
      viewer.forceRedraw();
      publish();
    },
    getContainer() {
      return options.container;
    },
  };

  return engine;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError() {
  const error = new Error("Viewer initialization aborted.");
  error.name = "AbortError";
  return error;
}

function getDefaultView(
  options: EngineInitOptions,
  dimensions: { width: number; height: number },
): MapViewState {
  const manifestView = options.source.type === "tiles" ? options.source.manifest.view : undefined;

  return {
    center: options.initialView?.center ?? normalizedCenterFromSource(options.source),
    zoom: options.initialView?.zoom ?? manifestView?.defaultZoom ?? 1,
    minZoom: options.minZoom ?? manifestView?.minZoom ?? 0,
    maxZoom: options.maxZoom ?? manifestView?.maxZoom ?? 8,
    containerWidth: dimensions.width,
    containerHeight: dimensions.height,
  };
}

function normalizedCenterFromSource(source: EngineInitOptions["source"]) {
  if (source.type === "tiles") {
    return {
      x: source.manifest.view.defaultCenter[0],
      y: source.manifest.view.defaultCenter[1],
    };
  }

  return { x: 0.5, y: 0.5 };
}

function createTileSource(
  source: EngineInitOptions["source"],
  openSeadragon?: OpenSeadragonLoadOptions,
) {
  if (source.type === "tiles") {
    const manifest = source.manifest;
    // OpenSeadragon's default getNumTiles uses
    // ceil(sourceWidth * scale / tileSize), which disagrees with libvips'
    // Google-layout output near image dimensions that round oddly across
    // zoom levels — OSD then asks for an extra column/row that libvips
    // never wrote, producing 404 noise in logs. The manifest already
    // records the authoritative per-level grid, so surface it to OSD.
    const levelsByZ = new Map(manifest.tiles.levels.map((lvl) => [lvl.z, lvl]));
    // Precompute a `"x,y"` lookup set per level. libvips' Google layout
    // skips tiles that are entirely the background colour, so on PDFs
    // with large white margins (most floor plans) the `columns × rows`
    // grid over-promises what was actually uploaded. Manifests produced
    // by pdf-mapview ≥ 0.4.3 record the generated coordinates per level;
    // older manifests omit the field and fall back to full-coverage.
    const generatedTilesByZ = new Map<number, Set<string>>();
    for (const lvl of manifest.tiles.levels) {
      if (lvl.generatedTiles) {
        generatedTilesByZ.set(
          lvl.z,
          new Set(lvl.generatedTiles.map(([tx, ty]) => `${tx},${ty}`)),
        );
      }
    }
    return {
      width: manifest.source.width,
      height: manifest.source.height,
      tileSize: manifest.tiles.tileSize,
      minLevel: manifest.tiles.minZoom,
      maxLevel: manifest.tiles.maxZoom,
      crossOriginPolicy: openSeadragon?.crossOriginPolicy,
      ajaxWithCredentials: openSeadragon?.ajaxWithCredentials,
      getNumTiles(level: number) {
        const lvl = levelsByZ.get(level);
        if (!lvl) {
          // Fall back to OSD's default calculation for levels the manifest
          // doesn't cover. Returning undefined lets OSD compute it the old
          // way rather than crashing on an unexpected level.
          return undefined;
        }
        return { x: lvl.columns, y: lvl.rows };
      },
      tileExists(level: number, x: number, y: number) {
        // Outside the manifest's advertised zoom range: OSD should never
        // ask, but be defensive to keep 404 noise out of logs if it does.
        if (level < manifest.tiles.minZoom || level > manifest.tiles.maxZoom) {
          return false;
        }
        const lvl = levelsByZ.get(level);
        // An in-range zoom without a corresponding level entry means the
        // manifest is internally inconsistent — err on the side of "no
        // tile here" rather than enqueuing a guaranteed-404 request.
        if (!lvl) return false;
        // Outside the per-level grid bounds.
        if (x < 0 || y < 0 || x >= lvl.columns || y >= lvl.rows) {
          return false;
        }
        // In-bounds: consult the per-level emitted-tile index when the
        // manifest records one. Manifests produced by pdf-mapview ≤ 0.4.2
        // omit `generatedTiles`, so fall back to assuming full coverage
        // (historical behaviour, including the 404 noise that motivated
        // this fix — re-ingest to pick up sparse-aware tileExists).
        const index = generatedTilesByZ.get(level);
        if (!index) return true;
        return index.has(`${x},${y}`);
      },
      getTileUrl(level: number, x: number, y: number) {
        if (source.getTileUrl) {
          return source.getTileUrl({
            manifest,
            z: level,
            x,
            y,
          }) as string;
        }
        return resolveTileUrl({
          manifest,
          z: level,
          x,
          y,
          baseUrl: source.baseUrl,
        });
      },
    };
  }

  if (source.type === "image") {
    return {
      type: "image",
      url: source.src,
      buildPyramid: false,
      crossOriginPolicy: openSeadragon?.crossOriginPolicy,
      ajaxWithCredentials: openSeadragon?.ajaxWithCredentials,
    };
  }

  throw new Error("OpenSeadragon engine only supports tile and image sources.");
}

function getDimensions(source: EngineInitOptions["source"]) {
  if (source.type === "tiles") {
    return {
      width: source.manifest.source.width,
      height: source.manifest.source.height,
    };
  }

  if (source.type === "image") {
    return {
      width: source.width,
      height: source.height,
    };
  }

  throw new Error("OpenSeadragon engine only supports image and tile sources.");
}
