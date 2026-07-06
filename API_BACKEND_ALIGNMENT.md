# VPBuddy 前后端接口对齐检查

检查对象：

- 前端契约：`outputs/vpbuddy-frontend/API_REQUIREMENTS.md`、`src/api/client.js`、`src/api/contracts.ts`
- 后端算法包：`work/vpbuddy-main/vpbuddy-main/src/vpbuddy/ui_server.py`、`kb_api.py`、`realtime_server.py`
- 检查日期：2026-07-03

## 结论

当前后端是“算法/GPU 流式会议服务”，已经覆盖录音流、SSE 实时事件、KB 上传/搜索、VP Chat、协作提问、6 类文档产物读取。

前端契约是“完整产品层 API”，覆盖登录、工作台、材料管理、客户提问解释、交付物版本、知识库多 scope、会后归档、分享和设置。

两者不能直接无缝对接。前端功能点不应删减；集成时需要后端补产品层接口，或增加一层 BFF/Adapter 把现有算法接口包装成前端契约。

本轮补充口径：不是所有 UI 操作都需要后端接口。会中投屏里的画笔轨迹、当前工具、缩放比例、临时框选等可以是前端本地运行态；只有需要多端同步、会后回放、客户留痕、归档证据时，才需要后端接收批注或截图。

## 2026-07-06 前端接入修正

根据后端 issue 反馈，本次前端已不再要求后端补齐“客户提问 / 概念检索 / 解释材料 / 发送客户消息”等产品层重接口。当前实现采用以下收敛口径：

- 工作台会议列表：优先调用 `GET /meetings`，失败时保留本地演示数据。
- 会议详情：优先调用 `GET /meetings/{id}`，并兼容其中的 `state/docs/transcript_segments` 聚合字段。
- 会议记录：优先调用 `GET /meetings/{id}/transcript-segments`，并监听 `GET /api/meetings/{id}/events` 的 `transcript-segment` 事件实时追加。
- VPBuddy 输入框：统一调用 `POST /api/meetings/{id}/chat`，不再要求独立的 customer-question / concept-search / explanation / customer-message 端点。
- Chat 历史：调用 `GET /api/meetings/{id}/chat/history`。
- 交付物：调用 `GET /meetings/{id}/deliverables`，兼容后端 `req/arch/tasks/api/risk/demo/summary` kind 映射。
- 知识库：上传、列表、检索按 `meeting_id` 维度调用 `/api/kb/upload`、`/api/kb/list`、`/api/kb/search`；前端 personal / enterprise / industry 仅保留为 UI 展示维度，不要求后端新增 scope 字段。
- 导出、分享：作为前端行为处理，不要求后端新增导出/分享接口。

实现策略是“真实后端优先 + mock fallback”。后端未启动或某个接口缺失时，页面继续可演示；后端可用时自动切换为真实数据和 SSE 更新。

## 后端实际存在的 HTTP 接口

### 基础与工作台

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/meetings` | 会议列表，返回 `{ meetings, count }` |
| GET | `/api/meetings/check_id?id=` | 校验会议 ID 是否可用 |
| GET | `/api/timeline` | 全局 timeline，来自 MeetingState 累积项 |
| GET | `/api/status` | 控制器、数据目录、docs 目录状态 |

### 录音流与实时事件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/meetings/upload` | 整段音频上传，自动转写并触发 6 docs |
| POST | `/api/meetings/stream_start?meeting_id=&audio_source=` | 创建/复用流式会议 |
| POST | `/api/meetings/{id}/stream_chunk?sync=false` | 上传音频切片 |
| POST | `/api/meetings/{id}/stream_stop` | 停止流式订阅 |
| POST | `/api/meetings/{id}/close` | 结束会议，推送 `meeting-complete` |
| GET | `/api/meetings/{id}/events` | SSE，推送 `transcript-segment`、`state-update`、`doc-update`、`chat-message`、`collab-update` 等 |
| GET | `/api/meetings/{id}/state` | 会议状态、转写片段、指标、已处理 chunk |

