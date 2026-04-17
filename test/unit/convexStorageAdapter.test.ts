import { describe, expect, it } from "vitest";

import {
  convexStorageAdapter,
  type ConvexStoreArtifactArgs,
  type ConvexStoreArtifactResult,
} from "../../src/ingest/storage/convex";
import type { PdfMapManifest } from "../../src/shared/manifest";
import { writeArtifacts } from "../../src/ingest/pipeline/writeArtifacts";
import type { PersistableArtifact } from "../../src/ingest/pipeline/generatedArtifacts";

/** Instrumented fake `storeArtifact` callback. */
function makeFake(
  override: (args: ConvexStoreArtifactArgs) => ConvexStoreArtifactResult = () => ({
    storageId: "fake-id",
  }),
) {
  const calls: ConvexStoreArtifactArgs[] = [];
  const fake = async (args: ConvexStoreArtifactArgs): Promise<ConvexStoreArtifactResult> => {
    calls.push(args);
    return override(args);
  };
  return { fake, calls };
}

function manifestStub(): PdfMapManifest {
  return {
    version: 1,
    kind: "pdf-map",
    id: "test-map",
    source: { type: "image", width: 1, height: 1 },
    coordinateSpace: { normalized: true, width: 1, height: 1 },
    tiles: {
      tileSize: 256,
      format: "webp",
      minZoom: 0,
      maxZoom: 0,
      pathTemplate: "tiles/{z}/{x}/{y}.webp",
      levels: [],
    },
    view: {
      defaultCenter: [0.5, 0.5],
      defaultZoom: 0,
      minZoom: 0,
      maxZoom: 0,
    },
  };
}

