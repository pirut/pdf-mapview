import type { NormalizedPoint } from "../../shared/coordinates";
import type { RegionFeature, RegionGeometry } from "../../shared/overlays";

export interface NativeHitTestOptions {
  regions: RegionFeature[];
  point: NormalizedPoint;
  tolerance?: number;
}

export function hitTestNativeRegions(options: NativeHitTestOptions): RegionFeature | null {
  const tolerance = options.tolerance ?? 0.015;

  for (let index = options.regions.length - 1; index >= 0; index -= 1) {
    const region = options.regions[index];
    if (containsNativeRegionPoint(region, options.point, tolerance)) {
      return region;
    }
  }

  return null;
}

export function containsNativeRegionPoint(
  region: RegionFeature,
  point: NormalizedPoint,
  tolerance = 0.015,
): boolean {
  switch (region.geometry.type) {
    case "rectangle":
      return containsRect(region.geometry.rect, point, tolerance);
    case "polygon":
      return containsPolygon(region.geometry.points, point);
    case "point": {
      const radius = region.geometry.radius ? region.geometry.radius / 1024 : tolerance;
      return distance(region.geometry.point, point) <= radius;
    }
    case "label":
      return distance(region.geometry.point, point) <= tolerance;
  }
}

export function getNativeRegionBounds(region: RegionFeature) {
  return getGeometryBounds(region.geometry);
}

function getGeometryBounds(geometry: RegionGeometry) {
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

function containsRect(
  rect: { x: number; y: number; width: number; height: number },
  point: NormalizedPoint,
  tolerance: number,
) {
  return (
    point.x >= rect.x - tolerance &&
    point.y >= rect.y - tolerance &&
    point.x <= rect.x + rect.width + tolerance &&
    point.y <= rect.y + rect.height + tolerance
  );
}

function containsPolygon(points: NormalizedPoint[], point: NormalizedPoint) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distance(left: NormalizedPoint, right: NormalizedPoint) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}
