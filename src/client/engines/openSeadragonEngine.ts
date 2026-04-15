import { clamp01 } from "../../shared/coordinates";
import { resolveTileUrl } from "../../shared/manifest";
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
  const OpenSeadragon = (await import("openseadragon")) as unknown as OpenSeadragonModule;
  const osd = OpenSeadragon.default;

  const viewer = osd({
    element: options.container,
    showNavigationControl: false,
    minZoomLevel: options.minZoom,
    maxZoomLevel: options.maxZoom,
    visibilityRatio: 1,
    constrainDuringPan: true,
    animationTime: 0.2,
    gestureSettingsMouse: {
      clickToZoom: false,
      dblClickToZoom: true,
      pinchToZoom: true,
      flickEnabled: true,
      scrollToZoom: true,
    },
    tileSources: createTileSource(options.source),
  });

  const publish = () => {
    options.onViewChange?.(getView());
  };

  viewer.addHandler("open", () => {
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

  const imageToViewportPoint = (x: number, y: number) => {
    const item = viewer.world.getItemAt(0);
    return item.imageToViewportCoordinates(x * dimensions.width, y * dimensions.height);
  };

  const getView = (): MapViewState => {
    const item = viewer.world.getItemAt(0);
    const center = viewer.viewport.getCenter(true);
    const imageCenter = item.viewportToImageCoordinates(center);
    const containerSize = viewer.container.getBoundingClientRect();
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
      if (!bounds) {
        viewer.viewport.goHome(transitionOptions?.immediate ?? false);
        publish();
        return;
      }

      const item = viewer.world.getItemAt(0);
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
      const viewportPoint = viewer.viewport.pointFromPixel(
        new osd.Point(point.x, point.y),
        true,
      );
      const item = viewer.world.getItemAt(0);
      const imagePoint = item.viewportToImageCoordinates(viewportPoint);
      return {
        x: clamp01(imagePoint.x / dimensions.width),
        y: clamp01(imagePoint.y / dimensions.height),
      };
    },
    normalizedToScreen(point: NormalizedPoint) {
      const viewportPoint = imageToViewportPoint(point.x, point.y);
      const pixel = viewer.viewport.pixelFromPoint(viewportPoint, true);
      return {
        x: pixel.x,
        y: pixel.y,
      };
    },
    destroy() {
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

function createTileSource(source: EngineInitOptions["source"]) {
  if (source.type === "tiles") {
    const manifest = source.manifest;
    return {
      width: manifest.source.width,
      height: manifest.source.height,
      tileSize: manifest.tiles.tileSize,
      minLevel: manifest.tiles.minZoom,
      maxLevel: manifest.tiles.maxZoom,
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
