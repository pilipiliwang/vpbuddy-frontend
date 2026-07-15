# VPBuddy 正式前端与当前 FastAPI 契约审计

审计日期：2026-07-13

## 1. 审计范围与判定口径

### 1.1 事实源

- 正式前端工作树：`C:\Users\67303\Documents\Codex\2026-07-02\new-chat\work\formal-frontend-contract-audit`
  - 前端基线 commit：`bbb679dc2818d20ec440f018534ca34e8aa1ec36`
  - 实际调用：`src/api/client.js`、`src/main.js`
  - 目标 DTO：`src/api/contracts.ts`
  - 既有文档：`API.md`、`API_REQUIREMENTS.md`、`API_BACKEND_ALIGNMENT.md`
- 后端快照：`C:\Users\67303\Documents\Codex\2026-07-02\new-chat\work\backend-remote-main`
  - 该目录不含 Git 元数据，无法记录后端 commit；本报告以审计时目录内容为准。
  - 路由事实源：`src/vpbuddy/server/fastapi_app.py`
  - DTO/存储事实源：`server/api_utils.py`、`server/auth.py`、`server/ai_settings.py`、`server/material_storage.py`、`kb_api.py`、`rag_backend.py`、`realtime_server.py`、`server/bailian_asr.py`、`collab.py`
  - 后端文档：`docs/api-reference.md`
  - 测试：`src/tests/test_auth.py`、`test_ws_realtime_asr.py`、`test_v021_3_regression.py`、`src/tests/apitest/*` 及相关 E2E 测试

冲突时按“实际 FastAPI 路由/实现 > 测试断言 > `docs/api-reference.md` > 前端旧文档”判定。

### 1.2 状态定义

- **可直接对接**：该接口自身的方法、路径、请求和前端已消费的主响应结构一致。仍以完成下述统一鉴权为前提。
- **需适配**：后端能力已存在，但正式前端尚未调用，或路径、鉴权、字段、超时、流协议、业务语义不一致。
- **缺失**：当前 FastAPI 没有对应能力。只有这类项目给出新增接口建议。

## 2. 总结论

当前不是“改 Base URL 即可对接”。首要阻断是正式前端没有建立任何后端认证会话：

- `client.js` 支持通过 `getToken()` 注入 `Authorization: Bearer <token>`，但 `main.js` 创建 API 客户端时没有传 `getToken`。
- 登录按钮只把 `state.view` 从 `login` 切到 `workspace`，没有调用 `api.login()`、保存 token 或调用 `api.me()`。
- 登录 UI 是“手机号 + 验证码 + 邀请码”，后端真实登录是“email + password”。
- 除 `/healthz`、`POST /api/auth/register`、`POST /api/auth/login` 外，本文涉及的 HTTP 接口都要求 Bearer token；当前正式前端请求会得到 `401`，随后多数页面回退到演示数据。

因此，下表的“可直接对接”表示**完成统一 token 接入后，该接口不再需要路径或 DTO 适配**。

| 域 | 总体判定 | 关键结论 |
|---|---|---|
| 认证 | 需适配；SSO/重置缺失 | 后端 email/password + JWT 已有，正式前端没有真实登录和 token 生命周期 |
| 会议 | 部分可直接对接，部分需适配 | 列表、创建、详情可用；结束会议未调用，停止录音路径写错，状态缺少 closed 表达 |
| 材料 | 核心 CRUD 部分可直接对接；扩展能力缺失 | 列表/上传/详情已存在；前端未接删除和下载，版本/可调用/投屏状态等没有后端路由 |
| 个人知识库 | 需适配 | 上传漏传必填 `meeting_id`，列表读错 `docs`，搜索/范围/可调用未接；后端 `meeting_id`/`scope` 当前不参与过滤 |
| 实时 ASR/WS/SSE | 需适配，正式前端采集链路缺失 | 后端 WS 可收 PCM 并回转写；前端无音频采集/WS，原生 EventSource 又无法带 Bearer header |
| Chat/协同问答/解释材料 | Chat、协同需适配；结构化解释材料缺失 | Chat 路径正确但响应是嵌套对象；协同路由已有但前端未接；解释材料仍是静态演示数据 |
| 交付物/下载 | 列表可直接对接，详情/下载需适配，聚合导出缺失 | 六类 docs 已有且有单文件下载；正式前端未读取正文或下载真实文件 |
| AI 设置 | 需适配 | PUT 路径和核心字段可用；GET 未接，test 忽略请求体且前端会把 `connected:false` 当成功 |

## 3. 全局 HTTP 约定

