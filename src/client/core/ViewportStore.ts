import type { MapViewState } from "../../shared/viewport";

type Listener = () => void;

const defaultViewState: MapViewState = {
  center: { x: 0.5, y: 0.5 },
  zoom: 1,
  minZoom: 0,
  maxZoom: 6,
  containerWidth: 0,
  containerHeight: 0,
};

export class ViewportStore {
  private state: MapViewState = defaultViewState;
  private listeners = new Set<Listener>();

  getSnapshot(): MapViewState {
    return this.state;
  }

  setState(state: MapViewState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
