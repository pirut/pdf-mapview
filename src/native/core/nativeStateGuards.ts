import type { MapViewState } from "../../shared/viewport";
import type { NativeTileDescriptor } from "./nativeTiles";

const VIEW_ZOOM_TOLERANCE = 0.001;
const VIEW_CENTER_TOLERANCE = 0.00001;
const VIEW_SIZE_TOLERANCE = 0.5;
const TILE_TOLERANCE = 0.001;

export function areNativeViewsEqual(
  left: MapViewState,
  right: MapViewState,
): boolean {
  return (
    nearlyEqual(left.zoom, right.zoom, VIEW_ZOOM_TOLERANCE) &&
    nearlyEqual(left.minZoom, right.minZoom, VIEW_ZOOM_TOLERANCE) &&
    nearlyEqual(left.maxZoom, right.maxZoom, VIEW_ZOOM_TOLERANCE) &&
    nearlyEqual(left.center.x, right.center.x, VIEW_CENTER_TOLERANCE) &&
    nearlyEqual(left.center.y, right.center.y, VIEW_CENTER_TOLERANCE) &&
    nearlyEqual(left.containerWidth, right.containerWidth, VIEW_SIZE_TOLERANCE) &&
    nearlyEqual(left.containerHeight, right.containerHeight, VIEW_SIZE_TOLERANCE)
  );
}

export function isNativeLayoutSizeEqual(
  view: MapViewState,
  layout: { width: number; height: number },
): boolean {
  return (
    nearlyEqual(view.containerWidth, layout.width, VIEW_SIZE_TOLERANCE) &&
    nearlyEqual(view.containerHeight, layout.height, VIEW_SIZE_TOLERANCE)
  );
}

export function areNativeTileListsEqual(
  left: NativeTileDescriptor[],
  right: NativeTileDescriptor[],
  tolerance = TILE_TOLERANCE,
): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftTile, index) => areNativeTilesEqual(leftTile, right[index], tolerance));
}

export function withNativeTileUri(
  tiles: NativeTileDescriptor[],
  tileId: string,
  uri: string,
): NativeTileDescriptor[] {
  let changed = false;
  const nextTiles = tiles.map((tile) => {
    if (tile.id !== tileId) {
      return tile;
    }

    if (tile.uri === uri) {
      return tile;
    }

    changed = true;
    return {
      ...tile,
      uri,
    };
  });

  return changed ? nextTiles : tiles;
}

export function shouldRenderNativeDefaultOverlay(renderRegionOverlay?: unknown): boolean {
  return typeof renderRegionOverlay !== "function";
}

function areNativeTilesEqual(
  left: NativeTileDescriptor,
  right: NativeTileDescriptor | undefined,
  tolerance: number,
): boolean {
  if (!right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.z === right.z &&
    left.x === right.x &&
    left.y === right.y &&
    left.uri === right.uri &&
    nearlyEqual(left.left, right.left, tolerance) &&
    nearlyEqual(left.top, right.top, tolerance) &&
    nearlyEqual(left.width, right.width, tolerance) &&
    nearlyEqual(left.height, right.height, tolerance)
  );
}

function nearlyEqual(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}
