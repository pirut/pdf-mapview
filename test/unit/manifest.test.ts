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
