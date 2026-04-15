import { createCanvas, loadImage } from "@napi-rs/canvas";

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
  const image = await loadImage(Buffer.from(options.bytes));

  const resizeFactor =
    Math.max(image.width, image.height) > options.maxDimension
      ? options.maxDimension / Math.max(image.width, image.height)
      : 1;

  const width = Math.max(1, Math.round(image.width * resizeFactor));
  const height = Math.max(1, Math.round(image.height * resizeFactor));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = options.background;
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const bytes = await canvas.encode("png");

  return {
    bytes: new Uint8Array(bytes),
    width,
    height,
    mimeType: "image/png",
  };
}
