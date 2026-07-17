import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const RELEASE_REPOSITORY_URL = "https://github.com/pilipiliwang/vpbuddy-frontend";
export const LATEST_RELEASE_URL = `${RELEASE_REPOSITORY_URL}/releases/latest`;

const assetDefinitions = Object.freeze({
  windows: Object.freeze([
    (version) => `VPBuddy-Setup-${version}-x64.exe`,
    (version) => `VPBuddy-Portable-${version}-x64.exe`
  ]),
  macos: Object.freeze([
    (version) => `VPBuddy-${version}-mac-arm64.dmg`,
    (version) => `VPBuddy-${version}-mac-x64.dmg`
  ])
});

export const PUBLIC_RELEASE_ASSET_COUNT = Object.values(assetDefinitions).reduce(
  (count, definitions) => count + definitions.length,
  0
);

function assertVersion(version) {
  if (!semverPattern.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }
}

function assertPlatform(platform) {
  if (!Object.hasOwn(assetDefinitions, platform)) {
    throw new Error(`Unsupported release platform: ${platform}`);
  }
}

export function getReleaseAssetNames(platform, version) {
  assertPlatform(platform);
  assertVersion(version);
  return assetDefinitions[platform].map((buildName) => buildName(version));
}

export function getAllReleaseAssetNames(version) {
  return Object.keys(assetDefinitions).flatMap((platform) => getReleaseAssetNames(platform, version));
}

export function getReleaseAssetUrl(version, assetName) {
  assertVersion(version);
  if (!getAllReleaseAssetNames(version).includes(assetName)) {
    throw new Error(`Unsupported public release asset: ${assetName}`);
  }
  return `${RELEASE_REPOSITORY_URL}/releases/download/v${version}/${assetName}`;
}

export function assertReleaseTag(tag, version) {
  assertVersion(version);
  if (tag !== `v${version}`) {
    throw new Error(`Release tag ${tag || "<empty>"} must match package version v${version}`);
  }
}

export async function readPackageVersion(packagePath = path.join(repositoryRoot, "package.json")) {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  assertVersion(packageJson.version);
  return packageJson.version;
}

async function assertNonEmptyFile(file, label) {
  let fileStat;
  try {
    fileStat = await stat(file);
  } catch {
    throw new Error(`${label} is missing: ${file}`);
  }

  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new Error(`${label} is empty or not a file: ${file}`);
  }
}

export async function prepareReleaseAssets({
  platform,
  releaseDirectory,
  outputDirectory,
  version
}) {
  const resolvedVersion = version ?? (await readPackageVersion());
  const resolvedReleaseDirectory = path.resolve(releaseDirectory);
  const resolvedOutputDirectory = path.resolve(
    outputDirectory ?? path.join(resolvedReleaseDirectory, "publish")
  );
  const assetNames = getReleaseAssetNames(platform, resolvedVersion);

  if (resolvedOutputDirectory === resolvedReleaseDirectory) {
    throw new Error("Public asset output directory must differ from the builder output directory.");
  }

  for (const assetName of assetNames) {
    await assertNonEmptyFile(
      path.join(resolvedReleaseDirectory, assetName),
      "Versioned release asset"
    );
  }

  await rm(resolvedOutputDirectory, { recursive: true, force: true });
  await mkdir(resolvedOutputDirectory, { recursive: true });

  for (const assetName of assetNames) {
    await copyFile(
      path.join(resolvedReleaseDirectory, assetName),
      path.join(resolvedOutputDirectory, assetName)
    );
  }

  return { assetNames, outputDirectory: resolvedOutputDirectory };
}

async function listFilesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
    })
  );
  return nestedFiles.flat();
}

export async function verifyReleaseAssets({ rootDirectory, version }) {
  const resolvedVersion = version ?? (await readPackageVersion());
  const expectedNames = getAllReleaseAssetNames(resolvedVersion).toSorted();
  const files = await listFilesRecursively(rootDirectory);
  const actualNames = files.map((file) => path.basename(file));
  const counts = new Map();

  for (const assetName of actualNames) {
    counts.set(assetName, (counts.get(assetName) ?? 0) + 1);
  }

  const missing = expectedNames.filter((assetName) => !counts.has(assetName));
  const unexpected = [...new Set(actualNames.filter((assetName) => !expectedNames.includes(assetName)))].toSorted();
  const duplicates = [...counts]
    .filter(([, count]) => count > 1)
    .map(([assetName]) => assetName)
    .toSorted();

  if (missing.length || unexpected.length || duplicates.length) {
    const details = [
      missing.length ? `missing: ${missing.join(", ")}` : "",
      unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "",
      duplicates.length ? `duplicated: ${duplicates.join(", ")}` : ""
    ].filter(Boolean);
    throw new Error(`Public release assets must be exactly the four approved files (${details.join("; ")}).`);
  }

  for (const file of files) {
    await assertNonEmptyFile(file, "Public release asset");
  }

  return expectedNames;
}

async function main([command, target, directory]) {
  if (command === "prepare") {
    const releaseDirectory = path.resolve(repositoryRoot, directory ?? "release");
    const prepared = await prepareReleaseAssets({ platform: target, releaseDirectory });
    for (const assetName of prepared.assetNames) {
      console.log(`${assetName} -> ${path.join(prepared.outputDirectory, assetName)}`);
    }
    return;
  }

  if (command === "verify") {
    const rootDirectory = path.resolve(repositoryRoot, target ?? "artifacts");
    const version = await readPackageVersion();
    if (process.env.GITHUB_REF_TYPE === "tag") {
      assertReleaseTag(process.env.GITHUB_REF_NAME, version);
    }
    await verifyReleaseAssets({ rootDirectory, version });
    console.log(`Release assets verified: ${PUBLIC_RELEASE_ASSET_COUNT} approved files.`);
    return;
  }

  throw new Error("Usage: release-assets.mjs prepare <windows|macos> [release-dir] | verify [artifacts-dir]");
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedUrl === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
