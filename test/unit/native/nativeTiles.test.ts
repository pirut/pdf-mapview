import { describe, expect, it, vi } from "vitest";

import type { PdfMapManifest } from "../../../src/shared/manifest";
import type { GetTileUrl } from "../../../src/shared/source";
import {
  assertNativeTilesSource,
  getNativeTileLevel,
  getNativeVisibleTiles,
  getTargetTileScale,
  nativeTileExists,
  resolveNativeTileUrl,
} from "../../../src/native/core/nativeTiles";

describe("native tile helpers", () => {
  it("rejects non-tile sources with a pre-ingest error", () => {
    expect(() =>
      assertNativeTilesSource({
        type: "pdf",
        file: "/plan.pdf",
      }),
    ).toThrow(/only renders prebuilt tile manifests/i);
  });

  it("honors generatedTiles when testing sparse tile coverage", () => {
    const level = manifest.tiles.levels[2];

    expect(nativeTileExists(level, 0, 0)).toBe(true);
    expect(nativeTileExists(level, 1, 0)).toBe(false);
    expect(nativeTileExists(level, 3, 1)).toBe(true);
    expect(nativeTileExists(level, 4, 1)).toBe(false);
  });

  it("keeps numeric zoom tile level selection compatible", () => {
    expect(getNativeTileLevel(manifest, 0.2).z).toBe(0);
    expect(getNativeTileLevel(manifest, 0.6).z).toBe(1);
    expect(getNativeTileLevel(manifest, 1).z).toBe(2);
  });

  it("selects native tile levels from rendered base scale", () => {
    const view = createView({ zoom: 1, containerWidth: 512, containerHeight: 256 });

    expect(getTargetTileScale(manifest, view)).toBe(0.5);
    expect(getNativeTileLevel(manifest, view).z).toBe(1);
  });

  it("does not select max-detail tiles for a fit-to-viewport large source", () => {
    const largeManifest: PdfMapManifest = {
      ...manifest,
      id: "large-native-plan",
      source: {
        ...manifest.source,
        width: 6000,
        height: 4000,
      },
      coordinateSpace: {
        ...manifest.coordinateSpace,
        width: 6000,
        height: 4000,
      },
      tiles: {
        ...manifest.tiles,
        maxZoom: 4,
        levels: [
          { z: 0, width: 375, height: 250, columns: 2, rows: 1, scale: 0.0625 },
          { z: 1, width: 750, height: 500, columns: 3, rows: 2, scale: 0.125 },
          { z: 2, width: 1500, height: 1000, columns: 6, rows: 4, scale: 0.25 },
          { z: 3, width: 3000, height: 2000, columns: 12, rows: 8, scale: 0.5 },
          { z: 4, width: 6000, height: 4000, columns: 24, rows: 16, scale: 1 },
        ],
      },
    };

    const level = getNativeTileLevel(
      largeManifest,
      createView({ zoom: 1, containerWidth: 390, containerHeight: 260 }),
    );

    expect(level.z).toBe(1);
    expect(level.z).not.toBe(4);
  });

  it("culls visible active tiles and skips sparse blank tiles", () => {
    const tiles = getNativeVisibleTiles({
      source: {
        type: "tiles",
        manifest,
      },
      view: createView({ zoom: 1, containerWidth: 1024, containerHeight: 512 }),
      overscan: 0,
    });

    expect(
      tiles
        .filter((tile) => tile.z === 2)
        .map((tile) => `${tile.z}/${tile.x}/${tile.y}`)
        .sort(),
    ).toEqual(["2/0/0", "2/0/1", "2/2/0", "2/3/1"]);
  });

  it("includes parent-level descriptors before active-level descriptors", () => {
    const tiles = getNativeVisibleTiles({
      source: {
        type: "tiles",
        manifest,
      },
      view: createView({ zoom: 1, containerWidth: 1024, containerHeight: 512 }),
      overscan: 0,
    });

    expect(tiles.map((tile) => tile.z)).toEqual([1, 1, 2, 2, 2, 2]);
  });

  it("projects tile descriptors from actual level dimensions instead of scale", () => {
    const irregularManifest: PdfMapManifest = {
      ...manifest,
      id: "irregular-native-plan",
      source: {
        ...manifest.source,
        width: 1000,
        height: 800,
      },
      coordinateSpace: {
        ...manifest.coordinateSpace,
        width: 1000,
        height: 800,
      },
      tiles: {
        ...manifest.tiles,
        maxZoom: 1,
        levels: [
          { z: 0, width: 240, height: 180, columns: 1, rows: 1, scale: 0.25 },
          { z: 1, width: 480, height: 360, columns: 2, rows: 2, scale: 0.5 },
        ],
      },
    };

    const tiles = getNativeVisibleTiles({
      source: {
        type: "tiles",
        manifest: irregularManifest,
      },
      view: createView({
        zoom: 1,
        maxZoom: 1,
        containerWidth: 1000,
        containerHeight: 800,
      }),
      overscan: 0,
    });

    const bottomRight = tiles.find((tile) => tile.z === 1 && tile.x === 1 && tile.y === 1);
    const parent = tiles.find((tile) => tile.z === 0 && tile.x === 0 && tile.y === 0);

    expect(parent?.left).toBeCloseTo(0);
    expect(parent?.top).toBeCloseTo(0);
    expect(parent?.width).toBeCloseTo(1000);
    expect(parent?.height).toBeCloseTo(800);
    expect(bottomRight?.left).toBeCloseTo(533.3333333333334);
    expect(bottomRight?.top).toBeCloseTo(568.8888888888889);
    expect(bottomRight?.width).toBeCloseTo(466.66666666666663);
    expect(bottomRight?.height).toBeCloseTo(231.1111111111111);
  });

  it("returns only active-level descriptors when active level is the minimum level", () => {
    const tiles = getNativeVisibleTiles({
      source: {
        type: "tiles",
        manifest,
      },
      view: createView({ zoom: 0.4, containerWidth: 512, containerHeight: 256 }),
      overscan: 0,
    });

    expect([...new Set(tiles.map((tile) => tile.z))]).toEqual([0]);
  });

  it("resolves signed tile URLs with cancellation signal support", async () => {
    const getTileUrl: GetTileUrl = vi.fn(async ({ z, x, y, signal }) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return `https://signed.example.com/${z}/${x}/${y}.webp`;
    });

    await expect(
      resolveNativeTileUrl({
        source: {
          type: "tiles",
          manifest,
          getTileUrl,
        },
        z: 2,
        x: 3,
        y: 1,
        signal: new AbortController().signal,
      }),
    ).resolves.toBe("https://signed.example.com/2/3/1.webp");
  });

  it("rejects cancelled tile URL requests", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      resolveNativeTileUrl({
        source: {
          type: "tiles",
          manifest,
        },
        z: 2,
        x: 0,
        y: 0,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

function createView(overrides: Partial<ReturnType<typeof baseView>> = {}) {
  return {
    ...baseView(),
    ...overrides,
  };
}

function baseView() {
  return {
    center: { x: 0.5, y: 0.5 },
    zoom: 1,
    minZoom: 0,
    maxZoom: 6,
    containerWidth: 512,
    containerHeight: 256,
  };
}

const manifest: PdfMapManifest = {
  version: 1,
  kind: "pdf-map",
  id: "native-plan",
  source: {
    type: "pdf",
    page: 1,
    width: 1024,
    height: 512,
  },
  coordinateSpace: {
    normalized: true,
    width: 1024,
    height: 512,
  },
  tiles: {
    tileSize: 256,
    format: "webp",
    minZoom: 0,
    maxZoom: 2,
    pathTemplate: "tiles/{z}/{x}/{y}.webp",
    levels: [
      { z: 0, width: 256, height: 128, columns: 1, rows: 1, scale: 0.25 },
      {
        z: 1,
        width: 512,
        height: 256,
        columns: 2,
        rows: 1,
        scale: 0.5,
        generatedTiles: [
          [0, 0],
          [1, 0],
        ],
      },
      {
        z: 2,
        width: 1024,
        height: 512,
        columns: 4,
        rows: 2,
        scale: 1,
        generatedTiles: [
          [0, 0],
          [2, 0],
          [0, 1],
          [3, 1],
        ],
      },
    ],
  },
  view: {
    defaultCenter: [0.5, 0.5],
    defaultZoom: 1,
    minZoom: 0,
    maxZoom: 6,
  },
};
