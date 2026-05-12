import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@shopify/react-native-skia";
import { PanResponder, StyleSheet, View } from "react-native";

import type { NormalizedRect } from "../../shared/coordinates";
import { normalizeRegions } from "../../shared/overlays";
import type { RegionFeature } from "../../shared/overlays";
import type { MapPointerEvent, MapViewState, ScreenPoint } from "../../shared/viewport";
import {
  applyNativePan,
  applyNativeZoom,
  clampNativeView,
  fitNativeBounds,
  nativeScreenToNormalized,
  normalizedToNativeScreen,
  resizeNativeView,
  resolveNativeInitialView,
} from "../core/nativeViewport";
import {
  assertNativeTilesSource,
  getNativeTileKey,
  getNativeVisibleTiles,
  resolveNativeTileUrl,
} from "../core/nativeTiles";
import type { NativeTileDescriptor } from "../core/nativeTiles";
import {
  areNativeTileListsEqual,
  areNativeViewsEqual,
  isNativeLayoutSizeEqual,
  shouldRenderNativeDefaultOverlay,
  withNativeTileUri,
} from "../core/nativeStateGuards";
import { hitTestNativeRegions, getNativeRegionBounds } from "../core/nativeHitTesting";
import { NativeMemoryTileCache } from "../core/nativeTileCache";
import { NativeMapRuntimeContext } from "../runtimeContext";
import type { NativeMapApi, TileMapNativeProps } from "../types";
import { NativeCustomOverlayLayer, NativeOverlayLayer } from "./NativeOverlayLayer";
import { TileImage } from "./TileImage";

