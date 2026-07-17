import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const readRepositoryFile = (file) => readFile(path.join(repositoryRoot, file));

const windowsIcon = "assets/desktop/vpbuddy-icon.ico";
const macosIcon = "assets/desktop/vpbuddy-icon.icns";
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const markSource = await readFile(path.join(repositoryRoot, "assets/desktop/vpbuddy-mark.svg"), "utf8");
const png = await readRepositoryFile("assets/desktop/vpbuddy-icon.png");
const ico = await readRepositoryFile(windowsIcon);
const icns = await readRepositoryFile(macosIcon);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseIcoSizes(buffer) {
  assert.equal(buffer.readUInt16LE(0), 0, "ICO reserved header must be zero");
  assert.equal(buffer.readUInt16LE(2), 1, "ICO must contain icon images");

  const count = buffer.readUInt16LE(4);
  const directoryEnd = 6 + count * 16;
  const sizes = [];

  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = buffer[entryOffset] || 256;
    const height = buffer[entryOffset + 1] || 256;
    const imageLength = buffer.readUInt32LE(entryOffset + 8);
    const imageOffset = buffer.readUInt32LE(entryOffset + 12);

    assert.equal(width, height, "every ICO frame must be square");
    assert.ok(imageLength > 0, "every ICO frame must contain image data");
    assert.ok(imageOffset >= directoryEnd, "ICO frame data must follow the directory");
    assert.ok(imageOffset + imageLength <= buffer.length, "ICO frame data must stay inside the file");
    sizes.push(width);
  }

  return sizes.toSorted((left, right) => left - right);
}

function parseIcnsTypes(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "icns");
  assert.equal(buffer.readUInt32BE(4), buffer.length, "ICNS header must declare the complete file");

  const types = [];
  let offset = 8;
  while (offset < buffer.length) {
    assert.ok(offset + 8 <= buffer.length, "ICNS chunk header must be complete");
    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    assert.ok(length >= 8, `ICNS chunk ${type} must include its header`);
    assert.ok(offset + length <= buffer.length, `ICNS chunk ${type} must stay inside the file`);
    types.push(type);
    offset += length;
  }

  assert.equal(offset, buffer.length);
  return types;
}

test("the desktop assets preserve the existing blue-purple VPBuddy mark", () => {
  assert.match(markSource, /viewBox="0 0 1024 1024"/);
  assert.equal((markSource.match(/<path\b/g) || []).length, 3);
  assert.deepEqual(
    Array.from(markSource.matchAll(/stop-color="(#[0-9a-f]{6})"/g), (match) => match[1]),
    ["#20c8ff", "#1765ff", "#6b2cff", "#8a2bff", "#5a28ff", "#245dff", "#234eff", "#8b20ef"]
  );

  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[24], 8, "the master PNG must use 8-bit channels");
  assert.equal(png[25], 6, "the master PNG must preserve RGBA transparency");
});

test("the Windows icon contains every desktop and shortcut size", () => {
  assert.deepEqual(parseIcoSizes(ico), [16, 20, 24, 32, 40, 48, 64, 128, 256]);
});

test("the macOS icon contains standard and Retina representations", () => {
  const types = parseIcnsTypes(icns);
  for (const type of ["ic07", "ic08", "ic09", "ic10", "ic11", "ic12", "ic13", "ic14"]) {
    assert.ok(types.includes(type), `ICNS must contain ${type}`);
  }
  assert.ok(types.includes("s8mk") && types.includes("l8mk"), "ICNS must retain legacy small-icon alpha masks");
});

test("electron-builder applies one brand to apps, installers, disk images, and shortcuts", () => {
  const { build } = packageJson;
  assert.equal(build.win.icon, windowsIcon);
  assert.equal(build.nsis.installerIcon, windowsIcon);
  assert.equal(build.nsis.uninstallerIcon, windowsIcon);
  assert.equal(build.mac.icon, macosIcon);
  assert.equal(build.dmg.icon, macosIcon);

  // Standard electron-builder NSIS shortcuts target the installed executable and inherit win.icon.
  assert.equal(build.nsis.createDesktopShortcut, true);
  assert.equal(build.nsis.createStartMenuShortcut, true);
  assert.equal(build.nsis.shortcutName, build.productName);
});

test("reviewed desktop icon binaries cannot be replaced silently", () => {
  assert.deepEqual(
    {
      png: sha256(png),
      ico: sha256(ico),
      icns: sha256(icns)
    },
    {
      png: "0d2106bb06ad1c217e289d5d2df1e9782a544c6ede38218cf013dab4a19706d5",
      ico: "91a37262f416748ddf23693db1aa0c88282488c8192bbcefdb4bbfb52bd2cde2",
      icns: "098a0ef23760c8f1340ccd532107e04d174125477740e55deae501268950df45"
    }
  );
});
