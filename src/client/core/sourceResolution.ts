import type { ImageSource, PdfMapSource, TilesSource } from "../../shared/source";

export interface ResolvedSourceDimensions {
  width: number;
  height: number;
}

export function getSourceDimensions(source: PdfMapSource): ResolvedSourceDimensions | null {
  switch (source.type) {
    case "tiles":
      return getTileSourceDimensions(source);
    case "image":
      return getImageSourceDimensions(source);
    case "pdf":
      return null;
    default:
      return null;
  }
}

function getTileSourceDimensions(source: TilesSource): ResolvedSourceDimensions {
  return {
    width: source.manifest.source.width,
    height: source.manifest.source.height,
  };
}

function getImageSourceDimensions(source: ImageSource): ResolvedSourceDimensions {
  return {
    width: source.width,
    height: source.height,
  };
}
