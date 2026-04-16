import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type {
  FinalizeStorageArgs,
  StorageAdapter,
  StorageFinalizeResult,
  StoredArtifact,
  WriteAssetArgs,
  WriteAssetFileArgs,
  WriteManifestArgs,
  WriteTileArgs,
  WriteTileFileArgs,
} from "../../shared/ingest";

export interface LocalStorageAdapterOptions {
  baseDir: string;
  clean?: boolean;
  manifestName?: string;
}

export function localStorageAdapter(options: LocalStorageAdapterOptions): StorageAdapter {
  const baseDir = resolve(options.baseDir);
  const manifestName = options.manifestName ?? "manifest.json";
  let cleanPromise: Promise<void> | null = null;

  const ensureParent = async (filePath: string) => {
    await mkdir(dirname(filePath), { recursive: true });
  };

  const ensureClean = async () => {
    if (!options.clean) {
      return;
    }
    if (!cleanPromise) {
      cleanPromise = rm(baseDir, { recursive: true, force: true });
    }
    await cleanPromise;
  };

  const writeBytes = async (
    kind: StoredArtifact["kind"],
    relativePath: string,
    contentType: string,
    bytes: Uint8Array,
  ): Promise<StoredArtifact> => {
    await ensureClean();
    const path = join(baseDir, relativePath);
    await ensureParent(path);
    await writeFile(path, bytes);
    return {
      kind,
      path,
      contentType,
      size: bytes.byteLength,
    };
  };

  const writeFileArtifact = async (
    kind: StoredArtifact["kind"],
    relativePath: string,
    contentType: string,
    sourcePath: string,
    size: number,
  ): Promise<StoredArtifact> => {
    await ensureClean();
    const path = join(baseDir, relativePath);
    await ensureParent(path);
    await copyFile(sourcePath, path);
    return {
      kind,
      path,
      contentType,
      size,
    };
  };

  return {
    async writeTile(args: WriteTileArgs) {
      return writeBytes(
        "tile",
        `tiles/${args.z}/${args.x}/${args.y}.${args.ext}`,
        args.contentType,
        args.bytes,
      );
    },
    async writeTileFile(args: WriteTileFileArgs) {
      return writeFileArtifact(
        "tile",
        `tiles/${args.z}/${args.x}/${args.y}.${args.ext}`,
        args.contentType,
        args.filePath,
        args.size,
      );
    },
    async writeManifest(args: WriteManifestArgs) {
      return writeBytes("manifest", manifestName, args.contentType, args.bytes);
    },
    async writeAsset(args: WriteAssetArgs) {
      return writeBytes(args.kind, args.path, args.contentType, args.bytes);
    },
    async writeAssetFile(args: WriteAssetFileArgs) {
      return writeFileArtifact(
        args.kind,
        args.path,
        args.contentType,
        args.filePath,
        args.size,
      );
    },
    async finalize(args: FinalizeStorageArgs): Promise<StorageFinalizeResult> {
      return {
        artifacts: [...args.artifacts],
      };
    },
  };
}
