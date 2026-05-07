import { Circle, Group, Path, Rect, Skia, Text as SkiaText, useFont } from "@shopify/react-native-skia";
import { StyleSheet, View } from "react-native";

import type { RegionFeature } from "../../shared/overlays";
import type { MapViewState } from "../../shared/viewport";
import { normalizedToNativeScreen } from "../core/nativeViewport";
import type { PdfMapManifest } from "../../shared/manifest";
import type { NativeRegionRenderArgs } from "../types";
import { getNativeRegionBounds } from "../core/nativeHitTesting";

export interface NativeOverlayLayerProps {
  manifest: PdfMapManifest;
  view: MapViewState;
  regions: RegionFeature[];
  hoveredRegionId?: string | null;
  selectedRegionId?: string | null;
  renderRegionOverlay?: (args: NativeRegionRenderArgs) => React.ReactNode;
}

export function NativeOverlayLayer(props: NativeOverlayLayerProps) {
  const font = useFont(undefined, 13);

  return (
    <Group>
      {props.regions.map((region) => {
          const isSelected = props.selectedRegionId === region.id;
          const isHovered = props.hoveredRegionId === region.id;
          const color = isSelected
            ? "rgba(37,99,235,0.24)"
            : isHovered
              ? "rgba(37,99,235,0.18)"
              : "rgba(37,99,235,0.12)";
          const stroke = isSelected ? "#1d4ed8" : "#2563eb";
          const strokeWidth = isSelected ? 2 : 1.5;

          switch (region.geometry.type) {
            case "rectangle": {
              const topLeft = normalizedToNativeScreen(props.manifest, props.view, {
                x: region.geometry.rect.x,
                y: region.geometry.rect.y,
              });
              const bottomRight = normalizedToNativeScreen(props.manifest, props.view, {
                x: region.geometry.rect.x + region.geometry.rect.width,
                y: region.geometry.rect.y + region.geometry.rect.height,
              });
              return (
                <Group key={region.id}>
                  <Rect
                    x={topLeft.x}
                    y={topLeft.y}
                    width={bottomRight.x - topLeft.x}
                    height={bottomRight.y - topLeft.y}
                    color={color}
                  />
                  <Rect
                    x={topLeft.x}
                    y={topLeft.y}
                    width={bottomRight.x - topLeft.x}
                    height={bottomRight.y - topLeft.y}
                    color={stroke}
                    style="stroke"
                    strokeWidth={strokeWidth}
                  />
                </Group>
              );
            }
            case "polygon": {
              const path = Skia.Path.Make();
              region.geometry.points.forEach((point, index) => {
                const screenPoint = normalizedToNativeScreen(props.manifest, props.view, point);
                if (index === 0) {
                  path.moveTo(screenPoint.x, screenPoint.y);
                } else {
                  path.lineTo(screenPoint.x, screenPoint.y);
                }
              });
              path.close();
              return (
                <Group key={region.id}>
                  <Path path={path} color={color} />
                  <Path path={path} color={stroke} style="stroke" strokeWidth={strokeWidth} />
                </Group>
              );
            }
            case "point": {
              const center = normalizedToNativeScreen(props.manifest, props.view, region.geometry.point);
              return (
                <Circle
                  key={region.id}
                  cx={center.x}
                  cy={center.y}
                  r={region.geometry.radius ?? 8}
                  color={stroke}
                />
              );
            }
            case "label": {
              const center = normalizedToNativeScreen(props.manifest, props.view, region.geometry.point);
              if (!font) {
                return null;
              }
              return (
                <SkiaText
                  key={region.id}
                  x={center.x}
                  y={center.y}
                  text={region.geometry.text}
                  font={font}
                  color={stroke}
                />
              );
            }
          }
      })}
    </Group>
  );
}

export function NativeCustomOverlayLayer(props: NativeOverlayLayerProps) {
  if (!props.renderRegionOverlay) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {props.regions.map((region) => {
        const bounds = getNativeRegionBounds(region);
        const topLeft = normalizedToNativeScreen(props.manifest, props.view, {
          x: bounds.x,
          y: bounds.y,
        });
        const bottomRight = normalizedToNativeScreen(props.manifest, props.view, {
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height,
        });
        const node = props.renderRegionOverlay?.({
          region,
          isHovered: props.hoveredRegionId === region.id,
          isSelected: props.selectedRegionId === region.id,
          screenBounds: {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
          },
        });
        return node ? (
          <View key={region.id} pointerEvents="box-none">
            {node}
          </View>
        ) : null;
      })}
    </View>
  );
}
