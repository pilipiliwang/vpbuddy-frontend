import assert from "node:assert/strict";
import test from "node:test";

import { createZipBytes } from "../src/utils/zip.js";

const decoder = new TextDecoder();

test("ZIP builder emits readable UTF-8 STORE entries", () => {
  const archive = createZipBytes([
    { name: "需求文档.md", data: new TextEncoder().encode("requirements") },
    { name: "Demo.html", data: new TextEncoder().encode("<main>demo</main>") }
  ]);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const files = [];
  let offset = 0;

  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    files.push({
      name: decoder.decode(archive.subarray(nameStart, nameStart + nameLength)),
      content: decoder.decode(archive.subarray(dataStart, dataStart + size)),
      utf8: Boolean(view.getUint16(offset + 6, true) & 0x0800)
    });
    offset = dataStart + size;
  }

  assert.deepEqual(files, [
    { name: "需求文档.md", content: "requirements", utf8: true },
    { name: "Demo.html", content: "<main>demo</main>", utf8: true }
  ]);
  assert.equal(view.getUint32(offset, true), 0x02014b50, "central directory must follow local entries");
  assert.equal(view.getUint32(archive.length - 22, true), 0x06054b50, "archive must end with EOCD");
  assert.equal(view.getUint16(archive.length - 12, true), 2, "EOCD must report both files");
});
