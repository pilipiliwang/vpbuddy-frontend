# VPBuddy API 契约清单

前端已按“客户端会议交互版”拆分接口。所有接口默认使用 Bearer Token，时间字段使用 ISO 8601。

## Auth

- `POST /auth/login`：账号密码登录
- `POST /auth/sso/start`：获取企业 SSO 授权地址
- `POST /auth/sso/complete`：SSO 回调换取 Token
- `POST /auth/password-reset`：发送密码重置邮件
- `GET /auth/me`：获取当前用户、组织、角色、权限

## Client

- `GET /client/device-status`：麦克风、录音、客户端版本状态
- `GET /client/devices`：本机麦克风/扬声器列表
- `GET /workspace/storage`：工作区空间用量

## Meetings

- `GET /meetings`：会议工作台列表
- `POST /meetings`：创建本地会议
- `GET /meetings/:id`：会议详情
- `POST /meetings/:id/recording/start`：开始录音
- `POST /meetings/:id/recording/stop`：停止录音
- `POST /meetings/:id/events`：写入会议时间线事件
- `POST /meetings/:id/archive`：生成会后归档

## Materials

- `GET /meetings/:id/materials`：会议资料列表
- `POST /meetings/:id/materials`：上传会议材料
- `GET /materials/:id`：材料详情
- `GET /materials/:id/versions`：材料版本列表
- `PATCH /materials/:id/visibility`：设置是否本次会议可调用
- `POST /materials/:id/annotations`：保存批注、框选、截图标记

## Customer Questions & Explanation

- `GET /meetings/:id/customer-questions`：从会议中识别出的客户提问
- `PATCH /customer-questions/:id`：更新提问状态或识别概念
- `POST /meetings/:id/concept-search`：围绕客户提问中的概念检索会议材料、企业知识、行业知识
- `POST /meetings/:id/ai/explanations`：生成解释材料草稿
- `POST /customer-questions/:id/explanation`：提交解释，并关联到对应客户提问
- `POST /meetings/:id/customer-messages`：向客户发送问题、解释材料或交付物

## Deliverables

- `GET /meetings/:id/deliverables`：交付物列表
- `POST /meetings/:id/deliverables/generate`：生成新交付物
- `GET /deliverables/:id`：交付物详情
- `GET /deliverables/:id/versions`：交付物版本列表
- `PATCH /deliverables/:id/version`：切换当前版本

## Industry Templates

行业模板接口统一使用 `Authorization: Bearer <token>`，列表、详情、封面、预览和应用结果均以后端响应为准。

- `GET /api/templates?q=&industry=&sort=default&page=1&page_size=20`：分页读取模板；`q` 搜索模板名称/场景，`industry` 按后端返回的行业值筛选，`sort` 支持 `default`、`updated`。
- `GET /api/templates/{template_id}`：读取模板详情、角色、模块、标签和应用说明。
- `GET /api/templates/{template_id}/cover`：读取鉴权封面图片。前端以 Bearer 请求 Blob，并使用可回收的临时 Blob URL 展示，不将 JWT 写入图片 URL。
- `GET /api/templates/{template_id}/preview`：读取鉴权 HTML 预览。前端以 Bearer 请求正文，并在不包含 `allow-same-origin` 的沙箱 iframe 中展示。
- `POST /api/templates/{template_id}/apply`：应用模板。请求头必须携带 `Idempotency-Key`，请求体为 `{ "project_name": string, "request_id": string, "meeting_id"?: string }`。
- `GET /api/templates/applications/{request_id}`：查询应用状态，用于请求超时或网络中断后的幂等恢复。

应用成功后，响应应包含创建/复用的会议和 Demo V1 信息。前端进入对应会议的“交付物”页并选择 Demo，但不会自动开始录音。

### 当前后端 Demo 安全预览

- `GET /api/meetings/:id/demo/versions`：读取当前用户拥有会议的 Demo 版本清单。
- `GET /api/meetings/:id/demo/versions/:version/content`：以 `Authorization: Bearer <token>` 读取指定版本 HTML；前端将正文转换为临时 Blob URL 后放入不含 `allow-same-origin` 的沙箱 iframe，不在 URL、日志或 DOM 属性中暴露 JWT。
- 预期状态码：未登录 `401`、非会议 owner `403`、会议或版本不存在 `404`。
- 正文响应应为 `text/html; charset=utf-8`，并携带 `Cache-Control: private, no-store` 与 `X-Content-Type-Options: nosniff`。
- 前端不再访问或代理公开 `/docs/:meeting_id/:file` 路径，也不会在鉴权接口失败时回退到该路径。

## Knowledge

- `GET /knowledge?scope=personal|enterprise|industry`：知识库列表
- `POST /knowledge/documents`：上传知识文档
- `GET /knowledge/documents/:id`：知识文档详情
- `POST /knowledge/documents/:id/tags`：添加标签
- `PATCH /knowledge/documents/:id/meeting-callable`：设置本次会议可调用

## Archive & Share

- `POST /meetings/:id/archive/export`：导出纪要/归档包
- `POST /meetings/:id/share-links`：创建分享链接

详细 DTO 请看 `src/api/contracts.ts`，前端请求封装请看 `src/api/client.js`。更完整的后端接口需求请看 `API_REQUIREMENTS.md`。
