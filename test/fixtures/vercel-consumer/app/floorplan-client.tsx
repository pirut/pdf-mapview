import { TileMapViewer } from "pdf-map/client";
import type { PdfMapManifest } from "pdf-map";
import manifest from "./site-plan-manifest.json";

export function FloorplanClient() {
  return (
    <div style={{ height: 720 }}>
      <TileMapViewer
        source={{
          type: "tiles",
          manifest: manifest as PdfMapManifest,
          baseUrl: "/maps/site-plan-001",
        }}
      />
    </div>
  );
}