| 项目 | 后端真实契约 | 正式前端现状 | 判定 |
|---|---|---|---|
| Base URL | 当前部署文档示例为 `http://47.100.182.3:28765` | 默认值相同，并支持 `vpbuddy.apiBaseUrl` 本地覆盖 | 可直接对接 |
| HTTP 鉴权 | `Authorization: Bearer <JWT>`；JWT payload 含 `sub/email/iat/exp`，有效期 72h | `request()` 能加 header，但 `main.js` 未提供 token | 需适配 |
| WebSocket 鉴权 | URL query：`?token=<JWT>` | 没有 WS 客户端 | 需适配 |
| 成功 JSON | 各路由直接返回业务对象，没有统一 `{data}` 包装 | `request()` 可直接解析 | 可直接对接 |
| 错误 JSON | FastAPI `HTTPException` 统一为 `{"error": string, "status": number}`；部分业务 helper 会返回含 `status` 的对象 | `request()` 优先读取 `error`/`message` | 可直接对接；需注意 helper 未转 HTTP status 的个别路由 |
| 默认超时 | 后端 Chat/材料/AI test 可能执行同步 LLM 调用，测试使用 60-120s | 普通请求默认 3.2s，材料 15s，Chat 附件 30s | 需适配 |

## 4. 认证

| 能力 | 后端真实方法与路径 | 请求 | 响应 | 正式前端现状 | 判定 |
|---|---|---|---|---|---|
| 注册 | `POST /api/auth/register` | JSON：`email`, `password`；email 转小写，密码至少 6 位 | `user_id`, `email`, `token` | `client.js` 没有 register 方法，UI 也无邮箱注册 | 需适配（前端） |
| 登录 | `POST /api/auth/login` | JSON：`email`, `password` | `user_id`, `email`, `token` | `client.js.login()` 路径正确；`main.js` 从未调用，UI 字段也不匹配 | 需适配 |
| 当前用户 | `GET /api/auth/me` | Bearer token | `user_id`, `email`, `created_at` | `client.js.me()` 已定义但未调用；页面用户仍是静态 `VP_User/企业版/VP` | 需适配 |
| 企业 SSO | 无 | 前端声明 `POST /api/auth/sso/start`、`POST /api/auth/sso/complete` | 无 | 仅 client stub，UI 当前未调用 | 缺失 |
| 密码重置 | 无 | 前端声明 `POST /api/auth/password-reset` | 无 | 仅 client stub，UI 当前未调用 | 缺失 |

后端 login 不返回旧前端契约所写的 `accessToken/refreshToken/expiresAt/user`，应直接以后端 `token/user_id/email` 为准，不需要另造一层旧 DTO。正式前端至少需要保存 `token`、向 `createVpbuddyApi` 注入 `getToken`、启动时调用 `/api/auth/me`，并在 401 时清理会话。

**仅针对缺失能力的建议**：若产品确认保留 SSO/密码重置，再新增 `/api/auth/sso/start`、`/api/auth/sso/complete`、`/api/auth/password-reset`；当前核心邮箱密码登录不依赖这些接口。

## 5. 会议

| 能力 | 后端真实方法与路径 | 请求 | 响应关键字段 | 正式前端现状 | 判定 |
|---|---|---|---|---|---|
| 会议列表 | `GET /api/meetings` | Bearer | `{meetings, count}`；item：`meeting_id, owner_id, platform, audio_source, project_name, started_at, last_updated, item_count, cleaned_text_length` | `listMeetings()` 路径正确，normalizer 能读 `meeting_id/project_name/started_at` | 可直接对接 |
| 创建/复用会议 | `POST /api/meetings/stream_start` | query：`meeting_id?`, `audio_source?`；query 或 JSON：`project_name?`。JSON 中的 `meeting_id/audio_source/title` 不生效 | `meeting_id, audio_source, reused, message` | `createMeeting()` 走正确路径；`main.js` 发送 `project_name`，可创建，并在本地补 title/desc | 可直接对接 |
| 校验 ID | `GET /api/meetings/check_id?id=...` | ID 需 3-48 字符，仅 `[A-Za-z0-9_-]` | `id, valid, exists` | 无 client 方法/调用 | 需适配（前端） |
| 会议详情 | `GET /api/meetings/{meeting_id}` | Bearer + owner | `id, state, cleaned_text_length, docs, transcript_segments, materials` | `getMeeting()` 路径正确；现有 normalizer 能读 state/docs/materials/segments | 可直接对接 |
| 状态/转写快照 | `GET /api/meetings/{meeting_id}/state` | Bearer + owner | `{state, transcript_segments, metrics, processed_chunks, materials}`；`state` 为摘要 DTO | `listTranscriptSegments()` 实际调用该接口并能读 `transcript_segments` | 接口形状可直接对接；实时数据来源需适配，见第 8 节 |
| 改标题 | `PATCH /api/meetings/{meeting_id}` | JSON：`project_name` | `meeting_id, project_name` | 无 client 方法，页面重命名没有后端行为 | 需适配（前端） |
| 结束会议 | `POST /api/meetings/{meeting_id}/close` | Bearer + owner | `meeting_id, status:"closed", details`；同时触发 `meeting-complete` 和最终文档任务 | `archiveMeeting()` 路径正确但从未调用；“结束会议”仅跳转总结页 | 需适配（前端） |
| 删除会议 | `DELETE /api/meetings/{meeting_id}` | Bearer + owner | `{meeting_id, deleted:{state,chat,materials,docs,stream_meta}}` | 无 client 方法/UI 调用 | 需适配（前端） |
| 录音别名 | `POST /meetings/{meeting_id}/recording/start`、`POST /meetings/{meeting_id}/recording/stop` | Bearer + owner | `{status, started_at/ended_at, detail}` | `client.js.stopRecording()` 错写为不存在的 `/api/meetings/{id}/stream_stop`；main 未调用 start/stop | 需适配 |

