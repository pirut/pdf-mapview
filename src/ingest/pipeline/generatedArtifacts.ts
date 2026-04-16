import type { OutputArtifact } from "../../shared/ingest";

export interface GeneratedTileFile {
  kind: "tile";
  z: number;
  x: number;
  y: number;
  ext: string;
  path: string;
  filePath: string;
  size: number;
  contentType: string;
}

export interface GeneratedAssetFile {
  kind: "preview" | "overlay";
  path: string;
  filePath: string;
  size: number;
  contentType: string;
}

export type GeneratedFileArtifact = GeneratedTileFile | GeneratedAssetFile;

export type PersistableArtifact = OutputArtifact | GeneratedFileArtifact;

export function isGeneratedFileArtifact(
  artifact: PersistableArtifact,
): artifact is GeneratedFileArtifact {
  return "filePath" in artifact;
}
