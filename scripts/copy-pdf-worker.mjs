import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourcePath = resolve(
  projectRoot,
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.min.mjs",
);
const targetPath = resolve(projectRoot, "dist", "pdf.worker.min.mjs");

await mkdir(dirname(targetPath), { recursive: true });
await copyFile(sourcePath, targetPath);