补充事实：

- `GET /meetings` 也是后端已有别名，但正式前端已经使用主路径 `GET /api/meetings`，不应再改回旧文档路径。
- 列表和详情没有持久化的 `closed/archived` 状态字段；前端会把缺失状态默认显示为“进行中”。结束后刷新仍可能显示进行中，这是后端状态模型缺口。
- `GET /api/meetings/{id}/aggregate` 已存在，返回 `state/docs/collab/experiences`，但正式前端当前没有使用，且现有 `/api/meetings/{id}` 已足够支撑详情首屏。

**仅针对缺失能力的建议**：若需要刷新后仍显示会议已结束，应在现有会议 state/list/detail 中增加并持久化 `status`/`closed_at`，不需要新增另一套会议路径。

## 6. 会议材料

| 能力 | 后端真实方法与路径 | 请求 | 响应关键字段 | 正式前端现状 | 判定 |
|---|---|---|---|---|---|
| 列表 | `GET /api/meetings/{meeting_id}/materials` | Bearer + owner | `{meeting_id, materials, count}` | 路径正确；normalizer 能读当前字段 | 可直接对接 |
| 上传 | `POST /api/meetings/{meeting_id}/materials` | multipart 单文件字段 `file`；实现只限制总大小 100MB，未实际执行扩展名白名单 | flat Material：`id, meeting_id, filename, content_type, size, created_at, status` | `uploadMaterial()` 字段和路径正确，main 已调用 | 可直接对接；15s 前端超时需放宽 |
| 详情 | `GET /api/materials/{material_id}` | Bearer；有 meeting 时校验 owner | 同一 Material DTO | `getMaterial()` 已定义但 main 未调用 | 需适配（前端） |
| 删除 | `DELETE /api/materials/{material_id}` | Bearer + owner | `deleted, material_id` | 无 client 方法/UI 调用 | 需适配（前端） |
| 原文件 | `GET /api/materials/{material_id}/file` | Bearer + owner | 二进制，`Content-Disposition: attachment` | 无 client 方法；页面“下载”仍是 toast | 需适配（前端 blob 下载） |
| 版本 | 无；前端声明 `/materials/{id}/versions` | - | - | client stub 存在 | 缺失 |
| 本次会议可见/可调用 | 无；前端调用 `/materials/{id}/visibility`（且缺 `/api`） | - | - | UI 状态仅本地 | 缺失 |
| 投屏状态/打开事件 | 无 `/meetings/{id}/presentation-state`、`/stage/open` | - | - | 双击材料会调用不存在的 `openInStage()`，失败后仅本地投屏 | 缺失 |
| 批注/截图留痕 | 无 annotations/stage snapshots 路由 | - | - | 批注保存在内存；截图改走 Chat 附件 | 缺失 |

材料上传返回的是 flat DTO，不是测试兼容代码曾容忍的 `{material:{...}}` 包装。正式前端 normalizer 已兼容 flat DTO。

**仅针对缺失能力的建议**：只有产品要求跨端恢复或会后留痕时，再补 `/api/materials/{id}/versions`、`PATCH /api/materials/{id}/visibility`、`GET/PATCH /api/meetings/{id}/presentation-state`、`POST /api/meetings/{id}/stage/open`、`POST /api/materials/{id}/annotations`、`POST /api/meetings/{id}/stage/snapshots`。纯前端画笔、缩放、选择态无需后端化。

## 7. 个人知识库

### 7.1 后端真实契约

