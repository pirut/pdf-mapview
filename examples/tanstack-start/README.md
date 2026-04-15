# TanStack Start example

This package is structured so TanStack Start can keep the viewer client-only and the ingest path server-only.

## Client component

```tsx
import { ClientOnly } from "@tanstack/react-start";
import { TileMapViewer } from "@scope/pdf-map/client";

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
          />
        </div>
      )}
    </ClientOnly>
  );
}
```

## Server function

```ts
import { ingestPdf, localStorageAdapter } from "@scope/pdf-map/server";

export async function buildPlanTiles() {
  return ingestPdf({
    input: "./plans/site-plan.pdf",
    page: 1,
    id: "site-plan-001",
    storage: localStorageAdapter({
      baseDir: "./public/maps/site-plan-001",
      clean: true,
    }),
  });
}
```

## Notes

- `@scope/pdf-map/client` does not touch browser globals at module scope.
- `@scope/pdf-map/server` avoids importing any client runtime.
- Local static output is the simplest TanStack Start deployment path.
