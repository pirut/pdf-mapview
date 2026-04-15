import { useContext } from "react";

import { MapRuntimeContext } from "../runtimeContext";

export function useRegions() {
  return useContext(MapRuntimeContext)?.regions ?? [];
}