| 能力 | 后端真实方法与路径 | 请求 | 响应关键字段 |
|---|---|---|---|
| 列表 | `GET /api/kb/list?meeting_id=...` | Bearer；`meeting_id` 可选 | `{total, meeting_id, docs}`；doc：`{id, document, distance, metadata}` |
| 搜索 GET | `GET /api/kb/search?q=...&meeting_id=...` | `q`、可选 `meeting_id` | 非空时同 POST；空 q 仅返回 `{results:[]}` |
| 搜索 POST | `POST /api/kb/search` | JSON：`query`, `top_k?=5`, `meeting_id?`, `scope?="current"` | `{results, count, scope, meeting_id}`；result：`id, document, distance, metadata` |
| 上传 | `POST /api/kb/upload` | multipart：`meeting_id` 必填、`file` 必填、`scope?="personal_kb"`、`labels?=""`、`meeting_callable?="true"` | 新文件：`status, doc_id, meeting_id, filename, chunks, char_count, scope, labels, meeting_callable`；重复文件额外 `duplicate:true`，但不返回 scope 三字段 |
| 删除 | `DELETE /api/kb/{doc_id}` | Bearer | `{status, doc_id}`；归属失败 helper 返回 `{error,status:403}`，当前 FastAPI 包装没有把它提升为 HTTP 403 |
| 原文件 | `GET /api/kb/{doc_id}/file` | Bearer；可解析 meeting 时校验 owner | 二进制 attachment |

经 `/api/kb/upload` 入库的 `metadata` 可包含：`user_id, meeting_id, source, uploaded_at, chunk_index, file_size, file_ext, content_hash, scope, labels, meeting_callable`。Chat 附件入库的旧路径不补后三个产品字段，前端读取时应允许它们缺省。

当前实现按 `user_id` 隔离，但存在两个重要语义差异：

1. `meeting_id` 在 list/search 中只被读取并回显，没有加入 Chroma `where` 条件，因此不会真正缩小到某场会议。
2. `scope` 会在上传时落 metadata、在搜索响应中回显，但搜索和列表都没有按 scope 过滤；`meeting_callable` 也没有更新接口或检索过滤。

### 7.2 正式前端现状

| 项目 | 当前行为 | 判定 |
|---|---|---|
| 列表 | `listKnowledgeDocuments()` 不接参数，main 传入 meeting ID 也会被 JS 忽略；normalizer 只找 `documents/files/items/data`，没有读取后端的 `docs`，也没有展开 `metadata` | 需适配 |
| 上传 | `uploadKnowledgeDocument(file)` 只 append `file`，漏传后端必填 `meeting_id`，当前必定 400 | 需适配 |
| 文件类型 | 前端 picker 允许 ppt/doc/xls/image，却不允许 txt/md；KB 后端只接受 `.txt/.md/.pdf` 且最大 50MB | 需适配 |
| 搜索 | `client.js.searchKnowledge()` 路径/JSON方式正确，但 main 的搜索框只过滤本地数组，没有调用它 | 需适配（前端） |
| scope/标签 | UI 没有读取或提交后端 metadata；旧文档关于“后端无 scope”的结论已经过期 | 需适配（前端）；过滤能力仍缺失 |
| 本次会议可调用 | toggle 只写 `state.knowledgeCallable` 内存 | 后端更新/过滤能力缺失 |
| 下载 | UI 生成本地文本 Blob，不调用后端原文件接口 | 需适配（前端） |
| 删除/详情 | 没有真实调用；后端有删除和原文件，无独立 metadata detail 路由 | 删除需适配；详情缺失 |

**仅针对缺失能力的建议**：在现有 `/api/kb` 命名下补 metadata 详情/更新，例如 `GET/PATCH /api/kb/{doc_id}`，并让现有 list/search 真正按 `meeting_id`、`scope`、`meeting_callable` 过滤。不要另建旧前端文档中的 `/knowledge` 平行体系。

## 8. 实时 ASR、WebSocket 与 SSE

### 8.1 WebSocket ASR

后端真实端点：`WS /api/meetings/{meeting_id}/realtime_asr?token=<JWT>`。

客户端协议：

1. 连接后先发文本 JSON：`{"type":"start","format":"pcm","sample_rate":16000}`。
2. 持续发送 binary：16kHz、mono、16-bit PCM little-endian。
3. 可发 `{"type":"ping"}`，收到 `{"type":"pong"}`。
4. 显式发 `{"type":"stop"}` 才 finalize 会议；网络断开只停止 ASR，并保留会议等待重连。

服务端 WS 消息：

| type | 字段 |
|---|---|
| `asr_status` | `status:"connected"|"closed"` |
| `transcript` | `text, begin_time, end_time, is_sentence_end, is_noise, speaker_id:"UNKNOWN"` |
| `asr_complete` | `sentence_count, full_text` |
| `asr_error` / `error` | `error` |
| `pong` | 仅 `type` |

