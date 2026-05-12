import { describe, expect, it, vi } from "vitest";

import type { MapViewState } from "../../../src/shared/viewport";
import type { NativeTileDescriptor } from "../../../src/native/core/nativeTiles";
import {
  areNativeTileListsEqual,
  areNativeViewsEqual,
  isNativeLayoutSizeEqual,
  shouldRenderNativeDefaultOverlay,
  withNativeTileUri,
} from "../../../src/native/core/nativeStateGuards";

describe("native state guards", () => {
  it("treats effectively equal published views as unchanged", () => {
    const view = createView();

    expect(
      areNativeViewsEqual(view, {
        ...view,
        zoom: view.zoom + 0.0000001,
        center: {
          x: view.center.x - 0.0000001,
          y: view.center.y + 0.0000001,
        },
        containerWidth: view.containerWidth + 0.0001,
        containerHeight: view.containerHeight - 0.0001,
      }),
    ).toBe(true);
  });

  it("detects meaningful published view changes", () => {
    expect(areNativeViewsEqual(createView(), { ...createView(), zoom: 2 })).toBe(false);
  });

  it("uses separate tolerances for zoom, center, and layout dimensions", () => {
    const view = createView();

    expect(areNativeViewsEqual(view, { ...view, zoom: view.zoom + 0.001 })).toBe(true);
    expect(areNativeViewsEqual(view, { ...view, zoom: view.zoom + 0.002 })).toBe(false);
    expect(
      areNativeViewsEqual(view, {
        ...view,
        center: { x: view.center.x + 0.00001, y: view.center.y },
      }),
    ).toBe(true);
    expect(
      areNativeViewsEqual(view, {
        ...view,
        center: { x: view.center.x + 0.00002, y: view.center.y },
      }),
    ).toBe(false);
    expect(
      areNativeViewsEqual(view, {
        ...view,
        containerWidth: view.containerWidth + 0.5,
      }),
    ).toBe(true);
    expect(
      areNativeViewsEqual(view, {
        ...view,
        containerWidth: view.containerWidth + 0.6,
      }),
    ).toBe(false);
  });

  it("lets the layout guard ignore equal and subpixel resize events", () => {
    const view = createView({ containerWidth: 390, containerHeight: 844 });

    expect(isNativeLayoutSizeEqual(view, { width: 390.4, height: 843.6 })).toBe(true);
    expect(isNativeLayoutSizeEqual(view, { width: 391, height: 844 })).toBe(false);
  });

  it("treats equal tile descriptor lists as unchanged", () => {
    const tiles = [createTile({ id: "a" }), createTile({ id: "b", x: 1, left: 256 })];

    expect(
      areNativeTileListsEqual(tiles, [
        createTile({ id: "a", left: 0.0000001 }),
        createTile({ id: "b", x: 1, left: 256 }),
      ]),
    ).toBe(true);
  });

  it("allows callers to skip setTiles when the descriptor list is unchanged", () => {
    const setTiles = vi.fn();
    const current = [createTile({ id: "a", uri: "tile.webp" })];
    const next = [createTile({ id: "a", uri: "tile.webp" })];

    if (!areNativeTileListsEqual(current, next)) {
      setTiles(next);
    }

    expect(setTiles).not.toHaveBeenCalled();
  });

  it("detects changed tile descriptor lists", () => {
    expect(
      areNativeTileListsEqual([createTile({ id: "a" })], [createTile({ id: "a", uri: "tile.webp" })]),
    ).toBe(false);
  });

  it("does not allocate a tile array when an async uri update is unchanged", () => {
    const tiles = [createTile({ id: "a", uri: "tile.webp" })];

    expect(withNativeTileUri(tiles, "a", "tile.webp")).toBe(tiles);
  });

  it("does not allocate or publish for a stale async uri result", () => {
    const tiles = [createTile({ id: "current-tile" })];

    expect(withNativeTileUri(tiles, "stale-tile", "tile.webp")).toBe(tiles);
  });

  it("allocates only when an async uri update changes a visible tile", () => {
    const tiles = [createTile({ id: "a" })];
    const next = withNativeTileUri(tiles, "a", "tile.webp");

    expect(next).not.toBe(tiles);
    expect(next[0]).toMatchObject({ uri: "tile.webp" });
  });

  it("suppresses the default native overlay when a custom renderer exists", () => {
    expect(shouldRenderNativeDefaultOverlay(undefined)).toBe(true);
    expect(shouldRenderNativeDefaultOverlay(() => null)).toBe(false);
  });
});

function createView(overrides: Partial<MapViewState> = {}): MapViewState {
  return {
    center: { x: 0.5, y: 0.5 },
    zoom: 1,
    minZoom: 0,
    maxZoom: 12,
    containerWidth: 390,
    containerHeight: 844,
    ...overrides,
  };
}

function createTile(overrides: Partial<NativeTileDescriptor> = {}): NativeTileDescriptor {
  return {
    id: "tile",
    z: 0,
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 256,
    height: 256,
    ...overrides,
  };
}
