# Changelog

All notable changes to `pdf-mapview` are documented here. This project
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
