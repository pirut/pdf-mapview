# `pdf-mapview`

`pdf-mapview` is a React viewer and ingest toolkit for turning large PDFs, floorplans, and images into smooth, map-like experiences with static tiles, manifests, and normalized overlays.

## What it ships

- `pdf-mapview` — shared types, manifest helpers, schemas (browser + server safe)
- `pdf-mapview/client` — React viewer runtime (browser only)
- `pdf-mapview/ingest` — Node ingest APIs, storage adapters, CLI
- `pdf-mapview/server` — server-safe re-export of the ingest toolkit (use from TanStack Start server functions, Next.js route handlers, etc.)

This package is not a hosted service. You can generate static tiles locally, upload them anywhere, or plug in a custom storage adapter.

The ingest pipeline is pure Node and uses prebuilt npm modules. PDF pages are rasterized with `pdfjs-dist` plus `@napi-rs/canvas`, and image normalization, resizing, tile generation, and preview generation are handled by `sharp`. There is no required system CLI or hosted backend.

## Install

```bash
npm install pdf-mapview react react-dom
```

## Viewer usage

### Tile source

```tsx
import { TileMapViewer } from "pdf-mapview/client";

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

### Viewer CORS options

```tsx
<TileMapViewer
  source={{
    type: "tiles",
    manifest,
    baseUrl: "https://cdn.example.com/maps/site-plan-001",
  }}
  openSeadragon={{
    crossOriginPolicy: "Anonymous",
    ajaxWithCredentials: false,
  }}
/>
```

Use `crossOriginPolicy: "Anonymous"` for public CDN or static-hosted assets that send `Access-Control-Allow-Origin`. Use `crossOriginPolicy: "use-credentials"` together with `ajaxWithCredentials: true` only when the remote host requires cookies or credentialed CORS.

### Disabling drag momentum

By default OpenSeadragon applies velocity decay after a quick drag-release so the view "flicks" across the screen. Set `flickEnabled: false` to disable that momentum for mouse, touch, and pen at once:

```tsx
<TileMapViewer
  source={{ type: "tiles", manifest }}
  openSeadragon={{ flickEnabled: false }}
/>
```

For finer control you can override individual gesture settings per input device. Explicit `gestureSettingsMouse` / `gestureSettingsTouch` / `gestureSettingsPen` entries win over the `flickEnabled` shortcut:

```tsx
<TileMapViewer
  source={{ type: "tiles", manifest }}
  openSeadragon={{
    flickEnabled: false,
    gestureSettingsMouse: { flickEnabled: true }, // keep flick on mouse only
  }}
/>
```

### Signed tile URLs

Pass `getTileUrl` on the tile source to compute each tile URL at request time — useful for signed S3 URLs, short-lived CDN tokens, or any per-tile authorization:

```tsx
<TileMapViewer
  source={{
    type: "tiles",
    manifest,
    async getTileUrl({ z, x, y, signal }) {
      const res = await fetch(`/api/sign-tile?z=${z}&x=${x}&y=${y}`, { signal });
      const { url } = await res.json();
      return url;
    },
  }}
/>
```

`getTileUrl` overrides `baseUrl`. The `signal` is an `AbortSignal` the viewer uses when a tile request is no longer needed.

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
import { pdfWorkerUrl } from "pdf-mapview";

<TileMapViewer
  source={{
    type: "pdf",
    file: "/plan.pdf",
    page: 1,
    workerSrc: pdfWorkerUrl,
  }}
/>
```