实现事实：WS `transcript` 只回在 WebSocket 上；完成句会更新 `MeetingState.cleaned_text`，但没有写入 `stream_meta.transcript_segments`，也没有转发为 SSE `transcript-segment`。此外，WS 当前只校验 token 有效性，没有调用会议 owner 校验。

正式前端没有 `getUserMedia`/`AudioContext`/PCM 编码/WebSocket 代码，`startRecording()`/`stopRecording()` 也没有被 main 调用。因此后端 WS 能力存在，但正式前端实时采集链路整体为**需适配（前端实现缺失）**。

### 8.2 SSE

后端真实端点：`GET /api/meetings/{meeting_id}/events`，要求 Bearer + owner；支持 `Last-Event-ID` header 或 `last_event_id` query。

实际可见事件包括：

- `connected`：`meeting_id, subscribers`
- `heartbeat`：`type, ts`
- `doc-update`：稳定字段为 `kind, status, meeting_id, updated_at`，通常含 `doc_size/is_demo`；不同 producer 仍可能带 `content`
- `demo-new-version`：`version, summary, file_size, file`
- `chat-message`：ChatMessage DTO
- `collab-update`：`action, qid, section/question/answer/asker/answerer, status`
- `meeting-complete`：`meeting_id, status:"user_closed", note`
- `recording-disconnected`：`meeting_id, sentences`

正式前端的三个不匹配：

1. 使用原生 `new EventSource(url)`，无法设置后端要求的 `Authorization` header；`eventsUrl()` 也没有 token query，而后端 SSE 不接受 query token。
2. 监听 `transcript-segment`，但当前 FastAPI WS 链路不会生产该 SSE 事件；实时转写应直接消费 WS `transcript`。
3. 未监听 `doc-update`、`demo-new-version`、`collab-update`、`recording-disconnected`，因此交付物和协同面板不会实时刷新。

判定：**需适配**。已有 SSE 路径以后端 `/api/meetings/{id}/events` 为准；前端应改用可带 Bearer 的 fetch-stream/EventSource polyfill，ASR 转写则消费现有 WS，不需要再建议一套新实时路径。

## 9. Chat、协同问答与解释材料

### 9.1 Chat

| 能力 | 后端真实方法与路径 | 请求 | 响应 | 正式前端现状 | 判定 |
|---|---|---|---|---|---|
| 纯文本 Chat | `POST /api/meetings/{id}/chat` | JSON：`message` 必填、`context?` object；前端多传的 `role` 被忽略 | `{meeting_id, user_message, assistant_message, status, source, error}` | 路径/请求可用；main 把整个 response 交给 `normalizeChatMessage()`，读不到嵌套 `assistant_message.content` | 需适配 |
| 附件 Chat | 同一路径 | multipart：`text?`, `files*`；txt/md/pdf 最大 50MB，图片最大 5MB | 上述字段 + `upload:{status,meeting_id,text,files,kb_doc_ids,image_count}` | `sendChatAttachment()` 字段正确；main 多为一文件一请求 | 需适配（响应/超时） |
| Chat 历史 | `GET /api/meetings/{id}/chat/history` | Bearer + owner | `{meeting_id, messages}` | main 已正确读取 `messages` 并映射 `role/content/created_at` | 可直接对接 |

ChatMessage 的真实字段是 `id, meeting_id, role, content, source, status, created_at`，并可能附加 `context/attachments/error/attachment_count`。纯文本 Chat 的前端默认超时只有 3.2s，而后端集成测试为该调用使用 120s，需显式放宽。

### 9.2 协同问答

| 能力 | 后端真实方法与路径 | 请求 | 响应 | 正式前端现状 | 判定 |
|---|---|---|---|---|---|
| 获取协同记录 | `GET /api/meetings/{id}/collab` | Bearer + owner | `{meeting_id, collab, pending, answered, stats}` | 无 client 方法；连接后 AI 反问面板反而清空 | 需适配（前端） |
| 提问 | `POST /api/meetings/{id}/collab/ask` | query：`section, question, asker?="agent"` | `{ok, qid, status}`，status 为 `added/throttled/duplicate_exact` | 无 client 方法/UI 提交 | 需适配（前端） |
| 回答 | `POST /api/meetings/{id}/collab/answer` | query：`qid, answer, answerer?="VP"` | `{ok, qid, status:"answered"}` | 无 client 方法/UI 提交 | 需适配（前端） |

后端 `docs/api-reference.md` 仍写成不存在的 `/ask_question`、`/answer_question`；实际路由必须以上表的 `/collab/ask`、`/collab/answer` 为准。

### 9.3 客户提问/概念检索/解释材料

现有可复用能力：

