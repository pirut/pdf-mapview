declare module "openseadragon";
declare module "pdfjs-dist/build/pdf.mjs";
declare module "pdfjs-dist/legacy/build/pdf.mjs";

declare module "react-native" {
  import type { ComponentType, ReactNode } from "react";

  export type StyleProp<T> = T | T[] | null | undefined;
  export interface ViewStyle {
    [key: string]: unknown;
  }
  export const View: ComponentType<any>;
  export const StyleSheet: {
    absoluteFill: Record<string, unknown>;
    create<T extends Record<string, unknown>>(styles: T): T;
  };
  export const PanResponder: {
    create(config: Record<string, unknown>): { panHandlers: Record<string, unknown> };
  };
  export interface GestureResponderEvent {
    nativeEvent: Record<string, unknown>;
  }
  export interface LayoutChangeEvent {
    nativeEvent: {
      layout: {
        width: number;
        height: number;
      };
    };
  }
  export interface ViewProps {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    pointerEvents?: "box-none" | "none" | "box-only" | "auto";
    onLayout?: (event: LayoutChangeEvent) => void;
  }
}

declare module "@shopify/react-native-skia" {
  import type { ComponentType } from "react";

  export const Canvas: ComponentType<any>;
  export const Circle: ComponentType<any>;
  export const Group: ComponentType<any>;
  export const Image: ComponentType<any>;
  export const Path: ComponentType<any>;
  export const Rect: ComponentType<any>;
  export const Text: ComponentType<any>;
  export function useFont(source?: unknown, size?: number): unknown;
  export function useImage(source?: string | null): unknown;
  export const Skia: {
    Path: {
      Make(): {
        moveTo(x: number, y: number): void;
        lineTo(x: number, y: number): void;
        close(): void;
      };
    };
  };
}

declare module "react-native-gesture-handler";
declare module "react-native-reanimated";
