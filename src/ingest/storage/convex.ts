import type {
  FinalizeStorageArgs,
  StorageAdapter,
  StorageFinalizeResult,
  StoredArtifact,
  WriteAssetArgs,
  WriteManifestArgs,
  WriteTileArgs,
} from "../../shared/ingest";

/**
 * Arguments passed to the user-supplied `storeArtifact` callback for every
 * tile, manifest, preview, and overlay the ingest pipeline emits.
 *
 * `relativePath` already has any configured `prefix` prepended, so the
 * implementor can use it directly as a lookup key (e.g., the `relativePath`
 * column on a `mapAssets` Convex table).
 */
export interface ConvexStoreArtifactArgs {
  /** Final relative path, e.g. "tiles/3/5/7.webp" or "manifest.json" (prefix already prepended). */
  relativePath: string;
  /** Raw bytes to persist. Always `Uint8Array`; never file paths. */
  bytes: Uint8Array;
  /** MIME type for the artifact. */
  contentType: string;
  /** Suggested `Cache-Control` value. Tiles/previews are immutable; manifest/overlay are short-lived. */
  cacheControl: string;
  /** Semantic kind for the artifact — lets implementors route by type. */
  kind: "tile" | "manifest" | "preview" | "overlay";
  /** Opaque user map identifier, forwarded verbatim from adapter options. */
  mapId: string;
  /** Byte length, provided for convenience (matches `bytes.byteLength`). */
  size: number;
}

/**
 * Result returned from the user-supplied `storeArtifact` callback.
 *
 * `storageId` is the typical output of Convex's file storage upload flow.
 * If provided, it is threaded into `StoredArtifact.metadata.storageId` so
 * downstream code can resolve URLs at request time (e.g., via
 * `ctx.storage.getUrl(storageId)` inside a Convex query).
 */
export interface ConvexStoreArtifactResult {
  /** Convex storage id for the uploaded blob. Optional — include when using the upload-URL flow. */
  storageId?: string;
  /** Pre-resolved URL, if the implementor chose to produce one eagerly. Usually omitted for Convex. */
  url?: string;
  /** Additional metadata to thread into `StoredArtifact.metadata`. */
  metadata?: Record<string, string>;
}

export interface ConvexStorageAdapterOptions {
  /** Required map identifier; forwarded into every `storeArtifact` call. Keep in sync with `IngestOptions.id`. */
  mapId: string;
  /** Optional path prefix (same semantics as `s3CompatibleStorageAdapter`). Defaults to no prefix. */
  prefix?: string;
  /**
   * User-supplied persistence callback. Keeps this adapter decoupled from
   * specific Convex function names and project layouts.
   *
   * A typical implementation (using the Convex upload-URL flow) is:
   *
   *   1. Call a Convex mutation that returns an upload URL.
   *   2. `fetch(uploadUrl, { method: "POST", body: bytes, headers: { "Content-Type": contentType } })`.
   *   3. Call a Convex mutation that inserts a row into a `mapAssets` table
   *      mapping `{mapId, relativePath} → storageId`.
   *   4. Return `{ storageId }`.
   */
  storeArtifact: (args: ConvexStoreArtifactArgs) => Promise<ConvexStoreArtifactResult>;
}

/**
 * Documentation-only type describing the shape a user-side `mapAssets`
 * Convex table row needs to support the recommended integration pattern.
 *
 * The library does not import or use this type at runtime; it is exported
 * so application code can opt in to a shared vocabulary.
 */
export interface ConvexMapAssetRecord {
  mapId: string;
  relativePath: string;
  storageId: string;
  kind: "tile" | "manifest" | "preview" | "overlay";
  contentType: string;
  size: number;
}

export function convexStorageAdapter(
  options: ConvexStorageAdapterOptions,
): StorageAdapter {
  const prefix = normalizePrefix(options.prefix);

  const upload = async (
    kind: StoredArtifact["kind"],
    relativePath: string,
    contentType: string,
    bytes: Uint8Array,
    cacheControl: string,
  ): Promise<StoredArtifact> => {
    const fullPath = `${prefix}${relativePath}`;
    const result = await options.storeArtifact({
      relativePath: fullPath,
      bytes,
      contentType,
      cacheControl,
      kind,
      mapId: options.mapId,
      size: bytes.byteLength,
    });

    const mergedMetadata: Record<string, string> = { ...(result.metadata ?? {}) };
    // Explicit `storageId` wins over any collision in `result.metadata`.
    if (result.storageId !== undefined) {
      mergedMetadata.storageId = result.storageId;
    }

    const hasMetadata = Object.keys(mergedMetadata).length > 0;

    return {
      kind,
      path: fullPath,
      contentType,
      size: bytes.byteLength,
      url: result.url,
      metadata: hasMetadata ? mergedMetadata : undefined,
    };
  };

  return {
    async writeTile(args: WriteTileArgs) {
      return upload(
        "tile",
        `tiles/${args.z}/${args.x}/${args.y}.${args.ext}`,
        args.contentType,
        args.bytes,
        "public, max-age=31536000, immutable",
      );
    },
    async writeManifest(args: WriteManifestArgs) {
      return upload(
        "manifest",
        args.path,
        args.contentType,
        args.bytes,
        "public, max-age=60",
      );
    },
    async writeAsset(args: WriteAssetArgs) {
      const cacheControl =
        args.kind === "preview"
          ? "public, max-age=31536000, immutable"
          : "public, max-age=60";
      return upload(args.kind, args.path, args.contentType, args.bytes, cacheControl);
    },
    async finalize(args: FinalizeStorageArgs): Promise<StorageFinalizeResult> {
      return {
        artifacts: [...args.artifacts],
        baseUrl: undefined,
        metadata: {
          kind: "convex",
          mapId: options.mapId,
        },
      };
    },
  };
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) {
    return "";
  }
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}
