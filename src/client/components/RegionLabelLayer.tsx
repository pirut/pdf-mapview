import type { RegionFeature } from "../../shared/overlays";
import type { ProjectedRegion } from "../core/overlayProjection";

export interface RegionLabelLayerProps {
  region: RegionFeature;
  projected: ProjectedRegion;
}

export function RegionLabelLayer({ region, projected }: RegionLabelLayerProps) {
  if (!projected.center || (!projected.text && !region.label)) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: projected.center.x,
        top: projected.center.y,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        color: "#111827",
        background: "rgba(255,255,255,0.92)",
        padding: "2px 6px",
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.3,
        border: "1px solid rgba(17,24,39,0.15)",
        whiteSpace: "nowrap",
      }}
    >
      {projected.text ?? region.label}
    </div>
  );
}
