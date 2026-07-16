import { copyFile, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const RELEASE_REPOSITORY_URL = "https://github.com/pilipiliwang/vpbuddy-frontend";
export const LATEST_RELEASE_URL = `${RELEASE_REPOSITORY_URL}/releases/latest`;

const assetDefinitions = Object.freeze({
  windows: Object.freeze([
    Object.freeze({
      versionedName: (version) => `VPBuddy-Setup-${version}-x64.exe`,
      stableName: "VPBuddy-Setup-latest-x64.exe"
    }),
    Object.freeze({
      versionedName: (version) => `VPBuddy-Portable-${version}-x64.exe`,
      stableName: "VPBuddy-Portable-latest-x64.exe"
    })
  ]),
  macos: Object.freeze(
    ["arm64", "x64"].flatMap((arch) =>
      ["dmg", "zip"].map((extension) =>
        Object.freeze({
          versionedName: (version) => `VPBuddy-${version}-mac-${arch}.${extension}`,
          stableName: `VPBuddy-latest-mac-${arch}.${extension}`
        })
      )
    )
  )
});

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

export function getReleaseAssetPairs(platform, version) {
  assertPlatform(platform);
  assertVersion(version);
  return assetDefinitions[platform].map(({ versionedName, stableName }) => ({
    versionedName: versionedName(version),
    stableName
  }));
}

export function getAllReleaseAssetPairs(version) {
  return Object.keys(assetDefinitions).flatMap((platform) => getReleaseAssetPairs(platform, version));
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

export async function prepareReleaseAliases({ platform, releaseDirectory, version }) {
  const resolvedVersion = version ?? (await readPackageVersion());
  const pairs = getReleaseAssetPairs(platform, resolvedVersion);

  for (const pair of pairs) {
    const source = path.join(releaseDirectory, pair.versionedName);
    const destination = path.join(releaseDirectory, pair.stableName);
    const sourceStat = await stat(source);
    if (!sourceStat.isFile() || sourceStat.size === 0) {
      throw new Error(`Versioned release asset is empty or missing: ${source}`);
    }
    await copyFile(source, destination);
  }

  return pairs;
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
  const files = await listFilesRecursively(rootDirectory);
  const filesByName = new Map(files.map((file) => [path.basename(file), file]));

  for (const pair of getAllReleaseAssetPairs(resolvedVersion)) {
    const versionedPath = filesByName.get(pair.versionedName);
    const stablePath = filesByName.get(pair.stableName);
    if (!versionedPath || !stablePath) {
      throw new Error(`Release asset pair is incomplete: ${pair.versionedName} / ${pair.stableName}`);
    }

    const [versionedStat, stableStat] = await Promise.all([stat(versionedPath), stat(stablePath)]);
    if (versionedStat.size === 0 || versionedStat.size !== stableStat.size) {
      throw new Error(`Release asset alias does not match its versioned source: ${pair.stableName}`);
    }
  }
}

async function main([command, target, directory]) {
  if (command === "prepare") {
    const releaseDirectory = path.resolve(repositoryRoot, directory ?? "release");
    const pairs = await prepareReleaseAliases({ platform: target, releaseDirectory });
    for (const pair of pairs) {
      console.log(`${pair.versionedName} -> ${pair.stableName}`);
    }
    return;
  }

  if (command === "verify") {
    const rootDirectory = path.resolve(repositoryRoot, target ?? "artifacts");
    await verifyReleaseAssets({ rootDirectory });
    console.log("Release assets verified.");
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
