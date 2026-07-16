import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  LATEST_RELEASE_URL,
  assertReleaseTag,
  getAllReleaseAssetPairs,
  getReleaseAssetPairs,
  prepareReleaseAliases,
  verifyReleaseAssets
} from "../scripts/release-assets.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRepositoryFile = (file) => readFile(path.join(repositoryRoot, file), "utf8");

const packageJson = JSON.parse(await readRepositoryFile("package.json"));
const packageLock = JSON.parse(await readRepositoryFile("package-lock.json"));
const readme = await readRepositoryFile("README.md");
const releaseNotes = await readRepositoryFile("RELEASE_NOTES.md");
const workflowSource = await readRepositoryFile(".github/workflows/desktop-build.yml");
const workflow = yaml.load(workflowSource);

const expectedStableAssets = [
  "VPBuddy-Setup-latest-x64.exe",
  "VPBuddy-Portable-latest-x64.exe",
  "VPBuddy-latest-mac-arm64.dmg",
  "VPBuddy-latest-mac-arm64.zip",
  "VPBuddy-latest-mac-x64.dmg",
  "VPBuddy-latest-mac-x64.zip"
];

function stepRuns(job, command) {
  return job.steps.some((step) => step.run === command);
}

function actionStep(job, action) {
  return job.steps.find((step) => step.uses === action);
}

