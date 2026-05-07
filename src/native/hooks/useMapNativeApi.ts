import { useContext } from "react";

import { NativeMapRuntimeContext } from "../runtimeContext";

export function useMapNativeApi() {
  return useContext(NativeMapRuntimeContext);
}
