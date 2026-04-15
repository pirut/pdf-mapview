import { describe, expect, it } from "vitest";

import {
  clampNormalizedRect,
  normalizedToPixels,
  pixelsToNormalized,
  unionRects,
} from "../../src/shared/coordinates";

describe("coordinate helpers", () => {
  it("round-trips pixel and normalized points", () => {
    const normalized = { x: 0.25, y: 0.75 };
    const pixels = normalizedToPixels(normalized, { width: 800, height: 600 });
    expect(pixels).toEqual({ x: 200, y: 450 });
    expect(pixelsToNormalized(pixels, { width: 800, height: 600 })).toEqual(normalized);
  });

  it("clamps rectangles into normalized bounds", () => {
    const rect = clampNormalizedRect({
      x: -0.1,
      y: 0.8,
      width: 0.5,
      height: 0.5,
    });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0.8);
    expect(rect.width).toBe(0.5);
    expect(rect.height).toBeCloseTo(0.2);
  });

  it("unions multiple rectangles", () => {
    const rect = unionRects([
      { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
      { x: 0.5, y: 0.4, width: 0.2, height: 0.2 },
    ]);
    expect(rect).not.toBeNull();
    expect(rect?.x).toBe(0.1);
    expect(rect?.y).toBe(0.1);
    expect(rect?.width).toBeCloseTo(0.6);
    expect(rect?.height).toBeCloseTo(0.5);
  });
});
