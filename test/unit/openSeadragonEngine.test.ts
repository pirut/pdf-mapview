import { beforeEach, describe, expect, it, vi } from "vitest";

const viewerFactoryCalls: Record<string, unknown>[] = [];

vi.mock("openseadragon", () => {
  const viewerFactory = (options: Record<string, unknown>) => {
    viewerFactoryCalls.push(options);
    return {
      addHandler: vi.fn(),
      destroy: vi.fn(),
      forceRedraw: vi.fn(),
      container: options.element,
      world: {
        getItemAt: vi.fn(() => null),
      },
      viewport: {},
    };
  };

  return {
    default: Object.assign(viewerFactory, {
      Point: class Point {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
      Rect: class Rect {
        constructor(
          public x: number,
          public y: number,
          public width: number,
          public height: number,
        ) {}
      },
    }),
  };
});

describe("createOpenSeadragonEngine", () => {
  beforeEach(() => {
    viewerFactoryCalls.length = 0;
  });

  it("passes viewer-level CORS options into OpenSeadragon for tile sources", async () => {
    const { createOpenSeadragonEngine } = await import(
      "../../src/client/engines/openSeadragonEngine"
    );

    const container = makeContainer();

    await createOpenSeadragonEngine({
      container,
      source: {
        type: "tiles",
        manifest: {
          id: "site-plan-001",
          version: 1,
          kind: "pdf-map",
          source: {
            type: "pdf",
            page: 1,
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
            levels: [{ z: 0, width: 2000, height: 1000, columns: 8, rows: 4, scale: 1 }],
          },
          view: {
            defaultCenter: [0.5, 0.5],
            defaultZoom: 1,
            minZoom: 0,
            maxZoom: 6,
          },
        },
      },
      openSeadragon: {
        crossOriginPolicy: "Anonymous",
        ajaxWithCredentials: false,
      },
    });

    expect(viewerFactoryCalls).toHaveLength(1);
    expect(viewerFactoryCalls[0]).toMatchObject({
      crossOriginPolicy: "Anonymous",
      ajaxWithCredentials: false,
    });
    expect(viewerFactoryCalls[0]?.tileSources).toMatchObject({
      crossOriginPolicy: "Anonymous",
      ajaxWithCredentials: false,
    });
  });

  it("passes viewer-level CORS options into OpenSeadragon image tile sources", async () => {
    const { createOpenSeadragonEngine } = await import(
      "../../src/client/engines/openSeadragonEngine"
    );

    const container = makeContainer();

    await createOpenSeadragonEngine({
      container,
      source: {
        type: "image",
        src: "https://cdn.example.com/floorplan.png",
        width: 2000,
        height: 1000,
      },
      openSeadragon: {
        crossOriginPolicy: "use-credentials",
        ajaxWithCredentials: true,
      },
    });

    expect(viewerFactoryCalls).toHaveLength(1);
    expect(viewerFactoryCalls[0]).toMatchObject({
      crossOriginPolicy: "use-credentials",
      ajaxWithCredentials: true,
    });
    expect(viewerFactoryCalls[0]?.tileSources).toMatchObject({
      type: "image",
      url: "https://cdn.example.com/floorplan.png",
      crossOriginPolicy: "use-credentials",
      ajaxWithCredentials: true,
    });
  });

  it("defaults flickEnabled to true for mouse when no openSeadragon options are provided", async () => {
    const { createOpenSeadragonEngine } = await import(
      "../../src/client/engines/openSeadragonEngine"
    );

    await createOpenSeadragonEngine({
      container: makeContainer(),
      source: {
        type: "image",
        src: "https://cdn.example.com/floorplan.png",
        width: 2000,
        height: 1000,
      },
    });

    expect(viewerFactoryCalls).toHaveLength(1);
    const gestureSettingsMouse = viewerFactoryCalls[0]?.gestureSettingsMouse as
      | Record<string, unknown>
      | undefined;
    expect(gestureSettingsMouse).toMatchObject({
      clickToZoom: false,
      dblClickToZoom: true,
      pinchToZoom: true,
      scrollToZoom: true,
      flickEnabled: true,
    });
  });

  it("disables flick on mouse, touch, and pen when flickEnabled: false", async () => {
    const { createOpenSeadragonEngine } = await import(
      "../../src/client/engines/openSeadragonEngine"
    );

    await createOpenSeadragonEngine({
      container: makeContainer(),
      source: {
        type: "image",
        src: "https://cdn.example.com/floorplan.png",
        width: 2000,
        height: 1000,
      },
      openSeadragon: {
        flickEnabled: false,
      },
    });

    expect(viewerFactoryCalls).toHaveLength(1);
    expect(viewerFactoryCalls[0]?.gestureSettingsMouse).toMatchObject({
      flickEnabled: false,
    });
    expect(viewerFactoryCalls[0]?.gestureSettingsTouch).toMatchObject({
      flickEnabled: false,
    });
    expect(viewerFactoryCalls[0]?.gestureSettingsPen).toMatchObject({
      flickEnabled: false,
    });
  });

  it("lets explicit per-input overrides win over the flickEnabled shortcut", async () => {
    const { createOpenSeadragonEngine } = await import(
      "../../src/client/engines/openSeadragonEngine"
    );

    await createOpenSeadragonEngine({
      container: makeContainer(),
      source: {
        type: "image",
        src: "https://cdn.example.com/floorplan.png",
        width: 2000,
        height: 1000,
      },
      openSeadragon: {
        flickEnabled: false,
        gestureSettingsMouse: { flickEnabled: true },
      },
    });

    expect(viewerFactoryCalls).toHaveLength(1);
    expect(viewerFactoryCalls[0]?.gestureSettingsMouse).toMatchObject({
      flickEnabled: true,
    });
    expect(viewerFactoryCalls[0]?.gestureSettingsTouch).toMatchObject({
      flickEnabled: false,
    });
    expect(viewerFactoryCalls[0]?.gestureSettingsPen).toMatchObject({
      flickEnabled: false,
    });
  });

  it("exposes the manifest's per-level grid via getNumTiles and tileExists", async () => {
    const { createOpenSeadragonEngine } = await import(
      "../../src/client/engines/openSeadragonEngine"
    );

    await createOpenSeadragonEngine({
      container: makeContainer(),
      source: {
        type: "tiles",
        manifest: {
          id: "odd-dims",
          version: 1,
          kind: "pdf-map",
          source: {
            type: "pdf",
            page: 1,
            width: 4100,
            height: 1300,
          },
          coordinateSpace: {
            normalized: true,
            width: 4100,
            height: 1300,
          },
          tiles: {
            tileSize: 256,
            format: "webp",
            minZoom: 0,
            maxZoom: 4,
            pathTemplate: "tiles/{z}/{x}/{y}.webp",
            // Hand-picked grid that exposes the bug: at z=4, OSD's default
            // would compute ceil(4100 / 256) = 17, but libvips produced 16
            // columns. tileExists must reject x=16 and getNumTiles must
            // advertise 16, not 17.
            levels: [
              { z: 0, width: 257, height: 82, columns: 2, rows: 1, scale: 0.0625 },
              { z: 4, width: 4100, height: 1300, columns: 16, rows: 6, scale: 1 },
            ],
          },
          view: {
            defaultCenter: [0.5, 0.5],
            defaultZoom: 1,
            minZoom: 0,
            maxZoom: 4,
          },
        },
      },
    });

    expect(viewerFactoryCalls).toHaveLength(1);
    const tileSources = viewerFactoryCalls[0]?.tileSources as
      | {
          getNumTiles: (level: number) => { x: number; y: number } | undefined;
          tileExists: (level: number, x: number, y: number) => boolean;
          getTileUrl: (level: number, x: number, y: number) => string;
        }
      | undefined;
    expect(tileSources).toBeDefined();

    // Authoritative grid from the manifest.
    expect(tileSources!.getNumTiles(4)).toEqual({ x: 16, y: 6 });
    expect(tileSources!.getNumTiles(0)).toEqual({ x: 2, y: 1 });
    // Levels not present in the manifest: fall back to OSD's default by
    // returning undefined rather than fabricating a grid.
    expect(tileSources!.getNumTiles(2)).toBeUndefined();

    // In-bounds tiles exist; edge tiles past the advertised grid do not.
    expect(tileSources!.tileExists(4, 0, 0)).toBe(true);
    expect(tileSources!.tileExists(4, 15, 5)).toBe(true);
    expect(tileSources!.tileExists(4, 16, 0)).toBe(false);
    expect(tileSources!.tileExists(4, 0, 6)).toBe(false);
    expect(tileSources!.tileExists(4, -1, 0)).toBe(false);
    expect(tileSources!.tileExists(4, 0, -1)).toBe(false);
    // Unknown levels: be permissive so OSD's internal behavior is preserved.
    expect(tileSources!.tileExists(2, 0, 0)).toBe(true);

    // Sanity: the original getTileUrl resolution still works.
    expect(tileSources!.getTileUrl(4, 3, 2)).toBe("tiles/4/3/2.webp");
  });

  it("routes tileExists/getNumTiles through a consumer-provided getTileUrl override", async () => {
    const { createOpenSeadragonEngine } = await import(
      "../../src/client/engines/openSeadragonEngine"
    );

    const getTileUrl = vi.fn(
      ({ z, x, y }: { z: number; x: number; y: number }) =>
        `https://cdn.example.com/custom/${z}/${x}/${y}.webp`,
    );

    await createOpenSeadragonEngine({
      container: makeContainer(),
      source: {
        type: "tiles",
        manifest: {
          id: "site-plan-001",
          version: 1,
          kind: "pdf-map",
          source: {
            type: "pdf",
            page: 1,
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
            levels: [{ z: 3, width: 2000, height: 1000, columns: 8, rows: 4, scale: 1 }],
          },
          view: {
            defaultCenter: [0.5, 0.5],
            defaultZoom: 1,
            minZoom: 0,
            maxZoom: 6,
          },
        },
        getTileUrl,
      },
    });

    const tileSources = viewerFactoryCalls[0]?.tileSources as
      | {
          getNumTiles: (level: number) => { x: number; y: number } | undefined;
          getTileUrl: (level: number, x: number, y: number) => string;
        }
      | undefined;

    // Consumer-provided getTileUrl still wins.
    expect(tileSources!.getTileUrl(3, 4, 2)).toBe(
      "https://cdn.example.com/custom/3/4/2.webp",
    );
    expect(getTileUrl).toHaveBeenCalledWith(
      expect.objectContaining({ z: 3, x: 4, y: 2 }),
    );
    // …and the grid is still the authoritative manifest grid, not OSD's
    // default.
    expect(tileSources!.getNumTiles(3)).toEqual({ x: 8, y: 4 });
  });
});

function makeContainer() {
  return {
    isConnected: true,
    getBoundingClientRect: () => ({
      width: 800,
      height: 600,
    }),
  } as unknown as HTMLElement;
}
