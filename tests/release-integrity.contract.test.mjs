import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  LATEST_RELEASE_URL,
  PUBLIC_RELEASE_ASSET_COUNT,
  assertReleaseTag,
  getAllReleaseAssetNames,
  getReleaseAssetNames,
  getReleaseAssetUrl,
  prepareReleaseAssets,
  verifyReleaseAssets
} from "../scripts/release-assets.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRepositoryFile = (file) => readFile(path.join(repositoryRoot, file), "utf8");

const packageJson = JSON.parse(await readRepositoryFile("package.json"));
const packageLock = JSON.parse(await readRepositoryFile("package-lock.json"));
const desktopMain = await readRepositoryFile("desktop/main.cjs");
const readme = await readRepositoryFile("README.md");
const releaseNotes = await readRepositoryFile("RELEASE_NOTES.md");
const workflowSource = await readRepositoryFile(".github/workflows/desktop-build.yml");
const workflow = yaml.load(workflowSource);

const expectedReleaseAssets = [
  `VPBuddy-Setup-${packageJson.version}-x64.exe`,
  `VPBuddy-Portable-${packageJson.version}-x64.exe`,
  `VPBuddy-${packageJson.version}-mac-arm64.dmg`,
  `VPBuddy-${packageJson.version}-mac-x64.dmg`
];
const windowsBuildCommand = "npx --no-install electron-builder --win nsis portable --x64 --publish never --config.nsis.differentialPackage=false";
const macosBuildCommand = "npx --no-install electron-builder --mac dmg --x64 --arm64 --publish never --config.dmg.writeUpdateInfo=false";
const windowsStageCommand = "node scripts/release-assets.mjs prepare windows release";
const macosStageCommand = "node scripts/release-assets.mjs prepare macos release";

function stepRuns(job, command) {
  return job.steps.some((step) => step.run === command);
}

function actionStep(job, action) {
  return job.steps.find((step) => step.uses === action);
}

function namedStep(job, name) {
  return job.steps.find((step) => step.name === name);
}

