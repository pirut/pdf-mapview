import type {
  FinalizeStorageArgs,
  StorageAdapter,
  StorageFinalizeResult,
  StoredArtifact,
  WriteAssetArgs,
  WriteManifestArgs,
  WriteTileArgs,
} from "../../shared/ingest";

export function memoryStorageAdapter(): StorageAdapter {
  const artifacts: StoredArtifact[] = [];

  const record = (
    kind: StoredArtifact["kind"],
    path: string,
    contentType: string,
    bytes: Uint8Array,
  ): StoredArtifact => {
    const artifact = {
      kind,
      path,
      contentType,
      size: bytes.byteLength,
    } satisfies StoredArtifact;
    artifacts.push(artifact);
    return artifact;
  };

  return {
    async writeTile(args: WriteTileArgs) {
      return record("tile", `tiles/${args.z}/${args.x}/${args.y}.${args.ext}`, args.contentType, args.bytes);
    },
    async writeManifest(args: WriteManifestArgs) {
      return record("manifest", args.path, args.contentType, args.bytes);
    },
    async writeAsset(args: WriteAssetArgs) {
      return record(args.kind, args.path, args.contentType, args.bytes);
    },
    async finalize(_args: FinalizeStorageArgs): Promise<StorageFinalizeResult> {
      return {
        artifacts: [...artifacts],
      };
    },
  };
}
