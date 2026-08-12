# VPBuddy Web

网页端直接复用客户端的 `index.html`、`src/main.js`、`src/styles.css` 和接口客户端。Electron 仍可独立打包，但不是网页端的运行依赖。

## 运行架构

```text
Browser (HTTPS)
  -> VPBuddy Web server
       -> static UI
       -> /vpbuddy/api/*       -> existing backend /api/* HTTP API
       -> /vpbuddy/meetings/*  -> existing backend /meetings/* recording API
       -> /vpbuddy/docs/*      -> existing backend /docs/* document preview API
       -> WebSocket    -> existing realtime ASR endpoint
```

网页端默认使用同源代理。接口路径、HTTP 方法、请求体、Bearer 凭证、SSE 数据和 WebSocket 查询参数都不做业务转换。

当外层 Nginx 以 `/vpbuddy/` 子路径发布网页并在转发时移除该前缀，Web 服务也会兼容收到的 `/api/*`、`/meetings/*` 和 `/docs/*` 内部路径；浏览器侧公开请求仍统一使用 `/vpbuddy/*`。

## 本地运行

要求 Node.js 20 或更高版本。

```bash
npm ci
npm run web
```

默认地址：`http://127.0.0.1:4173`

默认后端：`http://47.100.182.3:28765`

PowerShell 自定义后端：

```powershell
$env:VPBUDDY_API_BASE_URL="http://your-backend:28765"
$env:PORT="4173"
npm run web
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Web 服务监听地址 |
| `PORT` | `4173` | Web 服务端口 |
| `VPBUDDY_API_BASE_URL` | `http://47.100.182.3:28765` | 仅服务端可见的后端地址 |
| `VPBUDDY_PUBLIC_API_BASE_URL` | 空 | 可选的浏览器直连 API 地址；配置后必须是绝对 HTTP(S) URL |

生产环境建议只配置 `VPBUDDY_API_BASE_URL`，让浏览器始终请求当前网页域名。这样可以同时避免 CORS、HTTPS 混合内容和跨域 WebSocket 问题。

## Docker

```bash
docker build -t vpbuddy-web .
docker run --rm -p 4173:4173 \
  -e VPBUDDY_API_BASE_URL=http://47.100.182.3:28765 \
  vpbuddy-web
```

容器健康检查地址：`GET /healthz`

## HTTPS 部署

除 `localhost` 外，浏览器麦克风权限要求安全上下文，因此正式网页必须使用 HTTPS。可以让 Nginx、Caddy 或云负载均衡器终止 TLS，再转发到 VPBuddy Web 的 `4173` 端口。

Nginx 示例（`map` 放在 `http` 块中）：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

外层反向代理必须保留 WebSocket Upgrade，并关闭 SSE 响应缓冲，否则实时转写或会议事件会表现为断连、延迟或批量出现。

## 与客户端的一致性

- 页面结构、视觉样式、按钮和状态管理复用同一份代码。
- 登录、会议、录制、材料、知识库、AI 协同、交付物和下载接口继续由 `src/api/client.js` 定义。
- 实时会议事件与 ASR 继续由 `src/api/realtime.js` 处理。
- 网页域名拥有独立的 `localStorage`；登录令牌、会议转录本地缓存等数据不会自动继承 Electron 客户端的本地存储。
- 文件下载、PDF 浏览、投屏批注、截图和麦克风录制均使用标准浏览器 API。

## 验证

```bash
npm run test:web
npm test
```

网页契约测试覆盖静态资源隔离、运行配置、HTTP/上传透传、SSE、WebSocket 和原有代理路径。
