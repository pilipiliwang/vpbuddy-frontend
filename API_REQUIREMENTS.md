# VPBuddy 前端接口需求文档

版本：客户端会议交互版 MVP  
目标：支撑当前前端页面的登录、会议工作台、会议交互空间、客户提问解释、交付物、知识库、设置与归档流程。

## 1. 通用约定

- Base URL：由部署环境提供，例如 `/api`
- 鉴权：除登录/SSO/密码重置外，统一使用 `Authorization: Bearer <accessToken>`
- 时间：ISO 8601 字符串
- ID：字符串 UUID 或雪花 ID 均可
- 分页：列表接口建议支持 `page`, `pageSize`, `keyword`, `status`
- 文件上传：`multipart/form-data`
- 错误格式：

```json
{
  "code": "MATERIAL_PARSE_FAILED",
  "message": "材料解析失败",
  "traceId": "req_xxx"
}
```

## 2. Auth 与客户端环境

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/auth/login` | POST | 账号密码登录 | 必需 |
| `/auth/sso/start` | POST | 获取 SSO 授权地址 | 建议 |
| `/auth/sso/complete` | POST | SSO 回调换 Token | 建议 |
| `/auth/password-reset` | POST | 密码重置 | 建议 |
| `/auth/me` | GET | 当前用户、组织、角色、权限 | 必需 |
| `/client/device-status` | GET | 麦克风、录音、客户端版本状态 | 必需 |
| `/client/devices` | GET | 麦克风/扬声器列表 | 必需 |
| `/workspace/storage` | GET | 工作区容量 | 建议 |

登录响应核心字段：`accessToken`, `refreshToken`, `expiresAt`, `user`

设备状态核心字段：`microphone`, `recorder`, `clientVersion`

## 3. 会议工作台

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/meetings` | GET | 会议列表/工作台卡片 | 必需 |
| `/meetings` | POST | 新建本地会议 | 必需 |
| `/meetings/:id` | GET | 会议详情聚合 | 必需 |
| `/meetings/:id/archive` | POST | 结束会议并生成归档 | 必需 |

创建会议请求：

```json
{
  "projectName": "XX公司",
  "title": "XX公司-ESG碳管理系统需求沟通会",
  "objective": "确认一期范围和数据采集方案",
  "knowledgeScopes": ["enterprise", "industry"],
  "materialIds": ["mat_1"],
  "microphoneDeviceId": "mic_1",
  "recordingPolicy": "workspace_sync"
}
```

## 4. 会中录音、转写与时间线

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/meetings/:id/recording/start` | POST | 开始录音 | 必需 |
| `/meetings/:id/recording/stop` | POST | 停止录音 | 必需 |
| `/meetings/:id/transcript-segments` | GET | 获取转写片段 | 必需 |
| `/meetings/:id/events` | GET | 获取会议时间线 | 必需 |
| `/meetings/:id/events` | POST | 追加材料打开、解释、发送、决策等业务事件 | 必需 |

实时能力建议：

- MVP 可用轮询：每 2-5 秒拉取 `transcript-segments` 和 `events`
- 更优方案：SSE `GET /meetings/:id/stream`，推送 `transcript`, `event`, `question`, `deliverable_updated`

转写展示核心字段：

```json
{
  "id": "seg_1",
  "meetingId": "mtg_1",
  "speakerId": "SPEAKER_00",
  "speakerName": "客户-李明",
  "startsAtMs": 600000,
  "endsAtMs": 612300,
  "text": "Scope 3 是否支持多国排放因子？",
  "confidence": 0.92,
  "cleaned": true,
  "chunkIndex": 12
}
```

前端 UI 至少需要区分：说话人、开始/结束时间、转写内容、是否整理后文本。若后端只返回 `speaker_id`，需要同时返回 `speakerMap` 或在聚合接口中补 `speakerName`。

## 5. 会议交互空间与材料

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/meetings/:id/materials` | GET | 会议资料列表 | 必需 |
| `/meetings/:id/materials` | POST | 上传会议资料 | 必需 |
| `/materials/:id` | GET | 材料详情 | 必需 |
| `/materials/:id/versions` | GET | 材料版本 | 建议 |
| `/materials/:id/visibility` | PATCH | 本次会议是否可调用 | 必需 |
| `/materials/:id/annotations` | POST | 保存需要会后留痕的批注/截图证据 | 可选 |
| `/meetings/:id/presentation-state` | GET/PATCH | 当前打开材料、页码；缩放/工具一般可前端本地态 | 建议 |
| `/meetings/:id/stage/open` | POST | 在会议空间打开材料/交付物 | 必需 |
| `/meetings/:id/stage/snapshots` | POST | 生成当前画布截图证据 | 建议 |