### 交付物/文档

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/meetings/{id}/docs` | 返回 6 类文档：`req`、`arch`、`tasks`、`api`、`risk`、`demo` |
| GET | `/api/meetings/{id}/docs/{kind}` | 返回单个文档正文 |
| GET | `/api/meetings/{id}/demo/versions` | 返回 demo 版本列表 |

### VP Chat 与协作提问

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/meetings/{id}/chat` | VP Chat，支持 JSON 或 multipart 上传 |
| GET | `/api/meetings/{id}/chat/history` | VP Chat 历史 |
| GET | `/api/meetings/{id}/collab` | 协作提问文档、待答/已答列表、统计 |
| POST | `/api/meetings/{id}/ask_question?section=&question=&asker=` | 写入协作问题 |
| POST | `/api/meetings/{id}/answer_question?qid=&answer=&answerer=` | 回答协作问题 |

### KB

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/kb/upload` | multipart：`meeting_id` + `file`，上传到 KB |
| GET/POST | `/api/kb/search` | KB 检索，支持 `q/top_k/meeting_id` 或 JSON body |
| GET | `/api/kb/list?meeting_id=` | KB 统计/列表占位 |
| DELETE | `/api/kb/{doc_id}` | 代码里有 handler，但 `ui_server.py` 未实现 `do_DELETE()`，真实 DELETE 会失败 |

## 与前端契约的主要不匹配

### 1. Auth 与用户体系：后端缺失

前端需要：

- `POST /auth/login`
- `POST /auth/sso/start`
- `POST /auth/sso/complete`
- `POST /auth/password-reset`
- `GET /auth/me`

后端当前没有鉴权、用户、组织、角色、权限接口。

### 2. 客户端设备与设置：HTTP 后端缺失

前端需要：

- `GET /client/device-status`
- `GET /client/devices`
- `GET /workspace/storage`
- `PUT /settings/ai`
- `POST /settings/ai/test`

后端算法服务只有 `/api/status`。Tauri 客户端里有 `list_audio_devices`、`get_gpu_url`、`set_gpu_url` 等本地命令，但没有同名 HTTP API。

### 3. 会议工作台：部分可映射，创建/详情/归档不对齐

前端需要：

- `GET /meetings`
- `POST /meetings`
- `GET /meetings/:id`
- `POST /meetings/:id/archive`

后端已有：

- `GET /api/meetings`
- `POST /api/meetings/stream_start?meeting_id=...`
- `GET /api/meetings/{id}/state`
- `POST /api/meetings/{id}/close`

差异：

- 创建会议不是 `POST /api/meetings`，而是 `stream_start` query 参数。
- 会议详情拆在 `state/docs/chat/collab` 多个接口里，没有聚合详情接口。
- `archive` 不存在，`close` 只是结束会议。

### 4. 录音/转写：语义可映射，路径不一致

前端需要：

- `POST /meetings/:id/recording/start`
- `POST /meetings/:id/recording/stop`
- `GET /meetings/:id/transcript-segments`
- `GET /meetings/:id/events`

后端已有：

- `POST /api/meetings/stream_start`
- `POST /api/meetings/{id}/stream_stop`
- `GET /api/meetings/{id}/state` 中包含 `transcript_segments`
- `GET /api/meetings/{id}/events` 为 SSE，不是普通 timeline JSON

前端展示字段要求：

| UI 信息 | 前端需要字段 | 后端当前情况 |
|---|---|---|
| 说话人 | `speakerId`, `speakerName` | SSE `transcript-segment` 会推 `speaker_name`；`state.transcript_segments` 通常只有 `speaker_id`，冷启动需要补 `speakerMap` 或聚合 `speakerName` |
| 说话时间 | `startsAtMs`, `endsAtMs` 或 `start_sec`, `end_sec` | 后端有 `start_sec`, `end_sec` |
| 说话内容 | `text` | 后端有 `text`；部分 SSE 是 ASR 整理后的窗口文本 |
| 原始/整理 | `cleaned`, `rawTexts` | 后端 SSE 有 `cleaned`、`raw_texts`，但普通拉取接口未统一返回整理窗口 |
| 切片归属 | `chunkIndex` | 后端有 `chunk_index` |

需要补的不是 UI，而是接口返回结构：建议 `GET /api/meetings/{id}/transcript-segments` 返回统一 DTO，并在 `GET /api/meetings/{id}` 聚合详情中携带最近转写。

建议：保留前端契约，后端或 BFF 做路径/响应适配。

### 5. 会议资料/投屏材料：后端缺产品层材料管理，但部分 UI 不必后端化

前端需要：

- `GET/POST /meetings/:id/materials`
- `GET /materials/:id`
- `GET /materials/:id/versions`
- `PATCH /materials/:id/visibility`
- `POST /materials/:id/annotations`，仅在批注需要留痕/归档/多端同步时需要
- `GET/PATCH /meetings/:id/presentation-state`，至少记录当前打开材料/页码；缩放/工具可本地
- `POST /meetings/:id/stage/open`
- `POST /meetings/:id/stage/snapshots`，仅在要生成证据截图时需要

后端只有：

- `POST /api/kb/upload`
- `POST /api/meetings/{id}/chat` multipart
- `GET /api/kb/list`

差异：

- 没有“会议材料”实体、版本、可见范围、当前打开对象/页码、截图证据。
- KB 文档和会中投屏材料不是同一套数据模型。

不应要求后端实现的纯前端态：

- 当前选中的画笔/指针/文本/框选工具
- 画笔未提交轨迹、临时文本框、hover/selection 状态
- 缩略图滚动位置、当前缩放比例、局部全屏 UI 状态

可选上报的留痕态：

- VP 主动保存的批注
- 截图证据
- 发送给客户的标注页
- 会后纪要中引用的页面/区域

### 6. 客户提问与解释材料：后端只有协作提问/KB/Chat，缺正式解释流程

前端需要的流程：

客户提问 -> 识别概念 -> 检索会议/企业/行业知识 -> 生成解释 -> VP 提交 -> 可发送客户。

前端接口：

- `GET /meetings/:id/customer-questions`
- `PATCH /customer-questions/:id`
- `POST /meetings/:id/concept-search`
- `POST /meetings/:id/ai/explanations`
- `POST /customer-questions/:id/explanation`
- `POST /meetings/:id/customer-messages`

后端已有可复用能力：

- `GET /api/meetings/{id}/state` 可读取 open questions
- `GET /api/meetings/{id}/collab` 可读取 agent/VP 协作问题
- `POST /api/kb/search` 可做 KB 检索
- `POST /api/meetings/{id}/chat` 可让 LLM 生成自然语言回答

缺口：

- 没有客户问题实体与状态流转。
- 没有概念抽取接口。
- 没有多 scope 检索：meeting/enterprise/industry。
- 没有解释材料草稿、提交、绑定 question、发送客户的结构化接口。
- 现有 `collab` 是 agent 向 VP 提问，不等同于客户提问解释流程。

### 7. 交付物：有 6 docs 读取，缺产品层交付物与版本接口

前端需要：

- `GET /meetings/:id/deliverables`
- `POST /meetings/:id/deliverables/generate`
- `GET /deliverables/:id`
- `GET /deliverables/:id/versions`
- `PATCH /deliverables/:id/version`

后端已有：

- `GET /api/meetings/{id}/docs`
- `GET /api/meetings/{id}/docs/{kind}`
- `GET /api/meetings/{id}/demo/versions`

差异：

- 后端 kind 是 `req/arch/tasks/api/risk/demo`；前端应映射为 `requirements/architecture/tasks/api/risk/demo`。
- 前端的 `summary` 更像会后纪要/归档产物，后端当前没有独立 summary。
- 后端只有 demo 版本，不支持所有交付物版本。
- 没有通用 `deliverableId`、生成、切换版本接口。

### 8. 知识库：路径和能力不一致

前端需要：

- `GET /knowledge?scope=personal|enterprise|industry`
- `POST /knowledge/documents`
- `GET /knowledge/documents/:id`
- `POST /knowledge/documents/:id/tags`
- `PATCH /knowledge/documents/:id/meeting-callable`

后端已有：

- `POST /api/kb/upload`
- `GET/POST /api/kb/search`
- `GET /api/kb/list`
- `DELETE /api/kb/{doc_id}` 但 DELETE 路由未真正接入

差异：

- 后端 KB 按 `meeting_id` 隔离，不支持 personal/enterprise/industry scope。
- 没有标签、详情、meeting-callable 这些知识库产品字段。
- `GET /api/kb/list` 当前只返回 total/note，不返回完整文档列表。

### 9. 会后归档、导出、分享：后端缺失

前端需要：

- `POST /meetings/:id/archive`
- `POST /meetings/:id/archive/export`
- `POST /meetings/:id/share-links`

后端只有：

- `POST /api/meetings/{id}/close`
- 读取 docs/状态/材料的若干接口

缺归档聚合、DOCX/PDF/ZIP 导出、分享链接服务。

## 建议的后端补接口优先级

### P0：让核心会议页能真实跑通

1. `POST /api/meetings`：创建会议，包装现有 `stream_start?meeting_id=...`
2. `GET /api/meetings/{id}`：聚合 `state`、`docs`、`chat/history`、`collab`
3. `POST /api/meetings/{id}/recording/start`：包装 `stream_start`
4. `POST /api/meetings/{id}/recording/stop`：包装 `stream_stop`
5. `GET /api/meetings/{id}/transcript-segments`：从 `state.transcript_segments` 拆出
6. `GET /api/meetings/{id}/materials`：返回会议材料清单，先可包装 KB/上传文件元数据
7. `GET /api/meetings/{id}/deliverables`：包装 `docs`
8. `GET /api/deliverables/{id}`：解析 `{meetingId}:{kind}` 到 `docs/{kind}`

### P1：解释材料流程

1. `GET /api/meetings/{id}/customer-questions`
2. `POST /api/meetings/{id}/concept-search`
3. `POST /api/meetings/{id}/ai/explanations`
4. `POST /api/customer-questions/{id}/explanation`
5. `POST /api/meetings/{id}/customer-messages`

### P2：材料/知识库产品层

1. `POST /api/meetings/{id}/materials`
2. `GET /api/materials/{id}`
3. `PATCH /api/materials/{id}/visibility`
4. `POST /api/materials/{id}/annotations`，仅做留痕/归档，不承接所有前端画笔实时状态
5. `POST /api/meetings/{id}/stage/snapshots`
6. `GET /api/knowledge?scope=...`
7. `POST /api/knowledge/documents`
8. 修复 `DELETE /api/kb/{doc_id}`：增加 `do_DELETE()` 或改为 POST 删除接口。

### P3：用户、导出、分享、设置

1. Auth/SSO/me
2. workspace storage
3. AI settings/test
4. archive export
5. share links

## 前端当前不应修改的功能点

这些页面功能来自目标产品说明，应保留：

- 登录与客户端设备状态
- 工作台与新建会议
- 会中投屏材料、左侧资料清单、缩略图与批注工具
- AI 提问、解释材料、发送给 VPBuddy
- 交付物清单与版本切换
- 知识库 scope、标签、会议可调用
- 会后归档、导出与分享
- AI 设置

当前差异更适合作为后端/BFF 补接口清单，而不是删前端页面。