function needs(job) {
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

test("package, lockfile, README, release notes, and tag share one version", () => {
  const version = packageJson.version;
  const escapedVersion = version.replaceAll(".", "\\.");
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(packageLock.version, version);
  assert.equal(packageLock.packages[""].version, version);
  assert.ok(readme.includes(`当前代码版本：\`v${version}\``));
  assert.match(readme, new RegExp(`^## v${escapedVersion} 更新摘要$`, "m"));
  assert.match(releaseNotes, /^# VPBuddy Releases$/m);
  assert.match(releaseNotes, new RegExp(`^## v${escapedVersion} · \\d{4}-\\d{2}-\\d{2}$`, "m"));
  assert.ok(releaseNotes.includes(`\`v${version}\` tag`));

  assert.doesNotThrow(() => assertReleaseTag(`v${version}`, version));
  assert.throws(() => assertReleaseTag("v0.0.0", version), /must match package version/);

  if (process.env.GITHUB_REF_TYPE === "tag") {
    assertReleaseTag(process.env.GITHUB_REF_NAME, version);
  }
});

test("the desktop has no automatic updater dependency or runtime integration", () => {
  const directDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies
  };
  assert.equal(directDependencies["electron-updater"], undefined);
  assert.equal(directDependencies["update-electron-app"], undefined);
  assert.equal(packageJson.build.publish, undefined);
  assert.doesNotMatch(desktopMain, /\bautoUpdater\b|checkForUpdates|setFeedURL|latest(?:-mac)?\.ya?ml|\.blockmap/);
  assert.match(packageJson.scripts["desktop:build:win"], /--publish never$/);
  assert.match(packageJson.scripts["desktop:build:mac"], /--publish never$/);
});

test("electron-builder names the four public installers with the package version", () => {
  assert.equal(packageJson.build.nsis.artifactName, "${productName}-Setup-${version}-${arch}.${ext}");
  assert.equal(packageJson.build.portable.artifactName, "${productName}-Portable-${version}-${arch}.${ext}");
  assert.equal(packageJson.build.mac.artifactName, "${productName}-${version}-mac-${arch}.${ext}");

  const windowsTargets = Object.fromEntries(packageJson.build.win.target.map((target) => [target.target, target.arch]));
  assert.deepEqual(windowsTargets, { nsis: ["x64"], portable: ["x64"] });

  const macTargets = Object.fromEntries(packageJson.build.mac.target.map((target) => [target.target, target.arch]));
  assert.deepEqual(macTargets.dmg, ["x64", "arm64"]);
  assert.equal(PUBLIC_RELEASE_ASSET_COUNT, 4);
  assert.deepEqual(getAllReleaseAssetNames(packageJson.version), expectedReleaseAssets);
});

test("README and release notes link only the four versioned user downloads", () => {
  assert.ok(readme.includes(`](${LATEST_RELEASE_URL})`));

  for (const assetName of expectedReleaseAssets) {
    const downloadUrl = getReleaseAssetUrl(packageJson.version, assetName);
    assert.ok(readme.includes(`](${downloadUrl})`));
    assert.ok(releaseNotes.includes(`](${downloadUrl})`));
  }

  for (const document of [readme, releaseNotes]) {
    assert.doesNotMatch(
      document,
      /releases\/download\/[^)]+\/(?:[^)\s]*latest[^)\s]*|[^)\s]*\.blockmap|VPBuddy-[^)\s]*-mac-(?:arm64|x64)\.zip)/
    );
  }

  const versionHeading = releaseNotes.indexOf(`## v${packageJson.version} · `);
  const windowsHeading = releaseNotes.indexOf("### Windows", versionHeading);
  const macosHeading = releaseNotes.indexOf("### macOS", windowsHeading);
  const nextVersionHeading = releaseNotes.indexOf("\n## v", versionHeading + 1);
  const versionSectionEnd = nextVersionHeading === -1 ? releaseNotes.length : nextVersionHeading;
  assert.ok(versionHeading >= 0 && windowsHeading > versionHeading);
  assert.ok(macosHeading > windowsHeading && macosHeading < versionSectionEnd);
});

