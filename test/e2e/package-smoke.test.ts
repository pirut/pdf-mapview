import { cp, mkdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("packed artifact smoke test", () => {
  it("packs, installs, and resolves exports in a minimal React 18 consumer", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "pdf-map-consumer-"));
    const packDir = join(fixtureRoot, "pack");
    const consumerDir = join(fixtureRoot, "consumer");
    await mkdir(packDir, { recursive: true });
    await cp(resolve("test/fixtures/vercel-consumer"), consumerDir, { recursive: true });

    await execFileAsync("npm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: resolve("."),
    });

    const tarballName = await findTarball(packDir);
    const tarballPath = join(packDir, tarballName);

    await execFileAsync(
      "npm",
      [
        "install",
        tarballPath,
        "react@18.3.1",
        "react-dom@18.3.1",
        "pdf-lib@1.17.1",
      ],
      { cwd: consumerDir },
    );

    await execFileAsync("npm", ["run", "verify:imports"], { cwd: consumerDir });
    await execFileAsync("npm", ["run", "build:maps"], { cwd: consumerDir });

    const manifestBytes = await readFile(
      join(consumerDir, "public", "maps", "site-plan-001", "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestBytes);
    expect(manifest.id).toBe("site-plan-001");
    expect(manifest.tiles.pathTemplate).toContain("tiles/{z}/{x}/{y}");

    await rm(fixtureRoot, { recursive: true, force: true });
  }, 120_000);
});

async function findTarball(packDir: string) {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(packDir);
  const tarball = files.find((file) => file.endsWith(".tgz"));
  if (!tarball) {
    throw new Error("Expected npm pack to produce a tarball.");
  }
  return tarball;
}
