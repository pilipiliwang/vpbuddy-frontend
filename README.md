# VPBuddy 前端原型

这是根据产品说明书与 UI 参考图还原的无后端前端项目。项目使用原生 HTML/CSS/JavaScript，不依赖第三方包；后端接口契约放在 `src/api/contracts.ts`，请求封装放在 `src/api/client.js`。

## 运行

```bash
npm run dev
```

默认地址：

```text
http://127.0.0.1:4173
```

## 页面

- 客户端登录页
- 会议工作台与快速新建会议弹窗
- 会议交互空间：投屏内容、交付物、AI 协同、会议时间线
- 会后总结/归档页
- 知识库
- 设置

## 接口文档

- `API.md`：按业务模块整理的接口清单
- `API_REQUIREMENTS.md`：后端实现需要的接口需求文档
- `src/api/contracts.ts`：TypeScript DTO 与 API interface
- `src/api/client.js`：前端请求封装

## 接后端

当前页面使用本地 mock 数据。接入后端时：

1. 按 `src/api/contracts.ts` 实现服务端 DTO。
2. 使用 `createVpbuddyApi({ baseUrl, getToken })` 创建客户端。
3. 将页面中的 mock 数据调用替换为对应 API 方法。