test("asset staging publishes exactly four files and ignores builder byproducts", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "vpbuddy-release-contract-"));
  const windowsBuild = path.join(temporaryDirectory, "windows-build");
  const macosBuild = path.join(temporaryDirectory, "macos-build");
  const artifacts = path.join(temporaryDirectory, "artifacts");
  const windowsPublic = path.join(artifacts, "vpbuddy-windows");
  const macosPublic = path.join(artifacts, "vpbuddy-macos");

  try {
    await Promise.all([mkdir(windowsBuild, { recursive: true }), mkdir(macosBuild, { recursive: true })]);
    for (const assetName of getReleaseAssetNames("windows", packageJson.version)) {
      await writeFile(path.join(windowsBuild, assetName), `fixture:${assetName}`);
    }
    for (const assetName of getReleaseAssetNames("macos", packageJson.version)) {
      await writeFile(path.join(macosBuild, assetName), `fixture:${assetName}`);
    }

    await writeFile(path.join(windowsBuild, "VPBuddy-Setup-latest-x64.exe"), "forbidden alias");
    await writeFile(path.join(windowsBuild, `VPBuddy-Setup-${packageJson.version}-x64.exe.blockmap`), "byproduct");
    await writeFile(path.join(macosBuild, `VPBuddy-${packageJson.version}-mac-arm64.zip`), "duplicate package");
    await writeFile(path.join(macosBuild, `VPBuddy-${packageJson.version}-mac-arm64.dmg.blockmap`), "byproduct");

    await prepareReleaseAssets({
      platform: "windows",
      releaseDirectory: windowsBuild,
      outputDirectory: windowsPublic,
      version: packageJson.version
    });
    await prepareReleaseAssets({
      platform: "macos",
      releaseDirectory: macosBuild,
      outputDirectory: macosPublic,
      version: packageJson.version
    });

    assert.deepEqual(
      (await readdir(windowsPublic)).toSorted(),
      getReleaseAssetNames("windows", packageJson.version).toSorted()
    );
    assert.deepEqual(
      (await readdir(macosPublic)).toSorted(),
      getReleaseAssetNames("macos", packageJson.version).toSorted()
    );
    await assert.doesNotReject(() => verifyReleaseAssets({ rootDirectory: artifacts, version: packageJson.version }));

    const forbiddenAsset = path.join(macosPublic, `VPBuddy-${packageJson.version}-mac-x64.zip`);
    await writeFile(forbiddenAsset, "unexpected public file");
    await assert.rejects(
      () => verifyReleaseAssets({ rootDirectory: artifacts, version: packageJson.version }),
      /unexpected: .*\.zip/
    );
    await rm(forbiddenAsset);

    await writeFile(path.join(windowsPublic, expectedReleaseAssets[0]), "");
    await assert.rejects(
      () => verifyReleaseAssets({ rootDirectory: artifacts, version: packageJson.version }),
      /Public release asset is empty/
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("desktop workflow gates and publishes the exact public asset allowlist", () => {
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
  assert.equal(packageJson.scripts["release:verify"], "node scripts/release-assets.mjs verify artifacts");
  assert.deepEqual(needs(windows), ["contract"]);
  assert.deepEqual(needs(macos), ["contract"]);
  assert.deepEqual(needs(release).toSorted(), ["contract", "macos", "windows"]);
  assert.equal(release.if, "startsWith(github.ref, 'refs/tags/v')");

  assert.ok(stepRuns(windows, windowsBuildCommand));
  assert.ok(stepRuns(macos, macosBuildCommand));
  assert.ok(stepRuns(windows, windowsStageCommand));
  assert.ok(stepRuns(macos, macosStageCommand));
  assert.ok(stepRuns(release, "npm run release:verify"));
  assert.equal(actionStep(windows, "actions/upload-artifact@v4").with.path, "release/publish/*");
  assert.equal(actionStep(macos, "actions/upload-artifact@v4").with.path, "release/publish/*");

  const releaseMetadata = namedStep(release, "Compose release metadata");
  assert.match(releaseMetadata.run, /TZ=Asia\/Shanghai date '\+%Y-%m-%d'/);
  assert.match(releaseMetadata.run, /RELEASE_NAME=VPBuddy v\$\{VERSION\} · \$\{RELEASE_DATE\}/);

  const githubRelease = actionStep(release, "softprops/action-gh-release@v2");
  assert.equal(githubRelease.with.name, "${{ env.RELEASE_NAME }}");
  assert.equal(githubRelease.with.tag_name, "${{ github.ref_name }}");
  assert.equal(githubRelease.with.body_path, "RELEASE_NOTES.md");
  assert.equal(githubRelease.with.make_latest, true);
  assert.equal(githubRelease.with.fail_on_unmatched_files, true);
  assert.deepEqual(githubRelease.with.files.trim().split(/\r?\n/), [
    "artifacts/vpbuddy-windows/VPBuddy-Setup-${{ env.APP_VERSION }}-x64.exe",
    "artifacts/vpbuddy-windows/VPBuddy-Portable-${{ env.APP_VERSION }}-x64.exe",
    "artifacts/vpbuddy-macos/VPBuddy-${{ env.APP_VERSION }}-mac-arm64.dmg",
    "artifacts/vpbuddy-macos/VPBuddy-${{ env.APP_VERSION }}-mac-x64.dmg"
  ]);
  assert.doesNotMatch(githubRelease.with.files, /latest|\.blockmap|\.zip|\*\*\/\*/);
});
