# Changelog

All notable changes to `pdf-mapview` are documented here. This project
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.4.2 — 2026-04-17

### Fixed

- **404s for edge tiles on non-power-of-two image dimensions.** The
  OpenSeadragon tile source produced by `createOpenSeadragonEngine`
  relied on OSD's default `getNumTiles(level)`, which computes the grid
  as `ceil(sourceWidth * scale / tileSize)`. For image dimensions that
  round oddly across zoom levels, that formula disagrees with libvips'
  Google-layout output by one column or row, so OSD would request an
  edge tile that was never written and the server logs filled with
  `/tiles/{z}/{x}/{y}.{ext}` 404s. The viewer still rendered (OSD falls
  back to lower-level tiles), but the log noise was real.

  The tile source now surfaces the authoritative per-level grid already
  stored in `manifest.tiles.levels[].columns/rows` to OSD via
  `getNumTiles` and `tileExists`, so OSD never enqueues nor requests
  out-of-bounds tiles. Consumer-provided `source.getTileUrl` overrides
  continue to work unchanged. No API change; purely tile-source
  metadata.

## 0.4.1 — 2026-04-17

### Fixed

- **Tile axis swap on non-square zoom levels.** `collectTileFilePaths`
  parsed libvips' Google-layout output (`{z}/{y}/{x}.ext`, row before
  column) as if the second segment were the column. Uploaded tile keys
  (`tiles/{z}/{x}/{y}.ext`) and the OpenSeadragon viewer
  (`getTileUrl(level, x, y)`, x = column, y = row) both use the opposite
  convention, so for any level where `columns !== rows` the client
  fetched tile (col, row) but received the bytes libvips wrote at disk
  position (row, col). Square levels (including the single-tile z=0 on
  square fixtures) aligned by coincidence and hid the bug in every
  existing test.

  The fix swaps only the in-memory label assignment inside
  `collectTileFilePaths`; the uploaded key format and manifest
  `pathTemplate` are unchanged. A regression test using a deliberately
  4×1 (non-square) pyramid now guards the invariant.

### Upgrade notes

- **Re-ingest existing plan sheets after upgrading.** 0.4.0 tile
  pyramids are permanently scrambled on any non-square zoom level —
  consumers who ingested plans with 0.4.0 should re-run the ingest with
  0.4.1 to regenerate correct tile keys. Cached CDN/storage copies of
  the old tiles should also be purged.

## 0.4.0 — 2026-04-17

### Added

- `onProgress` option on `IngestCommonOptions` (and therefore on `ingestPdf`
  and `ingestImage`) — an awaitable, discriminated-union progress callback
  rich enough to drive a per-stage progress UI without forking the pipeline.
  Event types:
  - `RasterizeStartEvent` — PDF only; fires after scale resolution, before
    the page is rendered. Carries `effectiveDpi`, `requestedDpi`,
    `maxDimension`.
  - `RasterizeCompleteEvent` — PDF only; fires after the page is rendered.
    Carries `width`, `height`, `effectiveDpi`.
  - `TileLevelCompleteEvent` — fires once per pyramid level (N events),
    carrying `completedLevels` / `totalLevels` / `completedTiles` /
    `totalTiles` / `zoom` / `levelTileCount`.
  - `ArtifactUploadCompleteEvent` — fires once per uploaded artifact
    (M events), carrying `completedArtifacts` / `totalArtifacts` / `path` /
    `kind`.
  - `FinalizeCompleteEvent` — fires once after the pipeline completes.
- Callbacks are **awaited** (never fire-and-forget), **serialized** (never
  two in flight concurrently), and **monotonic** within a stage. A thrown or
  rejected callback propagates out of the `ingest*` call and aborts the
  ingest.

All new types are exported from `pdf-mapview`, `pdf-mapview/ingest`, and
`pdf-mapview/server`.
