# `pdf-map`

`pdf-map` is a React viewer and ingest toolkit for turning large PDFs, floorplans, and images into smooth, map-like experiences with static tiles, manifests, and normalized overlays.

## What it ships

- `pdf-map`: shared types, manifest helpers, schemas
- `pdf-map/client`: React viewer runtime
- `pdf-map/ingest`: Node ingest APIs, storage adapters, CLI
- `pdf-map/server`: server-safe re-export of ingest utilities

This package is not a hosted service. You can generate static tiles locally, upload them anywhere, or plug in a custom storage adapter.

The ingest pipeline is pure Node and uses prebuilt npm modules. PDF pages are rasterized with `pdfjs-dist` plus `@napi-rs/canvas`, and image normalization, resizing, tile generation, and preview generation are handled by `sharp`. There is no required system CLI or hosted backend.

## Install

```bash
npm install pdf-map react react-dom
```

## Viewer usage

### Tile source

```tsx
import { TileMapViewer } from "pdf-map/client";

function Floorplan({ manifest }: { manifest: any }) {
  return (
    <div style={{ height: 720 }}>
      <TileMapViewer
        source={{
          type: "tiles",
          manifest,
          baseUrl: "/maps/site-plan-001",
        }}
      />
    </div>
  );
}
```

### Image source

```tsx
<TileMapViewer
  source={{
    type: "image",
    src: "/floorplan.png",
    width: 8000,
    height: 6000,
  }}
/>
```

### PDF fallback source

```tsx
<TileMapViewer
  source={{
    type: "pdf",
    file: "/plan.pdf",
    page: 1,
  }}
/>
```

### Regions

```tsx
const regions = [
  {
    id: "suite-a",
    label: "Suite A",
    geometry: {
      type: "rectangle",
      rect: { x: 0.1, y: 0.2, width: 0.15, height: 0.12 },
    },
  },
];

<TileMapViewer
  source={{ type: "tiles", manifest }}
  regions={regions}
  onRegionClick={(region) => console.log(region.id)}
/>
```

## Ingest usage

### Local output

```ts
import { ingestPdf, localStorageAdapter } from "pdf-map/ingest";

const result = await ingestPdf({
  input: "./plans/site-plan.pdf",
  page: 1,
  id: "site-plan-001",
  storage: localStorageAdapter({
    baseDir: "./public/maps/site-plan-001",
    clean: true,
  }),
});
```

### In-memory / custom upload flow

```ts
import { ingestImage, memoryStorageAdapter } from "pdf-map/ingest";

const result = await ingestImage({
  input: imageBuffer,
  id: "floor-02",
  storage: memoryStorageAdapter(),
});
```

### S3-compatible storage

```ts
import { ingestPdf, s3CompatibleStorageAdapter } from "pdf-map/ingest";

const storage = s3CompatibleStorageAdapter({
  prefix: "maps/site-plan-001",
  baseUrl: "https://cdn.example.com",
  async putObject({ key, body, contentType, cacheControl }) {
    await myObjectStore.put(key, body, { contentType, cacheControl });
    return { url: `https://cdn.example.com/${key}` };
  },
});

const result = await ingestPdf({
  input: "./plans/site-plan.pdf",
  id: "site-plan-001",
  storage,
});
```

## CLI

```bash
pdf-map ingest ./plans/site-plan.pdf \
  --page 1 \
  --id site-plan-001 \
  --out-dir ./public/maps/site-plan-001
```

## Manifest

Generated manifests are versioned and viewer-complete. The viewer can load tiles from static hosting, object storage, or signed URL providers.

```json
{
  "version": 1,
  "kind": "pdf-map",
  "id": "site-plan-001",
  "source": {
    "type": "pdf",
    "page": 1,
    "width": 12000,
    "height": 9000
  },
  "tiles": {
    "tileSize": 256,
    "format": "webp",
    "minZoom": 0,
    "maxZoom": 6,
    "pathTemplate": "tiles/{z}/{x}/{y}.webp"
  }
}
```

## TanStack Start

Client code should import only from `pdf-map/client`, and ingest code should live in server functions or build steps via `pdf-map/server`.

See the TanStack Start example notes:

- [examples/tanstack-start/README.md](https://github.com/pirut/pdf-map/blob/main/examples/tanstack-start/README.md)

## Publishing

Before running `npm publish`, confirm:

```bash
npm test
npm run build
npm pack --dry-run
```

For an unscoped package:

```bash
npm publish
```
