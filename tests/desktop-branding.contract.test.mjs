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
  assert.match(markSource, /<rect width="1024" height="1024" fill="url\(#background\)"\/>/);
  assert.equal((markSource.match(/<line\b/g) || []).length, 2);
  assert.equal((markSource.match(/stroke-width="200"/g) || []).length, 2);
  assert.equal((markSource.match(/stroke-linecap="round"/g) || []).length, 2);
  assert.match(markSource, /x1="320" y1="300" x2="417" y2="724"/);
  assert.match(markSource, /x1="704" y1="300" x2="607" y2="724"/);
  assert.deepEqual(
    Array.from(markSource.matchAll(/stop-color="(#[0-9a-f]{6})"/g), (match) => match[1]),
    [
      "#0e285a",
      "#091e46",
      "#061839",
      "#26caff",
      "#2780ff",
      "#454bff",
      "#6b3fff",
      "#8b3fff",
      "#7350ff",
      "#3d67ff",
      "#13c4ff"
    ]
  );

  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[24], 8, "the master PNG must use 8-bit channels");
  assert.equal(png[25], 2, "the master PNG must preserve the opaque deep-navy RGB background");
});

test("the Windows icon contains every desktop and shortcut size", () => {
  assert.deepEqual(parseIcoSizes(ico), [16, 24, 32, 48, 64, 128, 256]);
});

test("the macOS icon contains standard and Retina representations", () => {
  const types = parseIcnsTypes(icns);
  for (const type of ["icp4", "icp5", "icp6", "ic07", "ic08", "ic09", "ic10", "ic11", "ic12", "ic13", "ic14"]) {
    assert.ok(types.includes(type), `ICNS must contain ${type}`);
  }
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
      png: "c22473244c52a468f6b7e55670ab94b0179ff5a1d392a41a441e9c8b6f00de8d",
      ico: "d404c931fe3c48edff4589a59ff6a0623229371998a9183bab2d2bcc89359859",
      icns: "e9bfd0ea6b586a2d92dcb14be0190604fbfef37af7ebfd64697a87216c15f09a"
    }
  );
});
