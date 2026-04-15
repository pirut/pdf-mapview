import { describe, expect, it } from "vitest";

describe("package boundaries", () => {
  it("imports shared exports in a node process", async () => {
    const mod = await import("../../src/shared/index");
    expect(mod.parseManifest).toBeTypeOf("function");
    expect(mod.pdfWorkerUrl).toBeTypeOf("string");
  });

  it("imports client exports in a node process without touching browser globals at module scope", async () => {
    const mod = await import("../../src/client/index");
    expect(mod.TileMapViewer).toBeTypeOf("object");
    expect(mod.pdfWorkerUrl).toBeTypeOf("string");
  });

  it("imports server exports without pulling client code", async () => {
    const mod = await import("../../src/server/index");
    expect(mod.ingestImage).toBeTypeOf("function");
    expect(mod.ingestPdf).toBeTypeOf("function");
  });
});
