function compactTranscriptText(records) {
  return Array.from(records || [], (record) => String(record?.text || "").replace(/\s+/g, ""))
    .filter(Boolean)
    .join("");
}

export function transcriptSnapshotCovers(snapshot, records) {
  const snapshotText = compactTranscriptText(snapshot);
  let cursor = 0;

  for (const record of records || []) {
    const text = compactTranscriptText([record]);
    if (!text) continue;
    const index = snapshotText.indexOf(text, cursor);
    if (index < 0) return false;
    cursor = index + text.length;
  }
  return true;
}

export function reconcileTranscriptRecords(currentRecords, snapshotRecords) {
  const current = Array.isArray(currentRecords) ? currentRecords : [];
  const snapshot = Array.isArray(snapshotRecords) ? snapshotRecords : [];
  if (!current.length) return snapshot;
  if (!snapshot.length) return current;

  if (transcriptSnapshotCovers(snapshot, current)) return snapshot;
  if (transcriptSnapshotCovers(current, snapshot)) return current;

  // Prefer the backend snapshot for persisted history, then append only realtime
  // text it has not persisted yet. This keeps both sides during a load/WS race.
  if (current.some((record) => record?.source === "realtime")) {
    const merged = [...snapshot];
    let mergedText = compactTranscriptText(merged);
    for (const record of current) {
      if (record?.source !== "realtime") continue;
      const text = compactTranscriptText([record]);
      if (!text || mergedText.includes(text)) continue;
      merged.push(record);
      mergedText += text;
    }
    return merged;
  }
  return snapshot;
}

function copyTranscriptRecords(records) {
  return Array.from(records || [], (record) => ({ ...record }));
}

function normalizeStorePart(value) {
  return encodeURIComponent(String(value || "").trim().toLowerCase());
}

export function createTranscriptRecordStore({
  storage = null,
  namespace = "vpbuddy.transcripts.v1",
  onStorageError
} = {}) {
  const recordsByMeeting = new Map();
  let ownerId = "";

  function reportStorageError(operation, error) {
    onStorageError?.({ operation, error });
  }

  function storageKey(meetingId) {
    if (!storage || !ownerId || !meetingId) return "";
    return `${namespace}:${normalizeStorePart(ownerId)}:${normalizeStorePart(meetingId)}`;
  }

  function readPersisted(meetingId) {
    const key = storageKey(meetingId);
    if (!key) return [];
    try {
      const payload = JSON.parse(storage.getItem(key) || "null");
      const records = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.records) ? payload.records : [];
      return copyTranscriptRecords(records);
    } catch (error) {
      reportStorageError("read", error);
      return [];
    }
  }

  function persist(meetingId, records) {
    const key = storageKey(meetingId);
    if (!key) return;
    try {
      storage.setItem(key, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        records: copyTranscriptRecords(records)
      }));
    } catch (error) {
      reportStorageError("write", error);
    }
  }

  return {
    setOwner(nextOwnerId) {
      const normalizedOwner = String(nextOwnerId || "").trim().toLowerCase();
      if (normalizedOwner === ownerId) return;
      ownerId = normalizedOwner;
      recordsByMeeting.clear();
    },
    read(meetingId) {
      if (!meetingId) return [];
      const id = String(meetingId);
      if (!recordsByMeeting.has(id)) recordsByMeeting.set(id, readPersisted(id));
      return copyTranscriptRecords(recordsByMeeting.get(id));
    },
    write(meetingId, records, { persist: shouldPersist = true } = {}) {
      if (!meetingId) return [];
      const id = String(meetingId);
      const copy = copyTranscriptRecords(records);
      recordsByMeeting.set(id, copy);
      if (shouldPersist) persist(id, copy);
      return copyTranscriptRecords(copy);
    },
    remove(meetingId) {
      if (!meetingId) return;
      const id = String(meetingId);
      recordsByMeeting.delete(id);
      const key = storageKey(id);
      if (!key) return;
      try {
        storage.removeItem(key);
      } catch (error) {
        reportStorageError("remove", error);
      }
    },
    clearMemory() {
      recordsByMeeting.clear();
    }
  };
}
