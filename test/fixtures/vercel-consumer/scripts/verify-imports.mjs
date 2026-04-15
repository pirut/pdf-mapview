import { parseManifest } from "pdf-map";
import { TileMapViewer } from "pdf-map/client";
import { ingestPdf } from "pdf-map/server";

if (typeof TileMapViewer !== "object") {
  throw new Error("Expected TileMapViewer export to resolve.");
}

if (typeof ingestPdf !== "function") {
  throw new Error("Expected ingestPdf export to resolve.");
}

const manifest = parseManifest({
  version: 1,
  kind: "pdf-map",
  id: "fixture",
  source: { type: "image", width: 100, height: 100 },
  coordinateSpace: { normalized: true, width: 100, height: 100 },
  tiles: {
    tileSize: 256,
    format: "webp",
    minZoom: 0,
    maxZoom: 0,
    pathTemplate: "tiles/{z}/{x}/{y}.webp",
    levels: [{ z: 0, width: 100, height: 100, columns: 1, rows: 1, scale: 1 }],
  },
  view: { defaultCenter: [0.5, 0.5], defaultZoom: 1, minZoom: 0, maxZoom: 4 },
});

console.log(JSON.stringify({ ok: true, manifestId: manifest.id }));
