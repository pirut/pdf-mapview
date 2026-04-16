import type {
  FinalizeStorageArgs,
  StorageAdapter,
  StorageFinalizeResult,
  StoredArtifact,
  WriteAssetArgs,
  WriteManifestArgs,
  WriteTileArgs,
} from "../../shared/ingest";

export interface S3CompatiblePutObjectArgs {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
}

export interface S3CompatibleAdapterOptions {
  prefix?: string;
  baseUrl?: string;
  putObject: (args: S3CompatiblePutObjectArgs) => Promise<{ url?: string } | void>;
}

export function s3CompatibleStorageAdapter(
  options: S3CompatibleAdapterOptions,
): StorageAdapter {
  const prefix = normalizePrefix(options.prefix);

  const upload = async (
    kind: StoredArtifact["kind"],
    relativePath: string,
    contentType: string,
    bytes: Uint8Array,
    cacheControl: string,
  ): Promise<StoredArtifact> => {
    const key = `${prefix}${relativePath}`;
    const result = await options.putObject({
      key,
      body: bytes,
      contentType,
      cacheControl,
    });
    return {
      kind,
      path: key,
      contentType,
      size: bytes.byteLength,
      url: result?.url ?? (options.baseUrl ? `${normalizeBaseUrl(options.baseUrl)}${key}` : undefined),
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
      return upload("manifest", args.path, args.contentType, args.bytes, "public, max-age=60");
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
        baseUrl: options.baseUrl,
      };
    },
  };
}

function normalizePrefix(prefix?: string) {
  if (!prefix) {
    return "";
  }
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