export const TileMapNative = forwardRef<NativeMapApi, TileMapNativeProps>(function TileMapNative(
  props,
  ref,
) {
  const source = assertNativeTilesSource(props.source);
  const manifest = source.manifest;
  const regions = useMemo(() => normalizeRegions(props.regions), [props.regions]);
  const regionsRef = useRef(regions);
  const sourceRef = useRef(source);
  const onViewChangeRef = useRef(props.onViewChange);
  const onRegionClickRef = useRef(props.onRegionClick);
  const onRegionHoverRef = useRef(props.onRegionHover);
  const onTileLoadRef = useRef(props.onTileLoad);
  const onErrorRef = useRef(props.onError);
  const cacheOptionsRef = useRef(props.cache);
  const cacheRef = useRef(new NativeMemoryTileCache(props.cache));
  const [view, setViewState] = useState<MapViewState>(() =>
    resolveNativeInitialView({
      manifest,
      container: { width: 1, height: 1 },
      initialView: props.initialView,
      minZoom: props.minZoom,
      maxZoom: props.maxZoom,
    }),
  );
  const viewRef = useRef(view);
  const [tiles, setTiles] = useState<NativeTileDescriptor[]>([]);
  const tilesRef = useRef<NativeTileDescriptor[]>([]);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const hoveredRegionIdRef = useRef<string | null>(null);
  const gestureRef = useRef({
    lastDistance: 0,
    lastDx: 0,
    lastDy: 0,
    lastTapAt: 0,
  });

  regionsRef.current = regions;
  sourceRef.current = source;
  viewRef.current = view;
  onViewChangeRef.current = props.onViewChange;
  onRegionClickRef.current = props.onRegionClick;
  onRegionHoverRef.current = props.onRegionHover;
  onTileLoadRef.current = props.onTileLoad;
  onErrorRef.current = props.onError;
  cacheOptionsRef.current = props.cache;

  useEffect(() => {
    cacheRef.current = new NativeMemoryTileCache(cacheOptionsRef.current);
  }, [
    props.cache?.adapter,
    props.cache?.enabled,
    props.cache?.maxMemoryEntries,
    props.cache?.namespace,
    props.cache?.persist,
  ]);

  const publishView = useCallback((nextView: MapViewState) => {
    const currentView = viewRef.current;
    if (areNativeViewsEqual(currentView, nextView)) {
      return;
    }

    viewRef.current = nextView;
    setViewState(nextView);
    onViewChangeRef.current?.(nextView);
  }, []);

  const setTilesIfChanged = useCallback((nextTiles: NativeTileDescriptor[]) => {
    if (areNativeTileListsEqual(tilesRef.current, nextTiles)) {
      return;
    }

    tilesRef.current = nextTiles;
    setTiles(nextTiles);
  }, []);

  const publishTileUri = useCallback((tileId: string, uri: string) => {
    const current = tilesRef.current;
    const next = withNativeTileUri(current, tileId, uri);
    if (next === current) {
      return;
    }

    tilesRef.current = next;
    setTiles(next);
  }, []);

  const publishHoveredRegion = useCallback((nextHoveredRegionId: string | null) => {
    if (hoveredRegionIdRef.current === nextHoveredRegionId) {
      return;
    }

    hoveredRegionIdRef.current = nextHoveredRegionId;
    setHoveredRegionId(nextHoveredRegionId);
  }, []);

  const mapApi = useMemo<NativeMapApi>(
    () => ({
      getView: () => viewRef.current,
      setView(nextView) {
        publishView(clampNativeView(manifest, {
          ...viewRef.current,
          ...nextView,
          center: nextView.center ?? viewRef.current.center,
          zoom: nextView.zoom ?? viewRef.current.zoom,
          minZoom: nextView.minZoom ?? viewRef.current.minZoom,
          maxZoom: nextView.maxZoom ?? viewRef.current.maxZoom,
        }));
      },
      fitToBounds(bounds, options) {
        publishView(fitNativeBounds(manifest, viewRef.current, bounds, options));
      },
      zoomToRegion(regionId, options) {
        const region = regionsRef.current.find((candidate) => candidate.id === regionId);
        if (!region) {
          return;
        }
        publishView(fitNativeBounds(manifest, viewRef.current, getNativeRegionBounds(region), options));
      },
      screenToNormalized(point) {
        return nativeScreenToNormalized(manifest, viewRef.current, point);
      },
      normalizedToScreen(point) {
        return normalizedToNativeScreen(manifest, viewRef.current, point);
      },
    }),
    [manifest, publishView],
  );

  useImperativeHandle(ref, () => mapApi, [mapApi]);

  const visibleTiles = useMemo(
    () =>
      getNativeVisibleTiles({
        source: {
          type: "tiles",
          manifest,
        },
        view,
        overscan: props.overscan,
      }),
    [manifest, props.overscan, view],
  );

  useEffect(() => {
    const abortController = new AbortController();
    const currentTilesById = new Map(tilesRef.current.map((tile) => [tile.id, tile]));
    const nextTiles = visibleTiles.map((tile) => {
      const cacheKey = getNativeTileKey(manifest, tile.z, tile.x, tile.y);
      return {
        ...tile,
        uri: cacheRef.current.get(cacheKey) ?? currentTilesById.get(tile.id)?.uri,
      };
    });
    setTilesIfChanged(nextTiles);

    void Promise.all(
      nextTiles.map(async (tile) => {
        if (tile.uri) {
          return;
        }

        onTileLoadRef.current?.({
          tile,
          status: "requested",
        });

        try {
          const cacheKey = getNativeTileKey(manifest, tile.z, tile.x, tile.y);
          const cachedUri = await cacheOptionsRef.current?.adapter?.get(cacheKey);
          if (abortController.signal.aborted) {
            onTileLoadRef.current?.({ tile, status: "cancelled" });
            return;
          }
          if (cachedUri) {
            cacheRef.current.set(cacheKey, cachedUri);
            onTileLoadRef.current?.({ tile, status: "loaded", uri: cachedUri });
            publishTileUri(tile.id, cachedUri);
            return;
          }

          const uri = await resolveNativeTileUrl({
            source: sourceRef.current,
            z: tile.z,
            x: tile.x,
            y: tile.y,
            signal: abortController.signal,
          });
          if (abortController.signal.aborted) {
            onTileLoadRef.current?.({ tile, status: "cancelled" });
            return;
          }

          cacheRef.current.set(cacheKey, uri);
          if (cacheOptionsRef.current?.adapter) {
            await cacheOptionsRef.current.adapter.set?.(cacheKey, uri);
          }
          if (abortController.signal.aborted) {
            onTileLoadRef.current?.({ tile, status: "cancelled" });
            return;
          }
          onTileLoadRef.current?.({ tile, status: "loaded", uri });
          publishTileUri(tile.id, uri);
        } catch (error) {
          if (abortController.signal.aborted) {
            onTileLoadRef.current?.({ tile, status: "cancelled" });
            return;
          }
          onTileLoadRef.current?.({ tile, status: "error", error });
          onErrorRef.current?.(asError(error));
        }
      }),
    );

    return () => {
      abortController.abort();
    };
  }, [manifest, publishTileUri, setTilesIfChanged, visibleTiles]);

  const handlePointer = useCallback(
    (screenPoint: ScreenPoint, nativeEvent: unknown, emitClick: boolean) => {
      const normalizedPoint = nativeScreenToNormalized(manifest, viewRef.current, screenPoint);
      const region = hitTestNativeRegions({
        regions: regionsRef.current,
        point: normalizedPoint,
      });
      const event: MapPointerEvent = {
        screenPoint,
        normalizedPoint,
        nativeEvent: nativeEvent as MapPointerEvent["nativeEvent"],
      };

      publishHoveredRegion(region?.id ?? null);
      onRegionHoverRef.current?.(region, event);
      if (emitClick && region) {
        onRegionClickRef.current?.(region, event);
      }
    },
    [manifest, publishHoveredRegion],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: unknown) => {
          gestureRef.current.lastDx = 0;
          gestureRef.current.lastDy = 0;
          const point = getEventPoint(event);
          const now = Date.now();
          if (now - gestureRef.current.lastTapAt < 280) {
            publishView(applyNativeZoom(manifest, viewRef.current, viewRef.current.zoom * 1.75, point));
          }
          gestureRef.current.lastTapAt = now;
          handlePointer(point, event, false);
        },
        onPanResponderMove: (event: unknown, gestureState: { dx: number; dy: number }) => {
          const touches = getTouches(event);
          if (touches.length >= 2) {
            const distance = getTouchDistance(touches);
            const focalPoint = getTouchCenter(touches);
            const lastDistance = gestureRef.current.lastDistance || distance;
            const ratio = distance / (lastDistance || distance);
            gestureRef.current.lastDistance = distance;
            publishView(applyNativeZoom(manifest, viewRef.current, viewRef.current.zoom * ratio, focalPoint));
            return;
          }

          const deltaX = gestureState.dx - gestureRef.current.lastDx;
          const deltaY = gestureState.dy - gestureRef.current.lastDy;
          gestureRef.current.lastDx = gestureState.dx;
          gestureRef.current.lastDy = gestureState.dy;
          publishView(applyNativePan(manifest, viewRef.current, {
            x: deltaX,
            y: deltaY,
          }));
        },
        onPanResponderRelease: (event: unknown, gestureState: { dx: number; dy: number }) => {
          gestureRef.current.lastDistance = 0;
          gestureRef.current.lastDx = 0;
          gestureRef.current.lastDy = 0;
          const point = getEventPoint(event);
          const moved = Math.abs(gestureState.dx) + Math.abs(gestureState.dy);
          handlePointer(point, event, moved < 8);
        },
        onPanResponderTerminate: () => {
          gestureRef.current.lastDistance = 0;
          gestureRef.current.lastDx = 0;
          gestureRef.current.lastDy = 0;
        },
      }),
    [handlePointer, manifest, publishView],
  );

  return (
    <NativeMapRuntimeContext.Provider value={mapApi}>
      <View
        {...panResponder.panHandlers}
        onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => {
          const { width, height } = event.nativeEvent.layout;
          if (isNativeLayoutSizeEqual(viewRef.current, { width, height })) {
            return;
          }

          publishView(resizeNativeView(viewRef.current, { width, height }));
        }}
        style={[styles.container, props.style]}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          {tiles.map((tile) => (
            <TileImage key={tile.id} tile={tile} />
          ))}
          {shouldRenderNativeDefaultOverlay(props.renderRegionOverlay) ? (
            <NativeOverlayLayer
              manifest={manifest}
              view={view}
              regions={regions}
              selectedRegionId={props.selectedRegionId}
              hoveredRegionId={hoveredRegionId}
            />
          ) : null}
        </Canvas>
        <NativeCustomOverlayLayer
          manifest={manifest}
          view={view}
          regions={regions}
          selectedRegionId={props.selectedRegionId}
          hoveredRegionId={hoveredRegionId}
          renderRegionOverlay={props.renderRegionOverlay}
        />
      </View>
    </NativeMapRuntimeContext.Provider>
  );
});

export const PdfMapNative = TileMapNative;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 320,
    overflow: "hidden",
    backgroundColor: "#f8fafc",
  },
});

function getEventPoint(event: any): ScreenPoint {
  return {
    x: event?.nativeEvent?.locationX ?? 0,
    y: event?.nativeEvent?.locationY ?? 0,
  };
}

function getTouches(event: any): Array<{ locationX: number; locationY: number }> {
  return event?.nativeEvent?.touches ?? [];
}

function getTouchDistance(touches: Array<{ locationX: number; locationY: number }>) {
  const first = touches[0];
  const second = touches[1];
  const dx = second.locationX - first.locationX;
  const dy = second.locationY - first.locationY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches: Array<{ locationX: number; locationY: number }>): ScreenPoint {
  const first = touches[0];
  const second = touches[1];
  return {
    x: (first.locationX + second.locationX) / 2,
    y: (first.locationY + second.locationY) / 2,
  };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
