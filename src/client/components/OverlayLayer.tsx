import { Fragment, useMemo } from "react";

import type { RegionFeature } from "../../shared/overlays";
import type { MapPointerEvent } from "../../shared/viewport";
import { projectRegion } from "../core/overlayProjection";
import { useMapApi } from "../hooks/useMapApi";
import { useViewportState } from "../hooks/useViewportState";
import { RegionLabelLayer } from "./RegionLabelLayer";

export interface RegionRenderArgs {
  region: RegionFeature;
  projected: ReturnType<typeof projectRegion>;
  isHovered: boolean;
  isSelected: boolean;
}

export interface OverlayLayerProps {
  regions: RegionFeature[];
  selectedRegionId?: string | null;
  hoveredRegionId?: string | null;
  onRegionClick?: (region: RegionFeature, event: MapPointerEvent) => void;
  onRegionHover?: (region: RegionFeature | null, event: MapPointerEvent) => void;
  renderRegion?: (args: RegionRenderArgs) => React.ReactNode;
}

export function OverlayLayer(props: OverlayLayerProps) {
  const api = useMapApi();
  const view = useViewportState();

  const projected = useMemo(() => {
    if (!api) {
      return [];
    }
    return props.regions.map((region) => ({
      region,
      projected: projectRegion(api, region),
    }));
  }, [api, props.regions, view]);

  if (!api) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
        }}
      >
        {projected.map(({ region, projected }) => {
          const isHovered = props.hoveredRegionId === region.id;
          const isSelected = props.selectedRegionId === region.id;
          const getLocalPoint = (event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>) => {
            const rect = (event.currentTarget.ownerSVGElement ?? event.currentTarget).getBoundingClientRect();
            return {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            };
          };

          const onPointerMove = (event: React.PointerEvent<SVGElement>) => {
            const localPoint = getLocalPoint(event);
            props.onRegionHover?.(region, {
              screenPoint: localPoint,
              normalizedPoint: api.screenToNormalized(localPoint),
              nativeEvent: event,
            });
          };

          const onClick = (event: React.MouseEvent<SVGElement>) => {
            const localPoint = getLocalPoint(event);
            props.onRegionClick?.(region, {
              screenPoint: localPoint,
              normalizedPoint: api.screenToNormalized(localPoint),
              nativeEvent: event,
            });
          };

          const custom = props.renderRegion?.({
            region,
            projected,
            isHovered,
            isSelected,
          });

          if (custom) {
            return <Fragment key={region.id}>{custom}</Fragment>;
          }

          const sharedProps = {
            onClick,
            onPointerMove,
            onPointerLeave: (event: React.PointerEvent<SVGElement>) => {
              const localPoint = getLocalPoint(event);
              props.onRegionHover?.(null, {
                screenPoint: localPoint,
                nativeEvent: event,
              });
            },
            style: {
              pointerEvents: "auto" as const,
              cursor: "pointer",
            },
            fill: isSelected ? "rgba(37,99,235,0.24)" : isHovered ? "rgba(37,99,235,0.18)" : "rgba(37,99,235,0.12)",
            stroke: isSelected ? "#1d4ed8" : "#2563eb",
            strokeWidth: isSelected ? 2 : 1.5,
          };

          switch (region.geometry.type) {
            case "polygon":
              return <path key={region.id} d={projected.path} {...sharedProps} />;
            case "rectangle":
              if (!projected.rect) return null;
              return <rect key={region.id} x={projected.rect.x} y={projected.rect.y} width={projected.rect.width} height={projected.rect.height} {...sharedProps} />;
            case "point":
              if (!projected.center) return null;
              return <circle key={region.id} cx={projected.center.x} cy={projected.center.y} r={region.geometry.radius ?? 8} {...sharedProps} />;
            case "label":
              return null;
          }
        })}
      </svg>

      {projected.map(({ region, projected }) => (
        <RegionLabelLayer key={`${region.id}:label`} region={region} projected={projected} />
      ))}
    </div>
  );
}
