import sharp from "sharp";

export interface NormalizedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
}

export interface NormalizeImageOptions {
  bytes: Uint8Array;
  maxDimension: number;
  background: string;
}

export async function normalizeImage(options: NormalizeImageOptions): Promise<NormalizedImage> {
  const { data, info } = await sharp(options.bytes, { failOn: "none" })
    .rotate()
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({
      background: options.background,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: new Uint8Array(data),
    width: info.width,
    height: info.height,
    mimeType: "image/png",
  };
}
