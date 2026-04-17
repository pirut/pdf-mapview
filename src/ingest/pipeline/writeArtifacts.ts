import * as fs from "node:fs/promises";

import type {
  OutputArtifact,
  StorageAdapter,
  StorageFinalizeResult,
  StoredArtifact,
} from "../../shared/ingest";
import type { PdfMapManifest } from "../../shared/manifest";
import { mapWithConcurrency, resolveConcurrency } from "./concurrency";
import type { PersistableArtifact } from "./generatedArtifacts";
import { isGeneratedFileArtifact } from "./generatedArtifacts";
import type { ProgressReporter } from "./progressReporter";

export interface WriteArtifactsResult {
  uploaded: StoredArtifact[];
  storage: StorageFinalizeResult;
}

export interface WriteArtifactsOptions {
  writeConcurrency?: number;
  /**
   * Optional reporter. When supplied, an `upload:artifact-complete` event is
   * emitted after every artifact is written, with the `completedArtifacts`
   * counter incrementing monotonically in callback-delivery order.
   *
   * The reporter is expected to be serialized (see `createProgressReporter`)
   * so concurrent workers never issue overlapping callbacks.
   */
  report?: ProgressReporter;
  /**
   * Total artifact count used in emitted events. Defaults to `files.length`
   * when omitted.
   */
  totalArtifacts?: number;
}

export async function writeArtifacts(
  adapter: StorageAdapter,
  manifest: PdfMapManifest,
  files: PersistableArtifact[],
  options: WriteArtifactsOptions = {},
): Promise<WriteArtifactsResult> {
  const uploaded = new Array<StoredArtifact>(files.length);
  const nonManifestArtifacts = files
    .map((file, index) => ({ file, index }))
    .filter((entry) => entry.file.kind !== "manifest");
  const manifestArtifacts = files
    .map((file, index) => ({ file, index }))
    .filter((entry): entry is { file: OutputArtifact; index: number } => entry.file.kind === "manifest");

  const totalArtifacts = options.totalArtifacts ?? files.length;
  const report = options.report;
  let completedArtifacts = 0;

  const reportUpload = report
    ? async (artifact: StoredArtifact) => {
        // Counter is incremented inside the serialized reporter call so that
        // `completedArtifacts` matches the delivery order the consumer sees,
        // even though the upload workers race to completion.
        await report({
          stage: "upload",
          phase: "artifact-complete",
          completedArtifacts: ++completedArtifacts,
          totalArtifacts,
          path: artifact.path,
          kind: artifact.kind,
        });
      }
    : undefined;

  await mapWithConcurrency(
    nonManifestArtifacts,
    resolveConcurrency(options.writeConcurrency),
    async ({ file, index }) => {
      uploaded[index] = await writeArtifact(adapter, file);
      if (reportUpload) {
        await reportUpload(uploaded[index]);
      }
      return uploaded[index];
    },
  );

  for (const { file, index } of manifestArtifacts) {
    uploaded[index] = await adapter.writeManifest({
      path: file.path,
      bytes: file.bytes,
      contentType: "application/json",
    });
    if (reportUpload) {
      await reportUpload(uploaded[index]);
    }
  }

  const orderedUploaded = uploaded.filter((artifact): artifact is StoredArtifact => Boolean(artifact));

  const storage = await adapter.finalize({
    manifest,
    artifacts: orderedUploaded,
  });

  return {
    uploaded: orderedUploaded,
    storage,
  };
}

async function writeArtifact(
  adapter: StorageAdapter,
  file: PersistableArtifact,
): Promise<StoredArtifact> {
  if (file.kind === "tile") {
    return writeTileArtifact(adapter, file);
  }

  if (file.kind === "manifest") {
    throw new Error("Manifest artifacts must be written after non-manifest artifacts.");
  }

  if (isGeneratedFileArtifact(file)) {
    if (adapter.writeAssetFile) {
      return adapter.writeAssetFile({
        kind: file.kind,
        path: file.path,
        filePath: file.filePath,
        size: file.size,
        contentType: file.contentType,
      });
    }

    if (!adapter.writeAsset) {
      throw new Error(`Storage adapter does not support writing ${file.kind} assets.`);
    }

    const bytes = await fs.readFile(file.filePath);
    return adapter.writeAsset({
      kind: file.kind,
      path: file.path,
      bytes: new Uint8Array(bytes),
      contentType: file.contentType,
    });
  }

  if (!adapter.writeAsset) {
    throw new Error(`Storage adapter does not support writing ${file.kind} assets.`);
  }

  return adapter.writeAsset({
    kind: file.kind,
    path: file.path,
    bytes: file.bytes,
    contentType: file.contentType,
  });
}

async function writeTileArtifact(
  adapter: StorageAdapter,
  file: PersistableArtifact,
): Promise<StoredArtifact> {
  if (isGeneratedFileArtifact(file)) {
    if (file.kind !== "tile") {
      throw new Error(`Invalid generated tile artifact kind: ${file.kind}`);
    }

    if (adapter.writeTileFile) {
      return adapter.writeTileFile({
        z: file.z,
        x: file.x,
        y: file.y,
        ext: file.ext,
        filePath: file.filePath,
        size: file.size,
        contentType: file.contentType,
      });
    }

    const bytes = await fs.readFile(file.filePath);
    return adapter.writeTile({
      z: file.z,
      x: file.x,
      y: file.y,
      ext: file.ext,
      bytes: new Uint8Array(bytes),
      contentType: file.contentType,
    });
  }

  const match = file.path.match(/^tiles\/(\d+)\/(\d+)\/(\d+)\.([^.]+)$/);
  if (!match) {
    throw new Error(`Invalid tile path: ${file.path}`);
  }

  return adapter.writeTile({
    z: Number(match[1]),
    x: Number(match[2]),
    y: Number(match[3]),
    ext: match[4],
    bytes: file.bytes,
    contentType: file.contentType,
  });
}
