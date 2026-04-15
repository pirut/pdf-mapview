export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function clampNormalizedPoint(point: NormalizedPoint): NormalizedPoint {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };
}

export function clampNormalizedRect(rect: NormalizedRect): NormalizedRect {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const width = Math.min(1 - x, Math.max(0, rect.width));
  const height = Math.min(1 - y, Math.max(0, rect.height));
  return { x, y, width, height };
}

export function normalizedToPixels(point: NormalizedPoint, size: PixelSize): NormalizedPoint {
  return {
    x: point.x * size.width,
    y: point.y * size.height,
  };
}

export function pixelsToNormalized(point: NormalizedPoint, size: PixelSize): NormalizedPoint {
  if (size.width <= 0 || size.height <= 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: point.x / size.width,
    y: point.y / size.height,
  };
}

export function rectCenter(rect: NormalizedRect): NormalizedPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

export function unionRects(rects: readonly NormalizedRect[]): NormalizedRect | null {
  if (rects.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return clampNormalizedRect({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
}
