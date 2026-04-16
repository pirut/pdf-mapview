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
