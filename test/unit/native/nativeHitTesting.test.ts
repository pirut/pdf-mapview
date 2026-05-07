import { describe, expect, it } from "vitest";

import { hitTestNativeRegions } from "../../../src/native/core/nativeHitTesting";
import type { RegionFeature } from "../../../src/shared/overlays";

describe("native region hit testing", () => {
  it("returns the topmost hit region", () => {
    expect(
      hitTestNativeRegions({
        regions,
        point: { x: 0.5, y: 0.5 },
      })?.id,
    ).toBe("front");
  });

  it("supports polygon hit testing", () => {
    expect(
      hitTestNativeRegions({
        regions,
        point: { x: 0.15, y: 0.15 },
      })?.id,
    ).toBe("triangle");
  });
});

const regions: RegionFeature[] = [
  {
    id: "triangle",
    geometry: {
      type: "polygon",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.1 },
        { x: 0.1, y: 0.3 },
      ],
    },
  },
  {
    id: "back",
    geometry: {
      type: "rectangle",
      rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    },
  },
  {
    id: "front",
    geometry: {
      type: "rectangle",
      rect: { x: 0.4, y: 0.4, width: 0.25, height: 0.25 },
    },
  },
];
