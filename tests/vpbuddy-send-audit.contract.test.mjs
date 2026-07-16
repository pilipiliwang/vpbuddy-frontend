import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");
const stylesSource = await readFile(path.join(repoRoot, "src", "styles.css"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("text sends render the outgoing message before awaiting the real backend", () => {
  const sendSource = sourceBetween(mainSource, "async function sendVpbuddyChatMessage", "function getSettingsPayload");
  const optimisticWrite = sendSource.indexOf("addVpbuddyMessage(optimisticMessage)");
  const immediateRender = sendSource.indexOf("render();", optimisticWrite);
  const backendAwait = sendSource.indexOf("await api.sendChat(meetingId, content)");

  assert.ok(optimisticWrite >= 0, "the outgoing user message must be inserted locally");
  assert.ok(immediateRender > optimisticWrite, "the optimistic user message must trigger an immediate render");
  assert.ok(backendAwait > immediateRender, "the immediate render must happen before waiting for the backend");
  assert.match(sendSource, /status:\s*"sending"/, "the optimistic message must expose a sending state");
  assert.match(sendSource, /pendingVpbuddyChatRequests\.set\(meetingId, request\)/, "duplicate sends must be locked per meeting");
  assert.match(sendSource, /isVpbuddyChatBusy\(meetingId\)/, "the busy guard must be scoped to the selected meeting");
});

test("chat completion uses only backend messages and stale callbacks cannot cross meetings", () => {
  const sendSource = sourceBetween(mainSource, "async function sendVpbuddyChatMessage", "function getSettingsPayload");

  assert.match(sendSource, /const\s+meetingId\s*=\s*state\.selectedMeetingId/, "the request must capture the meeting before awaiting");
  assert.match(sendSource, /api\.sendChat\(meetingId, content\)/, "the POST must use the captured meeting id");
  assert.doesNotMatch(sendSource, /api\.sendChat\(state\.selectedMeetingId/, "an in-flight POST must never retarget to another meeting");
  assert.match(sendSource, /activeRequest\?\.id\s*!==\s*requestId/, "late or superseded requests must be ignored");
  assert.match(sendSource, /meetingId\s*!==\s*state\.selectedMeetingId/, "a response must not write into another meeting");
  assert.match(sendSource, /response\?\.user_message\s*\?\s*normalizeChatMessage\(response\.user_message\)/, "the confirmed user record must come from the backend response");
  assert.match(sendSource, /response\?\.assistant_message\s*\?\s*normalizeChatMessage\(response\.assistant_message\)/, "the VPBuddy answer must come from the backend response");
  assert.doesNotMatch(sendSource, /normalizeChatMessage\(response\?\.user_message\s*\|\|\s*\{/, "the client must not fabricate a backend user record");
  assert.doesNotMatch(sendSource, /pushVpbuddyMessage\([^)]*,\s*"answer"\)/, "the client must not fabricate a VPBuddy answer");
});

test("failed sends remain visible, restore the draft, and can be retried", () => {
  const sendSource = sourceBetween(mainSource, "async function sendVpbuddyChatMessage", "function getSettingsPayload");
  const composerSource = sourceBetween(mainSource, "function renderVpbuddyComposer", "function renderAIPanel");
  const clickSource = sourceBetween(mainSource, 'document.addEventListener("click"', 'document.addEventListener("dblclick"');

  assert.match(sendSource, /status:\s*"failed"/, "a failed request must leave an explicit failed message");
  assert.match(sendSource, /if\s*\(!state\.composerText\.trim\(\)\)\s*state\.composerText\s*=\s*content/, "failed text must be recoverable in the input");
  assert.match(composerSource, /data-action="retry-vpbuddy-message"/, "failed messages must expose a retry control");
  assert.match(clickSource, /sendVpbuddyChatMessage\(message\.text,\s*\{\s*optimisticMessageId:\s*message\.id\s*\}\)/, "retry must reuse the failed bubble instead of adding a duplicate");
  assert.match(stylesSource, /\.composer-history \.message-status\.sending[\s\S]{0,500}?\.composer-history \.message-status\.failed/, "sending and failed states must be visibly distinct");
});

test("text and material sending survive presentation/deliverable tab rerenders", () => {
  const stageSource = sourceBetween(mainSource, "function renderMeetingStage", "function renderMeetingLeftPanel");
  const clickSource = sourceBetween(mainSource, 'document.addEventListener("click"', 'document.addEventListener("dblclick"');
  const renderSource = sourceBetween(mainSource, "function render()", "function renderFilePicker");

  const tabCanvas = stageSource.indexOf('state.stageTab === "presentation" ? renderPresentationCanvas() : renderDeliverableCanvas()');
  const composer = stageSource.indexOf("renderVpbuddyComposer()", tabCanvas);
  assert.ok(tabCanvas >= 0 && composer > tabCanvas, "both center tabs must share the same composer below their canvas");
  assert.match(clickSource, /action\s*===\s*"stage-tab"[\s\S]{0,120}?state\.stageTab\s*=\s*target\.dataset\.tab/, "tab switching must use delegated state updates");
  assert.match(clickSource, /action\s*===\s*"send-vpbuddy-message"[\s\S]{0,160}?sendVpbuddyChatMessage/, "text sending must remain delegated after a rerender");
  assert.match(clickSource, /action\s*===\s*"send-vpbuddy-material"[\s\S]{0,220}?fileUploadContext\s*=\s*"vpbuddy-material"/, "material sending must remain delegated after a rerender");
  assert.match(renderSource, /renderFilePicker\(\)/, "every rerender must retain the shared native file picker");
});

test("chat history refreshes retain local sending and failed records", () => {
  const historySource = sourceBetween(mainSource, "function applyChatHistory", "function setApiStatus");
  const detailSource = sourceBetween(mainSource, "async function loadMeetingDetailFromBackend", "async function loadKnowledgeFromBackend");

  assert.match(historySource, /message\.localOnly\s*&&\s*\["sending",\s*"failed"\]\.includes\(message\.status\)/, "a backend history refresh must not erase unresolved local state");
  assert.match(detailSource, /restorePendingVpbuddyMessage\(meetingId\)/, "returning to a meeting while its request is pending must restore the outgoing bubble");
});
