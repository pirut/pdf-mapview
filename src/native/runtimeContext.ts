import { createContext } from "react";

import type { NativeMapApi } from "./types";

export const NativeMapRuntimeContext = createContext<NativeMapApi | null>(null);
