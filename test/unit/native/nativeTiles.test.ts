import { describe, expect, it, vi } from "vitest";

import type { PdfMapManifest } from "../../../src/shared/manifest";
import type { GetTileUrl } from "../../../src/shared/source";
import {
  assertNativeTilesSource,
  getNativeTileLevel,
  getNativeVisibleTiles,
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

  it("selects the closest tile level for a viewport zoom", () => {
    expect(getNativeTileLevel(manifest, 0.2).z).toBe(0);
    expect(getNativeTileLevel(manifest, 0.6).z).toBe(1);
    expect(getNativeTileLevel(manifest, 1).z).toBe(2);
  });

  it("culls visible tiles and skips sparse blank tiles", () => {
    const tiles = getNativeVisibleTiles({
      source: {
        type: "tiles",
        manifest,
      },
      view: {
        center: { x: 0.5, y: 0.5 },
        zoom: 1,
        minZoom: 0,
        maxZoom: 6,
        containerWidth: 512,
        containerHeight: 256,
      },
      overscan: 0,
    });

    expect(tiles.map((tile) => `${tile.z}/${tile.x}/${tile.y}`).sort()).toEqual([
      "2/0/0",
      "2/0/1",
      "2/2/0",
      "2/3/1",
    ]);
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
