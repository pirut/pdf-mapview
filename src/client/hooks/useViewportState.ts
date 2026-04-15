import { useSyncExternalStore } from "react";

import { MapRuntimeContext } from "../runtimeContext";
import { useContext } from "react";

export function useViewportState() {
  const runtime = useContext(MapRuntimeContext);
  if (!runtime) {
    throw new Error("useViewportState must be used within a TileMapViewer");
  }

  return useSyncExternalStore(
    (listener) => runtime.controller.store.subscribe(listener),
    () => runtime.controller.store.getSnapshot(),
  );
}
