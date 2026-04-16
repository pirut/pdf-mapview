# TanStack Start example

This package is structured so TanStack Start can keep the viewer client-only and the ingest path server-only.

## Client component

```tsx
import { ClientOnly } from "@tanstack/react-start";
import { TileMapViewer } from "pdf-mapview/client";

export function FloorplanClient({ manifest }: { manifest: any }) {
  return (
    <ClientOnly fallback={<div>Loading map...</div>}>
      {() => (
        <div style={{ height: 720 }}>
          <TileMapViewer
            source={{
              type: "tiles",
              manifest,
              baseUrl: "/maps/site-plan-001",
            }}
            openSeadragon={{
              crossOriginPolicy: "Anonymous",
              ajaxWithCredentials: false,
            }}
          />
        </div>
      )}
    </ClientOnly>
  );
}
```

## Server function

```ts
import { ingestPdf, localStorageAdapter } from "pdf-mapview/server";

export async function buildPlanTiles() {
  return ingestPdf({
    input: "./plans/site-plan.pdf",
    page: 1,
    id: "site-plan-001",
    rasterDpi: 300,
    storage: localStorageAdapter({
      baseDir: "./public/maps/site-plan-001",
      clean: true,
    }),
  });
}
```

## Notes

- `pdf-mapview/client` does not touch browser globals at module scope.
- `pdf-mapview/server` avoids importing any client runtime.
- Local static output is the simplest TanStack Start deployment path.
- For production ingest running inside a server function, pass `retainFilesInResult: false` — the adapter has already written everything to disk, and skipping the read-back keeps memory usage flat on large maps.
