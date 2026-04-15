import { useContext } from "react";

import { MapRuntimeContext } from "../runtimeContext";

export function useMapApi() {
  return useContext(MapRuntimeContext)?.controller ?? null;
}
