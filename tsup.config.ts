import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      "shared/index": "src/shared/index.ts",
      "client/index": "src/client/index.ts",
      "ingest/index": "src/ingest/index.ts",
      "ingest/cli": "src/ingest/cli.ts",
      "server/index": "src/server/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    target: "es2022",
    outDir: "dist",
    treeshake: true,
    minify: false,
    external: ["react", "react-dom"],
    onSuccess: "node scripts/copy-pdf-worker.mjs",
  },
]);