- `GET /api/meetings/{id}/state` 的 `state.items` 中 `type:"que"` 可作为轻量 open question 来源。
- `POST /api/kb/search` 可做非结构化概念检索。
- `POST /api/meetings/{id}/chat` 可生成自然语言解释。

但当前 FastAPI 没有客户问题实体、解释草稿/证据绑定/提交状态、发送客户记录等结构化能力。正式前端这些区域全部来自 `aiFollowupQuestions` 和 `explanationFindings` 静态数组；一旦后端连接成功，`shouldUseDemoData()` 会让它们显示为空。

判定：结构化解释材料流程**缺失**。

**仅针对缺失能力的建议**：若产品仍要求“客户问题 -> 证据检索 -> 解释草稿 -> VP 确认/发送”的可追踪流程，可在已有命名空间下新增 `GET /api/meetings/{id}/customer_questions`、`POST /api/meetings/{id}/explanations`、`POST /api/meetings/{id}/customer_messages`。概念检索继续复用 `/api/kb/search`，不要重复建设另一套搜索接口。

## 10. 交付物与下载

| 能力 | 后端真实方法与路径 | 请求 | 响应关键字段 | 正式前端现状 | 判定 |
|---|---|---|---|---|---|
| 六类文档列表 | `GET /api/meetings/{id}/docs` | Bearer + owner | `{meeting_id, docs}`；kind 固定 `req,arch,tasks,api,risk,demo` | `listDeliverables()` 路径正确，kind 映射完整 | 可直接对接 |
| 文档 DTO | 同上/单文档 | `kind` | `meeting_id, kind, label, content, version, doc_size, status, updated_at` | normalizer 使用 label/version/status/time，但不保留 content/doc_size | 列表可用；正文展示需适配 |
| 单文档 | `GET /api/meetings/{id}/docs/{kind}` | Bearer + owner | 同一 DTO；非 demo content 最多 2000 字，demo content 固定空 | client/main 无调用 | 需适配（前端） |
| 文档下载 | `GET /api/meetings/{id}/docs/{kind}/download` | Bearer + owner | attachment；demo 为 `demo.html`，其余 `{kind}.md` | 无 client 方法，按钮只弹 toast/modal | 需适配（前端 blob 下载） |
| Demo 版本 | `GET /api/meetings/{id}/demo/versions` | Bearer；实现未做 owner 校验 | `{meeting_id, versions, count}`；version item：`version,created_at,trigger,summary,file_size,file` | 无 client/main 调用 | 需适配（前端）；后端 owner 校验需补齐 |
| 产品层列表别名 | `GET /meetings/{id}/deliverables` | Bearer + owner | `{deliverables,count}`；item：`id,meetingId,type,name,version,status,updatedAt` | 正式前端没有使用该别名 | 可用但无需改道 |
| 产品层详情别名 | `GET /deliverables/{deliverable_id}` | ID 约定 `del-{meeting_id}-{kind}` | `id,meetingId,type,name,version,content,updatedAt` | `client.js.getDeliverable()` 已定义但 main 未调用；带 `-` 的 meeting_id 会被当前 parser 误拆 | 需适配 |
| 材料原文件 | `GET /api/materials/{id}/file` | Bearer + owner | attachment | 未接 | 需适配（前端） |
| KB 原文件 | `GET /api/kb/{doc_id}/file` | Bearer；按可解析 meeting 校验 owner | attachment | 未接，当前生成本地文本 | 需适配（前端） |
| 聚合 DOCX/PDF/ZIP 导出 | 无 | - | - | UI 声称导出纪要，实际没有请求 | 缺失 |
| 分享链接 | 无 | - | - | 旧 API 文档有需求，当前 UI 没有真实调用 | 缺失 |

文档列表 `content` 只是预览：非 demo 截断到 2000 字，demo 不返回正文。需要真实文件时应使用现有 download 路由；不要把列表预览当完整交付物。

**仅针对缺失能力的建议**：若必须服务端生成聚合文件，再新增 `POST /api/meetings/{id}/archive/export`；若只下载当前六类文件，直接接已有三个 download 路由即可。分享链接只有在明确需要外部访问控制时再新增。

## 11. AI 设置

| 能力 | 后端真实方法与路径 | 请求 | 响应 | 正式前端现状 | 判定 |
|---|---|---|---|---|---|
| 读取 | `GET /api/settings/ai` | Bearer | 未配置：`provider,model,base_url,api_key_configured:false,status:"not_configured"`；已配置：另含 `api_key_masked,updated_at` | `client.js` 没有 GET 方法，页面永远使用硬编码默认值 | 需适配（前端） |
| 保存 | `PUT /api/settings/ai` | JSON：`provider,model,base_url,api_key`，所有缺失字段都会写成空字符串 | `{status:"saved", updated_at}` | 路径和四个核心字段正确；额外 `api_key_env/hermes/preset` 被后端忽略 | 接口可直接对接；需先解决认证和读取 |
| 测试连接 | `POST /api/settings/ai/test` | 请求体被忽略；只测试服务器上已保存的当前用户配置 | 成功/失败都 HTTP 200；`status,connected,model,provider?,elapsed_ms,error?` | main 发送未保存的表单 payload；只要 HTTP 200 就显示“通过”，不检查 `connected`；默认 3.2s 也短于真实 LLM 调用 | 需适配 |

