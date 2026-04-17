import { describe, expect, it } from "vitest";

import { createManifest, parseManifest, resolveTileUrl } from "../../src/shared/manifest";

describe("manifest helpers", () => {
  it("creates and parses a manifest", () => {
    const manifest = createManifest({
      id: "site-plan-001",
      source: {
        type: "image",
        width: 2000,
        height: 1000,
      },
      coordinateSpace: {
        normalized: true,
        width: 2000,
        height: 1000,
      },
      tiles: {
        tileSize: 256,
        format: "webp",
        minZoom: 0,
        maxZoom: 3,
        pathTemplate: "tiles/{z}/{x}/{y}.webp",
        levels: [
          { z: 0, width: 250, height: 125, columns: 1, rows: 1, scale: 0.125 },
          { z: 3, width: 2000, height: 1000, columns: 8, rows: 4, scale: 1 },
        ],
      },
      view: {
        defaultCenter: [0.5, 0.5],
        defaultZoom: 1,
        minZoom: 0,
        maxZoom: 6,
      },
    });

    expect(parseManifest(manifest)).toEqual(manifest);
  });

  it("round-trips optional PDF rasterization metadata", () => {
    const manifest = createManifest({
      id: "site-plan-001",
      source: {
        type: "pdf",
        page: 1,
        width: 2000,
        height: 1000,
        rasterization: {
          mode: "dpi",
          requestedDpi: 300,
          effectiveDpi: 300,
        },
      },
      coordinateSpace: {
        normalized: true,
        width: 2000,
        height: 1000,
      },
      tiles: {
        tileSize: 256,
        format: "webp",
        minZoom: 0,
        maxZoom: 3,
        pathTemplate: "tiles/{z}/{x}/{y}.webp",
        levels: [
          { z: 0, width: 250, height: 125, columns: 1, rows: 1, scale: 0.125 },
          { z: 3, width: 2000, height: 1000, columns: 8, rows: 4, scale: 1 },
        ],
      },
      view: {
        defaultCenter: [0.5, 0.5],
        defaultZoom: 1,
        minZoom: 0,
        maxZoom: 6,
      },
    });

    expect(parseManifest(manifest)).toEqual(manifest);
  });

  it("round-trips the per-level generatedTiles coverage list", () => {
    const manifest = createManifest({
      id: "sparse-coverage",
      source: {
        type: "pdf",
        page: 1,
        width: 18000,
        height: 10800,
      },
      coordinateSpace: {
        normalized: true,
        width: 18000,
        height: 10800,
      },
      tiles: {
        tileSize: 512,
        format: "webp",
        minZoom: 0,
        maxZoom: 1,
        pathTemplate: "tiles/{z}/{x}/{y}.webp",
        levels: [
          { z: 0, width: 18000, height: 10800, columns: 1, rows: 1, scale: 0.03125 },
          {
            z: 1,
            width: 18000,
            height: 10800,
            columns: 3,
            rows: 2,
            scale: 0.0625,
            // libvips skipped the white-margin tiles at (0, 0) and (2, 0).
            generatedTiles: [
              [1, 0],
              [0, 1],
              [1, 1],
              [2, 1],
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
    });

    const parsed = parseManifest(manifest);
    expect(parsed).toEqual(manifest);
    expect(parsed.tiles.levels[1].generatedTiles).toEqual([
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    // Omitting generatedTiles on an older/manually-constructed level
    // remains valid (back-compat for manifests produced by ≤ 0.4.2).
    expect(parsed.tiles.levels[0].generatedTiles).toBeUndefined();
  });

  it("resolves relative tile urls against a base url", () => {
    const manifest = createManifest({
      id: "site-plan-001",
      source: {
        type: "image",
        width: 1000,
        height: 1000,
      },
      coordinateSpace: {
        normalized: true,
        width: 1000,
        height: 1000,
      },
      tiles: {
        tileSize: 256,
        format: "webp",
        minZoom: 0,
        maxZoom: 1,
        pathTemplate: "tiles/{z}/{x}/{y}.webp",
        levels: [{ z: 0, width: 1000, height: 1000, columns: 4, rows: 4, scale: 1 }],
      },
      view: {
        defaultCenter: [0.5, 0.5],
        defaultZoom: 1,
        minZoom: 0,
        maxZoom: 6,
      },
    });

    expect(
      resolveTileUrl({
        manifest,
        z: 1,
        x: 2,
        y: 3,
        baseUrl: "https://cdn.example.com/maps/site-plan-001",
      }),
    ).toBe("https://cdn.example.com/maps/site-plan-001/tiles/1/2/3.webp");
  });

  it("resolves relative tile urls against a root-based base url", () => {
    const manifest = createManifest({
      id: "site-plan-001",
      source: {
        type: "image",
        width: 1000,
        height: 1000,
      },
      coordinateSpace: {
        normalized: true,
        width: 1000,
        height: 1000,
      },
      tiles: {
        tileSize: 256,
        format: "webp",
        minZoom: 0,
        maxZoom: 1,
        pathTemplate: "tiles/{z}/{x}/{y}.webp",
        levels: [{ z: 0, width: 1000, height: 1000, columns: 4, rows: 4, scale: 1 }],
      },
      view: {
        defaultCenter: [0.5, 0.5],
        defaultZoom: 1,
        minZoom: 0,
        maxZoom: 6,
      },
    });

    expect(
      resolveTileUrl({
        manifest,
        z: 0,
        x: 0,
        y: 0,
        baseUrl: "/maps/site-plan-001",
      }),
    ).toBe("/maps/site-plan-001/tiles/0/0/0.webp");
  });
});