describe("convexStorageAdapter", () => {
  it("builds canonical tile paths", async () => {
    const { fake, calls } = makeFake();
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    await adapter.writeTile({
      z: 3,
      x: 5,
      y: 7,
      ext: "webp",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].relativePath).toBe("tiles/3/5/7.webp");
    expect(calls[0].kind).toBe("tile");
    expect(calls[0].mapId).toBe("map-1");
    expect(calls[0].size).toBe(3);
    expect(calls[0].cacheControl).toBe("public, max-age=31536000, immutable");
  });

  it("prepends a prefix without trailing slash", async () => {
    const { fake, calls } = makeFake();
    const adapter = convexStorageAdapter({
      mapId: "map-1",
      prefix: "maps/site-1",
      storeArtifact: fake,
    });

    await adapter.writeTile({
      z: 3,
      x: 5,
      y: 7,
      ext: "webp",
      bytes: new Uint8Array([0]),
      contentType: "image/webp",
    });

    expect(calls[0].relativePath).toBe("maps/site-1/tiles/3/5/7.webp");
  });

  it("tolerates a prefix with an existing trailing slash", async () => {
    const { fake, calls } = makeFake();
    const adapter = convexStorageAdapter({
      mapId: "map-1",
      prefix: "maps/site-1/",
      storeArtifact: fake,
    });

    await adapter.writeTile({
      z: 3,
      x: 5,
      y: 7,
      ext: "webp",
      bytes: new Uint8Array([0]),
      contentType: "image/webp",
    });

    expect(calls[0].relativePath).toBe("maps/site-1/tiles/3/5/7.webp");
  });

  it("writes a manifest with kind='manifest' and max-age=60 cache", async () => {
    const { fake, calls } = makeFake();
    const adapter = convexStorageAdapter({
      mapId: "map-1",
      prefix: "maps/site-1",
      storeArtifact: fake,
    });

    await adapter.writeManifest({
      path: "manifest.json",
      bytes: new TextEncoder().encode("{}"),
      contentType: "application/json",
    });

    expect(calls[0].relativePath).toBe("maps/site-1/manifest.json");
    expect(calls[0].kind).toBe("manifest");
    expect(calls[0].cacheControl).toBe("public, max-age=60");
    expect(calls[0].contentType).toBe("application/json");
  });

  it("writes a preview asset with immutable cache and propagates kind", async () => {
    const { fake, calls } = makeFake();
    const adapter = convexStorageAdapter({
      mapId: "map-1",
      prefix: "maps/site-1",
      storeArtifact: fake,
    });

    const bytes = new Uint8Array([9, 9, 9, 9]);
    await adapter.writeAsset!({
      kind: "preview",
      path: "preview.webp",
      bytes,
      contentType: "image/webp",
    });

    expect(calls[0].relativePath).toBe("maps/site-1/preview.webp");
    expect(calls[0].kind).toBe("preview");
    expect(calls[0].cacheControl).toBe("public, max-age=31536000, immutable");
    expect(calls[0].size).toBe(4);
  });

  it("writes an overlay asset with short-lived cache", async () => {
    const { fake, calls } = makeFake();
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    await adapter.writeAsset!({
      kind: "overlay",
      path: "regions.json",
      bytes: new TextEncoder().encode("{}"),
      contentType: "application/json",
    });

    expect(calls[0].relativePath).toBe("regions.json");
    expect(calls[0].kind).toBe("overlay");
    expect(calls[0].cacheControl).toBe("public, max-age=60");
  });

  it("round-trips storageId into StoredArtifact.metadata", async () => {
    const { fake } = makeFake(() => ({ storageId: "kg2abc123" }));
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    const artifact = await adapter.writeTile({
      z: 0,
      x: 0,
      y: 0,
      ext: "webp",
      bytes: new Uint8Array([1]),
      contentType: "image/webp",
    });

    expect(artifact.metadata).toEqual({ storageId: "kg2abc123" });
  });

  it("round-trips url into StoredArtifact.url", async () => {
    const { fake } = makeFake(() => ({ url: "https://example.com/foo", storageId: "id" }));
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    const artifact = await adapter.writeTile({
      z: 0,
      x: 0,
      y: 0,
      ext: "webp",
      bytes: new Uint8Array([1]),
      contentType: "image/webp",
    });

    expect(artifact.url).toBe("https://example.com/foo");
  });

  it("merges callback-provided metadata with storageId (storageId wins on collision)", async () => {
    const { fake } = makeFake(() => ({
      storageId: "explicit",
      metadata: { foo: "bar", storageId: "loses-to-explicit" },
    }));
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    const artifact = await adapter.writeTile({
      z: 0,
      x: 0,
      y: 0,
      ext: "webp",
      bytes: new Uint8Array([1]),
      contentType: "image/webp",
    });

    expect(artifact.metadata).toEqual({ foo: "bar", storageId: "explicit" });
  });

  it("leaves metadata undefined when callback returns neither storageId nor metadata", async () => {
    const { fake } = makeFake(() => ({}));
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    const artifact = await adapter.writeTile({
      z: 0,
      x: 0,
      y: 0,
      ext: "webp",
      bytes: new Uint8Array([1]),
      contentType: "image/webp",
    });

    expect(artifact.metadata).toBeUndefined();
  });

  it("respects writeConcurrency when driven through writeArtifacts", async () => {
    let active = 0;
    let peak = 0;
    const fake = async (args: ConvexStoreArtifactArgs): Promise<ConvexStoreArtifactResult> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { storageId: args.relativePath };
    };
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    const files: PersistableArtifact[] = [
      ...Array.from(
        { length: 100 },
        (_, i): PersistableArtifact => ({
          kind: "tile",
          path: `tiles/0/${i}/0.webp`,
          contentType: "image/webp",
          bytes: new Uint8Array([i & 0xff]),
        }),
      ),
      {
        kind: "manifest",
        path: "manifest.json",
        contentType: "application/json",
        bytes: new TextEncoder().encode("{}"),
      },
    ];

    const { uploaded } = await writeArtifacts(adapter, manifestStub(), files, {
      writeConcurrency: 8,
    });

    expect(uploaded).toHaveLength(101);
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it("finalize returns undefined baseUrl and convex metadata", async () => {
    const { fake } = makeFake();
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    const stored = await adapter.writeTile({
      z: 0,
      x: 0,
      y: 0,
      ext: "webp",
      bytes: new Uint8Array([1]),
      contentType: "image/webp",
    });

    const result = await adapter.finalize({
      manifest: manifestStub(),
      artifacts: [stored],
    });

    expect(result.baseUrl).toBeUndefined();
    expect(result.metadata).toEqual({ kind: "convex", mapId: "map-1" });
    expect(result.artifacts).toEqual([stored]);
  });

  it("integration smoke: writeArtifacts end-to-end with mixed artifacts", async () => {
    const { fake, calls } = makeFake(() => ({ storageId: "ok" }));
    const adapter = convexStorageAdapter({ mapId: "map-1", storeArtifact: fake });

    const files: PersistableArtifact[] = [
      {
        kind: "tile",
        path: "tiles/0/0/0.webp",
        contentType: "image/webp",
        bytes: new Uint8Array([1]),
      },
      {
        kind: "preview",
        path: "preview.webp",
        contentType: "image/webp",
        bytes: new Uint8Array([2]),
      },
      {
        kind: "overlay",
        path: "regions.json",
        contentType: "application/json",
        bytes: new TextEncoder().encode("{}"),
      },
      {
        kind: "manifest",
        path: "manifest.json",
        contentType: "application/json",
        bytes: new TextEncoder().encode("{}"),
      },
    ];

    const { uploaded, storage } = await writeArtifacts(adapter, manifestStub(), files);

    expect(uploaded.map((a) => a.kind)).toEqual(["tile", "preview", "overlay", "manifest"]);
    expect(uploaded.every((a) => a.metadata?.storageId === "ok")).toBe(true);
    // Manifest is always written last (after non-manifest artifacts).
    expect(calls.at(-1)?.kind).toBe("manifest");
    expect(storage.baseUrl).toBeUndefined();
    expect(storage.metadata).toEqual({ kind: "convex", mapId: "map-1" });
  });
});