function needs(job) {
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

test("package, lockfile, README, release notes, and tag share one version", () => {
  const version = packageJson.version;
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(packageLock.version, version);
  assert.equal(packageLock.packages[""].version, version);
  assert.ok(readme.includes(`当前代码版本：\`v${version}\``));
  assert.match(readme, new RegExp(`^## v${version.replaceAll(".", "\\.")} 更新摘要$`, "m"));
  assert.match(releaseNotes, new RegExp(`^# VPBuddy v${version.replaceAll(".", "\\.")}$`, "m"));
  assert.ok(releaseNotes.includes(`\`v${version}\` tag`));

  assert.doesNotThrow(() => assertReleaseTag(`v${version}`, version));
  assert.throws(() => assertReleaseTag("v0.0.0", version), /must match package version/);

  if (process.env.GITHUB_REF_TYPE === "tag") {
    assertReleaseTag(process.env.GITHUB_REF_NAME, version);
  }
});

test("electron-builder names every Windows and macOS asset with the package version", () => {
  assert.equal(packageJson.scripts["desktop:build:win"], "electron-builder --win nsis portable --x64 --publish never");
  assert.equal(packageJson.scripts["desktop:build:mac"], "electron-builder --mac dmg zip --x64 --arm64 --publish never");
  assert.equal(packageJson.build.nsis.artifactName, "${productName}-Setup-${version}-${arch}.${ext}");
  assert.equal(packageJson.build.portable.artifactName, "${productName}-Portable-${version}-${arch}.${ext}");
  assert.equal(packageJson.build.mac.artifactName, "${productName}-${version}-mac-${arch}.${ext}");

  const windowsTargets = Object.fromEntries(packageJson.build.win.target.map((target) => [target.target, target.arch]));
  assert.deepEqual(windowsTargets, { nsis: ["x64"], portable: ["x64"] });

  const macTargets = Object.fromEntries(packageJson.build.mac.target.map((target) => [target.target, target.arch]));
  assert.deepEqual(macTargets, { dmg: ["x64", "arm64"], zip: ["x64", "arm64"] });

  assert.deepEqual(
    getAllReleaseAssetPairs(packageJson.version).map((asset) => asset.stableName).sort(),
    expectedStableAssets.toSorted()
  );
});

test("README uses the stable latest release page and never predicts a versioned release URL", () => {
  assert.ok(readme.includes(`](${LATEST_RELEASE_URL})`));
  assert.doesNotMatch(readme, /github\.com\/pilipiliwang\/vpbuddy-frontend\/releases\/(?:download|tag)\/v\d/);

  for (const stableAsset of expectedStableAssets.filter((asset) => !asset.endsWith(".zip"))) {
    assert.ok(readme.includes(`\`${stableAsset}\``));
  }
});

test("alias preparation preserves versioned artifacts and creates byte-identical stable assets", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "vpbuddy-release-contract-"));
  try {
    for (const pair of getAllReleaseAssetPairs(packageJson.version)) {
      await writeFile(path.join(temporaryDirectory, pair.versionedName), `fixture:${pair.versionedName}`);
    }

    await prepareReleaseAliases({
      platform: "windows",
      releaseDirectory: temporaryDirectory,
      version: packageJson.version
    });
    await prepareReleaseAliases({
      platform: "macos",
      releaseDirectory: temporaryDirectory,
      version: packageJson.version
    });
    await verifyReleaseAssets({ rootDirectory: temporaryDirectory, version: packageJson.version });

    for (const pair of getAllReleaseAssetPairs(packageJson.version)) {
      const [versioned, stable] = await Promise.all([
        readFile(path.join(temporaryDirectory, pair.versionedName)),
        readFile(path.join(temporaryDirectory, pair.stableName))
      ]);
      assert.deepEqual(stable, versioned);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("desktop workflow gates both builders and the latest GitHub Release on the contract", () => {
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  for (const contractPath of [
    "README.md",
    "RELEASE_NOTES.md",
    "scripts/release-assets.mjs",
    "tests/release-integrity.contract.test.mjs"
  ]) {
    assert.ok(workflow.on.push.paths.includes(contractPath));
  }

  const contract = workflow.jobs.contract;
  const windows = workflow.jobs.windows;
  const macos = workflow.jobs.macos;
  const release = workflow.jobs.release;

  assert.ok(stepRuns(contract, "npm ci --ignore-scripts"));
  assert.ok(stepRuns(contract, "npm run test:release-contract"));
  assert.equal(packageJson.scripts["test:release-contract"], "node --test tests/release-integrity.contract.test.mjs");
  assert.equal(packageJson.scripts["release:aliases:windows"], "node scripts/release-assets.mjs prepare windows release");
  assert.equal(packageJson.scripts["release:aliases:macos"], "node scripts/release-assets.mjs prepare macos release");
  assert.equal(packageJson.scripts["release:verify"], "node scripts/release-assets.mjs verify artifacts");
  assert.deepEqual(needs(windows), ["contract"]);
  assert.deepEqual(needs(macos), ["contract"]);
  assert.deepEqual(needs(release).toSorted(), ["contract", "macos", "windows"]);
  assert.equal(release.if, "startsWith(github.ref, 'refs/tags/v')");

  assert.ok(stepRuns(windows, "npm run desktop:build:win"));
  assert.ok(stepRuns(macos, "npm run desktop:build:mac"));
  assert.ok(stepRuns(windows, "npm run release:aliases:windows"));
  assert.ok(stepRuns(macos, "npm run release:aliases:macos"));
  assert.ok(stepRuns(release, "npm run release:verify"));

  const windowsUploadPaths = actionStep(windows, "actions/upload-artifact@v4").with.path;
  const macosUploadPaths = actionStep(macos, "actions/upload-artifact@v4").with.path;
  for (const pair of getReleaseAssetPairs("windows", packageJson.version)) {
    assert.match(windowsUploadPaths, new RegExp(pair.stableName.replaceAll(".", "\\.")));
  }
  for (const pair of getReleaseAssetPairs("macos", packageJson.version)) {
    assert.match(macosUploadPaths, new RegExp(pair.stableName.replaceAll(".", "\\.")));
  }
  assert.match(windowsUploadPaths, /VPBuddy-Setup-\*\.exe/);
  assert.match(windowsUploadPaths, /VPBuddy-Portable-\*\.exe/);
  assert.match(macosUploadPaths, /VPBuddy-\*\.dmg/);
  assert.match(macosUploadPaths, /VPBuddy-\*\.zip/);

  const githubRelease = actionStep(release, "softprops/action-gh-release@v2");
  assert.equal(githubRelease.with.tag_name, "${{ github.ref_name }}");
  assert.equal(githubRelease.with.make_latest, true);
  assert.equal(githubRelease.with.fail_on_unmatched_files, true);
  for (const extension of ["exe", "dmg", "zip"]) {
    assert.match(githubRelease.with.files, new RegExp(`artifacts/\\*\\*/\\*\\.${extension}`));
  }
});
