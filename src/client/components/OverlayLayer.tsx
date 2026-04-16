import { useCallback, useMemo, useRef } from "react";

import type { RegionFeature } from "../../shared/overlays";
import type { MapPointerEvent, ScreenPoint } from "../../shared/viewport";
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

const REGION_ID_ATTR = "data-region-id";
const REGION_ID_SELECTOR = `[${REGION_ID_ATTR}]`;

export function OverlayLayer(props: OverlayLayerProps) {
  const api = useMapApi();
  const view = useViewportState();

  const regionsById = useMemo(() => {
    const map = new Map<string, RegionFeature>();
    for (const region of props.regions) {
      map.set(region.id, region);
    }
    return map;
  }, [props.regions]);

  const projected = useMemo(() => {
    if (!api) {
      return [];
    }
    return props.regions.map((region) => ({
      region,
      projected: projectRegion(api, region),
    }));
  }, [api, props.regions, view]);

  const onRegionClickRef = useRef(props.onRegionClick);
  const onRegionHoverRef = useRef(props.onRegionHover);
  const lastHoverIdRef = useRef<string | null>(null);
  onRegionClickRef.current = props.onRegionClick;
  onRegionHoverRef.current = props.onRegionHover;

  const getScreenPoint = useCallback(
    (event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>): ScreenPoint => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    [],
  );

  const resolveRegion = useCallback(
    (target: EventTarget | null): RegionFeature | null => {
      if (!(target instanceof Element)) {
        return null;
      }
      const node = target.closest(REGION_ID_SELECTOR);
      if (!node) {
        return null;
      }
      const id = node.getAttribute(REGION_ID_ATTR);
      return id ? regionsById.get(id) ?? null : null;
    },
    [regionsById],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const handler = onRegionClickRef.current;
      if (!handler || !api) {
        return;
      }
      const region = resolveRegion(event.target);
      if (!region) {
        return;
      }
      const screenPoint = getScreenPoint(event);
      handler(region, {
        screenPoint,
        normalizedPoint: api.screenToNormalized(screenPoint),
        nativeEvent: event,
      });
    },
    [api, getScreenPoint, resolveRegion],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const handler = onRegionHoverRef.current;
      if (!handler || !api) {
        return;
      }
      const region = resolveRegion(event.target);

      if (region) {
        lastHoverIdRef.current = region.id;
        const screenPoint = getScreenPoint(event);
        handler(region, {
          screenPoint,
          normalizedPoint: api.screenToNormalized(screenPoint),
          nativeEvent: event,
        });
        return;
      }

      if (lastHoverIdRef.current !== null) {
        lastHoverIdRef.current = null;
        const screenPoint = getScreenPoint(event);
        handler(null, {
          screenPoint,
          normalizedPoint: api.screenToNormalized(screenPoint),
          nativeEvent: event,
        });
      }
    },
    [api, getScreenPoint, resolveRegion],
  );

  const handlePointerLeave = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (lastHoverIdRef.current === null) {
        return;
      }
      lastHoverIdRef.current = null;
      const handler = onRegionHoverRef.current;
      if (!handler) {
        return;
      }
      handler(null, {
        screenPoint: getScreenPoint(event),
        nativeEvent: event,
      });
    },
    [getScreenPoint],
  );

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
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {projected.map(({ region, projected }) => {
          const isHovered = props.hoveredRegionId === region.id;
          const isSelected = props.selectedRegionId === region.id;

          const custom = props.renderRegion?.({
            region,
            projected,
            isHovered,
            isSelected,
          });

          if (custom) {
            return (
              <g key={region.id} data-region-id={region.id}>
                {custom}
              </g>
            );
          }

          const sharedProps = {
            "data-region-id": region.id,
            style: {
              pointerEvents: "auto" as const,
              cursor: "pointer",
            },
            fill: isSelected
              ? "rgba(37,99,235,0.24)"
              : isHovered
                ? "rgba(37,99,235,0.18)"
                : "rgba(37,99,235,0.12)",
            stroke: isSelected ? "#1d4ed8" : "#2563eb",
            strokeWidth: isSelected ? 2 : 1.5,
          };

          switch (region.geometry.type) {
            case "polygon":
              return <path key={region.id} d={projected.path} {...sharedProps} />;
            case "rectangle":
              if (!projected.rect) return null;
              return (
                <rect
                  key={region.id}
                  x={projected.rect.x}
                  y={projected.rect.y}
                  width={projected.rect.width}
                  height={projected.rect.height}
                  {...sharedProps}
                />
              );
            case "point":
              if (!projected.center) return null;
              return (
                <circle
                  key={region.id}
                  cx={projected.center.x}
                  cy={projected.center.y}
                  r={region.geometry.radius ?? 8}
                  {...sharedProps}
                />
              );
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