另一个易丢配置的行为：PUT 是全量覆盖。正式前端没有先 GET；API key 输入框为空时保存会清空后端已有 key。前端应先映射 GET 结果，并明确“保留现有 key”与“清空 key”的交互语义。

## 12. 后端文档与实现不一致

`docs/api-reference.md` 整体已比旧前端对齐文档新，但以下项目不能按文档直接实现：

1. 协同问答文档写 `/ask_question`、`/answer_question`，实际为 `/collab/ask`、`/collab/answer`。
2. 文档把 `transcript/asr_status/asr_complete/asr_error` 列为 SSE 事件；实际它们是 ASR WebSocket 消息，当前 SSE 没有实时转写 producer。
3. 文档称 KB list/search 可按 `meeting_id`、scope 使用；实现仅按 `user_id` 过滤，meeting/scope 目前只是 metadata/回显。
4. 文档称 `doc-update` 不再带 `content`，但 batch docs/helper producer 仍可能带；前端只能依赖稳定元字段并按需 GET 文档。
5. 文档列出材料支持扩展名集合，实际材料上传路由没有调用该白名单，只检查 multipart 和 100MB 大小。
6. 文档称会议单资源均按 owner 隔离，但 WS 只校验 token，demo versions 也没有 owner guard。

旧 `API_BACKEND_ALIGNMENT.md` 基于 2026-07-03 的旧 HTTP 服务，关于“认证、材料实体、下载、AI 设置、KB 文档明细、scope 均缺失”的结论已经失效，不应继续作为当前接入依据。

## 13. 测试证据与覆盖边界

当前测试能支持的结论：

- `test_auth.py` 覆盖注册、登录、JWT、bcrypt 和 72h token 基础行为。
- `test_ws_realtime_asr.py` 覆盖 token、start handshake、binary frame、ping/pong、stop、断连和并发 WS。
- `test_v021_3_regression.py`、`apitest/test_security_fixes.py` 覆盖多数 HTTP bridge 的 401/403 owner 边界。
- `apitest/test_materials.py` 覆盖材料上传/详情/删除生命周期。
- `apitest/test_kb_params.py` 覆盖上传时 scope/labels/meeting_callable；没有证明 list/search 真正按这些字段过滤。
- `apitest/test_deliverables.py` 覆盖六 kind 和字符串 version。
- `apitest/test_downloads.py` 覆盖下载端点的 401/403/404。
- `apitest/test_ai_settings.py` 覆盖 GET/PUT、脱敏、全量覆盖和 test 响应结构。
- `apitest/test_service_regression.py` 的 Chat 调用使用 120s timeout，反向证明正式前端 3.2s 默认值不适合该接口。

覆盖边界：

- `src/tests/apitest` 默认需要 `RUN_E2E=1` 才运行，且默认指向远程 GPU 服务；本次只审计快照代码和测试，不把测试文件存在等同于当前远程部署已通过。
- 正式前端 `package.json` 没有 test 脚本，也没有覆盖真实 token、EventSource Bearer、WS 音频、KB DTO normalizer、Chat 嵌套响应或 blob 下载的集成测试。
- 当前测试没有锁住 WS owner 校验、KB meeting/scope 过滤、KB DELETE 的真实 HTTP 403、demo versions owner 校验。

## 14. 接入顺序

1. **P0 认证底座**：用 `/api/auth/login` 获取 `token`，持久化并注入 `getToken`，启动时调用 `/api/auth/me`；在这之前不要把任何业务接口的 mock fallback 当成后端不可用。
2. **P0 实时链路**：前端实现 PCM 音频采集和 `/api/meetings/{id}/realtime_asr?token=...`；SSE 改为可带 Bearer 的实现，转写直接消费 WS `transcript`。
3. **P0 知识库**：上传补 `meeting_id/scope/labels/meeting_callable`；列表读取 `docs[].metadata`；搜索框接 `/api/kb/search`。
4. **P1 Chat**：读取 `response.assistant_message`，把纯文本 Chat 超时提高到与 LLM 调用相符的范围。
5. **P1 会议结束/刷新**：结束按钮调用 `/api/meetings/{id}/close`；停止录音使用后端已有 `/meetings/{id}/recording/stop`；补持久化会议状态。
6. **P1 交付物/下载**：列表继续用 `/api/meetings/{id}/docs`，正文/文件用现有单文档和 download 路由，以带 Bearer 的 blob 请求下载。
7. **P1 AI 设置**：先接 GET，再 PUT；test 检查 `connected`，加长 timeout，并明确测试的是已保存配置。
8. **P2 产品扩展**：只有确认需要结构化解释材料、材料版本/留痕、聚合导出或分享时，才新增第 6、9、10 节列出的缺失接口。

