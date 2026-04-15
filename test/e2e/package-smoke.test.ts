import { cp, mkdir, readFile, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const testFilePath = fileURLToPath(import.meta.url);
const testDir = dirname(testFilePath);
const packageRoot = resolve(testDir, "../..");
const fixtureSource = resolve(testDir, "../fixtures/vercel-consumer");
const installEnv = {
  ...process.env,
  // Some local machines have a globally-installed libvips, which makes sharp
  // choose a source-build path. The packaged artifact should still validate
  // against the normal prebuilt sharp install used on Vercel.
  SHARP_IGNORE_GLOBAL_LIBVIPS: "1",
};

describe("packed artifact smoke test", () => {
  it("packs, installs, and resolves exports in a minimal React 18 consumer", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "pdf-map-consumer-"));
    const packDir = join(fixtureRoot, "pack");
    const consumerDir = join(fixtureRoot, "consumer");
    await mkdir(packDir, { recursive: true });
    await cp(fixtureSource, consumerDir, { recursive: true });
    await syncFixturePackageName(consumerDir);

    await execFileAsync("npm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: packageRoot,
      env: installEnv,
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
      { cwd: consumerDir, env: installEnv },
    );

    await execFileAsync("npm", ["run", "verify:imports"], { cwd: consumerDir, env: installEnv });
    await execFileAsync("npm", ["run", "build:maps"], { cwd: consumerDir, env: installEnv });

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
  const files = await readdir(packDir);
  const tarball = files.find((file) => file.endsWith(".tgz"));
  if (!tarball) {
    throw new Error("Expected npm pack to produce a tarball.");
  }
  return tarball;
}

async function syncFixturePackageName(consumerDir: string) {
  const packageName = await readPackageName();
  await replacePackageNameInTree(consumerDir, packageName);
}

async function readPackageName() {
  const packageJsonPath = join(packageRoot, "package.json");
  const packageJsonBytes = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonBytes) as { name?: unknown };
  if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
    throw new Error(`Expected a non-empty package name in ${packageJsonPath}.`);
  }
  return packageJson.name;
}

async function replacePackageNameInTree(rootDir: string, packageName: string) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await replacePackageNameInTree(entryPath, packageName);
      continue;
    }

    if (!(await isTextFixtureFile(entryPath))) {
      continue;
    }

    const source = await readFile(entryPath, "utf8");
    const next = source.replaceAll("@scope/pdf-map", packageName);
    if (next !== source) {
      await writeFile(entryPath, next);
    }
  }
}

async function isTextFixtureFile(filePath: string) {
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile()) {
    return false;
  }

  return /\.(?:[cm]?[jt]sx?|json|md)$/u.test(filePath);
}