`pdfWorkerUrl` resolves to the `pdf.worker.min.mjs` file bundled in the package. See [PDF worker hosting](#pdf-worker-hosting) if your bundler strips it.

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
import { ingestPdf, localStorageAdapter } from "pdf-mapview/ingest";

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

### Default PDF ingest behavior

```ts
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

When `rasterDpi` is omitted, PDF ingest preserves the existing `maxDimension`-based scaling behavior. The generated manifest still records the effective raster DPI in `manifest.source.rasterization`.

### PDF ingest with custom DPI

```ts
const result = await ingestPdf({
  input: "./plans/site-plan.pdf",
  page: 1,
  id: "site-plan-001-300dpi",
  rasterDpi: 300,
  storage: localStorageAdapter({
    baseDir: "./public/maps/site-plan-001-300dpi",
    clean: true,
  }),
});
```

Higher DPI is useful when you need sharper text, linework, or annotation detail before tiling. The tradeoff is more pixels to rasterize, more memory and CPU during ingest, and potentially more output tiles.

### In-memory / custom upload flow

```ts
import { ingestImage, memoryStorageAdapter } from "pdf-mapview/ingest";

const result = await ingestImage({
  input: imageBuffer,
  id: "floor-02",
  storage: memoryStorageAdapter(),
});
```

### S3-compatible storage

```ts
import { ingestPdf, s3CompatibleStorageAdapter } from "pdf-mapview/ingest";

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
  writeConcurrency: 16,
  retainFilesInResult: false,
});
```

## Performance tuning

Ingest runs in streaming mode — tiles and previews live on disk until storage adapters copy them into place. A few knobs let you trade memory, CPU, and latency for your target hardware.

### `retainFilesInResult`

By default, `IngestResult.files` is populated with every tile, preview, and overlay as an in-memory `OutputArtifact`. This is convenient when the caller wants to inspect or re-upload output, but it forces the pipeline to read every tile back from disk.

For large maps going directly to a storage adapter (local disk, S3, CDN), set `retainFilesInResult: false`. The adapter already has the bytes; the pipeline then skips the final read-back and `result.files` comes back as an empty array. Expect a large memory and wall-clock drop on >1,000-tile outputs.

```ts
await ingestPdf({
  input: "./plans/site-plan.pdf",
  id: "site-plan-001",
  storage: s3Storage,
  retainFilesInResult: false,
});
```

### `writeConcurrency`

Controls how many tiles/previews are written to the storage adapter in parallel. Default: `min(8, os.availableParallelism())`.

- **Raise it** (e.g. `16`–`32`) for network-bound adapters like S3 — uploads are I/O-bound and benefit from parallelism beyond CPU count.
- **Leave it alone** for local disk on modern SSDs — the default saturates most disks.
- **Lower it** if you see EMFILE/ETIMEDOUT against a flaky backend.

### `rasterDpi` vs `maxDimension` (PDF only)

Both bound the pixel budget for PDF rasterization but behave differently:

- `rasterDpi`: fixed DPI regardless of page size. Predictable quality (`300` is good for text-heavy plans). Larger PDF pages produce larger rasters.
- `maxDimension` (default `12288`): rasterizes at whatever DPI fits within `maxDimension × maxDimension` pixels. Produces a consistent upper bound on raster cost regardless of page size, but DPI varies per page.

Pick `rasterDpi` when print-style fidelity matters; keep `maxDimension` when you want predictable ingest cost.

### `tileFormat` and `tileQuality`

| Format   | Use when                                                | Notes                              |
| -------- | ------------------------------------------------------- | ---------------------------------- |
| `webp`   | default; best size/quality ratio                        | universal browser support in 2024+ |
| `jpeg`   | photographic content (satellite, orthophotos, scans)    | no transparency                    |
| `png`    | sharp UI/diagrams where lossless matters                | much larger files                  |

`tileQuality` (default `92`) applies to `webp` and `jpeg`. Drop to `80`–`85` for another ~20–30% size reduction with imperceptible visual change on most content.

## Ingest options reference

| Option                | Type                      | Default                   | Applies to   |
| --------------------- | ------------------------- | ------------------------- | ------------ |
| `id`                  | `string`                  | slugified filename        | both         |
| `title`               | `string`                  | —                         | both         |
| `tileSize`            | `256` \| `512`            | `256`                     | both         |
| `tileFormat`          | `"webp"`\|`"jpeg"`\|`"png"` | `"webp"`                | both         |
| `tileQuality`         | `number`                  | `92`                      | both         |
| `maxDimension`        | `number`                  | `12288`                   | both         |
| `rasterDpi`           | `number`                  | —                         | PDF          |
| `background`          | CSS color                 | `"#ffffff"`               | both         |
| `overlays`            | `RegionCollection \| URL` | —                         | both         |
| `baseUrl`             | `string`                  | —                         | both         |
| `storage`             | `StorageAdapter`          | `memoryStorageAdapter()`  | both         |
| `writeConcurrency`    | `number`                  | `min(8, cpu count)`       | both         |
| `retainFilesInResult` | `boolean`                 | `true`                    | both         |
| `page`                | `number`                  | `1`                       | PDF          |

## CLI

```bash
pdf-mapview ingest ./plans/site-plan.pdf \
  --page 1 \
  --id site-plan-001 \
  --out-dir ./public/maps/site-plan-001
