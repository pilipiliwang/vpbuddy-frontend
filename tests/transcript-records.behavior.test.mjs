import assert from "node:assert/strict";
import test from "node:test";

import {
  createTranscriptRecordStore,
  reconcileTranscriptRecords,
  transcriptSnapshotCovers
} from "../src/utils/transcript.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test("a stale non-empty snapshot cannot erase a newer realtime final segment", () => {
  const current = [
    { time: "00:00:00", text: "已持久化的旧记录" },
    { time: "00:00:12", text: "刚收到的实时终句", source: "realtime", live: false }
  ];
  const staleSnapshot = [{ time: "00:00:00", text: "已持久化的旧记录" }];

  assert.deepEqual(reconcileTranscriptRecords(current, staleSnapshot), current);
});

test("a concurrent old snapshot and a new WS final segment are merged", () => {
  const realtimeFinal = { time: "00:00:12", text: "刚收到的实时终句", source: "realtime", live: false };
  const current = [realtimeFinal];
  const oldSnapshot = [{ time: "00:00:00", text: "更早的后端记录" }];

  assert.deepEqual(reconcileTranscriptRecords(current, oldSnapshot), [oldSnapshot[0], realtimeFinal]);
});

test("empty backend data preserves only records already received in this page", () => {
  const current = [{ text: "当前页面收到的真实转录", source: "realtime" }];
  const emptySnapshot = [];

  assert.strictEqual(reconcileTranscriptRecords(current, emptySnapshot), current);
  assert.strictEqual(reconcileTranscriptRecords([], emptySnapshot), emptySnapshot);
});

test("a complete persisted snapshot replaces covered realtime records", () => {
  const current = [
    { text: "第一句", source: "realtime" },
    { text: "第二句", source: "realtime" }
  ];
  const persisted = [{ text: "第一句 第二句 第三句" }];

  assert.equal(transcriptSnapshotCovers(persisted, current), true);
  assert.strictEqual(reconcileTranscriptRecords(current, persisted), persisted);
});

test("an unrelated backend correction remains authoritative without realtime records", () => {
  const current = [{ text: "旧的后端文本" }];
  const corrected = [{ text: "后端校正后的文本" }];

  assert.strictEqual(reconcileTranscriptRecords(current, corrected), corrected);
});

test("same-page meeting re-entry restores real records without mixing meetings", () => {
  const store = createTranscriptRecordStore();
  store.write("meeting-a", [
    { time: "00:00:03", text: "会议 A 的实时终句", source: "realtime", live: false }
  ]);
  store.write("meeting-b", [
    { time: "00:00:08", text: "会议 B 的后端记录" }
  ]);

  assert.deepEqual(store.read("meeting-a").map((item) => item.text), ["会议 A 的实时终句"]);
  assert.deepEqual(store.read("meeting-b").map((item) => item.text), ["会议 B 的后端记录"]);
});

test("store returns copies so another meeting view cannot mutate cached history", () => {
  const store = createTranscriptRecordStore();
  store.write("meeting-a", [{ text: "真实转录" }]);

  const visible = store.read("meeting-a");
  visible[0].text = "被其他视图改写";
  visible.push({ text: "额外记录" });

  assert.deepEqual(store.read("meeting-a"), [{ text: "真实转录" }]);
});

test("logout clears memory while the same account can restore its local records", () => {
  const storage = createMemoryStorage();
  const store = createTranscriptRecordStore({ storage });
  store.setOwner("owner@example.com");
  store.write("meeting-a", [{ text: "账号 A 的真实转录", source: "realtime" }]);

  store.setOwner("");
  assert.deepEqual(store.read("meeting-a"), []);

  store.setOwner("OWNER@example.com");
  assert.deepEqual(store.read("meeting-a"), [{ text: "账号 A 的真实转录", source: "realtime" }]);
});

test("a browser refresh restores final transcript records from user-scoped local storage", () => {
  const storage = createMemoryStorage();
  const beforeRefresh = createTranscriptRecordStore({ storage });
  beforeRefresh.setOwner("owner@example.com");
  beforeRefresh.write("meeting-a", [{ text: "刷新前实时记录", source: "realtime" }]);

  const afterRefresh = createTranscriptRecordStore({ storage });
  afterRefresh.setOwner("owner@example.com");
  assert.deepEqual(afterRefresh.read("meeting-a"), [{ text: "刷新前实时记录", source: "realtime" }]);
});

test("local transcripts are isolated by account and removed with the meeting", () => {
  const storage = createMemoryStorage();
  const ownerA = createTranscriptRecordStore({ storage });
  ownerA.setOwner("a@example.com");
  ownerA.write("meeting-1", [{ text: "账号 A 的会议" }]);

  const ownerB = createTranscriptRecordStore({ storage });
  ownerB.setOwner("b@example.com");
  assert.deepEqual(ownerB.read("meeting-1"), []);

  ownerA.remove("meeting-1");
  const restoredA = createTranscriptRecordStore({ storage });
  restoredA.setOwner("a@example.com");
  assert.deepEqual(restoredA.read("meeting-1"), []);
});

test("interim transcript updates stay in memory until a final update is persisted", () => {
  const storage = createMemoryStorage();
  const store = createTranscriptRecordStore({ storage });
  store.setOwner("owner@example.com");
  store.write("meeting-a", [{ text: "中间识别", live: true }], { persist: false });

  const beforeFinal = createTranscriptRecordStore({ storage });
  beforeFinal.setOwner("owner@example.com");
  assert.deepEqual(beforeFinal.read("meeting-a"), []);

  store.write("meeting-a", [{ text: "最终识别", live: false, source: "realtime" }]);
  const afterFinal = createTranscriptRecordStore({ storage });
  afterFinal.setOwner("owner@example.com");
  assert.deepEqual(afterFinal.read("meeting-a"), [{ text: "最终识别", live: false, source: "realtime" }]);
});
