import { forwardRef } from "react";

import type { MapApi, TileMapViewerProps } from "./TileMapViewer";
import { TileMapViewer } from "./TileMapViewer";

export const PdfMap = forwardRef<MapApi, TileMapViewerProps>(function PdfMap(props, ref) {
  return <TileMapViewer ref={ref} {...props} />;
});