材料核心字段：`id`, `name`, `type`, `sizeLabel`, `version`, `status`, `visibleInMeeting`, `tags`

会中本地交互不强制后端化：

- 画笔轨迹、临时文本框、框选高亮、当前工具、缩放比例、缩略图滚动位置，默认是前端运行态。
- 只有当需要多端同步、会后回放、客户留痕、归档证据时，才通过 `annotations` 或 `stage/snapshots` 上报。
- 后端必须提供的是资料列表、上传/解析状态、可调用范围、当前打开对象或会后可恢复的展示状态。

## 6. 客户提问、概念检索与解释材料

当前 UI 的解释材料不是普通摘要，而是绑定客户提问的解释流程：

客户提问 → 识别概念 → 检索会议材料/企业知识/行业知识 → 生成解释 → VP 提交 → 可发送客户

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/meetings/:id/customer-questions` | GET | 客户提问列表 | 必需 |
| `/customer-questions/:id` | PATCH | 更新状态/概念 | 必需 |
| `/meetings/:id/concept-search` | POST | 概念检索 | 必需 |
| `/meetings/:id/ai/explanations` | POST | 生成解释草稿 | 必需 |
| `/customer-questions/:id/explanation` | POST | 提交解释并绑定提问 | 必需 |
| `/meetings/:id/customer-messages` | POST | 发送解释/材料/交付物给客户 | 建议 |

概念检索请求：

```json
{
  "questionId": "q_1",
  "concepts": ["自动采集", "排放源数据", "IoT/ERP接口"],
  "scopes": ["meeting", "enterprise", "industry"],
  "limit": 6
}
```

解释提交请求：

```json
{
  "title": "碳排放数据自动采集说明",
  "summary": "建议采用数据连接器、采集任务和校验规则实现...",
  "sourceIds": ["src_1", "src_2"],
  "sendToCustomer": false
}
```

## 7. 交付物

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/meetings/:id/deliverables` | GET | 交付物列表 | 必需 |
| `/meetings/:id/deliverables/generate` | POST | 生成交付物 | 必需 |
| `/deliverables/:id` | GET | 交付物详情 | 必需 |
| `/deliverables/:id/versions` | GET | 版本列表 | 必需 |
| `/deliverables/:id/version` | PATCH | 切换版本 | 必需 |

交付物类型：`demo`, `requirements`, `tasks`, `architecture`, `api`, `risk`, `summary`

说明：后端算法当前已有 `req/arch/tasks/api/risk/demo` 六类产物；前端展示可映射为 `requirements/architecture/tasks/api/risk/demo`。`summary` 属于会后纪要/归档类产物，可作为后续扩展。

生成请求：

```json
{
  "type": "requirements",
  "title": "需求清单",
  "sourceQuestionIds": ["q_1", "q_2"],
  "sourceMaterialIds": ["mat_1"],
  "instruction": "生成可供会后评审的需求清单"
}
```

## 8. 知识库

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/knowledge?scope=personal|enterprise|industry` | GET | 知识库列表 | 必需 |
| `/knowledge/documents` | POST | 上传知识文档 | 必需 |
| `/knowledge/documents/:id` | GET | 知识详情 | 必需 |
| `/knowledge/documents/:id/tags` | POST | 添加标签 | 建议 |
| `/knowledge/documents/:id/meeting-callable` | PATCH | 设置本次会议可调用 | 必需 |

## 9. 会后归档、导出与分享

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/meetings/:id/archive` | POST | 生成会议归档 | 必需 |
| `/meetings/:id/archive/export` | POST | 导出 DOCX/PDF/ZIP | 必需 |
| `/meetings/:id/share-links` | POST | 创建分享链接 | 建议 |

导出请求：

```json
{
  "format": "pdf",
  "includeAudio": false,
  "includeMaterials": true,
  "includeDeliverables": true
}
```

## 10. 设置

| 接口 | 方法 | 用途 | MVP |
|---|---:|---|---|
| `/settings/ai` | PUT | 保存 AI Key、模型、接口地址 | 必需 |
| `/settings/ai/test` | POST | 测试 AI 连接 | 必需 |

## 11. 前端已提供文件

- `src/api/contracts.ts`：TypeScript DTO 与 `VpbuddyApi`
- `src/api/client.js`：请求封装
- `API.md`：接口清单简版
- `API_REQUIREMENTS.md`：本文档