```

### CLI flags

| Flag                             | Description                                                                          | Default                |
| -------------------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| `--page <n>`                     | PDF page to ingest                                                                   | `1`                    |
| `--id <id>`                      | Manifest id                                                                          | slugified filename     |
| `--title <title>`                | Manifest title                                                                       | —                      |
| `--out-dir <outDir>`             | Write output to a local directory                                                    | —                      |
| `--type <pdf\|image>`            | Force source type                                                                    | inferred from filename |
| `--base-url <baseUrl>`           | Base URL for manifest asset references                                               | —                      |
| `--adapter <modulePath>`         | Custom storage adapter factory (JS/TS module)                                        | —                      |
| `--adapter-export <name>`        | Named export on the adapter module                                                   | `default`              |
| `--tile-size <256\|512>`         | Tile size                                                                            | `256`                  |
| `--format <webp\|jpeg\|png>`     | Tile format                                                                          | `webp`                 |
| `--quality <n>`                  | Tile quality (0–100, webp/jpeg)                                                      | `92`                   |
| `--raster-dpi <n>`               | Rasterize PDF pages at a fixed DPI                                                   | —                      |
| `--max-dimension <n>`            | Max raster dimension                                                                 | `12288`                |
| `--write-concurrency <n>`        | Parallel tile/asset writes                                                           | `min(8, cpu count)`    |
| `--no-retain-files`              | Skip populating `result.files` — lower memory for large maps writing to disk/S3      | files retained         |

## Serving tiles

Generated tiles are static files under `tiles/{z}/{x}/{y}.{ext}`. Serve them as aggressively cached immutable assets:

- `Cache-Control: public, max-age=31536000, immutable` on tiles and `preview.webp`
- `Cache-Control: public, max-age=60` on `manifest.json` and `regions.json`
- `Access-Control-Allow-Origin` set for the domain(s) that will render the viewer, if tiles are on a different host

The S3-compatible adapter already sets cache headers; match them on any custom backend.

## PDF worker hosting

The PDF fallback (and PDF ingest on the server) uses `pdfjs-dist`, which requires a worker bundle. `pdf-mapview` exports `pdfWorkerUrl`, a `new URL(...)` reference to the copy in `dist/pdf.worker.min.mjs`.

- **Vite, TanStack Start** — `new URL(..., import.meta.url)` is understood natively; `pdfWorkerUrl` resolves to a hashed asset in your build output.
- **Next.js App Router / Turbopack** — same; no extra config needed.
- **Webpack 5** — same; `asset/resource` handles the URL import automatically.
- **Plain static hosting** — copy `node_modules/pdf-mapview/dist/pdf.worker.min.mjs` into your public directory and pass the URL directly:

  ```tsx
  <TileMapViewer source={{ type: "pdf", file: "/plan.pdf", workerSrc: "/pdf.worker.min.mjs" }} />
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
    "height": 9000,
    "rasterization": {
      "mode": "dpi",
      "requestedDpi": 300,
      "effectiveDpi": 300
    }
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

Client code should import only from `pdf-mapview/client`, and ingest code should live in server functions or build steps via `pdf-mapview/server`.

See the TanStack Start example notes:

- [examples/tanstack-start/README.md](https://github.com/pirut/pdf-mapview/blob/main/examples/tanstack-start/README.md)