## 15. 正式前端对接结果（2026-07-13）

本节记录完成对接后的状态；前文“正式前端现状”保留为改造前基线和问题证据。

### 15.1 已按后端现有接口完成

- 邮箱/密码注册、登录、JWT 持久化、`/api/auth/me` 会话恢复与 401 清理。
- 会议列表、创建、详情、状态、结束和删除；会议标题使用后端 `project_name`。
- 会议材料列表、上传、原文件下载；图片和 PDF 可在原投屏画布中读取真实文件预览。
- Chat 文本/附件、历史记录和嵌套 `assistant_message` 响应。
- 协同问答列表与 SSE `collab-update` 刷新。
- 六类交付物列表、正文预览、真实文件下载和 Demo 版本客户端方法。
- 个人知识库列表、搜索、上传、删除、原文件下载；列表/搜索按当前用户跨会议读取。
- AI 设置 GET/PUT/test；只有 `connected:true` 才显示测试成功。
- Bearer fetch-stream SSE、`Last-Event-ID` 重连、实时 ASR WebSocket、16 kHz mono PCM16 采集协议。
- 所有后端负责的数据集合为空启动；网络或业务失败只显示错误，不创建本地会议、静态投屏、示例转写或假交付物。

画笔、文字、矩形、橡皮、缩放、全屏和本次页面批注属于实时会议本地 UI 操作，不要求后端参与。只有产品要求跨客户端恢复或会后留痕时，才需要批注持久化接口。

### 15.2 仍需后端补充或修正

1. **会议结束状态持久化**：`POST /api/meetings/{id}/close` 成功，但 `GET /api/meetings` 和详情没有稳定的 `status/closed_at`；刷新后前端只能再次显示进行中。
2. **个人知识库独立上传**：产品语义是用户个人知识库跨会议可用，但 `POST /api/kb/upload` 强制要求 `meeting_id`，原文件下载又会按该会议校验 owner。需要用户级文件归属，不应强迫先创建会议。
3. **知识库元数据更新与过滤**：缺少 `GET/PATCH /api/kb/{doc_id}`，`meeting_callable`、标签、scope 无法持久更新；list/search 也未真正按 meeting/scope/callable 过滤。
4. **说话人区分**：实时 ASR 消息固定 `speaker_id:"UNKNOWN"`，且完成句未写入持久化 `transcript_segments`。前端已分别展示说话人、时间和内容，但无法凭空生成真实说话人。
5. **解释材料流程**：缺少客户提问实体、概念/证据绑定、解释草稿、确认/提交/发送客户状态接口。现有 Chat 与 KB 搜索只能生成非结构化文本，不能替代可追踪流程。
6. **结构化会后总结**：六类 docs 可用，但会议结论、参会人员、待办、引用关系和会议事件时间线没有独立结构化响应。
7. **Office 投屏预览**：原文件下载可用，图片/PDF 可直接预览；PPTX/DOCX/XLSX 缺少页图/缩略图转换接口。
8. **聚合导出与分享**：单交付物下载已接通；“导出纪要”和只读分享链接仍没有服务端接口。
9. **资源 owner 校验**：实时 ASR WebSocket 和 Demo versions 仍需补会议 owner 校验。
10. **传输安全**：当前远端地址为明文 HTTP，邮箱密码、JWT 和 AI Key 应部署在 HTTPS/WSS 后再用于正式数据。

### 15.3 验证记录

- `node --test tests/*.test.mjs`：39/39 通过。
- UI 实操通过：真实邮箱注册/登录、刷新恢复会话、创建会议、真实空状态、AI 设置读取与失败判定、结束会议、六类交付物返回、会议删除。
- 自动化浏览器无法代替用户确认系统麦克风授权，因此 UI 以 15 秒超时回到“重试录制”；PCM/WS 协议由独立契约测试覆盖，客户端人工测试需在授权麦克风后复测真实声音。
- 自动化浏览器不支持向原生文件选择控件注入本地文件；multipart 字段、Bearer、进度状态和成功后刷新逻辑已由代码与契约测试覆盖，客户端人工测试需各选择一个会议材料和一个 `.txt/.md/.pdf` 知识文档复测。
