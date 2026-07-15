const encoder = new TextEncoder();

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return encoder.encode(String(value ?? ""));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function set16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function set32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function concat(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Build a standards-compliant ZIP archive using the STORE method.
 * The backend already returns compressed or small text assets, so recompression
 * would add latency without changing the archive contract.
 */
export function createZipBytes(files) {
  const entries = files.map((file) => {
    const safeName = String(file.name || "file")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/(?:^|\/)\.\.(?=\/|$)/g, "_");
    const name = encoder.encode(safeName || "file");
    const data = asBytes(file.data);
    const stamp = dosTimestamp(file.modifiedAt);
    return { name, data, stamp, crc: crc32(data), offset: 0 };
  });

  const localChunks = [];
  let localSize = 0;
  for (const entry of entries) {
    entry.offset = localSize;
    const chunk = new Uint8Array(30 + entry.name.length + entry.data.length);
    const view = new DataView(chunk.buffer);
    set32(view, 0, 0x04034b50);
    set16(view, 4, 20);
    set16(view, 6, 0x0800);
    set16(view, 8, 0);
    set16(view, 10, entry.stamp.time);
    set16(view, 12, entry.stamp.date);
    set32(view, 14, entry.crc);
    set32(view, 18, entry.data.length);
    set32(view, 22, entry.data.length);
    set16(view, 26, entry.name.length);
    set16(view, 28, 0);
    chunk.set(entry.name, 30);
    chunk.set(entry.data, 30 + entry.name.length);
    localChunks.push(chunk);
    localSize += chunk.length;
  }

  const centralChunks = [];
  let centralSize = 0;
  for (const entry of entries) {
    const chunk = new Uint8Array(46 + entry.name.length);
    const view = new DataView(chunk.buffer);
    set32(view, 0, 0x02014b50);
    set16(view, 4, 20);
    set16(view, 6, 20);
    set16(view, 8, 0x0800);
    set16(view, 10, 0);
    set16(view, 12, entry.stamp.time);
    set16(view, 14, entry.stamp.date);
    set32(view, 16, entry.crc);
    set32(view, 20, entry.data.length);
    set32(view, 24, entry.data.length);
    set16(view, 28, entry.name.length);
    set16(view, 30, 0);
    set16(view, 32, 0);
    set16(view, 34, 0);
    set16(view, 36, 0);
    set32(view, 38, 0);
    set32(view, 42, entry.offset);
    chunk.set(entry.name, 46);
    centralChunks.push(chunk);
    centralSize += chunk.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50);
  set16(endView, 4, 0);
  set16(endView, 6, 0);
  set16(endView, 8, entries.length);
  set16(endView, 10, entries.length);
  set32(endView, 12, centralSize);
  set32(endView, 16, localSize);
  set16(endView, 20, 0);

  return concat([...localChunks, ...centralChunks, end], localSize + centralSize + end.length);
}

export function createZipBlob(files) {
  return new Blob([createZipBytes(files)], { type: "application/zip" });
}
