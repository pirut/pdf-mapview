import { describe, expect, it } from "vitest";

import type { PdfMapManifest } from "../../../src/shared/manifest";
import {
  applyNativePan,
  applyNativeZoom,
  fitNativeBounds,
  nativeScreenToNormalized,
  normalizedToNativeScreen,
  resolveNativeInitialView,
} from "../../../src/native/core/nativeViewport";

describe("native viewport helpers", () => {
  it("round-trips screen and normalized coordinates", () => {
    const view = resolveNativeInitialView({
      manifest,
      container: { width: 500, height: 500 },
    });

    const screen = normalizedToNativeScreen(manifest, view, { x: 0.25, y: 0.75 });
    expect(nativeScreenToNormalized(manifest, view, screen)).toEqual({
      x: 0.25,
      y: 0.75,
    });
  });

  it("keeps a focal point stable while zooming", () => {
    const view = resolveNativeInitialView({
      manifest,
      container: { width: 500, height: 500 },
    });
    const focal = { x: 250, y: 250 };
    const before = nativeScreenToNormalized(manifest, view, focal);
    const next = applyNativeZoom(manifest, view, 2, focal);

    expect(nativeScreenToNormalized(manifest, next, focal)).toEqual(before);
  });

  it("pans in normalized plan space", () => {
    const view = resolveNativeInitialView({
      manifest,
      container: { width: 500, height: 500 },
    });
    const next = applyNativePan(manifest, view, { x: 125, y: 0 });

    expect(next.center.x).toBeLessThan(view.center.x);
  });

  it("fits bounds by centering and increasing zoom", () => {
    const view = resolveNativeInitialView({
      manifest,
      container: { width: 500, height: 500 },
    });
    const next = fitNativeBounds(manifest, view, {
      x: 0.25,
      y: 0.25,
      width: 0.25,
      height: 0.25,
    });

    expect(next.center).toEqual({ x: 0.375, y: 0.375 });
    expect(next.zoom).toBeGreaterThan(view.zoom);
  });
});

const manifest: PdfMapManifest = {
  version: 1,
  kind: "pdf-map",
  id: "viewport-plan",
  source: {
    type: "pdf",
    width: 1000,
    height: 500,
  },
  coordinateSpace: {
    normalized: true,
    width: 1000,
    height: 500,
  },
  tiles: {
    tileSize: 256,
    format: "webp",
    minZoom: 0,
    maxZoom: 2,
    pathTemplate: "tiles/{z}/{x}/{y}.webp",
    levels: [{ z: 2, width: 1000, height: 500, columns: 4, rows: 2, scale: 1 }],
  },
  view: {
    defaultCenter: [0.5, 0.5],
    defaultZoom: 1,
    minZoom: 0,
    maxZoom: 6,
  },
};
