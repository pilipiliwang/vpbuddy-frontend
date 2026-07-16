import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPersonalKnowledgeDocuments,
  isPersonalKnowledgeDocument
} from "../src/utils/knowledge.js";

test("personal knowledge documents remain visible", () => {
  const docs = [
    { id: "kb-1", name: "产品规范.pdf", metadata: { scope: "personal_kb", source: "upload:产品规范.pdf" } },
    { id: "kb-2", name: "行业报告.md", metadata: { resource_type: "knowledge_document" } }
  ];

  assert.deepEqual(filterPersonalKnowledgeDocuments(docs), docs);
});

test("meeting material scopes and origins stay out of the knowledge list", () => {
  const meetingDocs = [
    { id: "m-1", name: "会议附件.pdf", metadata: { scope: "meeting_only" } },
    { id: "m-2", name: "客户截图.png", metadata: { resource_type: "meeting_material" } },
    { id: "m-3", name: "需求讨论.docx", metadata: { source: "chat-upload:需求讨论.docx" } },
    { id: "m-4", name: "投屏截图.png", origin: "material-upload" },
    { id: "m-5", name: "截图.png", metadata: { ingest_source: "vision-analysis" } }
  ];

  assert.equal(meetingDocs.every((doc) => !isPersonalKnowledgeDocument(doc)), true);
  assert.deepEqual(filterPersonalKnowledgeDocuments(meetingDocs), []);
});

test("legacy generated vision descriptions are hidden until backend scopes are deployed", () => {
  const docs = [
    { id: "legacy-1", metadata: { scope: "personal_kb", source: "upload:vision_desc_UI01.png.txt" } },
    { id: "legacy-2", name: "vision-desc-投屏截图.png.txt" },
    { id: "kb-1", name: "视觉规范.txt", metadata: { scope: "personal_kb" } }
  ];

  assert.deepEqual(filterPersonalKnowledgeDocuments(docs).map((doc) => doc.id), ["kb-1"]);
});
