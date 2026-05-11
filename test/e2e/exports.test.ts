import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  PanResponder: {
    create: () => ({ panHandlers: {} }),
  },
  StyleSheet: {
    absoluteFill: {},
    create: <T extends Record<string, unknown>>(styles: T) => styles,
  },
  View: "View",
}));

vi.mock("@shopify/react-native-skia", () => ({
  Canvas: "Canvas",
  Circle: "Circle",
  Group: "Group",
  Image: "Image",
  Path: "Path",
  Rect: "Rect",
  Text: "Text",
  Skia: {
    Path: {
      Make: () => ({
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        close: vi.fn(),
      }),
    },
  },
  useFont: () => null,
  useImage: () => null,
}));

describe("package boundaries", () => {
  it("imports shared exports in a node process", async () => {
    const mod = await import("../../src/shared/index");
    expect(mod.parseManifest).toBeTypeOf("function");
    expect("pdfWorkerUrl" in mod).toBe(false);
  });

  it("imports client exports in a node process without touching browser globals at module scope", async () => {
    const mod = await import("../../src/client/index");
    expect(mod.TileMapViewer).toBeTypeOf("object");
    expect(mod.pdfWorkerUrl).toBeTypeOf("string");
  });

  it("imports web worker exports from the web-only subpath", async () => {
    const mod = await import("../../src/web-worker/index");
    expect(mod.pdfWorkerUrl).toBeTypeOf("string");
  });

  it("imports server exports without pulling client code", async () => {
    const mod = await import("../../src/server/index");
    expect(mod.ingestImage).toBeTypeOf("function");
    expect(mod.ingestPdf).toBeTypeOf("function");
  });

  it("imports native exports with native peers mocked", async () => {
    const mod = await import("../../src/native/index");
    expect(mod.TileMapNative).toBeTypeOf("object");
    expect(mod.PdfMapNative).toBe(mod.TileMapNative);
    expect(mod.getNativeVisibleTiles).toBeTypeOf("function");
  });
});
