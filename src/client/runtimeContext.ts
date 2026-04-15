import { createContext } from "react";

import type { RegionFeature } from "../shared/overlays";
import type { MapController } from "./core/MapController";

export interface MapRuntimeValue {
  controller: MapController;
  regions: RegionFeature[];
}

export const MapRuntimeContext = createContext<MapRuntimeValue | null>(null);
