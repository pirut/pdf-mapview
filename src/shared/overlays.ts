import { z } from "zod";

import type { NormalizedPoint, NormalizedRect } from "./coordinates";

export type RegionGeometryType = "polygon" | "rectangle" | "point" | "label";

export interface PolygonGeometry {
  type: "polygon";
  points: NormalizedPoint[];
}

export interface RectangleGeometry {
  type: "rectangle";
  rect: NormalizedRect;
}

export interface PointGeometry {
  type: "point";
  point: NormalizedPoint;
  radius?: number;
}

export interface LabelGeometry {
  type: "label";
  point: NormalizedPoint;
  text: string;
}

export type RegionGeometry =
  | PolygonGeometry
  | RectangleGeometry
  | PointGeometry
  | LabelGeometry;

export interface RegionFeature<Metadata = Record<string, unknown>> {
  id: string;
  geometry: RegionGeometry;
  label?: string;
  metadata?: Metadata;
}

export interface RegionCollection<Metadata = Record<string, unknown>> {
  type: "FeatureCollection";
  regions: RegionFeature<Metadata>[];
}

const normalizedPointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const normalizedRectSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().min(0).max(1),
  height: z.number().finite().min(0).max(1),
});

export const regionFeatureSchema = z.object({
  id: z.string().min(1),
  geometry: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("polygon"),
      points: z.array(normalizedPointSchema).min(3),
    }),
    z.object({
      type: z.literal("rectangle"),
      rect: normalizedRectSchema,
    }),
    z.object({
      type: z.literal("point"),
      point: normalizedPointSchema,
      radius: z.number().finite().positive().optional(),
    }),
    z.object({
      type: z.literal("label"),
      point: normalizedPointSchema,
      text: z.string().min(1),
    }),
  ]),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const regionCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  regions: z.array(regionFeatureSchema),
});

export function normalizeRegions(
  input?: RegionCollection | RegionFeature[] | null,
): RegionFeature[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  return input.regions;
}
