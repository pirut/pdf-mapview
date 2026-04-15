import type { RegionFeature, RegionGeometry } from "../../shared/overlays";
import type { NormalizedPoint, NormalizedRect } from "../../shared/coordinates";
import type { ViewportController } from "../../shared/viewport";

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ProjectedRegion {
  bounds: NormalizedRect;
  path?: string;
  points?: ProjectedPoint[];
  rect?: { x: number; y: number; width: number; height: number };
  center?: ProjectedPoint;
  text?: string;
}

export function projectRegion(
  controller: ViewportController,
  region: RegionFeature,
): ProjectedRegion {
  const bounds = getRegionBounds(region);

  switch (region.geometry.type) {
    case "polygon": {
      const points = region.geometry.points.map((point) => controller.normalizedToScreen(point));
      return {
        bounds,
        path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ") + " Z",
        points,
      };
    }
    case "rectangle": {
      const topLeft = controller.normalizedToScreen({
        x: region.geometry.rect.x,
        y: region.geometry.rect.y,
      });
      const bottomRight = controller.normalizedToScreen({
        x: region.geometry.rect.x + region.geometry.rect.width,
        y: region.geometry.rect.y + region.geometry.rect.height,
      });
      return {
        bounds,
        rect: {
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        },
      };
    }
    case "point": {
      const center = controller.normalizedToScreen(region.geometry.point);
      return {
        bounds,
        center,
      };
    }
    case "label": {
      const center = controller.normalizedToScreen(region.geometry.point);
      return {
        bounds,
        center,
        text: region.geometry.text,
      };
    }
  }
}

export function getRegionBounds(region: RegionFeature): NormalizedRect {
  return getGeometryBounds(region.geometry);
}

function getGeometryBounds(geometry: RegionGeometry): NormalizedRect {
  switch (geometry.type) {
    case "rectangle":
      return geometry.rect;
    case "point":
      return {
        x: geometry.point.x,
        y: geometry.point.y,
        width: 0,
        height: 0,
      };
    case "label":
      return {
        x: geometry.point.x,
        y: geometry.point.y,
        width: 0,
        height: 0,
      };
    case "polygon": {
      const xs = geometry.points.map((point) => point.x);
      const ys = geometry.points.map((point) => point.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
  }
}

export function getRegionCenter(region: RegionFeature): NormalizedPoint {
  const bounds = getRegionBounds(region);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}
