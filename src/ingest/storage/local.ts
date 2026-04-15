import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type {
  FinalizeStorageArgs,
  StorageAdapter,
  StorageFinalizeResult,
  StoredArtifact,
  WriteAssetArgs,
  WriteManifestArgs,
  WriteTileArgs,
} from "../../shared/ingest";

export interface LocalStorageAdapterOptions {
  baseDir: string;
  clean?: boolean;
  manifestName?: string;
}

export function localStorageAdapter(options: LocalStorageAdapterOptions): StorageAdapter {
  const baseDir = resolve(options.baseDir);
  const manifestName = options.manifestName ?? "manifest.json";
  const artifacts: StoredArtifact[] = [];
  let cleaned = false;

  const ensureParent = async (filePath: string) => {
    await mkdir(dirname(filePath), { recursive: true });
  };

  const ensureClean = async () => {
    if (!options.clean || cleaned) {
      return;
    }
    cleaned = true;
    await rm(baseDir, { recursive: true, force: true });
  };

  const write = async (
    kind: StoredArtifact["kind"],
    relativePath: string,
    contentType: string,
    bytes: Uint8Array,
  ): Promise<StoredArtifact> => {
    await ensureClean();
    const path = join(baseDir, relativePath);
    await ensureParent(path);
    await writeFile(path, bytes);
    const artifact: StoredArtifact = {
      kind,
      path,
      contentType,
      size: bytes.byteLength,
    };
    artifacts.push(artifact);
    return artifact;
  };

  return {
    async writeTile(args: WriteTileArgs) {
      return write(
        "tile",
        `tiles/${args.z}/${args.x}/${args.y}.${args.ext}`,
        args.contentType,
        args.bytes,
      );
    },
    async writeManifest(args: WriteManifestArgs) {
      return write("manifest", manifestName, args.contentType, args.bytes);
    },
    async writeAsset(args: WriteAssetArgs) {
      return write(args.kind, args.path, args.contentType, args.bytes);
    },
    async finalize(_args: FinalizeStorageArgs): Promise<StorageFinalizeResult> {
      return {
        artifacts: [...artifacts],
      };
    },
  };
}
