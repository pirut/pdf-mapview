import { describe, expect, it } from "vitest";

import { MapController } from "../../src/client/core/MapController";
import type { ViewerEngine } from "../../src/client/engines/engineTypes";
import type { MapViewState } from "../../src/shared/viewport";

const fallbackView: MapViewState = {
  center: { x: 0.5, y: 0.5 },
  zoom: 1,
  minZoom: 0,
  maxZoom: 6,
  containerWidth: 0,
  containerHeight: 0,
};

describe("MapController", () => {
  it("does not require engine.getView during attach", () => {
    const controller = new MapController();
    let getViewCalls = 0;

    const engine: ViewerEngine = {
      getView() {
        getViewCalls += 1;
        throw new Error("getView should not run during attach");
      },
      setView() {},
      fitToBounds() {},
      screenToNormalized() {
        return { x: 0, y: 0 };
      },
      normalizedToScreen() {
        return { x: 0, y: 0 };
      },
      destroy() {},
      resize() {},
      getContainer() {
        return {} as HTMLElement;
      },
    };

    controller.attachEngine(engine);

    expect(getViewCalls).toBe(0);
    expect(controller.store.getSnapshot()).toEqual(fallbackView);
  });
});
