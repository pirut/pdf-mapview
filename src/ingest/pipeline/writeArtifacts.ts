import type {
  OutputArtifact,
  StorageAdapter,
  StorageFinalizeResult,
  StoredArtifact,
} from "../../shared/ingest";
import type { PdfMapManifest } from "../../shared/manifest";

export interface WriteArtifactsResult {
  uploaded: StoredArtifact[];
  storage: StorageFinalizeResult;
}

export async function writeArtifacts(
  adapter: StorageAdapter,
  manifest: PdfMapManifest,
  files: OutputArtifact[],
): Promise<WriteArtifactsResult> {
  const uploaded: StoredArtifact[] = [];

  for (const file of files) {
    if (file.kind === "tile") {
      const match = file.path.match(/^tiles\/(\d+)\/(\d+)\/(\d+)\.[^.]+$/);
      if (!match) {
        throw new Error(`Invalid tile path: ${file.path}`);
      }
      uploaded.push(
        await adapter.writeTile({
          z: Number(match[1]),
          x: Number(match[2]),
          y: Number(match[3]),
          ext: file.path.split(".").pop() ?? "bin",
          bytes: file.bytes,
          contentType: file.contentType,
        }),
      );
      continue;
    }

    if (file.kind === "manifest") {
      uploaded.push(
        await adapter.writeManifest({
          path: file.path,
          bytes: file.bytes,
          contentType: "application/json",
        }),
      );
      continue;
    }
    if (!adapter.writeAsset) {
      throw new Error(`Storage adapter does not support writing ${file.kind} assets.`);
    }

    uploaded.push(
      await adapter.writeAsset({
        kind: file.kind,
        path: file.path,
        bytes: file.bytes,
        contentType: file.contentType,
      }),
    );
  }

  const storage = await adapter.finalize({
    manifest,
    artifacts: uploaded,
  });

  return {
    uploaded,
    storage,
  };
}
